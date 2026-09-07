import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

const LABEL_W = 'w-36'; // phase-name column; kept separate from AVATAR_W so both share LABEL_REM below
const AVATAR_W = 'w-12'; // team-avatar-stack column
const LABEL_REM = '13.5rem'; // AVATAR_W + LABEL_W + gaps, in rem -- keep the row-label columns, the
                              // ruler's left offset, and the dependency-connector SVG's left offset in lockstep
const ROW_H = 40; // fixed px row height -- lets the dependency-connector SVG compute exact Y positions
                   // per row instead of measuring the DOM; every row below must actually be this tall.

// Builds ruler tick labels across [rangeStart, rangeEnd] at week/month/quarter granularity.
// Ticks are evenly spaced visually (like the rest of the app's bar charts) -- actual bar and
// milestone positions are computed separately, from real dates, not from tick spacing.
function buildTicks(rangeStart: number, rangeEnd: number, zoom: 'week'|'month'|'quarter'){
  const ticks: string[] = [];
  const cur = new Date(rangeStart);
  cur.setHours(0,0,0,0);
  if(zoom==='week'){
    // align to the Monday on/before rangeStart
    const dow = (cur.getDay()+6)%7;
    cur.setDate(cur.getDate()-dow);
    while(cur.getTime() <= rangeEnd){
      ticks.push(cur.toLocaleDateString('en-US',{month:'short', day:'numeric'}));
      cur.setDate(cur.getDate()+7);
    }
  } else if(zoom==='quarter'){
    cur.setDate(1); cur.setMonth(Math.floor(cur.getMonth()/3)*3);
    while(cur.getTime() <= rangeEnd){
      ticks.push(`Q${Math.floor(cur.getMonth()/3)+1} '${String(cur.getFullYear()).slice(2)}`);
      cur.setMonth(cur.getMonth()+3);
    }
  } else {
    cur.setDate(1);
    while(cur.getTime() <= rangeEnd){
      ticks.push(cur.toLocaleDateString('en-US',{month:'short', year: cur.getMonth()===0?'2-digit':undefined}));
      cur.setMonth(cur.getMonth()+1);
    }
  }
  return ticks.length ? ticks : [''];
}

// Milestone diamond color follows the same read as everywhere else: green once approved, red
// once past its deadline and not approved, blue while actively in progress, grey otherwise.
function diamondCls(ms: any){
  if(S.isApproved(ms)) return 'bg-emerald-500';
  if(S.isOverdue(ms)) return 'bg-red-500';
  if(S.derivedMilestoneStatus(ms)==='In Progress') return 'bg-blue-500';
  return 'bg-slate-300';
}

