import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import * as S from '../shared';
import * as db from '../db';

export default function Portal(){
  const location = useLocation();
  const { tree, setTree, addNotification } = React.useContext(S.PhaseDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { admin } = React.useContext(S.AdminDataContext);
  const { email, profile: myProfile } = React.useContext(S.CurrentUserContext);
  // Issue Management: a client can raise an issue on their own project the same way a teammate can
  // (see screens/Issues.tsx) -- and see only the issues they raised or were tagged on, same
  // visibility rule Issues.tsx enforces for staff.
  const { issues, setIssues } = React.useContext(S.GovernanceDataContext);
  // Same Client Portal capability whether this is a Client-type login or a staff account previewing
  // the portal (both reach this screen only once App.tsx's route Gate confirms capability >= View) --
  // Edit or above unlocks the sign-off actions below; exactly View means read-only: the timeline is
  // visible but Approve/Request Changes/Remark are hidden, since the account can only look, not act.
  const canAct = S.capAtLeast(S.capabilityFor('Client Portal', email, admin), 'Edit');
  const [activeProj, setActiveProj] = useState(projects[0]?.id);
  const [openPhase, setOpenPhase] = useState({});
  const [openMs, setOpenMs] = useState({});
  const [remarkDraft, setRemarkDraft] = useState({});
  const [expandedApproval, setExpandedApproval] = useState(null);
  // Declared here (not below, alongside the rest of the issue-raising logic) so it's called
  // unconditionally on every render, same as every other useState above -- the early "no projects"
  // return right below this would otherwise skip it on some renders and violate the Rules of Hooks.
  const [issueDraft, setIssueDraft] = useState({ desc:'', severity:'Medium' });
  const [raisingIssue, setRaisingIssue] = useState(false);

  // Deep link from a notification click (see shared.tsx's notificationTarget) — jumps straight to the
  // project/phase/milestone the notification was about instead of leaving the client to hunt through
  // the timeline. Also called unconditionally, above the "no projects" early return, same reasoning
  // as issueDraft/raisingIssue above.
  React.useEffect(() => {
    const deepLink: any = location.state;
    if (!deepLink) return;
    if (deepLink.projectId) setActiveProj(deepLink.projectId);
    if (deepLink.phaseId) setOpenPhase((o:any) => ({ ...o, [deepLink.phaseId]: true }));
    if (deepLink.msId) setOpenMs((o:any) => ({ ...o, [deepLink.msId]: true }));
    if (deepLink.stId || deepLink.msId) setExpandedApproval(deepLink.stId || deepLink.msId);
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reached with no projects when a Client-type account's tagged project has since been removed (or
  // was never set) -- ProjectsDataContext is filtered to just their one project for that role (see
  // App.tsx), so an empty list here specifically means "nothing assigned", not "no projects exist".
  if (projects.length === 0) {
    return (
      <div>
        <S.SectionTitle sub="Client-facing view — approvals pending your sign-off, plus a simple phase / milestone / sub task timeline">Client Portal</S.SectionTitle>
        <S.Card className="p-8 text-center text-sm text-slate-400">No project has been assigned to this account yet — contact your project team.</S.Card>
      </div>
    );
  }

  const phases = tree[activeProj] || [];
  const projMeta = projects.find(p=>p.id===activeProj) || {};
  const roster = S.buildRoster(projMeta, admin);
  const clientOwner = (projMeta.clients||[]).find(c=>c.owner);
  const notifyProject = (payload) => addNotification({ projectId:activeProj, project:projMeta.name, tags: roster.map(r=>r.name), priority:'high', ...payload });

  // ---- Project Health — the first thing a client should see: is this project on track, and if
  // not, exactly what's late. Milestones (not sub tasks) are the client-meaningful unit of progress
  // here, same granularity the sign-off flow above already uses. ----
  const msOnly = phases.flatMap((ph:any)=>ph.milestones||[]);
  const stOnly = msOnly.flatMap((ms:any)=>ms.subtasks||[]);
  const msDone = msOnly.filter(S.isApproved).length;
  const stDone = stOnly.filter(S.isApproved).length;
  const msPct = msOnly.length ? Math.round(100*msDone/msOnly.length) : 0;

  // Everything actually late right now: an unapproved milestone/sub task past its deadline, or a
  // phase past its end date that isn't Completed or deliberately On Hold. Each keeps its parent
  // phase name and how many days overdue, feeding both the health card's callout below and the red
  // "overdue" badges in Project Timeline further down — one source of truth for "what's delayed" so
  // the two never disagree.
  const delayedItems: any[] = [];
  phases.forEach((ph:any)=>{
    if(ph.end && ph.end<S.TODAY_ISO && S.derivedPhaseStatus(ph)!=='Completed' && !ph.onHold){
      delayedItems.push({ label:`Phase: ${ph.name}`, phaseName:ph.name, daysOverdue:-S.daysLeft(ph.end) });
    }
    (ph.milestones||[]).forEach((ms:any)=>{
      if(S.isOverdue(ms)) delayedItems.push({ label:ms.name, phaseName:ph.name, daysOverdue:-S.daysLeft(ms.deadline) });
      (ms.subtasks||[]).forEach((s:any)=>{
        if(S.isOverdue(s)) delayedItems.push({ label:s.name, phaseName:ph.name, daysOverdue:-S.daysLeft(s.deadline) });
      });
    });
  });
  delayedItems.sort((a,b)=>b.daysOverdue-a.daysOverdue);

  const nextMilestone = (()=>{
    const mss = msOnly.filter((m:any)=>!S.isApproved(m) && m.deadline);
    if(!mss.length) return null;
    return [...mss].sort((a:any,b:any)=>a.deadline<b.deadline?-1:1)[0];
  })();

  // Pace check: what share of the project's planned calendar has elapsed vs. what share of
  // milestones are actually done — the gap is a plain-language answer to "are we behind" even before
  // anything is formally overdue (e.g. deadlines further out, but work isn't keeping pace).
  const totalPlannedDays = S.daysBetween(projMeta.start, projMeta.end);
  const elapsedDaysRaw = projMeta.start ? S.daysBetween(projMeta.start, S.TODAY_ISO) : null;
  const timeElapsedPct = (totalPlannedDays && elapsedDaysRaw!==null) ? Math.min(100, Math.round(100*elapsedDaysRaw/totalPlannedDays)) : null;
  const paceTrailing = timeElapsedPct!==null && msOnly.length>0 && (timeElapsedPct - msPct) >= 20;

  // Red = something is actually late, or the project's own end date has lapsed with no extension on
  // file (S.needsExtension — same signal Dashboard's Portfolio Health uses). Amber = nothing overdue
  // yet, but either the next milestone is due within a week or the pace check above is trailing.
  const overallHealth = (delayedItems.length>0 || S.needsExtension(projMeta)) ? 'red'
    : ((nextMilestone && S.daysLeft(nextMilestone.deadline)<=7) || paceTrailing) ? 'amber'
    : 'green';

  // My name as far as the issue register is concerned -- matches how it's recorded in
  // project.clients[] (see Project Master), falling back to the Client Owner label if this login
  // isn't itself a named client contact.
  const myClientName = myProfile?.name || clientOwner?.name || email;
  const myIssues = issues.filter(i => i.project===projMeta.name && (i.raisedBy===myClientName || (i.tags||[]).includes(myClientName)));
  // ID reserved atomically in the database (db.nextSeqId) so two people raising an issue at the
  // same moment can't be handed the same IS-NNN number (see Issues.tsx for the same fix).
  const raiseIssue = async () => {
    if(!canAct || !issueDraft.desc.trim() || raisingIssue) return;
    setRaisingIssue(true);
    try {
      const id = await db.nextSeqId('IS');
      const fresh = {
        id, project: projMeta.name, desc: issueDraft.desc.trim(), raisedBy: myClientName, assignee: '', tags: [],
        severity: issueDraft.severity, due: '', status: 'Open', pendingStatus: null,
        addedBy: myClientName, addedAt: new Date().toISOString(), remarks: [],
      };
      setIssues((is:any[]) => [...is, fresh]);
      notifyProject({ level:'issue', itemName:fresh.desc, itemId:fresh.id, type:'Issue Raised',
        message:`${myClientName} raised a new issue: "${fresh.desc}" (${id}) in ${projMeta.name}. Assign an owner to get it moving.` });
      setIssueDraft({ desc:'', severity:'Medium' });
    } finally { setRaisingIssue(false); }
  };

  // Pipeline: only items whose internal level-approval chain (Phase Management -> Mark Implemented,
  // see S.implementChainFor) is fully complete show up here —
  // that hand-off is what makes the Client Owner's approval window appear at all.
  const pending = [];
  phases.forEach(ph=>{
    ph.milestones.forEach(ms=>{
      if(ms.review==='Implemented Review' && ms.headApprovedImpl && !ms.clientApprovedImpl) pending.push({level:'Milestone', ph, ms, item:ms});
      (ms.subtasks||[]).forEach(s=>{
        if(s.review==='Implemented Review' && s.headApprovedImpl && !s.clientApprovedImpl) pending.push({level:'Sub Task', ph, ms, item:s});
      });
    });
  });

  const setRemark = (id, v) => setRemarkDraft(d => ({...d, [id]:v}));

  const clientApprove = (entry) => {
    if(!canAct) return;
    const { level, ph, ms, item } = entry;
    if(level==='Milestone'){
      setTree(t => S.mutateMs(t, activeProj, ph.id, ms.id, m => ({...m, status:'Implemented', review:'', clientApprovedImpl:true, clientAcceptedDate:S.TODAY_ISO})));
    } else {
      setTree(t => S.mutateSt(t, activeProj, ph.id, ms.id, item.id, s => ({...s, status:'Implemented', review:'', clientApprovedImpl:true, clientAcceptedDate:S.TODAY_ISO})));
    }
    notifyProject({ level:level.toLowerCase(), itemName:item.name, phaseName:ph.name, phaseId:ph.id, msId:ms.id, stId:level==='Sub Task'?item.id:undefined, type:'Implemented',
      message:`"${item.name}" in phase "${ph.name}" has been marked Implemented after internal approval and Client Owner sign-off.` });
  };

  const requestChanges = (entry) => {
    if(!canAct) return;
    const { level, ph, ms, item } = entry;
    if(level==='Milestone'){
      setTree(t => S.mutateMs(t, activeProj, ph.id, ms.id, m => ({...m, review:'', headApprovedImpl:false})));
    } else {
      setTree(t => S.mutateSt(t, activeProj, ph.id, ms.id, item.id, s => ({...s, review:'', headApprovedImpl:false})));
    }
    const text = (remarkDraft[item.id]||'').trim();
    notifyProject({ level:level.toLowerCase(), itemName:item.name, phaseName:ph.name, phaseId:ph.id, msId:ms.id, stId:level==='Sub Task'?item.id:undefined, type:'Client Requested Changes',
      message:`Client Owner requested changes on "${item.name}" (${ph.name})${text?`: "${text}"`:'.'}` });
    setRemark(item.id, '');
  };

  const postRemark = (entry) => {
    if(!canAct) return;
    const { level, ph, ms, item } = entry;
    const text = (remarkDraft[item.id]||'').trim();
    if(!text) return;
    notifyProject({ level:level.toLowerCase(), itemName:item.name, phaseName:ph.name, phaseId:ph.id, msId:ms.id, stId:level==='Sub Task'?item.id:undefined, type:'Client Remark',
      message:`Client remark on "${item.name}" (${ph.name}): "${text}"` });
    setRemark(item.id, '');
  };

  const togglePhase = (id) => setOpenPhase(o => ({...o, [id]: !o[id]}));
  const toggleMs = (id) => setOpenMs(o => ({...o, [id]: !o[id]}));

  return (
    <div>
      <S.SectionTitle sub="Client-facing view — project health, approvals pending your sign-off, and a phase / milestone / sub task timeline">Client Portal{projMeta.client?` — ${projMeta.client}`:''}</S.SectionTitle>

      {/* Project tabs (stands in for "logged in as this client's project" in the prototype) */}
      <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto">
        {projects.map(p=>(
          <button key={p.id} onClick={()=>setActiveProj(p.id)}
            className={`whitespace-nowrap px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${activeProj===p.id?'border-violet-500 text-violet-700 font-medium':'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {p.name}
          </button>
        ))}
      </div>

      {clientOwner && (
        <div className="mb-4 text-xs text-slate-400">Signed in as Client Owner: <span className="font-medium text-slate-600">{clientOwner.name}</span>, {clientOwner.designation}</div>
      )}

      {!canAct && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">You have view-only access to this portal — sign-off and remarks are turned off for this account.</div>
      )}

      {/* Project Health — on track / delayed at a glance, plus exactly what's late if anything is,
          before the client has to go digging through the timeline for it. */}
      <S.Card className={`p-4 mb-5 border-l-4 ${overallHealth==='red'?'border-l-red-400':overallHealth==='amber'?'border-l-amber-400':'border-l-emerald-400'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <S.Icon name={overallHealth==='red'?'alert':overallHealth==='amber'?'clock':'checkcircle'} className={`w-5 h-5 ${overallHealth==='red'?'text-red-500':overallHealth==='amber'?'text-amber-500':'text-emerald-500'}`}/>
            <span className={`font-semibold ${overallHealth==='red'?'text-red-700':overallHealth==='amber'?'text-amber-700':'text-emerald-700'}`}>
              {overallHealth==='red' ? 'Delayed' : overallHealth==='amber' ? 'On Track — keep an eye on this' : 'On Track'}
            </span>
          </div>
          <span className="text-xs text-slate-400 whitespace-nowrap">{projMeta.start||'—'} → {projMeta.end||'—'}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-slate-400 mb-1">Milestones Completed</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-100 rounded-full"><div className="h-2 rounded-full bg-brand-500" style={{width:`${msPct}%`}}></div></div>
              <span className="text-xs font-medium text-slate-600 whitespace-nowrap">{msDone}/{msOnly.length}</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{stDone}/{stOnly.length} sub tasks done</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Time Elapsed</div>
            {timeElapsedPct!==null ? (<>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-slate-100 rounded-full"><div className={`h-2 rounded-full ${paceTrailing?'bg-amber-500':'bg-slate-400'}`} style={{width:`${timeElapsedPct}%`}}></div></div>
                <span className="text-xs font-medium text-slate-600 whitespace-nowrap">{timeElapsedPct}%</span>
              </div>
              <div className={`text-[11px] mt-1 ${paceTrailing?'text-amber-600':'text-slate-400'}`}>{paceTrailing?'Work is trailing the schedule':'Pace looks healthy'}</div>
            </>) : <div className="text-sm text-slate-400">No project dates set.</div>}
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Next Milestone</div>
            {nextMilestone ? (<>
              <div className="text-sm font-medium text-slate-700 truncate">{nextMilestone.name}</div>
              <div className={`text-[11px] mt-0.5 ${S.isOverdue(nextMilestone)?'text-red-600 font-medium':'text-slate-400'}`}>
                {nextMilestone.deadline}{S.isOverdue(nextMilestone) ? ` · ${-S.daysLeft(nextMilestone.deadline)}d overdue` : ` · in ${S.daysLeft(nextMilestone.deadline)}d`}
              </div>
            </>) : <div className="text-sm text-slate-400">Nothing upcoming.</div>}
          </div>
        </div>

        {(delayedItems.length>0 || S.needsExtension(projMeta)) && (
          <div className="border-t border-slate-100 mt-4 pt-3">
            <div className="text-xs font-medium text-red-600 mb-1.5">What's causing the delay</div>
            <div className="space-y-1">
              {S.needsExtension(projMeta) && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
                  The project's planned end date ({projMeta.end}) has passed and no extension has been confirmed yet.
                </div>
              )}
              {delayedItems.slice(0,5).map((d,i)=>(
                <div key={i} className="flex justify-between items-center gap-2 text-xs bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
                  <span className="text-slate-700 truncate">{d.label} <span className="text-slate-400">— {d.phaseName}</span></span>
                  <span className="text-red-600 font-medium whitespace-nowrap">{d.daysOverdue}d overdue</span>
                </div>
              ))}
              {delayedItems.length>5 && <div className="text-[11px] text-slate-400">+{delayedItems.length-5} more overdue — see Project Timeline below.</div>}
            </div>
          </div>
        )}
      </S.Card>

      {/* Pending Your Approval — phase-wise, expandable */}
      <S.Card className="p-4 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-semibold text-slate-800">Pending Your Approval</span>
          {pending.length>0 && <S.Badge cls="bg-violet-100 text-violet-700">{pending.length}</S.Badge>}
        </div>
        {pending.length===0 ? (
          <div className="text-sm text-slate-400">Nothing is waiting on you right now.</div>
        ) : (
          <div className="space-y-2">
            {pending.map(entry=>{ const { level, ph, item } = entry; const open = expandedApproval===item.id; return (
              <div key={item.id} className="border border-violet-200 rounded-lg overflow-hidden">
                <button onClick={()=>setExpandedApproval(open?null:item.id)} className="w-full flex flex-wrap items-center gap-3 px-3 py-2.5 bg-violet-50/60 text-left">
                  <span className="text-slate-400 text-xs w-4">{open?'▼':'▶'}</span>
                  <S.Badge cls="bg-sky-100 text-sky-700">{ph.name}</S.Badge>
                  <S.Badge cls={S.LEVEL[level==='Milestone'?'milestone':'subtask'].badge}>{level}</S.Badge>
                  <span className="font-medium text-slate-800">{item.name}</span>
                  <span className="text-xs text-slate-400 ml-auto whitespace-nowrap">Deadline {item.deadline || '—'}</span>
                  <S.Badge cls={S.statusColor('Client Review')}>Awaiting your sign-off</S.Badge>
                </button>
                {open && (
                  <div className="px-4 py-3 border-t border-violet-100 bg-white space-y-3">
                    <div className="text-xs text-slate-500">Approved internally by the project team — your sign-off marks this <b>Implemented</b>, the most important status in the project.</div>
                    {canAct ? (
                      <>
                        <div className="flex gap-2">
                          <button onClick={()=>clientApprove(entry)} className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg flex-1">✓ Approve as Implemented</button>
                          <button onClick={()=>requestChanges(entry)} className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs px-3 py-1.5 rounded-lg flex-1">Request Changes</button>
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Add a remark (sent as high priority to the whole project team)</label>
                          <div className="flex gap-2">
                            <textarea rows={2} value={remarkDraft[item.id]||''} onChange={e=>setRemark(item.id, e.target.value)} placeholder="Type your remark…"
                              className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"></textarea>
                            <button onClick={()=>postRemark(entry)} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-1.5 self-end whitespace-nowrap">Post Remark</button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-slate-400">This account has view-only access — sign-off and remarks are disabled.</div>
                    )}
                  </div>
                )}
              </div>
            );})}
          </div>
        )}
      </S.Card>

      {/* Issues -- raise one, and see only the ones you raised or were tagged on (same visibility
          rule Issue Management enforces for staff, see screens/Issues.tsx) */}
      <S.Card className="p-4 mb-5">
        <div className="font-semibold text-slate-800 mb-3">Issues</div>
        {canAct ? (
          <div className="flex flex-wrap items-end gap-2 mb-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="flex-1 min-w-[200px] flex flex-col gap-1">
              <label className="text-[10px] text-slate-400">Describe the issue</label>
              <input value={issueDraft.desc} onChange={e=>setIssueDraft(d=>({...d,desc:e.target.value}))} placeholder="What's going wrong?"
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                onKeyDown={e=>{ if(e.key==='Enter') raiseIssue(); }}/>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-400">Severity</label>
              <select value={issueDraft.severity} onChange={e=>setIssueDraft(d=>({...d,severity:e.target.value}))}
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {S.RAG.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <button onClick={raiseIssue} disabled={!issueDraft.desc.trim() || raisingIssue} className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap">{raisingIssue ? 'Raising…' : 'Raise Issue'}</button>
          </div>
        ) : (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">This account has view-only access — raising an issue is disabled.</div>
        )}
        {myIssues.length===0 ? (
          <div className="text-sm text-slate-400">No issues raised or tagged to you yet.</div>
        ) : (
          <div className="space-y-1.5">
            {myIssues.map((i:any)=>(
              <div key={i.id} className="flex items-center justify-between gap-2 text-sm bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-700 truncate">{i.desc}</div>
                  <div className="text-[10px] text-slate-400">{i.id} · Raised by {i.raisedBy}{i.assignee?` · Assigned to ${i.assignee}`:''}</div>
                </div>
                <S.Badge cls={S.statusColor(i.pendingStatus ? 'Pending Sign-off' : i.status)}>{i.pendingStatus ? `Pending Sign-off (${i.pendingStatus})` : i.status}</S.Badge>
              </div>
            ))}
          </div>
        )}
      </S.Card>

      {/* Simple timeline: Phase -> Milestone -> Sub Task, deadline & status only */}
      <S.Card className="p-4">
        <div className="font-semibold text-slate-800 mb-3">Project Timeline</div>
        <div className="space-y-2">
          {phases.map(ph=>{
            const phOpen = !!openPhase[ph.id]; const phStatus = S.derivedPhaseStatus(ph);
            const phDelayed = ph.end && ph.end<S.TODAY_ISO && phStatus!=='Completed' && !ph.onHold;
            const phDone = ph.milestones.filter(S.isApproved).length;
            return (
            <div key={ph.id} className={`border rounded-lg overflow-hidden ${phDelayed?'border-red-200':'border-slate-200'}`}>
              <button onClick={()=>togglePhase(ph.id)} className={`w-full flex flex-wrap items-center gap-3 px-3 py-2.5 text-left ${phDelayed?'bg-red-50/50':'bg-slate-50'}`}>
                <span className="text-slate-400 text-xs w-4">{phOpen?'▼':'▶'}</span>
                <span className="font-medium text-slate-800">{ph.name}</span>
                <span className="text-xs text-slate-400 whitespace-nowrap">{phDone}/{ph.milestones.length} milestones</span>
                <span className="text-xs text-slate-400 whitespace-nowrap ml-auto">Deadline {ph.end || '—'}</span>
                {phDelayed && <S.Badge cls="bg-red-100 text-red-700">{-S.daysLeft(ph.end)}d overdue</S.Badge>}
                <S.Badge cls={S.statusColor(phStatus)}>{phStatus}</S.Badge>
              </button>
              {phOpen && (
                <div className="divide-y divide-slate-100">
                  {ph.milestones.map(ms=>{ const msOpen = !!openMs[ms.id]; const msDelayed = S.isOverdue(ms); return (
                    <div key={ms.id}>
                      <button onClick={()=>toggleMs(ms.id)} className={`w-full flex flex-wrap items-center gap-3 px-3 py-2 pl-8 text-left hover:bg-slate-50 ${msDelayed?'bg-red-50/30':''}`}>
                        <span className="text-slate-300 text-xs w-4">{ms.subtasks&&ms.subtasks.length ? (msOpen?'▼':'▶') : '·'}</span>
                        <span className="text-sm text-slate-700 flex-1">{ms.name}</span>
                        <span className="text-xs text-slate-400 whitespace-nowrap">Deadline {ms.deadline || '—'}</span>
                        {msDelayed && <S.Badge cls="bg-red-100 text-red-700">{-S.daysLeft(ms.deadline)}d overdue</S.Badge>}
                        <S.Badge cls={S.statusColor(ms.status)}>{ms.status}</S.Badge>
                      </button>
                      {msOpen && (ms.subtasks||[]).map(s=>{ const stDelayed = S.isOverdue(s); return (
                        <div key={s.id} className={`flex flex-wrap items-center gap-3 px-3 py-2 pl-16 text-left ${stDelayed?'bg-red-50/30':''}`}>
                          <span className="text-sm text-slate-600 flex-1">{s.name}</span>
                          <span className="text-xs text-slate-400 whitespace-nowrap">Deadline {s.deadline || '—'}</span>
                          {stDelayed && <S.Badge cls="bg-red-100 text-red-700">{-S.daysLeft(s.deadline)}d overdue</S.Badge>}
                          <S.Badge cls={S.statusColor(s.status)}>{s.status}</S.Badge>
                        </div>
                      );})}
                    </div>
                  );})}
                  {ph.milestones.length===0 && <div className="text-xs text-slate-400 px-3 py-2 pl-8">No milestones yet.</div>}
                </div>
              )}
            </div>
          );})}
          {phases.length===0 && <div className="text-sm text-slate-400">No phases for this project yet.</div>}
        </div>
      </S.Card>
    </div>
  );
}


// Curated report catalog — each entry is backed by a real computation over live tree/governance/
// team data (see renderReportBody in Reports() below), rather than a stub link. Grouped the same
// way the old static mock was, so the categories stay familiar.
