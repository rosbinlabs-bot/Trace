import React from 'react';
import * as S from '../shared';

// Governance -> Budget: Budget vs Actual for the current financial year. Actual (Collection) is
// computed live from Received invoices/payment receipts wherever that data exists -- the exact same
// rule Dashboard's Revenue Collected widget and Project Master's Billing Tracker already use
// (S.monthCollectionAllProjects) -- so nobody types in a figure for a month that's already tracked.
// For months with no automatically-fetched collection (typically history from before this system was
// in use, or a month with genuinely no Received invoices recorded), Admin/Super Admin can enter that
// month's Collection manually instead, saved as its own admin_data key (budgetManualCollections) --
// same debounced key/patch path budgetTargets already uses. A manual figure only ever fills a gap: the
// moment real invoice data exists for that month, the automatic total takes over again and the manual
// entry is simply ignored (never overwritten, never double-counted). Target is the one thing a person
// always enters here: a single org-wide figure per month, saved the same way. Route is hard-gated to
// Admin/Super Admin only (NAV_MODULE.budget='Budget', matrix Officer/Manager=None) -- see App.tsx's
// <Gate>.
//
// View style: vertical bar chart -- each month is a column whose height is Collection, coloured by
// status (Ahead/On Track/Behind/No target), with a short dark tick marking that month's Target so the
// gap between "bar top" and "tick" is the story at a glance; gridlines/₹ labels give the y-axis scale
// and a hover tooltip carries the exact figures instead of printing them on every bar. A small "M"
// mark above a column flags a manually-entered month so it's never mistaken for an automatic figure.
// Target (and, where needed, manual Collection) entry doesn't fit inside a bar, so both live in a
// compact per-month grid below the chart -- kept to one line or two per month so the whole page still
// fits one screen with no scrolling.
export default function Budget() {
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { invoices } = React.useContext(S.InvoicesDataContext);
  const { admin, patchAdmin } = React.useContext(S.AdminDataContext);

  const fyStart = admin?.company?.fiscalYearStart || 'April';
  const [yearOffset, setYearOffset] = React.useState(0);
  const fy = S.fiscalYearMonths(fyStart, S.TODAY_ISO, yearOffset);
  const targets = admin?.budgetTargets || {};
  const manualCollections = admin?.budgetManualCollections || {};
  const currentYm = S.TODAY_ISO.slice(0, 7);

  const setTarget = (ym: string, raw: string) => {
    const n = raw === '' ? undefined : Math.max(0, Number(raw) || 0);
    patchAdmin('budgetTargets', (prev: any) => {
      const next = { ...(prev || {}) };
      if (n === undefined) delete next[ym]; else next[ym] = n;
      return next;
    });
  };

  const setManualCollection = (ym: string, raw: string) => {
    const n = raw === '' ? undefined : Math.max(0, Number(raw) || 0);
    patchAdmin('budgetManualCollections', (prev: any) => {
      const next = { ...(prev || {}) };
      if (n === undefined) delete next[ym]; else next[ym] = n;
      return next;
    });
  };

  const rows = fy.months.map((ym) => {
    const isFuture = ym > currentYm;
    const target = targets[ym];
    const autoActual = isFuture ? null : S.monthCollectionAllProjects(invoices, ym);
    // A manual figure only ever fills a gap -- it's read only when there's nothing automatic to show
    // for that month. As soon as real invoice data exists, the automatic total wins again on its own,
    // with no need to clear the manual entry (it just stops being used).
    const hasAuto = autoActual != null && autoActual > 0;
    const manual = manualCollections[ym];
    const isManual = !isFuture && !hasAuto && manual != null;
    const actual = isFuture ? null : (hasAuto ? autoActual : (manual ?? autoActual));
    const variance = (target != null && actual != null) ? actual - target : null;
    const pct = (target && actual != null) ? Math.round(100 * actual / target) : null;
    return { ym, isFuture, target, autoActual, isManual, actual, variance, pct };
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
  // actual (automatic where it exists, manual where it was entered to fill a gap) regardless of
  // whether that month has a Target yet, so it never hides money behind an unset Target. Target sums
  // only the months a figure has actually been entered. % Achieved compares the two, so it stays
  // blank until at least one Target exists to compare against.
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
  // whether the signed-in Admin/Super Admin gets the editable Target/manual-Collection inputs or
  // plain read-only figures -- same capAtLeast('Edit') check every other gated screen makes for its
  // own controls.
  const { email: myEmail } = React.useContext(S.CurrentUserContext);
  const canEdit = S.capAtLeast(S.capabilityFor('Budget', myEmail, admin), 'Edit');

  const [hoverYm, setHoverYm] = React.useState<string | null>(null);
  const [hoverPos, setHoverPos] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const hoverRow = hoverYm ? rows.find(r => r.ym === hoverYm) : null;

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
        <S.SectionTitle sub="Target vs Actual collection by month, Admin/Super Admin only. Target is entered here; Collection is pulled live from Received invoices wherever that data exists, with a manual entry available only for months nothing was fetched for.">Budget</S.SectionTitle>
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
            <span className="inline-flex items-center gap-1"><span className="text-[8px] font-bold text-slate-400">M</span>Manual entry</span>
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
                    {r.isManual && (
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 text-[7px] leading-none font-bold text-slate-400">M</div>
                    )}
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
              <div>Collected: {hoverRow.isFuture ? '—' : `${S.inLakh(hoverRow.actual || 0)}${hoverRow.isManual ? ' (manual)' : ''}`}</div>
              <div>Target: {hoverRow.target != null ? S.inLakh(hoverRow.target) : 'not set'}</div>
              <div>{st.label}</div>
            </div>
          );
        })()}
      </S.Card>

      <S.Card className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold text-slate-600">Monthly targets & collection</div>
          <div className="text-[9px] text-slate-400">Collection is only editable for a month with nothing fetched automatically</div>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {rows.map((r) => {
            const suggested = r.target == null ? S.suggestedMonthTarget(projects, r.ym) : null;
            const needsManual = !r.isFuture && !(r.autoActual != null && r.autoActual > 0);
            return (
              <div key={r.ym} className={`rounded-md border px-2 py-1 space-y-1 ${r.ym === currentYm ? 'border-brand-200 bg-brand-50/40' : 'border-slate-200'}`}>
                <div className="text-[9px] text-slate-400 truncate">{monthLabel(r.ym)}</div>
                <div className="flex items-center gap-1">
                  <span className="text-[8px] text-slate-400 w-9 shrink-0">Target</span>
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
                    <span className="text-xs font-medium text-slate-700">{r.target != null ? S.inLakh(r.target) : <span className="text-slate-300">—</span>}</span>
                  )}
                </div>
                {!r.isFuture && (
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] text-slate-400 w-9 shrink-0">Coll.</span>
                    {!needsManual ? (
                      <span className="text-xs font-medium text-slate-700" title="Fetched automatically from Received invoices">{S.inLakh(r.autoActual || 0)}</span>
                    ) : canEdit ? (
                      <input
                        type="number" min={0} inputMode="numeric"
                        value={manualCollections[r.ym] ?? ''}
                        onChange={(e) => setManualCollection(r.ym, e.target.value)}
                        placeholder="Manual"
                        title="No Received invoices found for this month -- enter the actual collection manually"
                        className="w-full text-[11px] border border-dashed border-slate-300 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-300 text-slate-700"
                      />
                    ) : (
                      <span className="text-xs font-medium text-slate-700">{r.actual != null ? S.inLakh(r.actual) : <span className="text-slate-300">—</span>}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </S.Card>
    </div>
  );
}
