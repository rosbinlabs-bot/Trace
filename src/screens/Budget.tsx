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
//
// View style: diverging "variance" chart -- each month's bar shows the GAP between Collection and
// Target (Actual - Target), not the two raw magnitudes side by side. A bar right of the zero-line
// means the month collected more than its target (surplus, green); left of it means it fell short
// (shortfall, red). Months with no Target entered yet, or not yet reached, get a plain neutral dot
// on the line instead of a fabricated bar -- there's no gap to show without a Target to compare
// against. Chosen after mocking up three magnitude-based alternatives (a bar chart, a bullet-row
// track, a tile grid) and shown to the user, because a Budget page's real question is "are we ahead
// or behind, and by how much" -- this is the one view that answers that directly instead of making
// the reader do the subtraction themselves.
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
  const fySumVariance = elapsed.some(r => r.target != null) ? (actualSum - targetSum) : null;

  // Shared scale for every row's variance bar -- the biggest |Actual - Target| across the fiscal
  // year sets how far a bar can travel from the zero-line, with headroom and a floor so a single
  // small variance doesn't visually fill the whole track.
  const gapMagnitudes = rows.filter(r => r.variance != null).map(r => Math.abs(r.variance));
  const scaleMax = Math.max(500000, ...gapMagnitudes, 1) * 1.3;

  // Route-level Gate (App.tsx) already keeps Officer/Manager/Client out entirely; this only decides
  // whether the signed-in Admin/Super Admin gets the editable Target input or a plain read-only
  // figure -- same capAtLeast('Edit') check every other gated screen makes for its own controls.
  const { email: myEmail } = React.useContext(S.CurrentUserContext);
  const canEdit = S.capAtLeast(S.capabilityFor('Budget', myEmail, admin), 'Edit');

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
        <S.SectionTitle sub="Target vs Actual collection by month, Admin/Super Admin only. Target is entered here; Collection is always pulled live from Received invoices -- never typed in.">Budget</S.SectionTitle>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-1 py-1">
          <button onClick={() => setYearOffset(o => o - 1)} className="w-7 h-7 rounded-md text-slate-500 hover:bg-slate-100 text-sm" aria-label="Previous financial year">‹</button>
          <span className="text-sm font-medium text-slate-700 px-2 whitespace-nowrap">{fy.label}</span>
          <button onClick={() => setYearOffset(o => o + 1)} className="w-7 h-7 rounded-md text-slate-500 hover:bg-slate-100 text-sm" aria-label="Next financial year">›</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <S.Card className="p-2.5">
          <div className="text-[10px] text-slate-500 mb-0.5">Target ({fy.label}, to date)</div>
          <div className="text-base font-bold text-slate-800">{targetSum ? S.inLakh(targetSum) : '—'}</div>
        </S.Card>
        <S.Card className="p-2.5">
          <div className="text-[10px] text-slate-500 mb-0.5">Collected ({fy.label}, to date)</div>
          <div className="text-base font-bold text-slate-800">{actualSum ? S.inLakh(actualSum) : '—'}</div>
        </S.Card>
        <S.Card className="p-2.5">
          <div className="text-[10px] text-slate-500 mb-0.5">% Achieved</div>
          <div className={`text-base font-bold ${fyPct == null ? 'text-slate-300' : toneFor(fyPct)}`}>{fyPct == null ? '—' : `${fyPct}%`}</div>
        </S.Card>
        <S.Card className="p-2.5">
          <div className="text-[10px] text-slate-500 mb-0.5">Months with a Target set</div>
          <div className="text-base font-bold text-slate-800">{monthsSet} / 12</div>
        </S.Card>
      </div>

      {/* Every month in one compact, single-line-per-row list -- the whole fiscal year fits in one
          screen with no scrolling, which is the point of a "glance at the whole year" chart. Target
          entry and the exact Collected figure ride along in their own narrow columns instead of a
          second line under each bar. */}
      <S.Card className="overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-200 bg-slate-50 text-[9px] uppercase tracking-wide text-slate-400 font-semibold">
          <div className="w-12 shrink-0">Month</div>
          <div className="flex-1 flex justify-between min-w-[80px]">
            <span>‹ Behind</span>
            <span>On target</span>
            <span>Ahead ›</span>
          </div>
          <div className="w-20 shrink-0 text-right">Target</div>
          <div className="w-16 shrink-0 text-right">Collected</div>
          <div className="w-[84px] shrink-0 text-right">Status</div>
        </div>
        <div className="divide-y divide-slate-100">
          {rows.map((r) => {
            const st = statusFor(r);
            const suggested = r.target == null ? S.suggestedMonthTarget(projects, r.ym) : null;
            const hasGap = r.variance != null;
            const halfPct = hasGap ? Math.min(50, (Math.abs(r.variance) / scaleMax) * 50) : 0;
            const barCls = !hasGap ? '' : (r.variance >= 0 ? 'bg-emerald-500' : 'bg-red-500');
            const labelCls = !hasGap ? 'text-slate-400' : (r.variance >= 0 ? 'text-emerald-600' : 'text-red-600');
            return (
              <div key={r.ym} className={`flex items-center gap-2 px-3 py-1.5 ${r.ym === currentYm ? 'bg-brand-50/40' : ''}`}>
                <div className="w-12 shrink-0">
                  <div className="text-xs font-medium text-slate-700 leading-tight">{monthLabel(r.ym)}</div>
                  {r.ym === currentYm && <div className="text-[8px] text-brand-600 font-semibold leading-tight">NOW</div>}
                </div>

                <div className="flex-1 relative h-5 min-w-[80px]">
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-200" />
                  {hasGap ? (
                    <>
                      <div
                        className={`absolute top-0.5 h-4 rounded ${barCls}`}
                        style={r.variance >= 0 ? { left: '50%', width: `${halfPct}%` } : { right: '50%', width: `${halfPct}%` }}
                      />
                      <div
                        className={`absolute top-0.5 text-[10px] font-bold whitespace-nowrap leading-4 ${labelCls}`}
                        style={r.variance >= 0 ? { left: `calc(50% + ${halfPct}% + 5px)` } : { right: `calc(50% + ${halfPct}% + 5px)` }}
                      >
                        {r.variance >= 0 ? '+' : ''}{S.inLakh(r.variance)}
                      </div>
                    </>
                  ) : (
                    <div className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full bg-slate-300 -translate-x-1/2 -translate-y-1/2" title={st.label} />
                  )}
                </div>

                <div className="w-20 shrink-0 text-right">
                  {canEdit ? (
                    <input
                      type="number" min={0} inputMode="numeric"
                      value={r.target ?? ''}
                      onChange={(e) => setTarget(r.ym, e.target.value)}
                      placeholder={suggested ? String(suggested) : '—'}
                      title={suggested != null && suggested > 0 ? `Suggested: ${S.inLakh(suggested)}` : undefined}
                      className="w-20 text-[11px] text-right border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-300 text-slate-700"
                    />
                  ) : (
                    <span className="text-xs text-slate-600 font-medium">{r.target != null ? S.inLakh(r.target) : <span className="text-slate-300">—</span>}</span>
                  )}
                </div>

                <div className="w-16 shrink-0 text-right text-xs text-slate-600 font-medium">
                  {r.isFuture ? <span className="text-slate-300 font-normal">—</span> : S.inLakh(r.actual || 0)}
                </div>

                <div className="w-[84px] shrink-0 text-right">
                  <S.Badge cls={st.cls}>{st.label}</S.Badge>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-200 bg-slate-50">
          <div className="w-12 shrink-0 text-xs font-semibold text-slate-700">Total</div>
          <div className="flex-1 min-w-[80px] text-[10px] text-slate-400 truncate">{fy.label} to date</div>
          <div className="w-20 shrink-0 text-right text-xs font-semibold text-slate-800">{targetSum ? S.inLakh(targetSum) : '—'}</div>
          <div className="w-16 shrink-0 text-right text-xs font-semibold text-slate-800">{actualSum ? S.inLakh(actualSum) : '—'}</div>
          <div className="w-[84px] shrink-0 text-right">
            {fySumVariance == null ? <span className="text-slate-300 text-xs">—</span> : (
              <span className={`text-xs font-bold ${fySumVariance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {fySumVariance >= 0 ? '+' : ''}{S.inLakh(fySumVariance)}
              </span>
            )}
          </div>
        </div>
      </S.Card>
    </div>
  );
}
