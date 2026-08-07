import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

export default function Implementation(){
  const { tree } = React.useContext(S.PhaseDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { admin } = React.useContext(S.AdminDataContext);
  // Optional chaining: a project-scoped restricted account (see S.staffVisibleProjects) can have
  // zero visible projects, so projects[0] may be undefined -- projects[0].id would crash the screen.
  const [activeProj, setActiveProj] = useState(projects[0]?.id);
  const projMeta = projects.find(p=>p.id===activeProj) || {};
  const phases = tree[activeProj] || [];

  const allItems = [];
  phases.forEach(ph => ph.milestones.forEach(ms=>{
    allItems.push({ item:ms, level:'Milestone', ph });
    (ms.subtasks||[]).forEach(s=> allItems.push({ item:s, level:'Sub Task', ph, ms }));
  }));

  const awaitingHead = allItems.filter(e=>e.item.review==='Implemented Review' && !e.item.headApprovedImpl);
  const awaitingClient = allItems.filter(e=>e.item.review==='Implemented Review' && e.item.headApprovedImpl && !e.item.clientApprovedImpl);
  const implemented = allItems.filter(e=>e.item.status==='Implemented').sort((a,b)=>(b.item.clientAcceptedDate||'').localeCompare(a.item.clientAcceptedDate||''));
  const totalEligible = awaitingHead.length + awaitingClient.length + implemented.length;
  const implementedPct = totalEligible ? Math.round(100*implemented.length/totalEligible) : 0;

  return (
    <div>
      <S.SectionTitle sub="Go-live, client acceptance and closure — live from Phase Management's Implemented Review workflow">Implementation Tracker</S.SectionTitle>

      <div className="flex gap-1 border-b border-slate-200 mb-3 overflow-x-auto">
        {projects.map(p=>(
          <button key={p.id} onClick={()=>setActiveProj(p.id)}
            className={`whitespace-nowrap px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${activeProj===p.id?'border-violet-500 text-violet-700 font-medium':'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {p.name}
          </button>
        ))}
      </div>

      <S.Card className="p-5 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><div className="text-xs text-slate-400">Project Manager</div><div className="font-medium">{S.projectManagerName(projMeta, admin)||'—'}</div></div>
          <div><div className="text-xs text-slate-400">Awaiting Head Sign-off</div><div className="font-medium">{awaitingHead.length}</div></div>
          <div><div className="text-xs text-slate-400">Awaiting Client Acceptance</div><div className="font-medium">{awaitingClient.length}</div></div>
          <div><div className="text-xs text-slate-400">Implemented</div><S.Badge cls={S.statusColor('Implemented')}>{implemented.length} of {totalEligible}</S.Badge></div>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Implementation Progress</span><span>{implementedPct}%</span></div>
          <div className="h-2 bg-slate-100 rounded-full"><div className="h-2 bg-brand-500 rounded-full" style={{width:implementedPct+'%'}}></div></div>
        </div>
      </S.Card>

      {totalEligible===0 ? (
        <S.Card className="p-6 text-center text-sm text-slate-400">No items have entered the Implemented Review workflow for this project yet — mark a milestone or sub task Implemented from Phase Management to see it tracked here.</S.Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <S.Card className="p-4">
            <div className="font-semibold text-slate-800 mb-2 text-sm">Awaiting Head Sign-off ({awaitingHead.length})</div>
            {awaitingHead.length===0 ? <div className="text-xs text-slate-400">Nothing here.</div> : (
              <div className="space-y-1.5">{awaitingHead.map((e,i)=>(
                <div key={i} className="text-sm bg-slate-50 rounded-lg px-3 py-2">
                  <div className="font-medium text-slate-700 truncate">{e.item.name}</div>
                  <div className="text-xs text-slate-400">{e.level}</div>
                </div>
              ))}</div>
            )}
          </S.Card>
          <S.Card className="p-4">
            <div className="font-semibold text-slate-800 mb-2 text-sm">Awaiting Client Acceptance ({awaitingClient.length})</div>
            {awaitingClient.length===0 ? <div className="text-xs text-slate-400">Nothing here.</div> : (
              <div className="space-y-1.5">{awaitingClient.map((e,i)=>(
                <div key={i} className="text-sm bg-slate-50 rounded-lg px-3 py-2">
                  <div className="font-medium text-slate-700 truncate">{e.item.name}</div>
                  <div className="text-xs text-slate-400">{e.level}</div>
                </div>
              ))}</div>
            )}
          </S.Card>
          <S.Card className="p-4">
            <div className="font-semibold text-slate-800 mb-2 text-sm">Implemented / Closed ({implemented.length})</div>
            {implemented.length===0 ? <div className="text-xs text-slate-400">Nothing implemented yet.</div> : (
              <div className="space-y-1.5">{implemented.map((e,i)=>(
                <div key={i} className="text-sm bg-emerald-50 rounded-lg px-3 py-2">
                  <div className="font-medium text-slate-700 truncate">{e.item.name}</div>
                  <div className="text-xs text-slate-400">{e.level} · Closed {e.item.clientAcceptedDate||e.item.actualDate||'—'}</div>
                </div>
              ))}</div>
            )}
          </S.Card>
        </div>
      )}
    </div>
  );
}

// Gantt chart — project-tabbed, one bar per Phase from the real Phase Management tree. Progress %
// is the share of that phase's milestones already approved; the timeline scale is derived from the
// project's own start/end (and its phases' dates), so every project gets an accurate scale rather
// than one fixed hardcoded window.
