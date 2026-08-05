import React, { useState } from 'react';
import * as S from '../shared';

// Traction status for a single phase — built from the same derivation rules Phase Management
// already uses (derivedPhaseStatus, isOverdue), not a separate hardcoded status field. "Delayed"
// takes priority over "In Progress" because a phase can be actively worked and still be behind.
const phaseTraction = (ph) => {
  if (ph.onHold) return 'On Hold';
  const base = S.derivedPhaseStatus(ph); // 'Not Started' | 'In Progress' | 'Completed' | 'On Hold'
  if (base === 'Completed') return 'Completed';
  const anyOverdue = ph.milestones.some(ms => S.isOverdue(ms) || (ms.subtasks||[]).some(S.isOverdue));
  if (anyOverdue) return 'Delayed';
  return base; // 'Not Started' | 'In Progress' (shown as "On Track")
};
const TRACTION_LABEL = { 'Not Started':'Not Started', 'In Progress':'On Track', 'Completed':'Completed', 'On Hold':'On Hold', 'Delayed':'Delayed' };
const TRACTION_COLOR = {
  'Not Started': 'bg-slate-100 text-slate-500',
  'In Progress': 'bg-blue-100 text-blue-700',
  'Completed':   'bg-emerald-100 text-emerald-700',
  'On Hold':     'bg-orange-100 text-orange-700',
  'Delayed':     'bg-red-100 text-red-700',
};
// Project-level traction rolls up every phase: one Delayed phase makes the whole project Delayed
// (worth flagging even if other phases are fine), otherwise On Hold beats In Progress, etc.
const rollUp = (statuses) => {
  if (statuses.length === 0) return 'Not Started';
  if (statuses.includes('Delayed')) return 'Delayed';
  if (statuses.includes('On Hold')) return 'On Hold';
  if (statuses.every(s => s === 'Completed')) return 'Completed';
  if (statuses.some(s => s === 'In Progress' || s === 'Completed')) return 'In Progress';
  return 'Not Started';
};

