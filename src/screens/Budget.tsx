import React from 'react';
import * as S from '../shared';

// Governance -> Budget: Budget vs Actual for the current financial year. Actual (Collection) is
// never entered by anyone -- it's computed live from Received invoices/payment receipts, the exact
// same rule Dashboard's Revenue Collected widget and Project Master's Billing Tracker already use
// (S.monthCollectionAllProjects). Target is the one thing a person enters here: a single org-wide
// figure per month, saved through the same Administration-style admin_data.budgetTargets key/patch
// path Company Settings etc. already use, so it debounces and syncs to Supabase the same way. Route
// is hard-gated to Admin/Super Admin only (NAV_MODULE.budget='Budget', matrix Officer/Manager=None)
// -- see App.tsx's <Gate>.
export default function Budget() {
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { invoices } = React.useContext(S.InvoicesDataContext);
  const { admin, patchAdmin } = React.useContext(S.AdminDataContext);

  const fyStart = admin?.company?.fiscalYearStart || 'April';
  const [yearOffset, setYearOffset] = React.useState(0);
  const fy = S.fiscalYearMonths(fyStart, S.TODAY_ISO, yearOffset);
  const targets = admin?.budgetTargets || {};
  const currentYm = S.TODAY_ISO.slice(0, 7);

  const setTarget = (ym: string, raw: string) => {
    const n = raw === '' ? undefined : Math.max(0, Number(raw) || 0);
    patchAdmin('budgetTargets', (prev: any) => {
      const next = { ...(prev || {}) };
      if (n === undefined) delete next[ym]; else next[ym] = n;
      return next;
    });
  };

  const rows = fy.months.map((ym) => {
    const isFuture = ym > currentYm;
    const target = targets[ym];
    const actual = isFuture ? null : S.monthCollectionAllProjects(invoices, ym);
    const variance = (target != null && actual != null) ? actual - target : null;
    const pct = (target && actual != null) ? Math.round(100 * actual / target) : null;
    return { ym, isFuture, target, actual, variance, pct };
  });

  const toneFor = (pct: number) => pct >= 100 ? 'text-emerald-600' : pct >= 75 ? 'text-amber-600' : 'text-red-600';
  const statusFor = (r: any) => {
    if (r.isFuture) return { label: 'Upcoming', cls: 'bg-slate-100 text-slate-400' };
    if (r.target == null) return { label: 'No target set', cls: 'bg-slate-100 text-slate-400' };
    if (r.pct >= 100) return { label: 'Ahead', cls: 'bg-emerald-100 text-emerald-700' };
    if (r.pct >= 75) return { label: 'On Track', cls: 'bg-amber-100 text-amber-700' };
    return { label: 'Behind', cls: 'bg-red-100 text-red-700' };
  };

  const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleString('en-US', { month: 'short', year: 'numeric' });

  // FY-to-date totals. Collected is real cash already in hand -- it sums every ELAPSED month's
  // actual regardless of whether that month has a Target yet, so it never hides money behind an
  // unset Target (the earlier cut tied both sums to "has a Target", which made Collected read as
  // 0/'--' for an entire year with no Targets entered even though invoices had real receipts).
  // Target sums only the months a figure has actually been entered. % Achieved compares the two,
  // so it stays blank until at least one Target exists to compare against.
  const elapsed = rows.filter(r => !r.isFuture);
  const actualSum = elapsed.reduce((s, r) => s + (r.actual || 0), 0);
  const targetSum = elapsed.reduce((s, r) => s + (r.target || 0), 0);
  const fyPct = targetSum ? Math.round(100 * actualSum / targetSum) : null;
  const monthsSet = fy.months.filter(ym => targets[ym] != null).length;

  // Route-level Gate (App.tsx) already keeps Officer/Manager/Client out entirely; this only decides
  // whether the signed-in Admin/Super Admin gets the editable Target input or a plain read-only
  // figure -- same capAtLeast('Edit') check every other gated screen makes for its own controls.
  const { email: myEmail } = React.useContext(S.CurrentUserContext);
  const canEdit = S.capAtLeast(S.capabilityFor('Budget', myEmail, admin), 'Edit');

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <S.SectionTitle sub="Target vs Actual collection by month, Admin/Super Admin only. Target is entered here; Collection is always pulled live from Received invoices -- never typed in.">Budget</S.SectionTitle>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-1 py-1">
          <button onClick={() => setYearOffset(o => o - 1)} className="w-7 h-7 rounded-md text-slate-500 hover:bg-slate-100 text-sm" aria-label="Previous financial year">‹</button>
          <span className="text-sm font-medium text-slate-700 px-2 whitespace-nowrap">{fy.label}</span>
          <button onClick={() => setYearOffset(o => o + 1)} className="w-7 h-7 rounded-md text-slate-500 hover:bg-slate-100 text-sm" aria-label="Next financial year">›</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <S.Card className="p-3">
          <div className="text-[11px] text-slate-500 mb-1">Target ({fy.label}, to date)</div>
          <div className="text-lg font-bold text-slate-800">{targetSum ? S.inLakh(targetSum) : '—'}</div>
        </S.Card>
        <S.Card className="p-3">
          <div className="text-[11px] text-slate-500 mb-1">Collected ({fy.label}, to date)</div>
          <div className="text-lg font-bold text-slate-800">{actualSum ? S.inLakh(actualSum) : '—'}</div>
        </S.Card>
        <S.Card className="p-3">
          <div className="text-[11px] text-slate-500 mb-1">% Achieved</div>
          <div className={`text-lg font-bold ${fyPct == null ? 'text-slate-300' : toneFor(fyPct)}`}>{fyPct == null ? '—' : `${fyPct}%`}</div>
        </S.Card>
        <S.Card className="p-3">
          <div className="text-[11px] text-slate-500 mb-1">Months with a Target set</div>
          <div className="text-lg font-bold text-slate-800">{monthsSet} / 12</div>
        </S.Card>
      </div>

      <S.Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <S.Th>Month</S.Th>
                <S.Th>Target</S.Th>
                <S.Th>Collection (Actual)</S.Th>
                <S.Th>Variance</S.Th>
                <S.Th>% Achieved</S.Th>
                <S.Th>Status</S.Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const st = statusFor(r);
                const suggested = r.target == null ? S.suggestedMonthTarget(projects, r.ym) : null;
                return (
                  <tr key={r.ym} className={r.ym === currentYm ? 'bg-brand-50/40' : ''}>
                    <S.Td className="font-medium whitespace-nowrap">
                      {monthLabel(r.ym)}
                      {r.ym === currentYm && <span className="ml-1.5 text-[10px] text-brand-600 font-semibold">CURRENT</span>}
                    </S.Td>
                    <S.Td>
                      {canEdit ? (
                        <div>
                          <input
                            type="number" min={0} inputMode="numeric"
                            value={r.target ?? ''}
                            onChange={(e) => setTarget(r.ym, e.target.value)}
                            placeholder={suggested ? String(suggested) : 'Target'}
                            className="w-32 text-sm border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-300"
                          />
                          {suggested != null && suggested > 0 && (
                            <div className="text-[10px] text-slate-400 mt-0.5">suggested {S.inLakh(suggested)}</div>
                          )}
                        </div>
                      ) : (
                        r.target != null ? S.inLakh(r.target) : <span className="text-slate-300">—</span>
                      )}
                    </S.Td>
                    <S.Td className="whitespace-nowrap">{r.isFuture ? <span className="text-slate-300">—</span> : S.inLakh(r.actual || 0)}</S.Td>
                    <S.Td className="whitespace-nowrap">
                      {r.variance == null ? <span className="text-slate-300">—</span> : (
                        <span className={r.variance >= 0 ? 'text-emerald-600' : 'text-red-600'}>{r.variance >= 0 ? '+' : ''}{S.inLakh(r.variance)}</span>
                      )}
                    </S.Td>
                    <S.Td className="whitespace-nowrap">
                      {r.pct == null ? <span className="text-slate-300">—</span> : <span className={`font-semibold ${toneFor(r.pct)}`}>{r.pct}%</span>}
                    </S.Td>
                    <S.Td><S.Badge cls={st.cls}>{st.label}</S.Badge></S.Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <S.Td className="font-semibold text-slate-700">Total ({fy.label} to date)</S.Td>
                <S.Td className="font-semibold text-slate-800">{targetSum ? S.inLakh(targetSum) : '—'}</S.Td>
                <S.Td className="font-semibold text-slate-800">{actualSum ? S.inLakh(actualSum) : '—'}</S.Td>
                <S.Td className="font-semibold">
                  {(targetSum || actualSum) ? (
                    <span className={(actualSum - targetSum) >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {(actualSum - targetSum) >= 0 ? '+' : ''}{S.inLakh(actualSum - targetSum)}
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </S.Td>
                <S.Td className={`font-bold ${fyPct == null ? 'text-slate-300' : toneFor(fyPct)}`}>{fyPct == null ? '—' : `${fyPct}%`}</S.Td>
                <S.Td></S.Td>
              </tr>
            </tfoot>
          </table>
        </div>
      </S.Card>
    </div>
  );
}
