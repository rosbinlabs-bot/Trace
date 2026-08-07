import React, { useState } from 'react';
import * as S from '../shared';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function MonthlyPlan(){
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { tree } = React.useContext(S.PhaseDataContext);
  const { plan, setPlan } = React.useContext(S.MonthlyPlanDataContext);
  const { role } = React.useContext(S.RoleContext);
  const { email: myEmail, profile: myProfile } = React.useContext(S.CurrentUserContext);

  // Optional chaining: a project-scoped restricted account (see S.staffVisibleProjects) can have
  // zero visible projects, so projects[0] may be undefined -- projects[0].id would crash the screen.
  const [activeProj, setActiveProj] = useState(projects[0]?.id);
  const projMeta = projects.find((p:any)=>p.id===activeProj) || {};
  const [monthKey, setMonthKey] = useState(S.monthKeyOf());

  // Same edit gate Phase Management uses (Phases.tsx's `readOnly`): Admin/Super Admin always gets
  // full edit rights; everyone else needs to actually be on THIS project's team. A Client never
  // reaches this screen at all -- Administration -> Roles & Permissions has Client:'None' on Phase
  // Management, and this route is gated on that same capability (see App.tsx).
  const readOnly = role!=='admin' && !S.isOnProjectTeam(projMeta, myProfile?.name);
  const canEdit = !readOnly;

  const phases = tree[activeProj] || [];
  const rows: any[] = (plan[activeProj] && plan[activeProj][monthKey]) || [];
  const hasPlan = !!(plan[activeProj] && plan[activeProj][monthKey]);
  const setRows = (updater: any) => setPlan((pl: any) => {
    const forProj = pl[activeProj] || {};
    const prevRows = forProj[monthKey] || [];
    const nextRows = typeof updater === 'function' ? updater(prevRows) : updater;
    return { ...pl, [activeProj]: { ...forProj, [monthKey]: nextRows } };
  });

  // Pull every Milestone/Sub Task across this project's Phase Management tree whose deadline falls
  // in the viewed month -- the "major deliverables for the month" -- and add one row per item not
  // already on the plan (tracked by sourceId). A re-sync never duplicates or overwrites a row already
  // here, so editing a synced row's activity text/onsite/status sticks even after syncing again.
  const syncFromPhases = () => {
    if (!canEdit) return;
    const found: any[] = [];
    phases.forEach((ph: any) => {
      (ph.milestones || []).forEach((ms: any) => {
        if (ms.deadline && S.monthKeyOf(ms.deadline) === monthKey) {
          found.push({ sourceId: ms.id, sourceType: 'Milestone', phase: ph.name, date: ms.deadline, activity: ms.name, done: S.isApproved(ms) });
        }
        (ms.subtasks || []).forEach((s: any) => {
          if (s.deadline && S.monthKeyOf(s.deadline) === monthKey) {
            found.push({ sourceId: s.id, sourceType: 'Sub Task', phase: ph.name, date: s.deadline, activity: s.name, done: S.isApproved(s) });
          }
        });
      });
    });
    setRows((rs: any[]) => {
      const have = new Set(rs.map((r) => r.sourceId).filter(Boolean));
      const fresh = found.filter((f) => !have.has(f.sourceId)).map((f) => ({
        id: S.uid('MP'), date: f.date, activity: f.activity, phase: f.phase,
        sourceId: f.sourceId, sourceType: f.sourceType, onsite: 'Offsite',
        deliveryStatus: f.done ? 'Done' : 'Pending',
      }));
      return fresh.length ? [...rs, ...fresh] : rs;
    });
  };

  // Auto-fill: the first time this project/month combination is opened (no plan record for it yet),
  // seed it straight from Phase Management -- matches "automatically filled from the phases" in the
  // request. Runs once per project/month (hasPlan flips true right after, even if it turned out empty).
  React.useEffect(() => {
    if (canEdit && !hasPlan && activeProj) syncFromPhases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProj, monthKey, hasPlan]);

  const shiftMonth = (delta: number) => {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonthKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const [newDate, setNewDate] = useState(monthKey === S.monthKeyOf() ? S.TODAY_ISO : `${monthKey}-01`);
  const [newActivity, setNewActivity] = useState('');
  const [newOnsite, setNewOnsite] = useState('Offsite');
  React.useEffect(() => { setNewDate(monthKey === S.monthKeyOf() ? S.TODAY_ISO : `${monthKey}-01`); }, [monthKey]);

  const addRow = () => {
    if (!canEdit || !newActivity.trim() || !newDate) return;
    setRows((rs: any[]) => [...rs, {
      id: S.uid('MP'), date: newDate, activity: newActivity.trim(), onsite: newOnsite,
      deliveryStatus: 'Pending', sourceId: null, sourceType: 'Custom', phase: '',
    }]);
    setNewActivity('');
  };
  const removeRow = (id: string) => { if (canEdit) setRows((rs: any[]) => rs.filter((r) => r.id !== id)); };
  const patchRow = (id: string, patch: any) => { if (canEdit) setRows((rs: any[]) => rs.map((r) => r.id === id ? { ...r, ...patch } : r)); };

  const fmtDate = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' });
  };

  const byDate: Record<string, any[]> = {};
  rows.forEach((r) => { const k = r.date || '__unscheduled__'; (byDate[k] = byDate[k] || []).push(r); });
  const dateKeys = Object.keys(byDate).filter((k) => k !== '__unscheduled__').sort();
  if (byDate['__unscheduled__']) dateKeys.unshift('__unscheduled__');

  const total = rows.length;
  const doneCount = rows.filter((r) => r.deliveryStatus === 'Done').length;
  const pendingCount = rows.filter((r) => r.deliveryStatus === 'Pending').length;
  const onsiteCount = rows.filter((r) => r.onsite === 'Onsite').length;

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Monthly Plan — ${projMeta.name || ''}`, 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(`${S.monthLabel(monthKey)}${projMeta.client ? ' · ' + projMeta.client : ''}`, 14, 21);
    const sorted = [...rows].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    autoTable(doc, {
      startY: 27,
      head: [['Date', 'Activity', 'Onsite / Offsite', 'Delivery Status']],
      body: sorted.map((r) => [r.date ? fmtDate(r.date) : 'No date set', r.activity, r.onsite, r.deliveryStatus]),
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [59, 91, 219], textColor: 255 },
      columnStyles: { 0: { cellWidth: 32 } },
    });
    doc.save(`Monthly-Plan-${(projMeta.name || 'project').replace(/[^a-z0-9]+/gi, '-')}-${monthKey}.pdf`);
  };

  return (
    <div>
      <S.SectionTitle sub="Each project's day-by-day delivery agenda for the month — major deliverables auto-filled from Phase Management, plus Onsite/Offsite and delivery status you track here.">Monthly Plan</S.SectionTitle>

      <div className="flex gap-1 border-b border-slate-200 mb-3 overflow-x-auto">
        {projects.map((p: any) => (
          <button key={p.id} onClick={() => setActiveProj(p.id)}
            className={`whitespace-nowrap px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${activeProj === p.id ? 'border-violet-500 text-violet-700 font-medium' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {p.name}
          </button>
        ))}
      </div>
      {!projects.length && <div className="text-sm text-slate-400 py-10 text-center">No projects visible on your account yet.</div>}

      {!!projects.length && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <button onClick={() => shiftMonth(-1)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">‹</button>
              <div className="text-sm font-medium text-slate-700 w-40 text-center">{S.monthLabel(monthKey)}</div>
              <button onClick={() => shiftMonth(1)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">›</button>
              {monthKey !== S.monthKeyOf() && <button onClick={() => setMonthKey(S.monthKeyOf())} className="text-xs text-brand-600 hover:text-brand-700 ml-1">This Month</button>}
            </div>
            <div className="flex items-center gap-2">
              {canEdit && <button onClick={syncFromPhases} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><S.Icon name="refresh" className="w-3.5 h-3.5" />Sync from Phases</button>}
              <button onClick={exportPdf} disabled={!rows.length} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white"><S.Icon name="filepdf" className="w-3.5 h-3.5" />Export PDF</button>
            </div>
          </div>

          <S.Card className="p-5 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><div className="text-xs text-slate-400">Activities This Month</div><div className="font-medium">{total}</div></div>
              <div><div className="text-xs text-slate-400">Onsite</div><div className="font-medium">{onsiteCount} of {total}</div></div>
              <div><div className="text-xs text-slate-400">Done</div><S.Badge cls={S.deliveryStatusColor('Done')}>{doneCount} of {total}</S.Badge></div>
              <div><div className="text-xs text-slate-400">Pending</div><S.Badge cls={S.deliveryStatusColor('Pending')}>{pendingCount} of {total}</S.Badge></div>
            </div>
          </S.Card>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 mb-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <input type="date" className={S.gInp + ' w-auto'} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              <input placeholder="Activity description" className={S.gInp + ' flex-1 min-w-[180px]'} value={newActivity}
                onChange={(e) => setNewActivity(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addRow(); }} />
              <select className={S.gInp + ' w-auto'} value={newOnsite} onChange={(e) => setNewOnsite(e.target.value)}>
                {S.ONSITE_STATUS_OPTS.map((o) => <option key={o}>{o}</option>)}
              </select>
              <button onClick={addRow} disabled={!newActivity.trim()} className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap">+ Add Activity</button>
            </div>
          )}

          <S.Card className="p-5">
            {dateKeys.length === 0 && (
              <div className="text-sm text-slate-400 text-center py-10">
                No activities planned for {S.monthLabel(monthKey)} yet.{canEdit && ' Add one above, or use "Sync from Phases".'}
              </div>
            )}
            {dateKeys.map((k) => (
              <div key={k} className="mb-4 last:mb-0">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-2">
                  {k === '__unscheduled__' ? 'No Date Set' : fmtDate(k)}
                  <span className="text-slate-300 font-normal normal-case">({byDate[k].length})</span>
                </div>
                <div className="border border-slate-100 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <S.Th>Date</S.Th><S.Th>Activity</S.Th><S.Th>Source</S.Th><S.Th>Onsite / Offsite</S.Th><S.Th>Delivery Status</S.Th>{canEdit && <th className="w-8"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {byDate[k].map((r) => (
                        <tr key={r.id}>
                          <S.Td className="whitespace-nowrap">
                            {canEdit ? <input type="date" className={S.gInp + ' w-auto'} value={r.date || ''} onChange={(e) => patchRow(r.id, { date: e.target.value })} /> : (r.date ? fmtDate(r.date) : '—')}
                          </S.Td>
                          <S.Td>
                            {canEdit ? <input className={S.gInp} value={r.activity} onChange={(e) => patchRow(r.id, { activity: e.target.value })} /> : r.activity}
                          </S.Td>
                          <S.Td>
                            <span title={r.phase ? `Phase: ${r.phase}` : ''} className="text-xs text-slate-400 whitespace-nowrap">{r.sourceType || 'Custom'}</span>
                          </S.Td>
                          <S.Td>
                            {canEdit ? (
                              <select className={S.gInp + ' w-auto ' + S.onsiteStatusColor(r.onsite)} value={r.onsite} onChange={(e) => patchRow(r.id, { onsite: e.target.value })}>
                                {S.ONSITE_STATUS_OPTS.map((o) => <option key={o}>{o}</option>)}
                              </select>
                            ) : <S.Badge cls={S.onsiteStatusColor(r.onsite)}>{r.onsite}</S.Badge>}
                          </S.Td>
                          <S.Td>
                            {canEdit ? (
                              <select className={S.gInp + ' w-auto ' + S.deliveryStatusColor(r.deliveryStatus)} value={r.deliveryStatus} onChange={(e) => patchRow(r.id, { deliveryStatus: e.target.value })}>
                                {S.DELIVERY_STATUS_OPTS.map((o) => <option key={o}>{o}</option>)}
                              </select>
                            ) : <S.Badge cls={S.deliveryStatusColor(r.deliveryStatus)}>{r.deliveryStatus}</S.Badge>}
                          </S.Td>
                          {canEdit && <S.Td><button onClick={() => removeRow(r.id)} className="text-slate-300 hover:text-red-500"><S.Icon name="trash" className="w-4 h-4" /></button></S.Td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </S.Card>
        </>
      )}
    </div>
  );
}
