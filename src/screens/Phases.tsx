import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

export default function Phases(){
  const { tree, setTree, addNotification } = React.useContext(S.PhaseDataContext);
  const { settings } = React.useContext(S.SettingsContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const [activeProj, setActiveProj] = useState(projects[0].id);
  const [actor, setActor] = useState('Associate'); // Associate | Project Manager | Project Head | Strategic Lead

  const ITEM_STATUS_OPTS = (settings.itemStatuses && settings.itemStatuses.length) ? settings.itemStatuses : S.DEFAULT_PROJECT_SETTINGS.itemStatuses;

  const phases = tree[activeProj] || [];
  const setPhases = (updater) => setTree(t => ({...t, [activeProj]: typeof updater==='function'? updater(t[activeProj]||[]) : updater}));

  // Roster limited to THIS project's team — only they can be tagged as assignees
  const projMeta = projects.find(p=>p.id===activeProj) || {};
  const roster = [
    projMeta.strategicLead && {name:projMeta.strategicLead, group:'Strategic Lead'},
    projMeta.projectHead && {name:projMeta.projectHead, group:'Project Head'},
    projMeta.pm && {name:projMeta.pm, group:'Project Manager'},
    projMeta.associate && {name:projMeta.associate, group:'Associate'},
  ].filter(Boolean);
  const notifyProject = (payload) => addNotification({ projectId:activeProj, project:projMeta.name, tags: roster.map(r=>r.name), priority:'high', ...payload });

  // ---- mutation helpers ----
  const mutPhase = (phId, fn) => setPhases(ps => ps.map(ph => ph.id===phId ? fn({...ph}) : ph));
  const mutMs = (phId, msId, fn) => mutPhase(phId, ph => ({...ph, milestones: ph.milestones.map(m => m.id===msId ? fn({...m}) : m)}));
  const mutSt = (phId, msId, stId, fn) => mutMs(phId, msId, m => ({...m, subtasks: (m.subtasks||[]).map(s => s.id===stId ? fn({...s}) : s)}));

  // Owner isn't something a user needs to fill in — it defaults to this project's Project Manager.
  const addPhase = () => setPhases(ps => [...ps, { id:S.uid('PH'), name:'New Phase', owner:projMeta.pm||'', start:'', end:'', onHold:false, headConfirmedComplete:false, milestones:[] }]);
  const removePhase = (id) => setPhases(ps => ps.filter(p=>p.id!==id));
  const addMs = (phId) => mutPhase(phId, ph => ({...ph, milestones:[...ph.milestones, {...S.newItem('New Milestone'), open:true, subtasks:[]}]}));
  const removeMs = (phId, msId) => mutPhase(phId, ph => ({...ph, milestones: ph.milestones.filter(m=>m.id!==msId)}));
  const addSt = (phId, msId) => mutMs(phId, msId, m => ({...m, subtasks:[...(m.subtasks||[]), S.newItem('New Sub Task')]}));
  const removeSt = (phId, msId, stId) => mutMs(phId, msId, m => ({...m, subtasks: (m.subtasks||[]).filter(s=>s.id!==stId)}));

  // ---- status changes: Not Started / In Progress / On Hold apply immediately; Completed queues review ----
  const setMsStatus = (phId, msId, val) => {
    mutMs(phId, msId, m => S.applyStatus(m, val, 'milestone', actor));
    if(val==='Completed' && S.ROLE_RANK[actor]>=S.APPROVER_RANK.milestone){
      const ph = phases.find(p=>p.id===phId); const ms = ph && ph.milestones.find(m=>m.id===msId);
      if(ph && ms) notifyProject({ level:'milestone', itemName:ms.name, phaseName:ph.name, type:'Milestone Completed',
        message:`Milestone "${ms.name}" in phase "${ph.name}" was marked Completed by ${actor}.` });
    }
  };
  const setStStatus = (phId, msId, stId, val) => mutSt(phId, msId, stId, s => S.applyStatus(s, val, 'subtask', actor));

  // ---- review decisions: Project Manager decides Sub Tasks, Project Head decides Milestones ----
  const decideMs = (ph, ms, decision) => {
    mutMs(ph.id, ms.id, m => decision==='Approved'
      ? ({...m, status:'Completed', review:'', approved:true, actualDate:m.actualDate||S.TODAY_ISO})
      : ({...m, status:'In Progress', review:'', approved:false}));
    if(decision==='Approved') notifyProject({ level:'milestone', itemName:ms.name, phaseName:ph.name, type:'Milestone Completed',
      message:`Milestone "${ms.name}" in phase "${ph.name}" was approved as Completed by the Project Head.` });
  };
  const decideSt = (phId, msId, stId, decision) => mutSt(phId, msId, stId, s => decision==='Approved'
    ? ({...s, status:'Completed', review:'', approved:true, actualDate:s.actualDate||S.TODAY_ISO})
    : ({...s, status:'In Progress', review:'', approved:false}));

  // ---- "Implemented" escalation: Project Head approves first, then the Client Owner signs off in Portal ----
  const markImplementedMs = (phId, msId) => mutMs(phId, msId, m => ({...m, review:'Implemented Review', headApprovedImpl:false, clientApprovedImpl:false}));
  const markImplementedSt = (phId, msId, stId) => mutSt(phId, msId, stId, s => ({...s, review:'Implemented Review', headApprovedImpl:false, clientApprovedImpl:false}));
  const headApproveImplMs = (phId, msId) => mutMs(phId, msId, m => ({...m, headApprovedImpl:true}));
  const headApproveImplSt = (phId, msId, stId) => mutSt(phId, msId, stId, s => ({...s, headApprovedImpl:true}));
  const cancelImplMs = (phId, msId) => mutMs(phId, msId, m => ({...m, review:'', headApprovedImpl:false}));
  const cancelImplSt = (phId, msId, stId) => mutSt(phId, msId, stId, s => ({...s, review:'', headApprovedImpl:false}));

  // ---- assignees ----
  const addMsAssignee = (phId, msId, name) => mutMs(phId, msId, m => ({...m, assignees:[...(m.assignees||[]), name]}));
  const removeMsAssignee = (phId, msId, name) => mutMs(phId, msId, m => ({...m, assignees:(m.assignees||[]).filter(x=>x!==name)}));
  const addStAssignee = (phId, msId, stId, name) => mutSt(phId, msId, stId, s => ({...s, assignees:[...(s.assignees||[]), name]}));
  const removeStAssignee = (phId, msId, stId, name) => mutSt(phId, msId, stId, s => ({...s, assignees:(s.assignees||[]).filter(x=>x!==name)}));

  // ---- documents ----
  const attachMsDocs = (phId, msId, files) => mutMs(phId, msId, m => ({...m, docs:[...(m.docs||[]), ...Array.from(files).map((f:any)=>({n:f.name}))]}));
  const removeMsDoc = (phId, msId, i) => mutMs(phId, msId, m => ({...m, docs:(m.docs||[]).filter((_,j)=>j!==i)}));
  const attachStDocs = (phId, msId, stId, files) => mutSt(phId, msId, stId, s => ({...s, docs:[...(s.docs||[]), ...Array.from(files).map((f:any)=>({n:f.name}))]}));
  const removeStDoc = (phId, msId, stId, i) => mutSt(phId, msId, stId, s => ({...s, docs:(s.docs||[]).filter((_,j)=>j!==i)}));

  // ---- phase-level: start-date lock, On Hold toggle, completion confirmation ----
  const startEditableBy = (ph) => !ph.start || actor==='Project Head' || actor==='Strategic Lead';
  const toggleHold = (phId) => mutPhase(phId, ph => ({...ph, onHold:!ph.onHold}));
  const confirmPhaseComplete = (ph) => {
    mutPhase(ph.id, x => ({...x, headConfirmedComplete:true}));
    notifyProject({ level:'phase', itemName:ph.name, phaseName:ph.name, type:'Phase Completed',
      message:`Phase "${ph.name}" has been confirmed Completed by the Project Head.` });
  };

  const isTagged = (item, role) => (item.assignees||[]).some(nm=>{ const r=roster.find(x=>x.name===nm); return r && r.group===role; });

  // notifications: items / phases awaiting the current actor's action
  const allMs = phases.flatMap(p=>p.milestones);
  const allSt = allMs.flatMap(m=>m.subtasks||[]);
  const allItems = [...allMs, ...allSt];
  const pmQueue = allItems.filter(i=>i.review==='PM Verification');
  const headQueue = allItems.filter(i=>i.review==='Head Review' || (i.review==='Implemented Review' && !i.headApprovedImpl));
  const phasesAwaitingHead = phases.filter(ph=>S.phaseMilestonesReady(ph) && !ph.headConfirmedComplete && !ph.onHold);
  const assigneeQueue = (role) => allItems.filter(i => !S.isApproved(i) && !i.review && isTagged(i, role));
  const notifFor = (role) => assigneeQueue(role).length + (role==='Project Manager'?pmQueue.length:0) + (role==='Project Head'?(headQueue.length+phasesAwaitingHead.length):0);

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
    const canEdit = locked ? actor==='Strategic Lead' : (level==='subtask' ? true : isTagged(item, actor));
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
  const dotColor = (s) => ({
    'Not Started':'bg-slate-300','Yet to Start':'bg-slate-300','In Progress':'bg-sky-400','On Hold':'bg-orange-400',
    'Completed':'bg-emerald-500','Implemented':'bg-purple-500','Dropped':'bg-red-400','Terminated':'bg-red-500'
  }[s] || 'bg-slate-300');

  // "Needs your action" — every phase/milestone/sub task the CURRENT actor can act on right now,
  // in one place, instead of making them scan the whole tree to find it.
  const myActionItems = [];
  if(actor!=='Strategic Lead'){
    phases.forEach(ph=>{
      ph.milestones.forEach(ms=>{
        if(!S.isApproved(ms) && !ms.review && isTagged(ms, actor)) myActionItems.push({ ph, ms, label:`Update status — ${ms.name}` });
        if(actor==='Project Head' && ms.review==='Head Review') myActionItems.push({ ph, ms, label:`Approve milestone — ${ms.name}` });
        if(actor==='Project Head' && ms.review==='Implemented Review' && !ms.headApprovedImpl) myActionItems.push({ ph, ms, label:`Approve Implemented — ${ms.name}` });
        (ms.subtasks||[]).forEach(s=>{
          if(!S.isApproved(s) && !s.review && isTagged(s, actor)) myActionItems.push({ ph, ms, st:s, label:`Update status — ${s.name}` });
          if(actor==='Project Manager' && s.review==='PM Verification') myActionItems.push({ ph, ms, st:s, label:`Approve sub task — ${s.name}` });
          if(actor==='Project Head' && s.review==='Implemented Review' && !s.headApprovedImpl) myActionItems.push({ ph, ms, st:s, label:`Approve Implemented — ${s.name}` });
        });
      });
      if(actor==='Project Head' && S.phaseMilestonesReady(ph) && !ph.headConfirmedComplete && !ph.onHold) myActionItems.push({ ph, label:`Confirm phase complete — ${ph.name}` });
    });
  }
  const jumpTo = (a) => { setSelectedPhaseId(a.ph.id); setSelectedMsId(a.ms ? a.ms.id : null); setActionOpen(false); };
  const [actionOpen, setActionOpen] = useState(false);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <S.SectionTitle sub="Per-project phases → milestones → sub tasks. Project Manager approves Sub Tasks, Project Head approves Milestones & Phases, Client Owner signs off on Implemented items in the Client Portal.">Phase Management</S.SectionTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Acting as:</span>
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 text-xs">
            {['Associate','Project Manager','Project Head','Strategic Lead'].map(a=>(
              <button key={a} onClick={()=>setActor(a)} className={`relative px-2.5 py-1 rounded-md font-medium transition-colors ${actor===a?'bg-white text-brand-700 shadow-sm':'text-slate-500'}`}>
                {a}
                {notifFor(a)>0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] min-w-[15px] h-[15px] px-1 rounded-full flex items-center justify-center">{notifFor(a)}</span>}
              </button>
            ))}
          </div>
        </div>
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
              {myActionItems.length===0 ? (actor==='Strategic Lead' ? '— nothing needs your action' : '— nothing waiting on you') : `— ${myActionItems[0].label}${myActionItems.length>1?` +${myActionItems.length-1} more`:''}`}
            </span>
          )}
        </button>
        {actionOpen && (
          <div className="px-4 pb-4">
            {myActionItems.length===0 ? (
              <div className="text-sm text-slate-400">{actor==='Strategic Lead' ? 'Nothing needs your action — you can still re-open any approved item if needed.' : 'Nothing is waiting on you right now.'}</div>
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
          <span key={r.name+r.group} className="text-[11px] rounded-full px-2 py-0.5 bg-slate-200 text-slate-600">
            {r.name} <span className="opacity-70">· {r.group}</span>
          </span>
        ))}
      </div>

      <div className="flex justify-between items-center mb-3">
        <div className="text-xs text-slate-400">{phases.length} phase(s) · {phases.reduce((a,p)=>a+p.milestones.length,0)} milestone(s)</div>
        <button onClick={addPhase} className={`${S.LEVEL.phase.solid} text-white text-sm px-3 py-1.5 rounded-lg`}>+ Add Phase</button>
      </div>

      {phases.length===0 ? (
        <S.Card className="p-8 text-center text-sm text-slate-400">No phases for this project yet. Click “+ Add Phase”.</S.Card>
      ) : (
      <div className="flex gap-3 overflow-x-auto pb-1" style={{alignItems:'flex-start'}}>
        {/* Phase rail — persistent, always visible; click a phase to browse its milestones */}
        <S.Card className="p-2 w-60 shrink-0 space-y-1">
          {phases.map((ph, pi)=>{
            const status = S.derivedPhaseStatus(ph);
            const msDone = ph.milestones.filter(S.isApproved).length;
            const isSel = selPhase && selPhase.id===ph.id;
            return (
              <button key={ph.id} onClick={()=>selectPhase(ph)}
                className={`w-full flex items-start gap-2 text-left px-2 py-2 rounded-lg transition-colors ${isSel?'bg-brand-50 border border-brand-200':'border border-transparent hover:bg-slate-50'}`}>
                <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${dotColor(status)}`}></span>
                <span className="min-w-0">
                  <span className={`block text-sm truncate ${isSel?'font-medium text-brand-700':'text-slate-700'}`}>{S.toRoman(pi+1)}. {ph.name || 'Untitled phase'}</span>
                  <span className="block text-[11px] text-slate-400 truncate">{msDone}/{ph.milestones.length} done{ph.onHold?' · on hold':''}</span>
                </span>
              </button>
            );
          })}
        </S.Card>

        {/* Milestone list — scoped to the selected phase only */}
        <S.Card className="p-3 w-72 shrink-0">
          {selPhase ? (<>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">{selPhase.name}</span>
              {selPhase.headConfirmedComplete
                ? <span className="text-[10px] text-emerald-600 whitespace-nowrap inline-flex items-center gap-1"><S.Icon name="lock" className="w-3 h-3"/> locked</span>
                : <button onClick={()=>addMs(selPhase.id)} className={`text-xs ${S.LEVEL.milestone.link} whitespace-nowrap`}>+ Add</button>}
            </div>
            <div className="space-y-1.5">
              {selPhase.milestones.map(ms=>{
                const msOverdue = S.isOverdue(ms);
                const subReady = S.subtasksReady(ms);
                const isSel = selMs && selMs.id===ms.id;
                return (
                  <button key={ms.id} onClick={()=>setSelectedMsId(ms.id)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg border ${isSel?'border-brand-300 bg-brand-50':'border-slate-200 hover:bg-slate-50'} ${msOverdue?'bg-red-50/40':''}`}>
                    <div className={`text-sm truncate ${isSel?'font-medium text-brand-700':'text-slate-700'}`}>{ms.name || 'Untitled milestone'}</div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className={`text-[11px] whitespace-nowrap inline-flex items-center gap-1 ${msOverdue?'text-red-500 font-medium':'text-slate-400'}`}>{msOverdue && <S.Icon name="alert" className="w-3 h-3"/>}{msOverdue?'overdue':`due ${ms.deadline||'—'}`}</span>
                      <S.Badge cls={S.statusColor(ms.review || S.derivedMilestoneStatus(ms))}>{ms.review || S.derivedMilestoneStatus(ms)}</S.Badge>
                    </div>
                    {ms.subtasks.length>0 && <div className="text-[11px] text-slate-400 mt-0.5">{ms.subtasks.filter(S.isApproved).length}/{ms.subtasks.length} sub tasks{!subReady?' · pending':''}</div>}
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
            const msLocked = S.isApproved(ms); const msDis = msLocked && actor!=='Strategic Lead'; const msOverdue = S.isOverdue(ms); const subReady = S.subtasksReady(ms);
            return (
              <div>
                <button onClick={()=>setSelectedMsId(null)} className="text-xs text-slate-400 hover:text-slate-600 mb-2">← {ph.name}</button>
                <div className="flex flex-wrap items-end gap-3 mb-3">
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
                    <S.DocsChips docs={ms.docs} disabled={msDis} onAttach={files=>attachMsDocs(ph.id,ms.id,files)} onRemove={i=>removeMsDoc(ph.id,ms.id,i)}/>
                  </div>
                  <button onClick={()=>removeMs(ph.id,ms.id)} disabled={msDis} className={`text-xs whitespace-nowrap ml-auto ${msDis?'text-slate-300':'text-red-400 hover:text-red-600'}`}>✕ Remove milestone</button>
                </div>
                <div className="mb-3">
                  <label className="text-[10px] text-slate-400 block mb-1">Assignees</label>
                  <S.AssigneeChips assignees={ms.assignees} roster={roster} disabled={msDis} accent={S.LEVEL.milestone}
                    onAdd={nm=>addMsAssignee(ph.id,ms.id,nm)} onRemove={nm=>removeMsAssignee(ph.id,ms.id,nm)}/>
                </div>
                <div className="flex items-center gap-2 flex-wrap mb-3 pb-3 border-b border-slate-100">
                  <StatusControl item={ms} level="milestone" ms={ms} onChange={val=>setMsStatus(ph.id,ms.id,val)}/>
                  <S.ApprovalFlow item={ms} actor={actor} level="milestone"
                    onDecide={d=>decideMs(ph,ms,d)}
                    onMarkImplemented={()=>markImplementedMs(ph.id,ms.id)}
                    onHeadApproveImpl={()=>headApproveImplMs(ph.id,ms.id)}
                    onCancelImpl={()=>cancelImplMs(ph.id,ms.id)}/>
                  {!subReady && !ms.review && !msLocked && <span className="text-[11px] text-amber-600">Complete all sub tasks first</span>}
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className={`text-xs font-semibold ${S.LEVEL.subtask.text} uppercase tracking-wide`}>Sub tasks</span>
                  <button onClick={()=>addSt(ph.id,ms.id)} disabled={msDis} className={`text-xs ${msDis?'text-slate-300 cursor-not-allowed':S.LEVEL.subtask.link}`}>+ Add sub task</button>
                </div>
                <div className={`rounded-lg ${S.LEVEL.subtask.tint} divide-y divide-blue-100`}>
                  {(ms.subtasks||[]).map(s=>{ const stLock=S.isApproved(s); const genDis=stLock&&actor!=='Strategic Lead'; const overdue=S.isOverdue(s); return (
                    <div key={s.id} id={`st-${s.id}`} className={`flex flex-wrap items-center gap-2 px-2 py-2 ${overdue?'bg-red-50':''}`}>
                      {overdue && <span title="Deadline exceeded — not completed" className="text-red-500"><S.Icon name="alert" className="w-3.5 h-3.5"/></span>}
                      <input className={inpFor('subtask')+" flex-1 min-w-[140px]"+(overdue?" border-red-300":"")} value={s.name} disabled={genDis} onChange={e=>mutSt(ph.id,ms.id,s.id,x=>({...x,name:e.target.value}))} placeholder="Sub task"/>
                      <S.AssigneeChips assignees={s.assignees} roster={roster} disabled={genDis} accent={S.LEVEL.subtask} onAdd={nm=>addStAssignee(ph.id,ms.id,s.id,nm)} onRemove={nm=>removeStAssignee(ph.id,ms.id,s.id,nm)}/>
                      <input type="date" className={inpFor('subtask')+(overdue?" border-red-400 text-red-600":"")} value={s.deadline} disabled={genDis} onChange={e=>mutSt(ph.id,ms.id,s.id,x=>({...x,deadline:e.target.value}))}/>
                      <span className="text-[11px] text-slate-400 whitespace-nowrap">done {S.itemDoneDate(s) || '—'}</span>
                      <StatusControl item={s} level="subtask" onChange={val=>setStStatus(ph.id,ms.id,s.id,val)}/>
                      <S.ApprovalFlow item={s} actor={actor} level="subtask"
                        onDecide={d=>decideSt(ph.id,ms.id,s.id,d)}
                        onMarkImplemented={()=>markImplementedSt(ph.id,ms.id,s.id)}
                        onHeadApproveImpl={()=>headApproveImplSt(ph.id,ms.id,s.id)}
                        onCancelImpl={()=>cancelImplSt(ph.id,ms.id,s.id)}/>
                      <S.DocsChips docs={s.docs} disabled={genDis} onAttach={files=>attachStDocs(ph.id,ms.id,s.id,files)} onRemove={i=>removeStDoc(ph.id,ms.id,s.id,i)}/>
                      <button onClick={()=>removeSt(ph.id,ms.id,s.id)} disabled={genDis} className={`${genDis?'text-slate-300':'text-red-400 hover:text-red-600'}`}>✕</button>
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
                  <span className="text-sm font-medium text-slate-800">Phase details</span>
                  <S.Badge cls={S.statusColor(status)}>{status}</S.Badge>
                </div>
                <div className="flex flex-wrap items-start gap-3 mb-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400">Phase name</label>
                    <input className={inpFor('phase')+" font-medium w-44"} value={ph.name} onChange={e=>mutPhase(ph.id, x=>({...x,name:e.target.value}))} placeholder="Phase name"/>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400">Owner</label>
                    <span className="text-xs text-slate-600 px-2 py-1.5 inline-block" title="Defaults to this project's Project Manager">{ph.owner || projMeta.pm || '—'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400">Start date {startLocked && <span title="Locked — only Project Head or Strategic Lead can change a start date once set" className="inline-flex align-text-bottom"><S.Icon name="lock" className="w-2.5 h-2.5"/></span>}</label>
                    <input type="date" className={inpFor('phase')} value={ph.start} disabled={startLocked} onChange={e=>mutPhase(ph.id, x=>({...x,start:e.target.value}))}/>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400">Deadline</label>
                    <input type="date" className={inpFor('phase')} value={ph.end} onChange={e=>mutPhase(ph.id, x=>({...x,end:e.target.value}))}/>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400">Actual completed</label>
                    <span className="text-xs text-slate-600 px-2 py-1.5 inline-block">{actualEnd || '—'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400">Duration</label>
                    <span className="text-xs text-slate-600 px-2 py-1.5 inline-block">{duration!=null ? `${duration}d` : '—'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(actor==='Project Head' || actor==='Strategic Lead') && !ph.headConfirmedComplete && (
                    <button onClick={()=>toggleHold(ph.id)} className={`text-xs px-2.5 py-1.5 rounded-lg border whitespace-nowrap ${ph.onHold?'border-emerald-300 text-emerald-600 hover:bg-emerald-50':'border-orange-300 text-orange-600 hover:bg-orange-50'}`}>
                      {ph.onHold ? 'Resume' : 'Put on hold'}
                    </button>
                  )}
                  {ready && !ph.headConfirmedComplete && !ph.onHold && (
                    actor==='Project Head'
                      ? <button onClick={()=>confirmPhaseComplete(ph)} className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white whitespace-nowrap">Confirm completion</button>
                      : <span className="text-xs text-amber-600 whitespace-nowrap py-1.5">Awaiting Head confirmation</span>
                  )}
                  <button onClick={()=>removePhase(ph.id)} className="text-xs text-red-500 hover:text-red-700 whitespace-nowrap ml-auto">✕ Remove phase</button>
                </div>
                {ph.headConfirmedComplete && <div className="text-[11px] text-emerald-600 mt-2 flex items-center gap-1"><S.Icon name="lock" className="w-3 h-3"/> Phase complete — milestones locked</div>}
              </div>
            );
          })() : <div className="text-xs text-slate-400">Select a phase from the left to see its details.</div>}
        </S.Card>
      </div>
      )}
      <div className="mt-3 text-xs text-slate-400 space-y-1">
        <div>Sub tasks are approved by the <b>Project Manager</b>; once all of a milestone's sub tasks are approved, the <b>Project Head</b> approves the milestone; once every milestone is approved, the <b>Project Head</b> confirms the phase.</div>
        <div><b>Implemented</b> — the most important status — needs the <b>Project Head</b>'s approval, then the <b>Client Owner</b>'s sign-off in the Client Portal. Approved items lock; only the <b>Strategic Lead</b> can re-open them, and only the <b>Project Head</b>/<b>Strategic Lead</b> can change a phase's start date once it's set.</div>
      </div>
    </div>
  );
}

// Deliverables here means every Milestone and Sub Task from Phase Management that's due by the
// end of the current month, counting cumulatively from the project's start date — this page is a
// read-only report over that same shared tree, so it inherits the exact same statuses, approval
// rules and "who approved it" facts as Phase Management. Nothing is edited from here.
