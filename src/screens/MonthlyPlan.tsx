import React, { useState } from 'react';
import * as S from '../shared';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Visual model matches a real client-facing monthly plan document (confirmed via mockup, see
// project memory): a printed-page look with two tables --
//   1. Major Objectives -- a short strategic summary for the month, with report due dates
//      in-house and at the client site. Entered by hand; not derived from anything.
//   2. A day-by-day table (Date / Day / Activity / Onsite-Offsite / Status) covering every
//      calendar day of the month, weekends blocked out unless the team explicitly logs something
//      on one. Once the plan is Final (see confirm/approve flow below), no-content days drop out
//      entirely so the document reads as a clean finished deliverable, not a work-in-progress grid.
const cellBase: React.CSSProperties = { border: '1px solid #000', padding: '6px 8px', verticalAlign: 'top', fontSize: 12 };
const headOrange: React.CSSProperties = { ...cellBase, background: '#ED7D31', fontWeight: 'bold', textAlign: 'center' };
const headBlue: React.CSSProperties = { ...cellBase, background: '#BDD7EE', fontWeight: 'bold', textAlign: 'center' };
const plainField: React.CSSProperties = { border: 'none', borderBottom: '1px dotted #bbb', background: 'transparent', fontFamily: 'inherit', fontSize: 12, width: '100%', outline: 'none', padding: 0, color: 'inherit' };

export default function MonthlyPlan(){
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { tree } = React.useContext(S.PhaseDataContext);
  const { plan, setPlan } = React.useContext(S.MonthlyPlanDataContext);
  const { role } = React.useContext(S.RoleContext);
  const { admin } = React.useContext(S.AdminDataContext);
  const { email: myEmail, profile: myProfile } = React.useContext(S.CurrentUserContext);

  // Optional chaining: a project-scoped restricted account (see S.staffVisibleProjects) can have
  // zero visible projects, so projects[0] may be undefined -- projects[0].id would crash the screen.
  const [activeProj, setActiveProj] = useState(projects[0]?.id);
  const projMeta = projects.find((p: any) => p.id === activeProj) || {};
  const [monthKey, setMonthKey] = useState(S.monthKeyOf());

  const hasPlan = !!(plan[activeProj] && plan[activeProj][monthKey]);
  const planData = (plan[activeProj] && plan[activeProj][monthKey]) || { objectives: [], activities: [] };
  const objectives: any[] = planData.objectives || [];
  const activities: any[] = planData.activities || [];
  const confirmStatus: string = planData.confirmStatus || 'Draft';
  const isPending = confirmStatus === 'Pending Approval';
  const isFinal = confirmStatus === 'Final';
  const setPlanData = (updater: any) => setPlan((pl: any) => {
    const forProj = pl[activeProj] || {};
    const prev = forProj[monthKey] || { objectives: [], activities: [] };
    const next = typeof updater === 'function' ? updater(prev) : updater;
    return { ...pl, [activeProj]: { ...forProj, [monthKey]: next } };
  });

  // Who's signed in, as far as THIS project's team is concerned -- same lookup Phases.tsx uses.
  // Confirm/Approve escalate along this same team-with-levels ladder (L1 most senior), not a fixed
  // role, so the chain matches whatever team is actually staffed on this specific project.
  const myTeamEntry = (projMeta.team || []).find((t: any) => t.name === myProfile?.name);
  const myLevel: string | null = myTeamEntry?.level || (role === 'admin' ? 'L1' : null);
  const presentLevelNums: number[] = S.projectLevelNumsPresent(projMeta); // ascending, L1 = most senior
  const myLevelNum = myLevel ? S.levelNum(myLevel) : null;
  const nextSeniorNum = myLevelNum != null
    ? presentLevelNums.filter((n) => n < myLevelNum).sort((a, b) => b - a)[0]
    : undefined;
  const nextLevelLabel = nextSeniorNum != null ? `L${nextSeniorNum}` : null;
  const pendingLevel: string | undefined = planData.pendingLevel;
  const pendingApproverName = pendingLevel ? (projMeta.team || []).find((t: any) => t.level === pendingLevel)?.name : '';
  const iAmApprover = isPending && (role === 'admin' || myLevel === pendingLevel);

  // Same edit gate Phase Management uses when the plan is still a draft (Phases.tsx's `readOnly`):
  // Admin/Super Admin always gets full rights; everyone else needs to be on THIS project's team.
  // Once sent for approval, only the approver (or Admin/Super Admin) can still touch it -- and once
  // Final, editing is restricted to Admin/Super Admin only, exactly as requested.
  const draftEdit = role === 'admin' || S.isOnProjectTeam(projMeta, myProfile?.name);
  const canEdit = isFinal ? role === 'admin' : isPending ? iAmApprover : draftEdit;
  const readOnly = !canEdit;

  const phases = tree[activeProj] || [];

  // Pull every Milestone/Sub Task across this project's Phase Management tree whose deadline falls
  // in the viewed month -- the "major deliverables for the month" -- and add one activity per item
  // not already on the plan (tracked by sourceId). A re-sync never duplicates or overwrites an
  // activity already here, so an edit made after syncing sticks even after syncing again.
  const syncFromPhases = () => {
    if (!canEdit || isFinal) return;
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
    setPlanData((pd: any) => {
      const acts = pd.activities || [];
      const have = new Set(acts.map((r: any) => r.sourceId).filter(Boolean));
      const fresh = found.filter((f) => !have.has(f.sourceId)).map((f) => ({
        id: S.uid('MP'), date: f.date, activity: f.activity, phase: f.phase,
        sourceId: f.sourceId, sourceType: f.sourceType, onsite: 'Offsite',
        status: f.done ? 'Done' : 'Pending',
      }));
      return fresh.length ? { ...pd, activities: [...acts, ...fresh] } : pd;
    });
  };

  // Auto-fill: the first time this project/month combination is opened (no plan record for it
  // yet), seed its activities straight from Phase Management -- matches "automatically filled from
  // the phases" in the original request. Major Objectives are never auto-filled -- there's nothing
  // in Phase Management that corresponds to a strategic monthly objective, that's entered by hand.
  React.useEffect(() => {
    if (draftEdit && !hasPlan && activeProj) syncFromPhases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProj, monthKey, hasPlan]);

  const shiftMonth = (delta: number) => {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonthKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const addRef = React.useRef<HTMLInputElement>(null);
  const [newDate, setNewDate] = useState(monthKey === S.monthKeyOf() ? S.TODAY_ISO : `${monthKey}-01`);
  const [newActivity, setNewActivity] = useState('');
  const [newOnsite, setNewOnsite] = useState('Offsite');
  React.useEffect(() => { setNewDate(monthKey === S.monthKeyOf() ? S.TODAY_ISO : `${monthKey}-01`); }, [monthKey]);

  const jumpToAdd = (dateIso: string) => {
    if (!canEdit || isFinal) return;
    setNewDate(dateIso);
    requestAnimationFrame(() => addRef.current?.focus());
  };
  const addActivity = () => {
    if (!canEdit || isFinal || !newActivity.trim() || !newDate) return;
    setPlanData((pd: any) => ({ ...pd, activities: [...(pd.activities || []), {
      id: S.uid('MP'), date: newDate, activity: newActivity.trim(), onsite: newOnsite,
      status: 'Pending', sourceId: null, sourceType: 'Custom', phase: '',
    }] }));
    setNewActivity('');
  };
  const removeActivity = (id: string) => { if (canEdit) setPlanData((pd: any) => ({ ...pd, activities: (pd.activities || []).filter((r: any) => r.id !== id) })); };
  const patchActivity = (id: string, patch: any) => { if (canEdit) setPlanData((pd: any) => ({ ...pd, activities: (pd.activities || []).map((r: any) => r.id === id ? { ...r, ...patch } : r) })); };

  const addObjective = () => { if (canEdit && !isFinal) setPlanData((pd: any) => ({ ...pd, objectives: [...(pd.objectives || []), { id: S.uid('OBJ'), text: '', dueInHouse: '', dueClient: '' }] })); };
  const removeObjective = (id: string) => { if (canEdit) setPlanData((pd: any) => ({ ...pd, objectives: (pd.objectives || []).filter((o: any) => o.id !== id) })); };
  const patchObjective = (id: string, patch: any) => { if (canEdit) setPlanData((pd: any) => ({ ...pd, objectives: (pd.objectives || []).map((o: any) => o.id === id ? { ...o, ...patch } : o) })); };

  // ---- confirm / approve / finalize ----
  const finalizePlan = () => {
    setPlanData((pd: any) => {
      const acts = (pd.activities || []).filter((r: any) => (r.activity || '').trim());
      return { ...pd, activities: acts, confirmStatus: 'Final', approvedBy: myProfile?.name || myEmail, approvedAt: S.TODAY_ISO };
    });
  };
  const confirmPlan = () => {
    if (!draftEdit || confirmStatus !== 'Draft') return;
    if (nextLevelLabel) {
      setPlanData((pd: any) => ({ ...pd, confirmStatus: 'Pending Approval', pendingLevel: nextLevelLabel, confirmedBy: myProfile?.name || myEmail, confirmedAt: S.TODAY_ISO }));
    } else {
      finalizePlan();
    }
  };
  const approvePlan = () => { if (iAmApprover) finalizePlan(); };

  const fmtDDMY = (iso: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return '—';
    return `${d}-${m}-${String(y).slice(2)}`;
  };

  const [y, m] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const isWeekend = (day: number) => { const dow = new Date(y, m - 1, day).getDay(); return dow === 0 || dow === 6; };
  const dayName = (day: number) => new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long' });

  const total = activities.length;
  const onsiteCount = activities.filter((r: any) => r.onsite === 'Onsite').length;
  const doneCount = activities.filter((r: any) => r.status === 'Done').length;
  const pendingCount = activities.filter((r: any) => r.status === 'Pending').length;

  const exportPdf = () => {
    const doc: any = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Monthly Plan — ${projMeta.name || ''}`, 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(`${S.monthLabel(monthKey)}${projMeta.client ? ' · ' + projMeta.client : ''}`, 14, 21);

    let nextY = 27;
    if (objectives.length) {
      autoTable(doc, {
        startY: nextY,
        head: [['Sl. No', 'Major objectives', 'Report submitted in-house', 'Report submitted at client site']],
        body: objectives.map((o: any, i: number) => [i + 1, o.text, fmtDDMY(o.dueInHouse), fmtDDMY(o.dueClient)]),
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [237, 125, 49], textColor: 0 },
      });
      nextY = doc.lastAutoTable.finalY + 8;
    }

    const dayBody: any[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateIso = `${monthKey}-${String(day).padStart(2, '0')}`;
      const lines = activities.filter((r: any) => r.date === dateIso);
      if (isFinal) { if (!lines.length) continue; }
      else if (isWeekend(day) && !lines.length) { dayBody.push([day, dayName(day), '', '', '']); continue; }
      if (!lines.length) { dayBody.push([day, dayName(day), '', '', '']); continue; }
      lines.forEach((r: any, i: number) => dayBody.push([i === 0 ? day : '', i === 0 ? dayName(day) : '', r.activity, r.onsite, r.status]));
    }
    autoTable(doc, {
      startY: nextY,
      head: [['Date', 'Day', 'Activity', 'Onsite / Offsite', 'Status']],
      body: dayBody,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [189, 215, 238], textColor: 0 },
      columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: 24 } },
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text('HSJB Business Solutions', pageWidth / 2, pageHeight - 10, { align: 'center' });

    doc.save(`Monthly-Plan-${(projMeta.name || 'project').replace(/[^a-z0-9]+/gi, '-')}-${monthKey}.pdf`);
  };

  // ---- day-by-day table rows ----
  const dayRows: React.ReactNode[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateIso = `${monthKey}-${String(day).padStart(2, '0')}`;
    const lines = activities.filter((r: any) => r.date === dateIso);
    const weekend = isWeekend(day);
    // Once Final, dates with nothing on them are dropped entirely -- the finished document only
    // lists real content, not a full blank calendar grid.
    if (isFinal && !lines.length) continue;
    if (!isFinal && weekend && !lines.length) {
      dayRows.push(
        <tr key={dateIso} style={{ background: '#ED7D31' }}>
          <td style={{ ...cellBase, textAlign: 'center' }}>{day}</td>
          <td style={cellBase}>{dayName(day)}</td>
          <td style={cellBase} colSpan={3}></td>
        </tr>
      );
      continue;
    }
    const lineCount = Math.max(lines.length, 1);
    for (let i = 0; i < lineCount; i++) {
      const r = lines[i];
      dayRows.push(
        <tr key={dateIso + '-' + i}>
          {i === 0 && <td rowSpan={lineCount} style={{ ...cellBase, textAlign: 'center' }}>{day}</td>}
          {i === 0 && <td rowSpan={lineCount} style={cellBase}>{dayName(day)}</td>}
          {r ? (
            <>
              <td style={cellBase}>{canEdit ? <textarea rows={2} style={{ ...plainField, resize: 'vertical' }} value={r.activity} onChange={(e) => patchActivity(r.id, { activity: e.target.value })} /> : r.activity}</td>
              <td style={{ ...cellBase, textAlign: 'center', color: r.onsite === 'Onsite' ? '#C55A11' : '#888' }}>
                {canEdit ? (
                  <select style={{ ...plainField, textAlign: 'center', color: r.onsite === 'Onsite' ? '#C55A11' : '#888' }} value={r.onsite} onChange={(e) => patchActivity(r.id, { onsite: e.target.value })}>
                    {S.ONSITE_STATUS_OPTS.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : r.onsite}
              </td>
              <td style={{ ...cellBase, textAlign: 'center' }}>
                {canEdit ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                    <select className={S.deliveryStatusColor(r.status)} style={{ ...plainField, width: 'auto', textAlign: 'center', borderRadius: 4, padding: '1px 4px' }} value={r.status} onChange={(e) => patchActivity(r.id, { status: e.target.value })}>
                      {S.DELIVERY_STATUS_OPTS.map((o) => <option key={o}>{o}</option>)}
                    </select>
                    <button onClick={() => removeActivity(r.id)} title="Remove" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999', fontSize: 12, lineHeight: 1 }}>×</button>
                  </span>
                ) : <S.Badge cls={S.deliveryStatusColor(r.status)}>{r.status}</S.Badge>}
              </td>
            </>
          ) : (
            <>
              <td style={{ ...cellBase, color: '#bbb', fontStyle: 'italic', cursor: canEdit ? 'pointer' : 'default' }} onClick={() => jumpToAdd(dateIso)}>{canEdit ? 'Click to add…' : '—'}</td>
              <td style={cellBase}></td>
              <td style={cellBase}></td>
            </>
          )}
        </tr>
      );
    }
  }

  return (
    <div>
      <S.SectionTitle sub="A client-ready monthly engagement plan per project — major objectives plus a day-by-day activity table, auto-filled from Phase Management and editable by the team until confirmed.">Monthly Plan</S.SectionTitle>

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
              {confirmStatus !== 'Draft' && (
                <S.Badge cls={isFinal ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
                  {isFinal ? 'Final' : `Pending approval · ${pendingApproverName || S.designationForLevel(pendingLevel || '', admin) || pendingLevel}`}
                </S.Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {draftEdit && confirmStatus === 'Draft' && <button onClick={syncFromPhases} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><S.Icon name="refresh" className="w-3.5 h-3.5" />Sync from Phases</button>}
              <button onClick={exportPdf} disabled={!activities.length && !objectives.length} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white"><S.Icon name="filepdf" className="w-3.5 h-3.5" />Export PDF</button>
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

          {canEdit && !isFinal && (
            <div className="flex flex-wrap items-center gap-2 mb-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <input ref={addRef} type="date" className={S.gInp + ' w-auto'} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              <input placeholder="Activity description" className={S.gInp + ' flex-1 min-w-[180px]'} value={newActivity}
                onChange={(e) => setNewActivity(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addActivity(); }} />
              <select className={S.gInp + ' w-auto'} value={newOnsite} onChange={(e) => setNewOnsite(e.target.value)}>
                {S.ONSITE_STATUS_OPTS.map((o) => <option key={o}>{o}</option>)}
              </select>
              <button onClick={addActivity} disabled={!newActivity.trim()} className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap">+ Add Activity</button>
            </div>
          )}

          <div style={{ background: '#fff', color: '#1a1a1a', border: '1px solid #d0d0d0', borderRadius: 2, padding: '28px 32px', fontFamily: "Georgia, 'Times New Roman', serif", maxWidth: 900, margin: '0 auto' }}>
            <div style={{ fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 }}>
              Monthly Plan — {projMeta.name || 'Project'} — {S.monthLabel(monthKey)}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 22 }}>
              <thead>
                <tr>
                  <th style={{ ...headOrange, width: 44 }}>Sl. No</th>
                  <th style={{ ...headOrange, textAlign: 'left' }}>Major objectives</th>
                  <th style={{ ...headOrange, width: 120 }}>Report submitted in-house</th>
                  <th style={{ ...headOrange, width: 120 }}>Report submitted at client site</th>
                  {canEdit && !isFinal && <th style={{ ...headOrange, width: 24 }}></th>}
                </tr>
              </thead>
              <tbody>
                {objectives.map((o: any, i: number) => (
                  <tr key={o.id}>
                    <td style={{ ...cellBase, textAlign: 'center' }}>{i + 1}</td>
                    <td style={cellBase}>{canEdit ? <input style={plainField} placeholder="Objective" value={o.text} onChange={(e) => patchObjective(o.id, { text: e.target.value })} /> : o.text}</td>
                    <td style={{ ...cellBase, textAlign: 'center' }}>{canEdit ? <input type="date" style={{ ...plainField, textAlign: 'center' }} value={o.dueInHouse || ''} onChange={(e) => patchObjective(o.id, { dueInHouse: e.target.value })} /> : fmtDDMY(o.dueInHouse)}</td>
                    <td style={{ ...cellBase, textAlign: 'center' }}>{canEdit ? <input type="date" style={{ ...plainField, textAlign: 'center' }} value={o.dueClient || ''} onChange={(e) => patchObjective(o.id, { dueClient: e.target.value })} /> : fmtDDMY(o.dueClient)}</td>
                    {canEdit && !isFinal && <td style={{ ...cellBase, textAlign: 'center' }}><button onClick={() => removeObjective(o.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999' }}>×</button></td>}
                  </tr>
                ))}
                {!objectives.length && <tr><td colSpan={canEdit && !isFinal ? 5 : 4} style={{ ...cellBase, textAlign: 'center', color: '#999', fontStyle: 'italic' }}>No major objectives added yet.</td></tr>}
              </tbody>
            </table>
            {canEdit && !isFinal && <button onClick={addObjective} style={{ fontSize: 12, color: '#C55A11', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 22, padding: 0 }}>+ Add objective</button>}

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...headBlue, width: 34 }}>Date</th>
                  <th style={{ ...headBlue, width: 90 }}>Day</th>
                  <th style={{ ...headBlue, textAlign: 'left' }}>Activity</th>
                  <th style={{ ...headBlue, width: 110 }}>Onsite / Offsite</th>
                  <th style={{ ...headBlue, width: 130 }}>Status</th>
                </tr>
              </thead>
              <tbody>{dayRows}</tbody>
            </table>

            <div style={{ borderTop: '1px solid #ddd', marginTop: 24, paddingTop: 16 }}>
              {confirmStatus === 'Draft' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: '#666', fontFamily: 'inherit' }}>
                    {draftEdit
                      ? (nextLevelLabel
                          ? `Confirming sends this plan to ${S.designationForLevel(nextLevelLabel, admin) || nextLevelLabel} for approval.`
                          : 'Confirming finalizes this plan — no more senior level is on this project\'s team.')
                      : 'Awaiting confirmation from the project team.'}
                  </div>
                  {draftEdit && (
                    <button onClick={confirmPlan} disabled={!objectives.length && !activities.length}
                      style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", background: '#3b5bdb', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: 'pointer', opacity: (!objectives.length && !activities.length) ? 0.4 : 1 }}>
                      {nextLevelLabel ? 'Confirm & send for approval' : 'Confirm & finalize'}
                    </button>
                  )}
                </div>
              )}
              {isPending && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: '#666', fontFamily: 'inherit' }}>
                    Confirmed by {planData.confirmedBy} on {fmtDDMY(planData.confirmedAt)} — pending approval from {pendingApproverName ? `${pendingApproverName} (${S.designationForLevel(pendingLevel || '', admin) || pendingLevel})` : (S.designationForLevel(pendingLevel || '', admin) || pendingLevel)}.
                  </div>
                  {iAmApprover && (
                    <button onClick={approvePlan}
                      style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", background: '#0f6e56', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
                      Approve & finalize
                    </button>
                  )}
                </div>
              )}
              {isFinal && (
                <div style={{ fontSize: 12, color: '#666', fontFamily: 'inherit' }}>
                  Confirmed by {planData.confirmedBy || '—'}{planData.confirmedAt ? ` on ${fmtDDMY(planData.confirmedAt)}` : ''}, approved and finalized by {planData.approvedBy || '—'}{planData.approvedAt ? ` on ${fmtDDMY(planData.approvedAt)}` : ''}. Only Admin/Super Admin can edit this plan now.
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', fontSize: 11, color: '#999', marginTop: 24, paddingTop: 12, borderTop: '1px solid #eee', fontFamily: 'inherit' }}>
              HSJB Business Solutions
            </div>
          </div>
        </>
      )}
    </div>
  );
}
