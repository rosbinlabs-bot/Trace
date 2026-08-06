import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

export default function Gantt(){
  const { tree } = React.useContext(S.PhaseDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  // Optional chaining: a project-scoped restricted account (see S.staffVisibleProjects) can have
  // zero visible projects, so projects[0] may be undefined -- projects[0].id would crash the screen.
  const [activeProj, setActiveProj] = useState(projects[0]?.id);
  const projMeta = projects.find(p=>p.id===activeProj) || {};
  const phases = tree[activeProj] || [];

  const allDates = phases.flatMap(ph=>[ph.start, ph.end]).concat([projMeta.start, projMeta.end]).filter(Boolean).map(d=>new Date(d).getTime());
  const rangeStart = allDates.length ? Math.min(...allDates) : new Date(S.TODAY_ISO).getTime();
  const rangeEnd = allDates.length ? Math.max(...allDates) : rangeStart + 86400000*90;
  const totalMs = Math.max(rangeEnd - rangeStart, 86400000);
  const bar = (s,e) => {
    if(!s || !e) return { left:'0%', width:'1.5%' };
    const left = (new Date(s).getTime()-rangeStart)/totalMs*100;
    const width = (new Date(e).getTime()-new Date(s).getTime())/totalMs*100;
    return { left:Math.max(left,0)+'%', width:Math.max(width,1.5)+'%' };
  };
  const todayLeft = ((new Date(S.TODAY_ISO).getTime()-rangeStart)/totalMs*100);
  const showToday = todayLeft>=0 && todayLeft<=100;

  return (
    <div>
      <S.SectionTitle sub="Project & phase timeline with progress, sourced live from Phase Management">Gantt Chart</S.SectionTitle>

      {/* Project tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-3 overflow-x-auto">
        {projects.map(p=>(
          <button key={p.id} onClick={()=>setActiveProj(p.id)}
            className={`whitespace-nowrap px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${activeProj===p.id?'border-violet-500 text-violet-700 font-medium':'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {p.name}
          </button>
        ))}
      </div>

      <S.Card className="p-5 overflow-x-auto">
        {phases.length===0 ? (
          <div className="text-sm text-slate-400 text-center py-8">No phases yet for this project — add some in Phase Management.</div>
        ) : (
        <div className="min-w-[760px] space-y-3 relative">
          {showToday && (
            <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-red-300 z-10" style={{left:`calc(11rem + ${todayLeft}%)`}} title={`Today · ${S.TODAY_ISO}`}></div>
          )}
          {phases.map((ph, pi)=>{
            const st = bar(ph.start, ph.end);
            const status = S.derivedPhaseStatus(ph);
            const msDone = ph.milestones.filter(S.isApproved).length;
            const pct = ph.milestones.length ? Math.round(100*msDone/ph.milestones.length) : (ph.headConfirmedComplete?100:0);
            const overdue = ph.end && ph.end<S.TODAY_ISO && !ph.headConfirmedComplete;
            return (
              <div key={ph.id} className="flex items-center gap-3">
                <div className="w-44 shrink-0 text-sm text-slate-600 truncate">{S.toRoman(pi+1)}. {ph.name}</div>
                <div className="flex-1 relative h-7 bg-slate-50 rounded">
                  <div className={`absolute h-7 rounded ${overdue?'bg-red-100':'bg-brand-100'}`} style={st}>
                    <div className={`h-7 rounded ${overdue?'bg-red-400':'bg-brand-500'} text-[10px] text-white flex items-center px-2 whitespace-nowrap`} style={{width:pct+'%'}}>{pct}%</div>
                  </div>
                </div>
                <S.Badge cls={S.statusColor(status)}>{status}</S.Badge>
              </div>
            );
          })}
        </div>
        )}
        <div className="flex gap-4 mt-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-brand-500 rounded-sm inline-block"></span>Progress</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-brand-100 rounded-sm inline-block"></span>Planned</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded-sm inline-block"></span>Overdue</span>
          {showToday && <span className="flex items-center gap-1"><span className="w-3 h-0 border-t-2 border-dashed border-red-300 inline-block"></span>Today</span>}
        </div>
      </S.Card>
    </div>
  );
}

// Calendar — a real month grid (correct weekday alignment for whatever month is being viewed),
// with events sourced live from every phase/milestone/sub task deadline in Phase Management.
