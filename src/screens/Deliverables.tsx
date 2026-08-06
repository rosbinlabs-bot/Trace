import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

export default function Deliverables(){
  const { tree } = React.useContext(S.PhaseDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  // Optional chaining: a project-scoped restricted account (see S.staffVisibleProjects) can have
  // zero visible projects, so projects[0] may be undefined -- projects[0].id would crash the screen.
  const [activeProj, setActiveProj] = useState(projects[0]?.id);
  const [statusFilter, setStatusFilter] = useState('Pending');
  const [assigneeFilter, setAssigneeFilter] = useState('All');
  const [monthFilter, setMonthFilter] = useState('All');

  const projMeta = projects.find(p=>p.id===activeProj) || {};
  const phases = tree[activeProj] || [];
  const roster = [
    projMeta.strategicLead && {name:projMeta.strategicLead, group:'Strategic Lead'},
    projMeta.projectHead && {name:projMeta.projectHead, group:'Project Head'},
    projMeta.pm && {name:projMeta.pm, group:'Project Manager'},
    projMeta.associate && {name:projMeta.associate, group:'Associate'},
  ].filter(Boolean);

  // Flatten phases -> milestones -> sub tasks into one list of rows, each carrying its parent
  // names so the table can show full context without re-deriving anything.
  const allRows = [];
  phases.forEach(ph=>{
    ph.milestones.forEach(ms=>{
      allRows.push({ key:`ms-${ms.id}`, type:'Milestone', ph, ms, item:ms, name:ms.name, deadline:ms.deadline, assignees:ms.assignees||[] });
      (ms.subtasks||[]).forEach(s=>{
        allRows.push({ key:`st-${s.id}`, type:'Sub Task', ph, ms, item:s, name:s.name, deadline:s.deadline, assignees:s.assignees||[] });
      });
    });
  });

  // In scope: has a deadline, and that deadline falls on/before the end of this month (everything
  // that should be done by month end, from wherever the project started).
  const inScope = allRows.filter(r => r.deadline && r.deadline<=S.CURRENT_MONTH_END && (!projMeta.start || r.deadline>=projMeta.start));

  const total = inScope.length;
  const pendingCount = inScope.filter(r=>!S.isApproved(r.item)).length;
  const completedCount = inScope.filter(r=>S.isApproved(r.item)).length;
  const implementedCount = inScope.filter(r=>r.item.status==='Implemented').length;
  const overdueCount = inScope.filter(r=>S.isOverdue(r.item)).length;
  const dueThisMonthCount = inScope.filter(r=>r.deadline.slice(0,7)===S.CURRENT_MONTH_END.slice(0,7)).length;

  const months = Array.from(new Set(inScope.map(r=>r.deadline.slice(0,7)))).sort();
  const monthLabel = (ym) => { const [y,m]=ym.split('-'); return new Date(Number(y), Number(m)-1, 1).toLocaleString('en-US',{month:'short',year:'numeric'}); };

  const displayed = inScope
    .filter(r => statusFilter==='All' ? true : statusFilter==='Pending' ? !S.isApproved(r.item) : (r.item.review||r.item.status)===statusFilter)
    .filter(r => assigneeFilter==='All' ? true : r.assignees.includes(assigneeFilter))
    .filter(r => monthFilter==='All' ? true : r.deadline.slice(0,7)===monthFilter)
    .sort((a,b)=> a.deadline<b.deadline?-1:a.deadline>b.deadline?1:0);

  const BentoCard = ({className, iconBg, icon, label, value}: any) => (
    <S.Card className={`px-3 py-2.5 flex items-center gap-2.5 flex-1 min-w-[120px] ${className||''}`}>
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}><S.Icon name={icon} className="w-4 h-4"/></span>
      <div className="min-w-0">
        <div className="text-lg font-semibold text-slate-800 leading-tight">{value}</div>
        <div className="text-[11px] text-slate-500 truncate">{label}</div>
      </div>
    </S.Card>
  );

  return (
    <div>
      <S.SectionTitle sub={`Milestones & sub tasks due by ${S.CURRENT_MONTH_LABEL} end, pulled live from Phase Management`}>Deliverable Management</S.SectionTitle>

      {/* Bento summary — a compact single-row strip, like a mini dashboard. Reflects the full
          in-scope set for this project, independent of the filters below. */}
      <div className="flex flex-wrap gap-2 my-4">
        <BentoCard label={`Total · ${dueThisMonthCount} this month`} value={total} icon="deliverables" iconBg="bg-brand-100 text-brand-700" className="bg-gradient-to-br from-brand-50 to-white"/>
        <BentoCard label="Pending" value={pendingCount} icon="clock" iconBg="bg-amber-100 text-amber-700" className="bg-gradient-to-br from-amber-50 to-white"/>
        <BentoCard label="Completed" value={completedCount} icon="checkcircle" iconBg="bg-emerald-100 text-emerald-700" className="bg-gradient-to-br from-emerald-50 to-white"/>
        <BentoCard label="Implemented" value={implementedCount} icon="rocket" iconBg="bg-purple-100 text-purple-700" className="bg-gradient-to-br from-purple-50 to-white"/>
        <BentoCard label="Overdue" value={overdueCount} icon="alert" iconBg="bg-red-100 text-red-700" className="bg-gradient-to-br from-red-50 to-white"/>
      </div>

      {/* Project tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-3 overflow-x-auto">
        {projects.map(p=>(
          <button key={p.id} onClick={()=>{setActiveProj(p.id); setMonthFilter('All');}}
            className={`whitespace-nowrap px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${activeProj===p.id?'border-violet-500 text-violet-700 font-medium':'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {p.name}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-slate-400">Filter:</span>
        <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="Pending">Pending (default)</option>
          <option value="All">All statuses</option>
          <option value="Not Started">Not Started</option>
          <option value="In Progress">In Progress</option>
          <option value="On Hold">On Hold</option>
          <option value="PM Verification">PM Verification</option>
          <option value="Head Review">Head Review</option>
          <option value="Completed">Completed</option>
          <option value="Implemented">Implemented</option>
        </select>
        <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none" value={assigneeFilter} onChange={e=>setAssigneeFilter(e.target.value)}>
          <option value="All">All assignees</option>
          {roster.map(r=><option key={r.name} value={r.name}>{r.name} · {r.group}</option>)}
        </select>
        <select className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none" value={monthFilter} onChange={e=>setMonthFilter(e.target.value)}>
          <option value="All">All months</option>
          {months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <span className="text-xs text-slate-400 ml-auto">{displayed.length} of {total} shown</span>
      </div>

      <S.Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200"><tr>
            <S.Th>Type</S.Th><S.Th>Name</S.Th><S.Th>Phase</S.Th><S.Th>Milestone</S.Th><S.Th>Assignees</S.Th><S.Th>Deadline</S.Th><S.Th>Done</S.Th><S.Th>Status</S.Th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {displayed.map(r=>{ const overdue = S.isOverdue(r.item); return (
              <tr key={r.key} className={`hover:bg-slate-50 ${overdue?'bg-red-50/60':''}`}>
                <S.Td><S.Badge cls={r.type==='Milestone'?'bg-amber-100 text-amber-700':'bg-blue-100 text-blue-700'}>{r.type}</S.Badge></S.Td>
                <S.Td className="font-medium">{r.name}</S.Td>
                <S.Td className="text-slate-500">{r.ph.name}</S.Td>
                <S.Td className="text-slate-500">{r.type==='Milestone' ? '—' : r.ms.name}</S.Td>
                <S.Td className="text-slate-500">{r.assignees.join(', ')||'Unassigned'}</S.Td>
                <S.Td className={overdue?'text-red-600 font-medium':''}><span className="inline-flex items-center gap-1">{overdue && <S.Icon name="alert" className="w-3 h-3"/>}{r.deadline}</span></S.Td>
                <S.Td className="text-slate-500">{S.itemDoneDate(r.item)||'—'}</S.Td>
                <S.Td><S.Badge cls={S.statusColor(r.item.review||r.item.status)}>{r.item.review||r.item.status}</S.Badge></S.Td>
              </tr>
            );})}
            {displayed.length===0 && (
              <tr><td colSpan={8} className="text-center text-sm text-slate-400 py-8">No deliverables match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </S.Card>
    </div>
  );
}

// Real go-live/closure pipeline, derived from Phase Management's "Implemented Review" workflow:
// a milestone/sub task marked Implemented moves through Head sign-off -> Client acceptance ->
// closed (status 'Implemented'), same fields Phase Management and the Client Portal already use.
