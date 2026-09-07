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
// View style: vertical bar chart -- each month is a column whose height is Collection, coloured by
// status (Ahead/On Track/Behind/No target), with a short dark tick marking that month's Target so the
// gap between "bar top" and "tick" is the story at a glance; gridlines/₹ labels give the y-axis scale
// and a hover tooltip carries the exact figures instead of printing them on every bar. This is the
// most literal of the four styles mocked up for the user (table / bullet rows / bar chart / tile
// grid) and was requested by name after seeing all four. Target entry doesn't fit inside a bar, so it
// moves to a compact per-month grid below the chart -- kept to one line per month so the whole page,
// chart plus every month's target field, still fits one screen with no scrolling.
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
    if (r.isFuture) return { label: 'Upcoming', cls: 'bg-slate-100 text-slate-400', tone: 'neutral' };
    if (r.target == null) return { label: 'No target set', cls: 'bg-slate-100 text-slate-400', tone: 'neutral' };
    if (r.pct >= 100) return { label: 'Ahead', cls: 'bg-emerald-100 text-emerald-700', tone: 'good' };
    if (r.pct >= 75) return { label: 'On Track', cls: 'bg-amber-100 text-amber-700', tone: 'warn' };
    return { label: 'Behind', cls: 'bg-red-100 text-red-700', tone: 'bad' };
  };
  // Bar colour follows the exact same tone the status badge/tooltip already use -- the chart never
  // invents its own colour rule, so bar and badge always agree for a given month.
  const barToneCls = (tone: string) => tone === 'good' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : tone === 'bad' ? 'bg-red-500' : 'bg-slate-300';

  const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleString('en-US', { month: 'short', year: 'numeric' });
  const monthShort = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleString('en-US', { month: 'short' });

  // FY-to-date totals. Collected is real cash already in hand -- it sums every ELAPSED month's
  // actual regardless of whether that month has a Target yet, so it never hides money behind an
  // unset Target. Target sums only the months a figure has actually been entered. % Achieved
  // compares the two, so it stays blank until at least one Target exists to compare against.
  const elapsed = rows.filter(r => !r.isFuture);
  const actualSum = elapsed.reduce((s, r) => s + (r.actual || 0), 0);
  const targetSum = elapsed.reduce((s, r) => s + (r.target || 0), 0);
  const fyPct = targetSum ? Math.round(100 * actualSum / targetSum) : null;
  const monthsSet = fy.months.filter(ym => targets[ym] != null).length;

  // Shared y-axis scale for the whole chart -- the largest Collection or Target across the fiscal
  // year sets the top of the axis, with 15% headroom so the tallest bar/tick never touches the top
  // gridline.
  const maxVal = Math.max(1, ...rows.flatMap(r => [r.target || 0, r.actual || 0])) * 1.15;

  // Route-level Gate (App.tsx) already keeps Officer/Manager/Client out entirely; this only decides
  // whether the signed-in Admin/Super Admin gets the editable Target input or a plain read-only
  // figure -- same capAtLeast('Edit') check every other gated screen makes for its own controls.
  const { email: myEmail } = React.useContext(S.CurrentUserContext);
  const canEdit = S.capAtLeast(S.capabilityFor('Budget', myEmail, admin), 'Edit');

  const [hoverYm, setHoverYm] = React.useState<string | null>(null);
  const [hoverPos, setHoverPos] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const hoverRow = hoverYm ? rows.find(r => r.ym === hoverYm) : null;

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

      <S.Card className="p-3 mb-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="text-[11px] font-semibold text-slate-600">Collection by month</div>
          <div className="flex flex-wrap items-center gap-2.5 text-[9px] text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />Ahead</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500 inline-block" />On Track</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" />Behind</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-300 inline-block" />No target</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-0.5 bg-slate-700 inline-block" />Target</span>
          </div>
        </div>

        <div className="flex">
          <div className="flex flex-col justify-between text-right text-[9px] text-slate-400 shrink-0 pr-1.5" style={{ width: 34, height: 152 }}>
            {[1, 0.75, 0.5, 0.25, 0].map((f) => (
              <div key={f} className="leading-none">{f === 0 ? '₹0' : S.inLakh(maxVal * f)}</div>
            ))}
          </div>

          <div className="flex-1 relative border-l border-b border-slate-200" style={{ height: 152 }}>
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <div key={f} className="absolute left-0 right-0 border-t border-dashed border-slate-100" style={{ bottom: `${f * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex items-end justify-between px-1.5">
              {rows.map((r) => {
                const st = statusFor(r);
                const heightPct = r.actual != null ? Math.max(1.5, (r.actual / maxVal) * 100) : 1.5;
                const targetPct = r.target != null ? Math.min(100, (r.target / maxVal) * 100) : null;
                return (
                  <div
                    key={r.ym}
                    className="relative flex-1 h-full flex items-end justify-center mx-0.5 cursor-default"
                    onMouseMove={(e) => { setHoverYm(r.ym); setHoverPos({ x: e.clientX, y: e.clientY }); }}
                    onMouseLeave={() => setHoverYm((cur) => (cur === r.ym ? null : cur))}
                  >
                    <div
                      className={`w-full max-w-[22px] rounded-t transition-opacity ${barToneCls(st.tone)} ${r.ym === currentYm ? 'ring-2 ring-brand-300' : ''}`}
                      style={{ height: `${heightPct}%` }}
                    />
                    {targetPct != null && (
                      <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-[26px] h-0.5 bg-slate-700 rounded pointer-events-none" style={{ bottom: `${targetPct}%` }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex" style={{ paddingLeft: 34 + 6 }}>
          <div className="flex-1 flex justify-between px-1.5 mt-1">
            {rows.map((r) => (
              <div key={r.ym} className={`flex-1 text-center text-[9px] ${r.ym === currentYm ? 'text-brand-600 font-semibold' : 'text-slate-400'}`}>{monthShort(r.ym)}</div>
            ))}
          </div>
        </div>

        {hoverRow && (() => {
          const st = statusFor(hoverRow);
          return (
            <div
              className="fixed z-50 pointer-events-none bg-slate-800 text-white text-[10px] leading-relaxed rounded-md px-2.5 py-1.5 shadow-lg"
              style={{ left: hoverPos.x + 14, top: hoverPos.y - 12 }}
            >
              <div className="font-semibold mb-0.5">{monthLabel(hoverRow.ym)}</div>
              <div>Collected: {hoverRow.isFuture ? '—' : S.inLakh(hoverRow.actual || 0)}</div>
              <div>Target: {hoverRow.target != null ? S.inLakh(hoverRow.target) : 'not set'}</div>
              <div>{st.label}</div>
            </div>
          );
        })()}
      </S.Card>

      <S.Card className="p-3">
        <div className="text-[11px] font-semibold text-slate-600 mb-2">Monthly targets</div>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {rows.map((r) => {
            const suggested = r.target == null ? S.suggestedMonthTarget(projects, r.ym) : null;
            return (
              <div key={r.ym} className={`rounded-md border px-2 py-1 ${r.ym === currentYm ? 'border-brand-200 bg-brand-50/40' : 'border-slate-200'}`}>
                <div className="text-[9px] text-slate-400 mb-0.5 truncate">{monthLabel(r.ym)}</div>
                {canEdit ? (
                  <input
                    type="number" min={0} inputMode="numeric"
                    value={r.target ?? ''}
                    onChange={(e) => setTarget(r.ym, e.target.value)}
                    placeholder={suggested ? String(suggested) : '—'}
                    title={suggested != null && suggested > 0 ? `Suggested: ${S.inLakh(suggested)}` : undefined}
                    className="w-full text-[11px] border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-300 text-slate-700"
                  />
                ) : (
                  <div className="text-xs font-medium text-slate-700">{r.target != null ? S.inLakh(r.target) : <span className="text-slate-300">—</span>}</div>
                )}
              </div>
            );
          })}
        </div>
      </S.Card>
    </div>
  );
}
