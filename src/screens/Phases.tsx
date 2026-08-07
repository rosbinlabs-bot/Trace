import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';
import * as db from '../db';

export default function Phases(){
  const { tree, setTree, addNotification } = React.useContext(S.PhaseDataContext);
  const { settings } = React.useContext(S.SettingsContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { role } = React.useContext(S.RoleContext);
  const { admin } = React.useContext(S.AdminDataContext);
  const { email: myEmail, profile: myProfile } = React.useContext(S.CurrentUserContext);
  // Optional chaining: a project-scoped restricted account (see S.staffVisibleProjects) can have
  // zero visible projects, so projects[0] may be undefined -- projects[0].id would crash the screen.
  const [activeProj, setActiveProj] = useState(projects[0]?.id);
  const projMeta = projects.find(p=>p.id===activeProj) || {};
  // Per-PROJECT, not per-account: someone can be a full level-based team member on one project and
  // only a Guest Teammate (Project Master -> Guest Teammates, project.guests) on another they aren't
  // otherwise on — so whether this screen is editable depends on the currently selected project, not
  // just who's signed in. Admin/Super Admin always gets full edit rights everywhere; everyone else
  // needs to actually be on THIS project's Team to edit anything here — a Guest (or anyone not tagged
  // at all, which shouldn't normally be reachable since staffVisibleProjects already filters the
  // project tabs) can view and download attachments only.
  const readOnly = role!=='admin' && !S.isOnProjectTeam(projMeta, myProfile?.name);
  // "Acting as" is scoped to THIS project's actual team now — only the hierarchy levels really
  // present in Project Master's team list show up as tabs, instead of a fixed global list of four
  // (see S.projectLevelNumsPresent). It's derived from the signed-in account's own level on this
  // project's team (falling back to their Administration -> Users hierarchy level / designation
  // default if they're not on this project's team at all) and locked there for everyone except
  // Admin/Super Admin (role==='admin'), who legitimately need to review the board from every tier
  // actually on this project.
  const presentLevels = S.projectLevelNumsPresent(projMeta).map(n=>`L${n}`); // ascending seniority, L1 first
  const myTeamEntry = (projMeta.team||[]).find((t:any)=>t.name===myProfile?.name);
  const myActorLevel = myTeamEntry?.level || myProfile?.level || S.designationHierarchyLevel(myProfile?.designation, admin) || 'L9';
  const canSwitchActor = role==='admin';
  const [actor, setActorState] = useState(myActorLevel); // e.g. 'L1' .. 'L9'
  const setActor = (a) => { if(canSwitchActor) setActorState(a); }; // no-op for anyone locked to their own tier
  // Keep a locked (non-admin) account's actor level in sync with their own real level, and reset an
  // admin's preview level whenever it switches to a project where that tier isn't actually present.
  React.useEffect(() => { if(!canSwitchActor) setActorState(myActorLevel); }, [myActorLevel, canSwitchActor]);
  React.useEffect(() => { if(canSwitchActor && presentLevels.length && !presentLevels.includes(actor)) setActorState(presentLevels[0]); }, [activeProj]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only Admin/Super Admin may delete a phase, milestone or sub task -- every other actor tier used
  // to be able to click these buttons with no check at all (the Associate-deletes-a-phase bug).
  const canDelete = role==='admin' && !readOnly;

  const ITEM_STATUS_OPTS = (settings.itemStatuses && settings.itemStatuses.length) ? settings.itemStatuses : S.DEFAULT_PROJECT_SETTINGS.itemStatuses;

  const phases = tree[activeProj] || [];
  const setPhases = (updater) => setTree(t => ({...t, [activeProj]: typeof updater==='function'? updater(t[activeProj]||[]) : updater}));

  // Roster limited to THIS project's team — only they can be tagged as assignees
  const roster = S.buildRoster(projMeta, admin);
  const notifyProject = (payload) => addNotification({ projectId:activeProj, project:projMeta.name, tags: roster.map(r=>r.name), priority:'high', ...payload });

  // ---- mutation helpers ----
  const mutPhase = (phId, fn) => setPhases(ps => ps.map(ph => ph.id===phId ? fn({...ph}) : ph));
  const mutMs = (phId, msId, fn) => mutPhase(phId, ph => ({...ph, milestones: ph.milestones.map(m => m.id===msId ? fn({...m}) : m)}));
  const mutSt = (phId, msId, stId, fn) => mutMs(phId, msId, m => ({...m, subtasks: (m.subtasks||[]).map(s => s.id===stId ? fn({...s}) : s)}));

  // Owner isn't something a user needs to fill in — it defaults to this project's most senior (L1) team member.
  const l1Name = (projMeta.team||[]).find((t:any)=>t.level==='L1')?.name || '';
  const addPhase = () => { if(readOnly) return; setPhases(ps => [...ps, { id:S.uid('PH'), name:'New Phase', owner:l1Name, start:'', end:'', onHold:false, headConfirmedComplete:false, milestones:[] }]); };
  // Removing any of these three is permanent (no trash/undo) and, for a phase or milestone, takes
  // everything nested under it -- milestones/sub tasks, their assignees, remarks and attachments --
  // down with it. A single misclick used to do that with no warning at all; now each asks first,
  // scoped to what that specific level actually destroys.
  const removePhase = (id) => {
    if(!canDelete) return;
    const ph = phases.find((p:any)=>p.id===id);
    const msCount = ph?.milestones?.length || 0;
    const stCount = (ph?.milestones||[]).reduce((n:number,m:any)=>n+(m.subtasks?.length||0),0);
    const detail = msCount ? ` along with its ${msCount} milestone${msCount===1?'':'s'}${stCount?` and ${stCount} sub task${stCount===1?'':'s'}`:''} (assignees, remarks and attachments included)` : '';
    if (!window.confirm(`Remove phase "${ph?.name||''}"${detail}?\n\nThis cannot be undone.`)) return;
    setPhases(ps => ps.filter(p=>p.id!==id));
  };
  const addMs = (phId) => { if(readOnly) return; mutPhase(phId, ph => ({...ph, milestones:[...ph.milestones, {...S.newItem('New Milestone'), open:true, subtasks:[]}]})); };
  const removeMs = (phId, msId) => {
    if(!canDelete) return;
    const ph = phases.find((p:any)=>p.id===phId);
    const ms = ph?.milestones?.find((m:any)=>m.id===msId);
    const stCount = ms?.subtasks?.length || 0;
    const detail = stCount ? ` along with its ${stCount} sub task${stCount===1?'':'s'} (assignees, remarks and attachments included)` : '';
    if (!window.confirm(`Remove milestone "${ms?.name||''}"${detail}?\n\nThis cannot be undone.`)) return;
    mutPhase(phId, ph => ({...ph, milestones: ph.milestones.filter(m=>m.id!==msId)}));
  };
  const addSt = (phId, msId) => { if(readOnly) return; mutMs(phId, msId, m => ({...m, subtasks:[...(m.subtasks||[]), S.newItem('New Sub Task')]})); };
  const removeSt = (phId, msId, stId) => {
    if(!canDelete) return;
    const ph = phases.find((p:any)=>p.id===phId);
    const st = ph?.milestones?.find((m:any)=>m.id===msId)?.subtasks?.find((s:any)=>s.id===stId);
    if (!window.confirm(`Remove sub task "${st?.name||''}" (assignees, remarks and attachments included)?\n\nThis cannot be undone.`)) return;
    mutMs(phId, msId, m => ({...m, subtasks: (m.subtasks||[]).filter(s=>s.id!==stId)}));
  };

  // ---- status changes: Not Started / In Progress / On Hold apply immediately; Completed queues review ----
  // Every Completed transition now raises a notification either way: an immediate-finalize notice
  // when the actor's own level already qualifies (S.actorQualifies), or a "Pending Review" heads-up
  // naming the approver level (S.approverLevelFor) when it queues instead — previously Sub Tasks
  // raised no notification at all, and Milestones only notified on immediate finalize, so a reviewer
  // had no way to know something was waiting on them short of opening Phase Management themselves.
  const setMsStatus = (phId, msId, val) => {
    mutMs(phId, msId, m => S.applyStatus(m, val, 'milestone', actor));
    if(val==='Completed'){
      const ph = phases.find(p=>p.id===phId); const ms = ph && ph.milestones.find(m=>m.id===msId);
      if(!ph || !ms) return;
      if(S.actorQualifies('milestone', actor)){
        notifyProject({ level:'milestone', itemName:ms.name, phaseName:ph.name, type:'Milestone Completed',
          message:`Milestone "${ms.name}" in phase "${ph.name}" was marked Completed by ${actor}.` });
      } else {
        const approverLvl = S.approverLevelFor('milestone', projMeta);
        notifyProject({ level:'milestone', itemName:ms.name, phaseName:ph.name, type:'Pending Review',
          message:`Milestone "${ms.name}" in phase "${ph.name}" was marked Completed by ${actor} and is awaiting ${approverLvl} review.` });
      }
    }
  };
  const setStStatus = (phId, msId, stId, val) => {
    mutSt(phId, msId, stId, s => S.applyStatus(s, val, 'subtask', actor));
    if(val==='Completed'){
      const ph = phases.find(p=>p.id===phId); const ms = ph && ph.milestones.find(m=>m.id===msId);
      const st = ms && (ms.subtasks||[]).find(s=>s.id===stId);
      if(!ph || !ms || !st) return;
      if(S.actorQualifies('subtask', actor)){
        notifyProject({ level:'subtask', itemName:st.name, phaseName:ph.name, type:'Sub Task Completed',
          message:`Sub Task "${st.name}" in phase "${ph.name}" was marked Completed by ${actor}.` });
      } else {
        const approverLvl = S.approverLevelFor('subtask', projMeta);
        notifyProject({ level:'subtask', itemName:st.name, phaseName:ph.name, type:'Pending Review',
          message:`Sub Task "${st.name}" in phase "${ph.name}" was marked Completed by ${actor} and is awaiting ${approverLvl} review.` });
      }
    }
  };

  // ---- review decisions: up to L2 decides Sub Tasks, L1 decides Milestones (S.approverLevelFor) ----
  const decideMs = (ph, ms, decision) => {
    mutMs(ph.id, ms.id, m => decision==='Approved'
      ? ({...m, status:'Completed', review:'', approved:true, actualDate:m.actualDate||S.TODAY_ISO, reviewSince:''})
      : ({...m, status:'In Progress', review:'', approved:false, reviewSince:''}));
    if(decision==='Approved') notifyProject({ level:'milestone', itemName:ms.name, phaseName:ph.name, type:'Milestone Completed',
      message:`Milestone "${ms.name}" in phase "${ph.name}" was approved as Completed by ${actor}.` });
  };
  const decideSt = (phId, msId, stId, decision) => {
    mutSt(phId, msId, stId, s => decision==='Approved'
      ? ({...s, status:'Completed', review:'', approved:true, actualDate:s.actualDate||S.TODAY_ISO, reviewSince:''})
      : ({...s, status:'In Progress', review:'', approved:false, reviewSince:''}));
    if(decision==='Approved'){
      const ph = phases.find(p=>p.id===phId); const ms = ph && ph.milestones.find(m=>m.id===msId);
      const st = ms && (ms.subtasks||[]).find(s=>s.id===stId);
      if(ph && ms && st) notifyProject({ level:'subtask', itemName:st.name, phaseName:ph.name, type:'Sub Task Completed',
        message:`Sub Task "${st.name}" in phase "${ph.name}" was approved as Completed by ${actor}.` });
    }
  };

  // ---- "Implemented" escalation: sequential chain from whoever marked it up to L1 (S.implementChainFor
  // walks every level actually present on this project's team, skipping any that are missing), then the
  // Client Owner signs off in the Client Portal once the internal chain is fully approved. ----
  const markImplementedMs = (phId, msId) => mutMs(phId, msId, m => { const chain = S.implementChainFor(projMeta, actor); return {...m, review:'Implemented Review', implChain:chain, implApprovals:[], headApprovedImpl:chain.length===0, clientApprovedImpl:false}; });
  const markImplementedSt = (phId, msId, stId) => mutSt(phId, msId, stId, s => { const chain = S.implementChainFor(projMeta, actor); return {...s, review:'Implemented Review', implChain:chain, implApprovals:[], headApprovedImpl:chain.length===0, clientApprovedImpl:false}; });
  const chainApproveMs = (phId, msId) => mutMs(phId, msId, m => { const rest=(m.implChain||[]).slice(1); return {...m, implChain:rest, implApprovals:[...(m.implApprovals||[]), {level:actor, by:myProfile?.name||myEmail, at:new Date().toISOString()}], headApprovedImpl:rest.length===0}; });
  const chainApproveSt = (phId, msId, stId) => mutSt(phId, msId, stId, s => { const rest=(s.implChain||[]).slice(1); return {...s, implChain:rest, implApprovals:[...(s.implApprovals||[]), {level:actor, by:myProfile?.name||myEmail, at:new Date().toISOString()}], headApprovedImpl:rest.length===0}; });
  const cancelImplMs = (phId, msId) => mutMs(phId, msId, m => ({...m, review:'', implChain:[], headApprovedImpl:false}));
  const cancelImplSt = (phId, msId, stId) => mutSt(phId, msId, stId, s => ({...s, review:'', implChain:[], headApprovedImpl:false}));

  // ---- assignees ----
  const addMsAssignee = (phId, msId, name) => mutMs(phId, msId, m => ({...m, assignees:[...(m.assignees||[]), name]}));
  const removeMsAssignee = (phId, msId, name) => mutMs(phId, msId, m => ({...m, assignees:(m.assignees||[]).filter(x=>x!==name)}));
  const addStAssignee = (phId, msId, stId, name) => mutSt(phId, msId, stId, s => ({...s, assignees:[...(s.assignees||[]), name]}));
  const removeStAssignee = (phId, msId, stId, name) => mutSt(phId, msId, stId, s => ({...s, assignees:(s.assignees||[]).filter(x=>x!==name)}));

  // ---- documents: real Supabase Storage uploads (db.uploadPhaseDoc), same private/tenant-scoped
  // bucket pattern as Document Library. docUploading/docErr surface progress and failures inline near
  // wherever the attach control is rendered, since the upload is now a real network call, not just an
  // instant in-memory push. downloadingDocId drives the little spinner swap in S.DocsChips.
  const [docUploading, setDocUploading] = useState(false);
  const [docErr, setDocErr] = useState('');
  const [downloadingDocId, setDownloadingDocId] = useState<string|null>(null);
  const attachMsDocs = async (phId, msId, files) => {
    setDocErr(''); setDocUploading(true);
    try {
      const uploaded = [];
      for (const f of Array.from(files) as File[]) { uploaded.push(await db.uploadPhaseDoc(S.uid('DOC'), f)); }
      mutMs(phId, msId, m => ({...m, docs:[...(m.docs||[]), ...uploaded.map(u=>({id:u.id, n:u.name, path:u.path, size:u.size, uploadedAt:new Date().toISOString(), uploadedBy:myEmail}))]}));
    } catch(e:any) { setDocErr(e.message || 'Could not upload that file.'); }
    setDocUploading(false);
  };
  const removeMsDoc = (phId, msId, i) => {
    const ph = phases.find(p=>p.id===phId); const ms = ph && ph.milestones.find(m=>m.id===msId);
    const d = ms && (ms.docs||[])[i];
    mutMs(phId, msId, m => ({...m, docs:(m.docs||[]).filter((_,j)=>j!==i)}));
    if(d?.path) db.deletePhaseDocFile(d.path).catch((e)=>console.error('Storage cleanup failed:', e));
  };
  const attachStDocs = async (phId, msId, stId, files) => {
    setDocErr(''); setDocUploading(true);
    try {
      const uploaded = [];
      for (const f of Array.from(files) as File[]) { uploaded.push(await db.uploadPhaseDoc(S.uid('DOC'), f)); }
      mutSt(phId, msId, stId, s => ({...s, docs:[...(s.docs||[]), ...uploaded.map(u=>({id:u.id, n:u.name, path:u.path, size:u.size, uploadedAt:new Date().toISOString(), uploadedBy:myEmail}))]}));
    } catch(e:any) { setDocErr(e.message || 'Could not upload that file.'); }
    setDocUploading(false);
  };
  const removeStDoc = (phId, msId, stId, i) => {
    const ph = phases.find(p=>p.id===phId); const ms = ph && ph.milestones.find(m=>m.id===msId);
    const s = ms && (ms.subtasks||[]).find(x=>x.id===stId);
    const d = s && (s.docs||[])[i];
    mutSt(phId, msId, stId, s => ({...s, docs:(s.docs||[]).filter((_,j)=>j!==i)}));
    if(d?.path) db.deletePhaseDocFile(d.path).catch((e)=>console.error('Storage cleanup failed:', e));
  };
  const downloadDoc = async (d:any) => {
    if(!d.path) return;
    setDocErr(''); setDownloadingDocId(d.id||d.path);
    try { window.open(await db.getPhaseDocDownloadUrl(d.path), '_blank'); }
    catch(e:any) { setDocErr(e.message || 'Could not generate a download link.'); }
    setDownloadingDocId(null);
  };

  // ---- remarks: a running comment log on a sub task, added from the detail modal ----
  const addStRemark = (phId, msId, stId, text) => {
    if(!text.trim()) return;
    mutSt(phId, msId, stId, s => ({...s, remarks:[...(s.remarks||[]), { id:S.uid('RMK'), text:text.trim(), by:myProfile?.name||myEmail, at:new Date().toISOString() }]}));
  };

  // ---- phase-level: start-date lock, On Hold toggle, completion confirmation ----
  // Once a phase has a start date, only L2-or-more-senior can change it (was "Project Head or
  // Strategic Lead" — generalized the same way as everything else in this file).
  const startEditableBy = (ph) => !readOnly && (!ph.start || S.levelNum(actor)<=2);
  const toggleHold = (phId) => { if(readOnly) return; mutPhase(phId, ph => ({...ph, onHold:!ph.onHold})); };
  const phaseApproverLevel = S.approverLevelFor('phase', projMeta);
  const confirmPhaseComplete = (ph) => {
    mutPhase(ph.id, x => ({...x, headConfirmedComplete:true}));
    notifyProject({ level:'phase', itemName:ph.name, phaseName:ph.name, type:'Phase Completed',
      message:`Phase "${ph.name}" has been confirmed Completed by ${actor}.` });
  };

  const isTagged = (item, level) => (item.assignees||[]).some(nm=>{ const r=roster.find((x:any)=>x.name===nm); return r && r.level===level; });

  const inpFor = (lvl) => `border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none ${S.LEVEL[lvl].focus}`;
  const pickableStatuses = (level, ms) => {
    // "Implemented" is reached only via the dedicated escalation button below, never picked here.
    let opts = ITEM_STATUS_OPTS.filter(o=>o!=='Implemented');
    if(level==='milestone' && !S.subtasksReady(ms)) opts = opts.filter(o=>o!=='Completed');
    return opts;
  };

  // Reusable status control for a milestone/sub task row
  const StatusControl = ({item, onChange, level, ms}: any) => {
    // Read-only badges show the milestone's derived status (auto "In Progress" once any sub task is
    // active) — the editable dropdown below still shows/edits the real stored value.
    const displayStatus = level==='milestone' ? S.derivedMilestoneStatus(item) : item.status;
    if(item.review) return <S.Badge cls={S.statusColor(item.status)}>{item.status}</S.Badge>;
    const locked = S.isApproved(item);
    // Sub tasks: anyone can mark progress/completion — who does it decides whether it still needs
    // review (see S.applyStatus). Milestones stay restricted to tagged assignees, same as before.
    // A read-only Guest teammate never gets an editable control, regardless of tagging.
    const canEdit = !readOnly && (locked ? actor==='L1' : (level==='subtask' ? true : isTagged(item, actor)));
    if(!canEdit) return <S.Badge cls={S.statusColor(displayStatus)}>{displayStatus}</S.Badge>;
    const opts = pickableStatuses(level, ms);
    return (
      <select className={inpFor(level)} value={item.status} onChange={e=>onChange(e.target.value)}>
        {opts.map(o=><option key={o}>{o}</option>)}
      </select>
    );
  };
  // ---- selection state for the split-view layout: a phase rail on the left, that phase's
  // milestones in the middle, and a detail panel on the right. Selecting a phase clears the
  // milestone selection (so the right panel falls back to showing the phase's own details);
  // selecting a milestone shows that milestone's detail + sub task checklist instead. ----
  const [selectedPhaseId, setSelectedPhaseId] = useState(null);
  const [selectedMsId, setSelectedMsId] = useState(null);
  const selPhase = phases.find(p=>p.id===selectedPhaseId) || phases[0] || null;
  const selMs = selPhase ? (selPhase.milestones||[]).find(m=>m.id===selectedMsId) || null : null;
  const selectPhase = (ph) => { setSelectedPhaseId(ph.id); setSelectedMsId(null); };
  // Sub task detail modal — {phId, msId, stId} of whichever sub task was clicked to expand, or null
  // when closed. Re-looked-up from `phases` on every render (not a stale snapshot) so live edits
  // made elsewhere (or via realtime sync from another user) show up immediately while it's open.
  const [detailStIds, setDetailStIds] = useState<{phId:string, msId:string, stId:string}|null>(null);
  const detailPh = detailStIds ? phases.find(p=>p.id===detailStIds.phId) : null;
  const detailMs = detailPh ? (detailPh.milestones||[]).find(m=>m.id===detailStIds!.msId) : null;
  const detailSt = detailMs ? (detailMs.subtasks||[]).find(s=>s.id===detailStIds!.stId) : null;
  const [remarkDraft, setRemarkDraft] = useState('');
  React.useEffect(() => { setRemarkDraft(''); }, [detailStIds]);
  const dotColor = (s) => ({
    'Not Started':'bg-slate-300','Yet to Start':'bg-slate-300','In Progress':'bg-brand-500','On Hold':'bg-amber-400',
    'Completed':'bg-emerald-500','Implemented':'bg-violet-500','Dropped':'bg-red-400','Terminated':'bg-red-500'
  }[s] || 'bg-slate-300');
  const ringColor = (s) => ({
    'Not Started':'bg-slate-100 text-slate-400','Yet to Start':'bg-slate-100 text-slate-400','In Progress':'bg-brand-100 text-brand-700','On Hold':'bg-amber-100 text-amber-700',
    'Completed':'bg-emerald-100 text-emerald-700','Implemented':'bg-violet-100 text-violet-700','Dropped':'bg-red-100 text-red-700','Terminated':'bg-red-100 text-red-700'
  }[s] || 'bg-slate-100 text-slate-400');

  // "Needs your action" — only phase/milestone/sub task items the CURRENT actor can act on AND that
  // are actually urgent (overdue, or due within the next 2 days). Previously this listed every
  // untouched/awaiting-review item regardless of deadline, which buried the handful that actually
  // needed attention today under everything due next month too.
  const daysUntil = (d) => d ? Math.floor((new Date(d).getTime() - new Date(S.TODAY_ISO).getTime())/86400000) : null;
  const isUrgent = (d) => { const n = daysUntil(d); return n!==null && n<=2; }; // overdue (negative) or due within 2 days
  const msApproverLevel = S.approverLevelFor('milestone', projMeta);
  const stApproverLevel = S.approverLevelFor('subtask', projMeta);
  const myActionItems = [];
  if(!readOnly && actor!=='L1'){
    phases.forEach(ph=>{
      ph.milestones.forEach(ms=>{
        if(!S.isApproved(ms) && !ms.review && isTagged(ms, actor) && isUrgent(ms.deadline)) myActionItems.push({ ph, ms, label:`Update status — ${ms.name}` });
        if(actor===msApproverLevel && ms.review && ms.review!=='Implemented Review' && isUrgent(ms.deadline)) myActionItems.push({ ph, ms, label:`Approve milestone — ${ms.name}` });
        if(ms.review==='Implemented Review' && !ms.headApprovedImpl && (ms.implChain||[])[0]===actor && isUrgent(ms.deadline)) myActionItems.push({ ph, ms, label:`Approve Implemented — ${ms.name}` });
        (ms.subtasks||[]).forEach(s=>{
          if(!S.isApproved(s) && !s.review && isTagged(s, actor) && isUrgent(s.deadline)) myActionItems.push({ ph, ms, st:s, label:`Update status — ${s.name}` });
          if(actor===stApproverLevel && s.review && s.review!=='Implemented Review' && isUrgent(s.deadline)) myActionItems.push({ ph, ms, st:s, label:`Approve sub task — ${s.name}` });
          if(s.review==='Implemented Review' && !s.headApprovedImpl && (s.implChain||[])[0]===actor && isUrgent(s.deadline)) myActionItems.push({ ph, ms, st:s, label:`Approve Implemented — ${s.name}` });
        });
      });
      if(actor===phaseApproverLevel && S.phaseMilestonesReady(ph) && !ph.headConfirmedComplete && !ph.onHold && isUrgent(ph.end)) myActionItems.push({ ph, label:`Confirm phase complete — ${ph.name}` });
    });
  }
  const jumpTo = (a) => { setSelectedPhaseId(a.ph.id); setSelectedMsId(a.ms ? a.ms.id : null); setActionOpen(false); };
  const [actionOpen, setActionOpen] = useState(false);

  return (
    <div>
      {docErr && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{docErr}</div>}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <S.SectionTitle sub="Per-project phases → milestones → sub tasks. Sub Tasks are approved up to L2, Milestones & Phases need L1, and the Implemented escalation walks every level on this project's team up to L1 before the Client Owner signs off in the Client Portal.">Phase Management</S.SectionTitle>
        {!readOnly && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Acting as:</span>
          {canSwitchActor ? (
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 text-xs">
              {presentLevels.length===0 && <span className="px-2.5 py-1 text-slate-400">No leveled team on this project yet</span>}
              {presentLevels.map(a=>{
                const desig = S.designationForLevel(a, admin);
                return (
                  <button key={a} onClick={()=>setActor(a)} className={`relative px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${actor===a?'bg-white text-brand-700 shadow-sm':'text-slate-500'}`}>
                    {a}{desig?` · ${desig}`:''}
                  </button>
                );
              })}
            </div>
          ) : (
            // Locked to the signed-in account's real level on this project -- no switcher, so there's
            // no way to act with a higher tier's approval rights than the account actually holds.
            <span className="relative text-xs font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-lg px-2.5 py-1 whitespace-nowrap">
              {actor}{S.designationForLevel(actor, admin) ? ` · ${S.designationForLevel(actor, admin)}` : ''}
            </span>
          )}
        </div>
        )}
      </div>

      {/* Needs your action — collapsed by default; click to expand the list. Replaces a stack of
          separate banners with one compact, on-demand summary. */}
      <S.Card className={`mb-4 overflow-hidden ${myActionItems.length>0?'border-amber-200':''}`}>
        <button onClick={()=>setActionOpen(o=>!o)} className={`w-full flex items-center gap-2 px-4 py-3 text-left ${myActionItems.length>0?'bg-amber-50/40':''}`}>
          <span className="text-slate-400 text-xs w-3 shrink-0">{actionOpen?'▼':'▶'}</span>
          <span className="font-semibold text-slate-800">Needs your action</span>
          {myActionItems.length>0 && <S.Badge cls="bg-amber-100 text-amber-700">{myActionItems.length}</S.Badge>}
          {!actionOpen && (
            <span className="text-xs text-slate-400 truncate ml-1">
              {myActionItems.length===0 ? (actor==='L1' ? '— nothing needs your action' : '— nothing waiting on you') : `— ${myActionItems[0].label}${myActionItems.length>1?` +${myActionItems.length-1} more`:''}`}
            </span>
          )}
        </button>
        {actionOpen && (
          <div className="px-4 pb-4">
            {myActionItems.length===0 ? (
              <div className="text-sm text-slate-400">{actor==='L1' ? 'Nothing needs your action — you can still re-open any approved item if needed.' : 'Nothing is waiting on you right now.'}</div>
            ) : (
              <div className="space-y-1.5">
                {myActionItems.map((a,i)=>(
                  <button key={i} onClick={()=>jumpTo(a)} className="w-full flex items-center justify-between gap-2 text-sm bg-white hover:bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-left">
                    <span className="text-slate-700 truncate">{a.label}</span>
                    <span className="text-xs text-amber-600 whitespace-nowrap">Go →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </S.Card>

      {/* Project tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-3 overflow-x-auto">
        {projects.map(p=>(
          <button key={p.id} onClick={()=>setActiveProj(p.id)}
            className={`whitespace-nowrap px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${activeProj===p.id?'border-violet-500 text-violet-700 font-medium':'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {p.name}
          </button>
        ))}
      </div>

      {/* Project team — only these people can be tagged as assignees below */}
      <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mr-1">Project Team</span>
        {roster.map(r=>(
          <span key={r.name+r.level} className="text-[11px] rounded-full px-2 py-0.5 bg-slate-200 text-slate-600">
            {r.name} <span className="opacity-70">· {r.label}</span>
          </span>
        ))}
      </div>

      <div className="flex justify-between items-center mb-3">
        <div className="text-xs text-slate-400">{phases.length} phase(s) · {phases.reduce((a,p)=>a+p.milestones.length,0)} milestone(s)</div>
        {!readOnly && <button onClick={addPhase} className={`${S.LEVEL.phase.solid} text-white text-sm px-3 py-1.5 rounded-lg`}>+ Add Phase</button>}
      </div>

      {phases.length===0 ? (
        <S.Card className="p-8 text-center text-sm text-slate-400">No phases for this project yet. Click “+ Add Phase”.</S.Card>
      ) : (
      <div className="flex gap-3 overflow-x-auto pb-1" style={{alignItems:'flex-start'}}>
        {/* Phase rail — timeline of numbered phase cards; click a phase to browse its milestones */}
        <S.Card className="p-2.5 w-64 shrink-0 space-y-1.5">
          {phases.map((ph, pi)=>{
            const status = S.derivedPhaseStatus(ph);
            const msDone = ph.milestones.filter(S.isApproved).length;
            const pct = ph.milestones.length ? Math.round(msDone/ph.milestones.length*100) : 0;
            const isSel = selPhase && selPhase.id===ph.id;
            return (
              <button key={ph.id} onClick={()=>selectPhase(ph)}
                className={`w-full flex items-start gap-2.5 text-left px-2.5 py-2.5 rounded-xl border transition-colors ${isSel?'border-brand-300 bg-brand-50':'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${ringColor(status)}`}>{pi+1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={`block text-sm truncate ${isSel?'font-medium text-brand-700':'text-slate-700'}`}>{ph.name || 'Untitled phase'}</span>
                    {ph.onHold && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor('On Hold')}`}></span>}
                  </span>
                  <span className="block text-[11px] text-slate-400 truncate mt-0.5">{msDone}/{ph.milestones.length} milestones done{ph.onHold?' · on hold':''}</span>
                  <span className="block h-1 bg-slate-100 rounded-full overflow-hidden mt-1.5">
                    <span className={`block h-full ${dotColor(status)}`} style={{width:`${pct}%`}}></span>
                  </span>
                </span>
              </button>
            );
          })}
        </S.Card>

        {/* Milestone list — scoped to the selected phase only */}
        <S.Card className="p-3 w-72 shrink-0">
          {selPhase ? (<>
            <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-slate-100">
              <span className="text-xs font-semibold text-brand-700 uppercase tracking-wide truncate">{selPhase.name}</span>
              {/* A completed/locked phase still allows new milestones to be added at any time — only
                  deletion is restricted (to Admin/Super Admin, see canDelete above). The lock icon is
                  informational (this phase was marked complete), it no longer disables adding. */}
              <span className="flex items-center gap-2 shrink-0">
                {selPhase.headConfirmedComplete && <span className="text-[10px] text-emerald-600 whitespace-nowrap inline-flex items-center gap-1"><S.Icon name="lock" className="w-3 h-3"/> locked</span>}
                {!readOnly && <button onClick={()=>addMs(selPhase.id)} className="text-xs text-brand-600 hover:text-brand-700 whitespace-nowrap font-medium">+ Add</button>}
              </span>
            </div>
            <div className="space-y-1.5">
              {selPhase.milestones.map(ms=>{
                const msOverdue = S.isOverdue(ms);
                const subReady = S.subtasksReady(ms);
                const isSel = selMs && selMs.id===ms.id;
                const msStatus = ms.review || S.derivedMilestoneStatus(ms);
                return (
                  <button key={ms.id} onClick={()=>setSelectedMsId(ms.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border-l-[3px] border ${isSel?'border-l-brand-500 border-brand-200 bg-brand-50':`border-l-transparent border-slate-200 hover:bg-slate-50`} ${msOverdue?'bg-red-50/40':''}`}>
                    <div className={`text-sm truncate ${isSel?'font-medium text-brand-700':'text-slate-700'}`}>{ms.name || 'Untitled milestone'}</div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className={`text-[11px] whitespace-nowrap inline-flex items-center gap-1 ${msOverdue?'text-red-500 font-medium':'text-slate-400'}`}>{msOverdue && <S.Icon name="alert" className="w-3 h-3"/>}{msOverdue?'overdue':`due ${ms.deadline||'—'}`}</span>
                      <S.Badge cls={S.statusColor(msStatus)}>{msStatus}</S.Badge>
                    </div>
                    {ms.subtasks.length>0 && <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5"><span className="flex-1 h-[3px] bg-slate-100 rounded-full overflow-hidden max-w-[60px]"><span className="block h-full bg-brand-400" style={{width:`${Math.round(ms.subtasks.filter(S.isApproved).length/ms.subtasks.length*100)}%`}}></span></span>{ms.subtasks.filter(S.isApproved).length}/{ms.subtasks.length}{!subReady?' · pending':''}</div>}
                  </button>
                );
              })}
              {selPhase.milestones.length===0 && <div className="text-xs text-slate-400 py-1">No milestones yet — add one.</div>}
            </div>
          </>) : <div className="text-xs text-slate-400">Select a phase to see its milestones.</div>}
        </S.Card>

        {/* Detail panel — shows the selected milestone, or the phase itself if none is selected */}
        <S.Card className="p-4 flex-1 min-w-[300px]">
          {selMs ? (() => {
            const ms = selMs, ph = selPhase;
            const msLocked = S.isApproved(ms); const msDis = readOnly || (msLocked && actor!=='L1'); const msOverdue = S.isOverdue(ms); const subReady = S.subtasksReady(ms);
            return (
              <div>
                <button onClick={()=>setSelectedMsId(null)} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-brand-600 mb-3">← {ph.name}</button>
                <div className="rounded-xl bg-amber-50/60 border border-amber-100 p-3 mb-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1 min-w-[180px]">
                      <label className="text-[10px] text-slate-400">Milestone name</label>
                      <input className={inpFor('milestone')+" font-medium"} value={ms.name} disabled={msDis} onChange={e=>mutMs(ph.id,ms.id,m=>({...m,name:e.target.value}))} placeholder="Milestone"/>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400">Deadline</label>
                      <input type="date" className={inpFor('milestone')+(msOverdue?" border-red-400 text-red-600":"")} value={ms.deadline} disabled={msDis} onChange={e=>mutMs(ph.id,ms.id,m=>({...m,deadline:e.target.value}))}/>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400">Actual date</label>
                      <span className="text-xs text-slate-600 py-1.5 inline-block">{S.itemDoneDate(ms) || '—'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400">Documents</label>
                      <S.DocsChips docs={ms.docs} disabled={msDis} onAttach={files=>attachMsDocs(ph.id,ms.id,files)} onRemove={i=>removeMsDoc(ph.id,ms.id,i)} onDownload={downloadDoc} downloadingId={downloadingDocId}/>
                    </div>
                    {canDelete && <button onClick={()=>removeMs(ph.id,ms.id)} disabled={msDis} className={`text-xs whitespace-nowrap ml-auto ${msDis?'text-slate-300':'text-red-400 hover:text-red-600'}`}>✕ Remove</button>}
                  </div>
                  <div className="mt-2.5">
                    <label className="text-[10px] text-slate-400 block mb-1">Assignees</label>
                    <S.AssigneeChips assignees={ms.assignees} roster={roster} disabled={msDis} accent={S.LEVEL.milestone}
                      onAdd={nm=>addMsAssignee(ph.id,ms.id,nm)} onRemove={nm=>removeMsAssignee(ph.id,ms.id,nm)}/>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap mb-4 pb-4 border-b border-slate-100">
                  <StatusControl item={ms} level="milestone" ms={ms} onChange={val=>setMsStatus(ph.id,ms.id,val)}/>
                  <S.ApprovalFlow item={ms} actorLevel={readOnly?null:actor} kind="milestone" project={projMeta} admin={admin}
                    onDecide={d=>decideMs(ph,ms,d)}
                    onMarkImplemented={()=>markImplementedMs(ph.id,ms.id)}
                    onChainApprove={()=>chainApproveMs(ph.id,ms.id)}
                    onCancelImpl={()=>cancelImplMs(ph.id,ms.id)}/>
                  {!subReady && !ms.review && !msLocked && <span className="text-[11px] text-amber-600">Complete all sub tasks first</span>}
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-blue-700 bg-blue-50 rounded-full px-2.5 py-1 uppercase tracking-wide">Sub tasks</span>
                  {/* Adding a sub task is never blocked, even once the milestone is approved/locked —
                      only deletion is restricted (canDelete, Admin/Super Admin only). */}
                  {!readOnly && <button onClick={()=>addSt(ph.id,ms.id)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ Add sub task</button>}
                </div>
                <div className={`rounded-xl border border-blue-100 ${S.LEVEL.subtask.tint} divide-y divide-blue-100`}>
                  {(ms.subtasks||[]).map(s=>{ const stLock=S.isApproved(s); const genDis=readOnly||(stLock&&actor!=='L1'); const overdue=S.isOverdue(s); return (
                    <div key={s.id} id={`st-${s.id}`} className={`flex flex-wrap items-center gap-2 px-2 py-2 ${overdue?'bg-red-50':''}`}>
                      {overdue && <span title="Deadline exceeded — not completed" className="text-red-500"><S.Icon name="alert" className="w-3.5 h-3.5"/></span>}
                      {/* Opens the full detail modal — view everything, download/upload attachments,
                          add remarks — without disturbing the quick inline fields alongside it. */}
                      <button onClick={()=>setDetailStIds({phId:ph.id, msId:ms.id, stId:s.id})} title="View details" aria-label={`View details for ${s.name || 'sub task'}`} className="text-slate-300 hover:text-brand-600 shrink-0">
                        <S.Icon name="search" className="w-3.5 h-3.5"/>
                      </button>
                      <input className={inpFor('subtask')+" flex-1 min-w-[140px]"+(overdue?" border-red-300":"")} value={s.name} disabled={genDis} onChange={e=>mutSt(ph.id,ms.id,s.id,x=>({...x,name:e.target.value}))} placeholder="Sub task"/>
                      <S.AssigneeChips assignees={s.assignees} roster={roster} disabled={genDis} accent={S.LEVEL.subtask} onAdd={nm=>addStAssignee(ph.id,ms.id,s.id,nm)} onRemove={nm=>removeStAssignee(ph.id,ms.id,s.id,nm)}/>
                      <input type="date" className={inpFor('subtask')+(overdue?" border-red-400 text-red-600":"")} value={s.deadline} disabled={genDis} onChange={e=>mutSt(ph.id,ms.id,s.id,x=>({...x,deadline:e.target.value}))}/>
                      <span className="text-[11px] text-slate-400 whitespace-nowrap">done {S.itemDoneDate(s) || '—'}</span>
                      <StatusControl item={s} level="subtask" onChange={val=>setStStatus(ph.id,ms.id,s.id,val)}/>
                      <S.ApprovalFlow item={s} actorLevel={readOnly?null:actor} kind="subtask" project={projMeta} admin={admin}
                        onDecide={d=>decideSt(ph.id,ms.id,s.id,d)}
                        onMarkImplemented={()=>markImplementedSt(ph.id,ms.id,s.id)}
                        onChainApprove={()=>chainApproveSt(ph.id,ms.id,s.id)}
                        onCancelImpl={()=>cancelImplSt(ph.id,ms.id,s.id)}/>
                      <S.DocsChips docs={s.docs} disabled={genDis} onAttach={files=>attachStDocs(ph.id,ms.id,s.id,files)} onRemove={i=>removeStDoc(ph.id,ms.id,s.id,i)} onDownload={downloadDoc} downloadingId={downloadingDocId}/>
                      {canDelete && <button onClick={()=>removeSt(ph.id,ms.id,s.id)} disabled={genDis} className={`${genDis?'text-slate-300':'text-red-400 hover:text-red-600'}`}>✕</button>}
                    </div>
                  );})}
                  {(!ms.subtasks||ms.subtasks.length===0) && <div className="text-xs text-slate-400 px-2 py-2">No sub tasks yet.</div>}
                </div>
              </div>
            );
          })() : selPhase ? (() => {
            const ph = selPhase;
            const status = S.derivedPhaseStatus(ph);
            const ready = S.phaseMilestonesReady(ph);
            const actualEnd = S.phaseActualEnd(ph);
            const duration = S.phaseDurationDays(ph);
            const startLocked = !startEditableBy(ph);
            return (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center"><S.Icon name="phases" className="w-4 h-4"/></span>
                  <span className="text-sm font-medium text-slate-800">Phase details</span>
                  <S.Badge cls={S.statusColor(status)}>{status}</S.Badge>
                </div>
                <div className="rounded-xl bg-sky-50/50 border border-sky-100 p-3 mb-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                      <label className="text-[10px] text-slate-400">Phase name</label>
                      <input className={inpFor('phase')+" font-medium"} value={ph.name} onChange={e=>mutPhase(ph.id, x=>({...x,name:e.target.value}))} placeholder="Phase name"/>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400">Owner</label>
                      <span className="text-xs text-slate-600 py-1.5 inline-block" title="Defaults to this project's most senior (L1) team member">{ph.owner || l1Name || '—'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400">Start date {startLocked && <span title="Locked — only L2-or-more-senior can change a start date once set" className="inline-flex align-text-bottom"><S.Icon name="lock" className="w-2.5 h-2.5"/></span>}</label>
                      <input type="date" className={inpFor('phase')} value={ph.start} disabled={startLocked} onChange={e=>mutPhase(ph.id, x=>({...x,start:e.target.value}))}/>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400">Deadline</label>
                      <input type="date" className={inpFor('phase')} value={ph.end} onChange={e=>mutPhase(ph.id, x=>({...x,end:e.target.value}))}/>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400">Actual completed</label>
                      <span className="text-xs text-slate-600 py-1.5 inline-block">{actualEnd || '—'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400">Duration</label>
                      <span className="text-xs text-slate-600 py-1.5 inline-block">{duration!=null ? `${duration}d` : '—'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {!readOnly && S.levelNum(actor)<=2 && !ph.headConfirmedComplete && (
                    <button onClick={()=>toggleHold(ph.id)} className={`text-xs px-2.5 py-1.5 rounded-lg border whitespace-nowrap ${ph.onHold?'border-emerald-300 text-emerald-600 hover:bg-emerald-50':'border-amber-300 text-amber-600 hover:bg-amber-50'}`}>
                      {ph.onHold ? 'Resume' : 'Put on hold'}
                    </button>
                  )}
                  {ready && !ph.headConfirmedComplete && !ph.onHold && (
                    (!readOnly && actor===phaseApproverLevel)
                      ? <button onClick={()=>confirmPhaseComplete(ph)} className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white whitespace-nowrap">Confirm completion</button>
                      : <span className="text-xs text-amber-600 whitespace-nowrap py-1.5">Awaiting {phaseApproverLevel} confirmation</span>
                  )}
                  {canDelete && <button onClick={()=>removePhase(ph.id)} className="text-xs text-red-500 hover:text-red-700 whitespace-nowrap ml-auto">✕ Remove phase</button>}
                </div>
                {ph.headConfirmedComplete && <div className="text-[11px] text-emerald-600 mt-2 flex items-center gap-1"><S.Icon name="lock" className="w-3 h-3"/> Phase complete — milestones locked</div>}
              </div>
            );
          })() : (
            <div className="h-full flex flex-col items-center justify-center text-center py-10 text-slate-300">
              <S.Icon name="phases" className="w-8 h-8 mb-2"/>
              <div className="text-xs text-slate-400">Select a phase from the left to see its details.</div>
            </div>
          )}
        </S.Card>
      </div>
      )}
      <div className="mt-4 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-1.5">
        <div>Sub tasks are approved by up to <b className="text-brand-700">L2</b>; once all of a milestone's sub tasks are approved, <b className="text-brand-700">L1</b> approves the milestone; once every milestone is approved, <b className="text-brand-700">L1</b> confirms the phase. (If a level isn't on this project's team, approval simply skips to the next level up.)</div>
        <div><b className="text-brand-700">Implemented</b> — the most important status — walks every level on this project's team from whoever marked it up to <b className="text-brand-700">L1</b>, one approval at a time, then the <b className="text-brand-700">Client Owner</b>'s sign-off in the Client Portal. Approved items lock; only <b className="text-brand-700">L1</b> can re-open them, and only <b className="text-brand-700">L2</b>-or-more-senior can change a phase's start date once it's set.</div>
      </div>

      {/* Sub task detail modal — full view + real attachment download/upload + remarks, opened via the
          search-icon button on a sub task row. Reuses the same StatusControl/ApprovalFlow/AssigneeChips/
          DocsChips as the inline row, just laid out with room to breathe and a remarks log underneath. */}
      {detailSt && detailMs && detailPh && (() => {
        const ph = detailPh, ms = detailMs, s = detailSt;
        const stLocked = S.isApproved(s); const stDis = readOnly || (stLocked && actor!=='L1'); const overdue = S.isOverdue(s);
        return (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={()=>setDetailStIds(null)}>
            <div className="bg-white rounded-xl max-w-lg w-full max-h-[88vh] overflow-auto p-6" onClick={e=>e.stopPropagation()}>
              <div className="flex justify-between items-start mb-1">
                <div className="text-[11px] text-slate-400">{ph.name} → {ms.name}</div>
                <button className="text-slate-400 hover:text-slate-600" onClick={()=>setDetailStIds(null)}>✕</button>
              </div>
              <input className={inpFor('subtask')+" font-medium text-sm w-full mb-3"+(overdue?" border-red-300":"")} value={s.name} disabled={stDis} onChange={e=>mutSt(ph.id,ms.id,s.id,x=>({...x,name:e.target.value}))} placeholder="Sub task"/>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400">Deadline {overdue && <span className="text-red-500">— overdue</span>}</label>
                  <input type="date" className={inpFor('subtask')+(overdue?" border-red-400 text-red-600":"")} value={s.deadline} disabled={stDis} onChange={e=>mutSt(ph.id,ms.id,s.id,x=>({...x,deadline:e.target.value}))}/>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400">Actual date</label>
                  <span className="text-xs text-slate-600 py-1.5 inline-block">{S.itemDoneDate(s) || '—'}</span>
                </div>
              </div>

              <div className="mb-3">
                <label className="text-[10px] text-slate-400 block mb-1">Assignees</label>
                <S.AssigneeChips assignees={s.assignees} roster={roster} disabled={stDis} accent={S.LEVEL.subtask} onAdd={nm=>addStAssignee(ph.id,ms.id,s.id,nm)} onRemove={nm=>removeStAssignee(ph.id,ms.id,s.id,nm)}/>
              </div>

              <div className="flex items-center gap-2 flex-wrap mb-4 pb-4 border-b border-slate-100">
                <StatusControl item={s} level="subtask" onChange={val=>setStStatus(ph.id,ms.id,s.id,val)}/>
                <S.ApprovalFlow item={s} actorLevel={readOnly?null:actor} kind="subtask" project={projMeta} admin={admin}
                  onDecide={d=>decideSt(ph.id,ms.id,s.id,d)}
                  onMarkImplemented={()=>markImplementedSt(ph.id,ms.id,s.id)}
                  onChainApprove={()=>chainApproveSt(ph.id,ms.id,s.id)}
                  onCancelImpl={()=>cancelImplSt(ph.id,ms.id,s.id)}/>
              </div>

              <div className="mb-4">
                <label className="text-[10px] text-slate-400 block mb-1.5">Attachments {docUploading && <span className="text-brand-500">— uploading…</span>}</label>
                {(s.docs||[]).length===0 && <div className="text-xs text-slate-300 mb-1.5">No attachments yet.</div>}
                <div className="space-y-1">
                  {(s.docs||[]).map((d:any,i:number)=>(
                    <div key={d.id||i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5 text-xs">
                      <S.Icon name={downloadingDocId===(d.id||d.path) ? 'refresh' : S.docIcon(d.n)} className={`w-3.5 h-3.5 shrink-0 ${downloadingDocId===(d.id||d.path) ? 'text-brand-500' : S.docIconTone(d.n)}`}/>
                      {d.path ? (
                        <button onClick={()=>downloadDoc(d)} className="flex-1 min-w-0 truncate text-left hover:underline hover:text-brand-700" title="Download">{d.n}</button>
                      ) : (
                        <span className="flex-1 min-w-0 truncate text-slate-400" title="No file on record">{d.n}</span>
                      )}
                      {d.size && <span className="text-[10px] text-slate-400 whitespace-nowrap">{(d.size/1024).toFixed(0)} KB</span>}
                      {!stDis && <button onClick={()=>removeStDoc(ph.id,ms.id,s.id,i)} className="text-red-400 hover:text-red-600">✕</button>}
                    </div>
                  ))}
                </div>
                {!stDis && (
                  <label className="mt-2 inline-block cursor-pointer text-xs text-brand-600 hover:text-brand-700 border border-dashed border-brand-300 rounded-lg px-2.5 py-1.5">+ Upload attachment
                    <input type="file" multiple accept={S.DOC_ACCEPT} className="hidden" onChange={e=>{attachStDocs(ph.id,ms.id,s.id,e.target.files); e.target.value='';}}/>
                  </label>
                )}
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1.5">Remarks</label>
                <div className="space-y-2 mb-2 max-h-40 overflow-auto">
                  {(s.remarks||[]).length===0 && <div className="text-xs text-slate-300">No remarks yet.</div>}
                  {(s.remarks||[]).map((r:any)=>(
                    <div key={r.id} className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                      <div className="text-xs text-slate-700">{r.text}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{r.by} · {new Date(r.at).toLocaleString('en-US',{dateStyle:'medium', timeStyle:'short'})}</div>
                    </div>
                  ))}
                </div>
                {!readOnly && (
                  <div className="flex gap-1.5">
                    <input value={remarkDraft} onChange={e=>setRemarkDraft(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter' && remarkDraft.trim()){ addStRemark(ph.id,ms.id,s.id,remarkDraft); setRemarkDraft(''); } }}
                      placeholder="Add a remark…" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                    <button onClick={()=>{ if(remarkDraft.trim()){ addStRemark(ph.id,ms.id,s.id,remarkDraft); setRemarkDraft(''); } }} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-1.5 whitespace-nowrap">Add</button>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center mt-5 pt-4 border-t border-slate-100">
                {canDelete ? <button onClick={()=>{removeSt(ph.id,ms.id,s.id); setDetailStIds(null);}} disabled={stDis} className={`text-sm ${stDis?'text-slate-300':'text-red-500 hover:text-red-700'}`}>✕ Remove sub task</button> : <span/>}
                <button onClick={()=>setDetailStIds(null)} className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Close</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// Deliverables here means every Milestone and Sub Task from Phase Management that's due by the
// end of the current month, counting cumulatively from the project's start date — this page is a
// read-only report over that same shared tree, so it inherits the exact same statuses, approval
// rules and "who approved it" facts as Phase Management. Nothing is edited from here.
