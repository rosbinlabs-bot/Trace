import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

const LABEL_W = 'w-44'; // keep the row-label column and the ruler's left offset in lockstep
const LABEL_REM = '11rem';

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

export default function Gantt(){
  const { tree } = React.useContext(S.PhaseDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  // Optional chaining: a project-scoped restricted account (see S.staffVisibleProjects) can have
  // zero visible projects, so projects[0] may be undefined -- projects[0].id would crash the screen.
  const [activeProj, setActiveProj] = useState(projects[0]?.id);
  const [zoom, setZoom] = useState<'week'|'month'|'quarter'>('month');
  const projMeta = projects.find(p=>p.id===activeProj) || {};
  const phases = tree[activeProj] || [];

  const allDates = phases.flatMap((ph:any)=>[ph.start, ph.end]).concat([projMeta.start, projMeta.end]).filter(Boolean).map((d:string)=>new Date(d).getTime());
  const rangeStart = allDates.length ? Math.min(...allDates) : new Date(S.TODAY_ISO).getTime();
  const rangeEnd = allDates.length ? Math.max(...allDates) : rangeStart + 86400000*90;
  const totalMs = Math.max(rangeEnd - rangeStart, 86400000);
  const bar = (s,e) => {
    if(!s || !e) return { left:'0%', width:'1.5%' };
    const left = (new Date(s).getTime()-rangeStart)/totalMs*100;
    const width = (new Date(e).getTime()-new Date(s).getTime())/totalMs*100;
    return { left:Math.max(left,0)+'%', width:Math.max(width,1.5)+'%' };
  };
  const pctPos = (dateStr) => Math.min(100, Math.max(0, (new Date(dateStr).getTime()-rangeStart)/totalMs*100));
  const todayLeft = ((new Date(S.TODAY_ISO).getTime()-rangeStart)/totalMs*100);
  const showToday = todayLeft>=0 && todayLeft<=100;

  const ticks = useMemo(()=>buildTicks(rangeStart, rangeEnd, zoom), [rangeStart, rangeEnd, zoom]);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <S.SectionTitle sub="Project & phase timeline with progress and milestones, sourced live from Phase Management">Gantt Chart</S.SectionTitle>
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
        <div className="min-w-[760px] relative">
          {/* Date ruler */}
          <div className="flex" style={{marginLeft:LABEL_REM}}>
            {ticks.map((t,i)=>(
              <div key={i} className="flex-1 text-[10px] uppercase tracking-wide text-slate-400 border-l border-slate-100 pl-1.5 pb-1.5 border-b border-b-slate-200 truncate">{t}</div>
            ))}
          </div>

          <div className="space-y-3 relative mt-3">
            {showToday && (
              <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-red-300 z-10" style={{left:`calc(${LABEL_REM} + ${todayLeft}%)`}} title={`Today · ${S.TODAY_ISO}`}></div>
            )}
            {phases.map((ph:any, pi:number)=>{
              const st = bar(ph.start, ph.end);
              const status = S.derivedPhaseStatus(ph);
              const msDone = ph.milestones.filter(S.isApproved).length;
              const pct = ph.milestones.length ? Math.round(100*msDone/ph.milestones.length) : (ph.headConfirmedComplete?100:0);
              const overdue = ph.end && ph.end<S.TODAY_ISO && !ph.headConfirmedComplete;
              return (
                <div key={ph.id} className="flex items-center gap-3">
                  <div className={`${LABEL_W} shrink-0 text-sm text-slate-600 truncate`}>{S.toRoman(pi+1)}. {ph.name}</div>
                  <div className="flex-1 relative h-7 bg-slate-50 rounded">
                    <div className={`absolute h-7 rounded ${overdue?'bg-red-100':'bg-brand-100'}`} style={st}>
                      <div className={`h-7 rounded ${overdue?'bg-red-400':'bg-brand-500'} text-[10px] text-white flex items-center px-2 whitespace-nowrap`} style={{width:pct+'%'}}>{pct}%</div>
                    </div>
                    {ph.milestones.map((ms:any)=>(
                      <div key={ms.id} title={`${ms.name} · ${ms.deadline||'no deadline'} · ${S.derivedMilestoneStatus(ms)}`}
                        className={`absolute top-1/2 w-2.5 h-2.5 rotate-45 border-2 border-white shadow-sm ${diamondCls(ms)}`}
                        style={{left:pctPos(ms.deadline||ph.end)+'%', transform:'translate(-50%,-50%) rotate(45deg)'}}>
                      </div>
                    ))}
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
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded-sm inline-block"></span>Overdue</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-500 rotate-45 inline-block"></span>Milestone (by status)</span>
          {showToday && <span className="flex items-center gap-1"><span className="w-3 h-0 border-t-2 border-dashed border-red-300 inline-block"></span>Today</span>}
        </div>
      </S.Card>
    </div>
  );
}
