import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

export default function Portal(){
  const { tree, setTree, addNotification } = React.useContext(S.PhaseDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const [activeProj, setActiveProj] = useState(projects[0].id);
  const [openPhase, setOpenPhase] = useState({});
  const [openMs, setOpenMs] = useState({});
  const [remarkDraft, setRemarkDraft] = useState({});
  const [expandedApproval, setExpandedApproval] = useState(null);

  const phases = tree[activeProj] || [];
  const projMeta = projects.find(p=>p.id===activeProj) || {};
  const roster = [
    projMeta.strategicLead && {name:projMeta.strategicLead, group:'Strategic Lead'},
    projMeta.projectHead && {name:projMeta.projectHead, group:'Project Head'},
    projMeta.pm && {name:projMeta.pm, group:'Project Manager'},
    projMeta.associate && {name:projMeta.associate, group:'Associate'},
  ].filter(Boolean);
  const clientOwner = (projMeta.clients||[]).find(c=>c.owner);
  const notifyProject = (payload) => addNotification({ projectId:activeProj, project:projMeta.name, tags: roster.map(r=>r.name), priority:'high', ...payload });

  // Pipeline: only items the Project Head has already approved for Implemented show up here —
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
    const { level, ph, ms, item } = entry;
    if(level==='Milestone'){
      setTree(t => S.mutateMs(t, activeProj, ph.id, ms.id, m => ({...m, status:'Implemented', review:'', clientApprovedImpl:true, clientAcceptedDate:S.TODAY_ISO})));
    } else {
      setTree(t => S.mutateSt(t, activeProj, ph.id, ms.id, item.id, s => ({...s, status:'Implemented', review:'', clientApprovedImpl:true, clientAcceptedDate:S.TODAY_ISO})));
    }
    notifyProject({ level:level.toLowerCase(), itemName:item.name, phaseName:ph.name, type:'Implemented',
      message:`"${item.name}" in phase "${ph.name}" has been marked Implemented after Project Head and Client Owner approval.` });
  };

  const requestChanges = (entry) => {
    const { level, ph, ms, item } = entry;
    if(level==='Milestone'){
      setTree(t => S.mutateMs(t, activeProj, ph.id, ms.id, m => ({...m, review:'', headApprovedImpl:false})));
    } else {
      setTree(t => S.mutateSt(t, activeProj, ph.id, ms.id, item.id, s => ({...s, review:'', headApprovedImpl:false})));
    }
    const text = (remarkDraft[item.id]||'').trim();
    notifyProject({ level:level.toLowerCase(), itemName:item.name, phaseName:ph.name, type:'Client Requested Changes',
      message:`Client Owner requested changes on "${item.name}" (${ph.name})${text?`: "${text}"`:'.'}` });
    setRemark(item.id, '');
  };

  const postRemark = (entry) => {
    const { level, ph, item } = entry;
    const text = (remarkDraft[item.id]||'').trim();
    if(!text) return;
    notifyProject({ level:level.toLowerCase(), itemName:item.name, phaseName:ph.name, type:'Client Remark',
      message:`Client remark on "${item.name}" (${ph.name}): "${text}"` });
    setRemark(item.id, '');
  };

  const togglePhase = (id) => setOpenPhase(o => ({...o, [id]: !o[id]}));
  const toggleMs = (id) => setOpenMs(o => ({...o, [id]: !o[id]}));

  return (
    <div>
      <S.SectionTitle sub="Client-facing view — approvals pending your sign-off, plus a simple phase / milestone / sub task timeline">Client Portal{projMeta.client?` — ${projMeta.client}`:''}</S.SectionTitle>

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
                    <div className="text-xs text-slate-500">Approved internally by the Project Head — your sign-off marks this <b>Implemented</b>, the most important status in the project.</div>
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
                  </div>
                )}
              </div>
            );})}
          </div>
        )}
      </S.Card>

      {/* Simple timeline: Phase -> Milestone -> Sub Task, deadline & status only */}
      <S.Card className="p-4">
        <div className="font-semibold text-slate-800 mb-3">Project Timeline</div>
        <div className="space-y-2">
          {phases.map(ph=>{ const phOpen = !!openPhase[ph.id]; const phStatus = S.derivedPhaseStatus(ph); return (
            <div key={ph.id} className="border border-slate-200 rounded-lg overflow-hidden">
              <button onClick={()=>togglePhase(ph.id)} className="w-full flex flex-wrap items-center gap-3 px-3 py-2.5 bg-slate-50 text-left">
                <span className="text-slate-400 text-xs w-4">{phOpen?'▼':'▶'}</span>
                <span className="font-medium text-slate-800 flex-1">{ph.name}</span>
                <span className="text-xs text-slate-400 whitespace-nowrap">Deadline {ph.end || '—'}</span>
                <S.Badge cls={S.statusColor(phStatus)}>{phStatus}</S.Badge>
              </button>
              {phOpen && (
                <div className="divide-y divide-slate-100">
                  {ph.milestones.map(ms=>{ const msOpen = !!openMs[ms.id]; return (
                    <div key={ms.id}>
                      <button onClick={()=>toggleMs(ms.id)} className="w-full flex flex-wrap items-center gap-3 px-3 py-2 pl-8 text-left hover:bg-slate-50">
                        <span className="text-slate-300 text-xs w-4">{ms.subtasks&&ms.subtasks.length ? (msOpen?'▼':'▶') : '·'}</span>
                        <span className="text-sm text-slate-700 flex-1">{ms.name}</span>
                        <span className="text-xs text-slate-400 whitespace-nowrap">Deadline {ms.deadline || '—'}</span>
                        <S.Badge cls={S.statusColor(ms.status)}>{ms.status}</S.Badge>
                      </button>
                      {msOpen && (ms.subtasks||[]).map(s=>(
                        <div key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2 pl-16 text-left">
                          <span className="text-sm text-slate-600 flex-1">{s.name}</span>
                          <span className="text-xs text-slate-400 whitespace-nowrap">Deadline {s.deadline || '—'}</span>
                          <S.Badge cls={S.statusColor(s.status)}>{s.status}</S.Badge>
                        </div>
                      ))}
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