export default function ProjectStructure(){
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { tree } = React.useContext(S.PhaseDataContext);
  const [active, setActive] = useState(projects[0]?.id);
  const [expandedPhase, setExpandedPhase] = useState(null);

  const project = projects.find(p=>p.id===active);
  const phases = tree[active] || [];

  const allMs = phases.flatMap(ph => ph.milestones);
  const allSt = allMs.flatMap(ms => ms.subtasks||[]);
  const allItems = [...allMs, ...allSt];
  const msDone = allMs.filter(S.isApproved).length;
  const overdueItems = allItems.filter(S.isOverdue);
  const pct = allMs.length ? Math.round(100 * msDone / allMs.length) : 0;
  const phaseStatuses = phases.map(phaseTraction);
  const projectTraction = rollUp(phaseStatuses);
  const phasesDone = phaseStatuses.filter(s=>s==='Completed').length;

  // Summary badge per project tab, so you can scan traction across the whole portfolio without
  // opening each one.
  const tabTraction = (p) => rollUp((tree[p.id]||[]).map(phaseTraction));

  if (!project) {
    return (
      <div>
        <S.SectionTitle sub="A live rollup of every project's phases and milestones from Phase Management">Project Structure</S.SectionTitle>
        <S.Card className="p-8 text-center text-sm text-slate-400">No projects yet — add one in Project Master first.</S.Card>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
        <S.SectionTitle sub="A live rollup of every project's phases and milestones from Phase Management — traction, delays and activity, at a glance">Project Structure</S.SectionTitle>
      </div>

      {/* Project tabs, each carrying its own traction badge */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 mb-4 pb-px">
        {projects.map(p=>{
          const t = tabTraction(p);
          return (
            <button key={p.id} onClick={()=>{setActive(p.id);setExpandedPhase(null);}}
              className={`flex-shrink-0 px-4 py-2.5 text-sm rounded-t-lg border-b-2 -mb-px transition-colors ${active===p.id?'border-brand-500 text-brand-700 bg-white font-medium':'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span>{p.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${TRACTION_COLOR[t]}`}>{TRACTION_LABEL[t]}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected project summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <S.Card className="p-4"><div className="text-xs text-slate-400">Project</div><div className="font-semibold text-slate-800 truncate">{project.name}</div><div className="text-xs text-slate-400 mt-0.5">{project.client}</div></S.Card>
        <S.Card className="p-4"><div className="text-xs text-slate-400">Traction</div><div className="mt-1"><S.Badge cls={TRACTION_COLOR[projectTraction]}>{TRACTION_LABEL[projectTraction]}</S.Badge></div><div className="text-xs text-slate-400 mt-1">{project.start||'—'} → {project.end||'—'}</div></S.Card>
        <S.Card className="p-4"><div className="text-xs text-slate-400">Phases Completed</div><div className="text-2xl font-bold text-slate-800">{phasesDone}<span className="text-base text-slate-400"> / {phases.length}</span></div></S.Card>
        <S.Card className="p-4"><div className="text-xs text-slate-400">Milestones Approved</div><div className="text-2xl font-bold text-slate-800">{msDone}<span className="text-base text-slate-400"> / {allMs.length}</span></div></S.Card>
        <S.Card className="p-4"><div className="text-xs text-slate-400">Overdue Items</div><div className={`text-2xl font-bold ${overdueItems.length?'text-red-600':'text-emerald-600'}`}>{overdueItems.length}</div><div className="text-xs text-slate-400 mt-0.5">milestones + sub tasks past deadline</div></S.Card>
        <S.Card className="p-4"><div className="text-xs text-slate-400">Overall Progress</div><div className="text-2xl font-bold text-brand-600">{pct}%</div><div className="h-1.5 bg-slate-100 rounded-full mt-1.5"><div className="h-1.5 bg-brand-500 rounded-full transition-all" style={{width:pct+'%'}}></div></div></S.Card>
      </div>

      {phases.length===0 ? (
        <S.Card className="p-8 text-center text-sm text-slate-400">
          No phases set up for this project yet. Go to <span className="text-slate-600 font-medium">Phase Management</span> to add phases and milestones — they'll show up here automatically.
        </S.Card>
      ) : (
        <div className="space-y-3">
          {phases.map((ph, pi) => {
            const traction = phaseTraction(ph);
            const done = ph.milestones.filter(S.isApproved).length;
            const total = ph.milestones.length;
            const phPct = total ? Math.round(100*done/total) : 0;
            const actualEnd = S.phaseActualEnd(ph);
            const duration = S.phaseDurationDays(ph);
            const isOpen = expandedPhase===ph.id;
            const phOverdue = ph.milestones.filter(ms=>S.isOverdue(ms) || (ms.subtasks||[]).some(S.isOverdue));
            return (
              <S.Card key={ph.id} className="overflow-hidden">
                <button onClick={()=>setExpandedPhase(isOpen?null:ph.id)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left">
                  <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center font-bold text-sm flex-shrink-0">{S.toRoman(pi+1)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800 truncate">{ph.name || 'Untitled phase'}</span>
                      <S.Badge cls={TRACTION_COLOR[traction]}>{TRACTION_LABEL[traction]}</S.Badge>
                      {phOverdue.length>0 && <span className="text-[11px] text-red-500 inline-flex items-center gap-1"><S.Icon name="alert" className="w-3 h-3"/>{phOverdue.length} overdue</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {ph.owner ? `${ph.owner} · ` : ''}{ph.start||'—'} → {ph.end||'—'}{actualEnd ? ` · completed ${actualEnd}` : ''}{duration!=null ? ` · ${duration}d` : ''}
                    </div>
                  </div>
                  <div className="hidden sm:block w-32 shrink-0">
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1"><span>{done}/{total}</span><span>{phPct}%</span></div>
                    <div className="h-1.5 bg-slate-100 rounded-full"><div className={`h-1.5 rounded-full ${traction==='Delayed'?'bg-red-400':traction==='On Hold'?'bg-orange-400':'bg-brand-500'}`} style={{width:phPct+'%'}}></div></div>
                  </div>
                  <span className="text-slate-400 text-xs w-4 text-center shrink-0">{isOpen?'▲':'▼'}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 divide-y divide-slate-100">
                    {ph.milestones.length===0 ? (
                      <div className="text-xs text-slate-400 px-4 py-3">No milestones in this phase yet.</div>
                    ) : ph.milestones.map(ms=>{
                      const msOverdue = S.isOverdue(ms);
                      const subs = ms.subtasks||[];
                      const subDone = subs.filter(S.isApproved).length;
                      return (
                        <div key={ms.id} className={`flex flex-wrap items-center gap-2 px-4 py-2.5 ${msOverdue?'bg-red-50/50':''}`}>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${S.isApproved(ms)?'bg-emerald-500':msOverdue?'bg-red-500':S.derivedMilestoneStatus(ms)==='In Progress'?'bg-sky-400':'bg-slate-300'}`}></span>
                          <span className="text-sm text-slate-700 min-w-[140px] flex-1 truncate">{ms.name || 'Untitled milestone'}</span>
                          <span className="text-xs text-slate-400 whitespace-nowrap">{(ms.assignees||[]).join(', ') || 'Unassigned'}</span>
                          {subs.length>0 && <span className="text-[11px] text-slate-400 whitespace-nowrap">{subDone}/{subs.length} sub tasks</span>}
                          <span className={`text-xs whitespace-nowrap inline-flex items-center gap-1 ${msOverdue?'text-red-500 font-medium':'text-slate-400'}`}>{msOverdue && <S.Icon name="alert" className="w-3 h-3"/>}{msOverdue?'overdue':`due ${ms.deadline||'—'}`}</span>
                          <S.Badge cls={S.statusColor(ms.review || S.derivedMilestoneStatus(ms))}>{ms.review || S.derivedMilestoneStatus(ms)}</S.Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </S.Card>
            );
          })}
        </div>
      )}
      <div className="mt-3 text-xs text-slate-400">Read-only summary — phases, milestones and their statuses are edited in <span className="font-medium text-slate-500">Phase Management</span>; this page just reports on them.</div>
    </div>
  );
}