function initials(name: string){
  return (name||'').split(/\s+/).map((w:string)=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
}

export default function Gantt(){
  const { tree } = React.useContext(S.PhaseDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  // Optional chaining: a project-scoped restricted account (see S.staffVisibleProjects) can have
  // zero visible projects, so projects[0] may be undefined -- projects[0].id would crash the screen.
  const [activeProj, setActiveProj] = useState(projects[0]?.id);
  const [zoom, setZoom] = useState<'week'|'month'|'quarter'>('month');
  const projMeta = projects.find(p=>p.id===activeProj) || {};
  const phases = tree[activeProj] || [];

  // Dependency-aware schedule (S.ganttEstimates) resolves a start/end for every phase -- actual dates
  // where Phase Management has them, otherwise a best estimate from that phase's own milestone
  // deadlines, otherwise honestly "unscheduled". S.ganttCriticalPath then walks the dependency chain
  // (ph.dependsOn, or implicitly the previous phase in the list) to find which phases actually set the
  // project's finish date, and which one of those is the current bottleneck. See shared.tsx for both.
  const estimates = useMemo(()=>S.ganttEstimates(phases), [phases]);
  const { path: criticalPath, blockingId } = useMemo(()=>S.ganttCriticalPath(phases, estimates), [phases, estimates]);

  const allDates = Object.values(estimates).flatMap((e:any)=>[e.start, e.end]).concat([projMeta.start, projMeta.end, S.TODAY_ISO]).filter(Boolean).map((d:string)=>new Date(d).getTime());
  const rangeStart = allDates.length ? Math.min(...allDates) : new Date(S.TODAY_ISO).getTime();
  const rangeEnd = allDates.length ? Math.max(...allDates) : rangeStart + 86400000*90;
  const totalMs = Math.max(rangeEnd - rangeStart, 86400000);
  const bar = (s: string, e: string) => {
    const left = (new Date(s).getTime()-rangeStart)/totalMs*100;
    const width = (new Date(e).getTime()-new Date(s).getTime())/totalMs*100;
    return { left:Math.max(left,0)+'%', width:Math.max(width,1.5)+'%' };
  };
  const pctPos = (dateStr: string) => Math.min(100, Math.max(0, (new Date(dateStr).getTime()-rangeStart)/totalMs*100));
  const todayLeft = ((new Date(S.TODAY_ISO).getTime()-rangeStart)/totalMs*100);
  const showToday = todayLeft>=0 && todayLeft<=100;

  const ticks = useMemo(()=>buildTicks(rangeStart, rangeEnd, zoom), [rangeStart, rangeEnd, zoom]);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <S.SectionTitle sub="Project & phase timeline with dependencies, team and critical path, sourced live from Phase Management">Gantt Chart</S.SectionTitle>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 shrink-0">
          {(['week','month','quarter'] as const).map(z=>(
            <button key={z} onClick={()=>setZoom(z)} className={`px-2.5 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${zoom===z?'bg-white text-brand-700 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>{z}</button>
          ))}
        </div>
      </div>

      {/* Project tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-3 overflow-x-auto">
        {projects.map((p:any)=>(
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
        <div className="min-w-[820px] relative">
          {/* Date ruler */}
          <div className="flex" style={{marginLeft:LABEL_REM}}>
            {ticks.map((t,i)=>(
              <div key={i} className="flex-1 text-[10px] uppercase tracking-wide text-slate-400 border-l border-slate-100 pl-1.5 pb-1.5 border-b border-b-slate-200 truncate">{t}</div>
            ))}
          </div>

          <div className="relative mt-3" style={{height: phases.length*ROW_H}}>
            {showToday && (
              <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-red-300 z-10" style={{left:`calc(${LABEL_REM} + ${todayLeft}%)`}} title={`Today · ${S.TODAY_ISO}`}></div>
            )}

            {/* Dependency connectors -- one elbow per phase that has a resolvable dependency, fanning
                out from the dependency's end into each phase that depends on it. Phases sharing the
                same dependency share the same vertical trunk position, reading as a fan-out tree. */}
            <svg className="absolute top-0" style={{left:LABEL_REM, width:`calc(100% - ${LABEL_REM})`, height: phases.length*ROW_H}}
              viewBox={`0 0 100 ${phases.length*ROW_H}`} preserveAspectRatio="none">
              {phases.map((ph:any, i:number)=>{
                const est = estimates[ph.id];
                if(!est.depId) return null;
                const depIdx = phases.findIndex((p:any)=>p.id===est.depId);
                if(depIdx<0) return null;
                const depEst = estimates[est.depId];
                const depEndPct = depEst.dateSource==='unscheduled' ? pctPos(S.TODAY_ISO) : pctPos(depEst.end);
                const childStartPct = est.dateSource==='unscheduled' ? depEndPct : pctPos(est.start);
                const y1 = depIdx*ROW_H + ROW_H/2, y2 = i*ROW_H + ROW_H/2;
                const midX = depEndPct + 1.1;
                const isCrit = criticalPath.has(ph.id) && criticalPath.has(est.depId);
                return (
                  <path key={ph.id} fill="none"
                    stroke={isCrit ? '#7c3aed' : '#cbd5e1'} strokeWidth={isCrit ? 1.75 : 1.25}
                    d={`M ${depEndPct} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${childStartPct} ${y2}`} />
                );
              })}
            </svg>

            {phases.map((ph:any, pi:number)=>{
              const status = S.derivedPhaseStatus(ph);
              const msDone = ph.milestones.filter(S.isApproved).length;
              const pct = ph.milestones.length ? Math.round(100*msDone/ph.milestones.length) : (ph.headConfirmedComplete?100:0);
              const overdue = ph.end && ph.end<S.TODAY_ISO && !ph.headConfirmedComplete;
              const est = estimates[ph.id];
              const team = S.phaseTeam(ph);
              const isCrit = criticalPath.has(ph.id);
              const isBlocking = ph.id===blockingId;
              return (
                <div key={ph.id} className="flex items-center gap-2" style={{height:ROW_H}}>
                  <div className={`${AVATAR_W} shrink-0 flex`}>
                    {team.length ? team.slice(0,3).map((name:string)=>(
                      <div key={name} title={name} className={`w-5 h-5 rounded-full ${S.colorForClient(name).dot} text-white text-[9px] font-semibold flex items-center justify-center border-2 border-white -ml-1.5 first:ml-0`}>{initials(name)}</div>
                    )) : (
                      <div title="No team tagged on this phase's milestones yet" className="w-5 h-5 rounded-full bg-slate-200 text-slate-400 text-[9px] font-semibold flex items-center justify-center border-2 border-white">—</div>
                    )}
                  </div>
                  <div className={`${LABEL_W} shrink-0 flex items-center gap-1.5 min-w-0`}>
                    <span className="text-sm text-slate-600 truncate">{S.toRoman(pi+1)}. {ph.name}</span>
                    {isBlocking && <S.Badge cls="bg-amber-100 text-amber-700 shrink-0">Blocking</S.Badge>}
                    {isCrit && !isBlocking && <S.Badge cls="bg-violet-100 text-violet-700 shrink-0">Critical</S.Badge>}
                  </div>
                  <div className="flex-1 relative h-7 bg-slate-50 rounded">
                    {est.dateSource==='unscheduled' ? (
                      <div className="absolute top-0.5 h-6 rounded border border-dashed border-slate-300 text-[10px] text-slate-400 flex items-center px-2 truncate whitespace-nowrap overflow-hidden"
                        style={{left:`${pctPos(estimates[est.depId||'']?.end || S.TODAY_ISO)}%`, right:'1%'}}>
                        Not scheduled — no dates or milestones yet
                      </div>
                    ) : (() => {
                      const st = bar(est.start, est.end);
                      const estimatedLook = est.dateSource==='estimated';
                      return (
                        <div className={`absolute h-7 rounded ${overdue?'bg-red-100':'bg-brand-100'} ${estimatedLook?'border border-dashed border-brand-300 bg-transparent':''} ${isCrit?'ring-2 ring-violet-400':''}`} style={st}>
                          <div className={`h-7 rounded ${overdue?'bg-red-400':'bg-brand-500'} text-[10px] text-white flex items-center px-2 whitespace-nowrap`} style={{width:pct+'%'}}>{pct}%</div>
                          {ph.milestones.map((ms:any)=>(
                            <div key={ms.id} title={`${ms.name} · ${ms.deadline||'no deadline'} · ${S.derivedMilestoneStatus(ms)}`}
                              className={`absolute top-1/2 w-2.5 h-2.5 rotate-45 border-2 border-white shadow-sm ${diamondCls(ms)}`}
                              style={{left:(pctPos(ms.deadline||est.end)-pctPos(est.start))/(pctPos(est.end)-pctPos(est.start)||1)*100+'%', transform:'translate(-50%,-50%) rotate(45deg)'}}>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <S.Badge cls={S.statusColor(status)}>{status}</S.Badge>
                </div>
              );
            })}
          </div>
        </div>
        )}
        <div className="flex gap-4 mt-4 text-xs text-slate-500 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-brand-500 rounded-sm inline-block"></span>Progress</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-brand-100 rounded-sm inline-block"></span>Planned</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 border border-dashed border-brand-300 rounded-sm inline-block"></span>Estimated (from milestone deadlines)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded-sm inline-block"></span>Overdue</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-500 rotate-45 inline-block"></span>Milestone (by status)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm ring-2 ring-violet-400 inline-block"></span>Critical path</span>
          {showToday && <span className="flex items-center gap-1"><span className="w-3 h-0 border-t-2 border-dashed border-red-300 inline-block"></span>Today</span>}
        </div>
      </S.Card>
    </div>
  );
}
