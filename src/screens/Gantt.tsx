import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

// Portfolio-first Gantt: every visible project collapses to one swimlane row (name, status,
// timeline bar) so you can see the whole book of work at once; click a row to open that
// project's own phase-level bars inline, right below it, without leaving the page.
export default function Gantt(){
  const { tree } = React.useContext(S.PhaseDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { settings } = React.useContext(S.SettingsContext);
  const CATEGORY_TIERS = (settings.categories && settings.categories.length) ? settings.categories : S.DEFAULT_PROJECT_SETTINGS.categories;
  const tierLabel = (code) => CATEGORY_TIERS.find(t=>t.code===code)?.label || code || '—';

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [fStatus, setFStatus] = useState('');
  const [fCategory, setFCategory] = useState('');

  // Overall portfolio date range, computed once across every project regardless of the active
  // filters -- so toggling a filter narrows the list without the timeline itself jumping around.
  const allDates = projects.flatMap(p=>[p.start, p.end]).filter(Boolean).map(d=>new Date(d).getTime());
  const rangeStart = allDates.length ? Math.min(...allDates) : new Date(S.TODAY_ISO).getTime();
  const rangeEnd = allDates.length ? Math.max(...allDates) : rangeStart + 86400000*90;
  const posWithin = (start, end, s, e) => {
    if(!s || !e) return { left:'0%', width:'1.5%' };
    const left = (new Date(s).getTime()-start)/(end-start)*100;
    const width = (new Date(e).getTime()-new Date(s).getTime())/(end-start)*100;
    return { left:Math.max(left,0)+'%', width:Math.max(width,1.5)+'%' };
  };

  const projectPct = (p) => {
    const phases = tree[p.id] || [];
    const ms = phases.flatMap((ph:any)=>ph.milestones||[]);
    if(!ms.length) return p.status==='Completed' ? 100 : 0;
    return Math.round(100*ms.filter(S.isApproved).length/ms.length);
  };

  const visibleProjects = useMemo(()=> projects.filter((p:any)=>{
    if(fStatus && p.status!==fStatus) return false;
    if(fCategory && p.category!==fCategory) return false;
    return true;
  }), [projects, fStatus, fCategory]);

  const toggle = (id) => setExpanded(e=>({...e, [id]: !e[id]}));

  return (
    <div>
      <S.SectionTitle sub="Every project's timeline in one view, sourced live from Phase Management — click a row to open its phase-level detail">Gantt Chart</S.SectionTitle>

      <div className="flex flex-wrap gap-2 mb-3">
        <select value={fStatus} onChange={e=>setFStatus(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">All statuses</option>
          {S.PROJECT_STATUSES.map((s:string)=><option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fCategory} onChange={e=>setFCategory(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">All categories</option>
          {CATEGORY_TIERS.map((t:any)=><option key={t.code} value={t.code}>{t.code} — {t.label}</option>)}
        </select>
      </div>

      <S.Card className="p-2 overflow-x-auto">
        {visibleProjects.length===0 ? (
          <div className="text-sm text-slate-400 text-center py-8">No projects match these filters.</div>
        ) : (
        <div className="min-w-[760px] divide-y divide-slate-100">
          {visibleProjects.map((p:any)=>{
            const st = posWithin(rangeStart, rangeEnd, p.start, p.end);
            const pct = projectPct(p);
            const overdue = p.end && p.end<S.TODAY_ISO && !['Completed','Dropped','Terminated'].includes(p.status);
            const isOpen = !!expanded[p.id];
            const phases = tree[p.id] || [];
            return (
              <div key={p.id}>
                <div onClick={()=>toggle(p.id)} role="button" aria-expanded={isOpen} aria-label={`${isOpen?'Collapse':'Expand'} ${p.name}`}
                  className="flex items-center gap-3 py-3 px-2 cursor-pointer hover:bg-slate-50 rounded-lg">
                  <span className="text-slate-400 w-4 text-center text-[10px] shrink-0">{isOpen?'▼':'▶'}</span>
                  <div className="w-52 shrink-0">
                    <div className="text-sm font-medium text-slate-700 truncate">{p.name}</div>
                    <div className="text-xs text-slate-400 truncate">{tierLabel(p.category)}</div>
                  </div>
                  <S.Badge cls={S.statusColor(p.status)}>{p.status}</S.Badge>
                  <div className="flex-1 relative h-6 bg-slate-50 rounded">
                    <div className={`absolute h-6 rounded overflow-hidden ${overdue?'bg-red-100':'bg-brand-100'}`} style={st}>
                      <div className={`h-6 ${overdue?'bg-red-400':'bg-brand-500'}`} style={{width:pct+'%'}}></div>
                    </div>
                  </div>
                  <div className="w-10 shrink-0 text-right text-xs text-slate-500">{pct}%</div>
                </div>

                {isOpen && (
                  <div className="pb-4 pl-9 pr-2">
                    {phases.length===0 ? (
                      <div className="text-sm text-slate-400 py-4">No phases yet for this project — add some in Phase Management.</div>
                    ) : (
                      <ProjectPhaseGantt project={p} phases={phases} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
        <div className="flex gap-4 mt-3 px-2 pb-2 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-brand-500 rounded-sm inline-block"></span>Progress</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-brand-100 rounded-sm inline-block"></span>Planned</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded-sm inline-block"></span>Overdue</span>
        </div>
      </S.Card>
    </div>
  );
}

// The per-project phase bar chart -- same visual language the page used when it was one project
// at a time, now rendered inline underneath a portfolio row instead of behind project tabs.
function ProjectPhaseGantt({ project, phases }: any){
  const allDates = phases.flatMap((ph:any)=>[ph.start, ph.end]).concat([project.start, project.end]).filter(Boolean).map(d=>new Date(d).getTime());
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
    <div className="space-y-2 relative pt-1">
      {showToday && (
        <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-red-300 z-10" style={{left:`calc(9rem + ${todayLeft}%)`}} title={`Today · ${S.TODAY_ISO}`}></div>
      )}
      {phases.map((ph:any, pi:number)=>{
        const st = bar(ph.start, ph.end);
        const status = S.derivedPhaseStatus(ph);
        const msDone = ph.milestones.filter(S.isApproved).length;
        const pct = ph.milestones.length ? Math.round(100*msDone/ph.milestones.length) : (ph.headConfirmedComplete?100:0);
        const overdue = ph.end && ph.end<S.TODAY_ISO && !ph.headConfirmedComplete;
        return (
          <div key={ph.id} className="flex items-center gap-3">
            <div className="w-36 shrink-0 text-xs text-slate-500 truncate">{S.toRoman(pi+1)}. {ph.name}</div>
            <div className="flex-1 relative h-6 bg-slate-50 rounded">
              <div className={`absolute h-6 rounded ${overdue?'bg-red-100':'bg-brand-100'}`} style={st}>
                <div className={`h-6 rounded ${overdue?'bg-red-400':'bg-brand-500'} text-[10px] text-white flex items-center px-2 whitespace-nowrap`} style={{width:pct+'%'}}>{pct}%</div>
              </div>
            </div>
            <S.Badge cls={S.statusColor(status)}>{status}</S.Badge>
          </div>
        );
      })}
    </div>
  );
}
