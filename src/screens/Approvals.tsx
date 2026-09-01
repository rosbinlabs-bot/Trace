import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as S from '../shared';

export default function Approvals(){
  const navigate = useNavigate();
  const { tree } = React.useContext(S.PhaseDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { admin } = React.useContext(S.AdminDataContext);

  // Every milestone/sub task across every project, keeping the IDs needed to jump straight to it in
  // Phase Management (same deep-link shape the Dashboard's Approval Bottlenecks widget and the
  // notification bell already use — see shared.tsx's notificationTarget).
  const allEntries: any[] = [];
  projects.forEach((p:any)=>{
    (tree[p.id]||[]).forEach((ph:any)=>{
      ph.milestones.forEach((ms:any)=>{
        allEntries.push({ item:ms, project:p.name, level:'Milestone', projectId:p.id, phaseId:ph.id, msId:ms.id });
        (ms.subtasks||[]).forEach((s:any)=> allEntries.push({ item:s, project:p.name, level:'Sub Task', projectId:p.id, phaseId:ph.id, msId:ms.id, stId:s.id }));
      });
    });
  });

  // `review` is a generic 'Pending Review' sentinel now (level-based approval, see S.applyStatus) —
  // e.level ('Sub Task'/'Milestone') tells the two single-stage approvals apart. The Implemented
  // escalation is its own multi-step chain (S.implementChainFor): 'Implemented Review' + not yet
  // headApprovedImpl means it's still walking that internal chain; headApprovedImpl true means the
  // chain finished and it's sitting with the Client Owner.
  const pmPending = allEntries.filter(e=>e.item.review==='Pending Review' && e.level==='Sub Task');
  const headPending = allEntries.filter(e=>e.item.review==='Pending Review' && e.level==='Milestone');
  const chainPending = allEntries.filter(e=>e.item.review==='Implemented Review' && !e.item.headApprovedImpl);
  const clientPending = allEntries.filter(e=>e.item.review==='Implemented Review' && e.item.headApprovedImpl && !e.item.clientApprovedImpl);
  const approved = allEntries.filter(e=>S.isApproved(e.item));
  const implemented = allEntries.filter(e=>e.item.status==='Implemented');

  // How long an item has been sitting in review, stamped the moment it first queued (item.reviewSince)
  // — same aging signal Dashboard's Approval Bottlenecks widget uses, so the two never disagree.
  // Shared with Dashboard.tsx and shared.tsx's totalPendingApprovals (S.daysPending) so "how long
  // has this been stuck" is computed identically everywhere in the app.
  const daysPending = (item:any) => S.daysPending(item);

  // Who's actually expected to act next — the approver level for a Sub Task/Milestone decision, the
  // next name in the Implemented chain, or the Client Owner once it's reached sign-off.
  const waitingOn = (e:any) => {
    const p = projects.find((pp:any)=>pp.name===e.project);
    if (e.stageKey==='client') return (p?.clients||[]).find((c:any)=>c.owner)?.name || 'Client Owner';
    const roster = p ? S.buildRoster(p, admin) : [];
    const level = e.stageKey==='chain' ? (e.item.implChain||[])[0] : S.approverLevelFor(e.level==='Milestone'?'milestone':'subtask', p);
    if (!level) return '—';
    return roster.find((r:any)=>r.level===level)?.name || `Anyone at ${level}`;
  };

  const stages = [
    { key:'subtask',   label:'Sub Task Approval',      icon:'subtasks',  count:pmPending.length },
    { key:'milestone', label:'Milestone Approval',     icon:'target',    count:headPending.length },
    { key:'chain',     label:'Implemented Escalation', icon:'rocket',    count:chainPending.length },
    { key:'client',    label:'Client Sign-off',        icon:'approvals', count:clientPending.length },
    { key:'implemented', label:'Implemented',          icon:'checkcircle', count:implemented.length, terminal:true },
  ];

  const allPending = [
    ...pmPending.map(e=>({ ...e, stageKey:'subtask', stage:'Sub Task Approval' })),
    ...headPending.map(e=>({ ...e, stageKey:'milestone', stage:'Milestone Approval' })),
    ...chainPending.map(e=>({ ...e, stageKey:'chain', stage:`Implemented — pending ${(e.item.implChain||[])[0]||'—'}` })),
    ...clientPending.map(e=>({ ...e, stageKey:'client', stage:'Client Sign-off' })),
  ].map(e=>({ ...e, days:daysPending(e.item), waitingOn:waitingOn(e) }))
   .sort((a,b)=>(b.days??-1)-(a.days??-1));
  const oldestDays = allPending.length ? Math.max(...allPending.map(e=>e.days??-1)) : null;

  const [activeStage, setActiveStage] = useState<string|null>(null);
  const [projFilter, setProjFilter] = useState('All');
  const [search, setSearch] = useState('');
  const projectNames = Array.from(new Set(projects.map((p:any)=>p.name))).sort() as string[];

  let pending = allPending;
  if (activeStage) pending = pending.filter(e=>e.stageKey===activeStage);
  if (projFilter!=='All') pending = pending.filter(e=>e.project===projFilter);
  if (search.trim()) { const q = search.trim().toLowerCase(); pending = pending.filter(e=>e.item.name.toLowerCase().includes(q)); }
  const filtersActive = !!activeStage || projFilter!=='All' || !!search.trim();

  // Jump to the item in Phase Management, same shape the Dashboard/notification-bell deep links use
  // — that screen already knows how to select the right project/phase/milestone(/sub task) from it.
  const goTo = (e:any) => navigate('/phases', { state:{ projectId:e.projectId, phaseId:e.phaseId, msId:e.msId, stId:e.level==='Sub Task'?e.stId:undefined } });

  return (
    <div>
      <S.SectionTitle sub="Live pending approvals across all projects — click a row to open it in Phase Management (by level) or act in Client Portal (Client)">Client Approval Workflow</S.SectionTitle>

      {/* Funnel — click a stage to filter the table below to just that stage */}
      <S.Card className="p-5 mb-4 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          {stages.map((s,i)=>{
            const active = activeStage===s.key;
            const amber = !s.terminal && s.count>0;
            return (
              <React.Fragment key={s.key}>
                <button
                  onClick={()=> !s.terminal && setActiveStage(active?null:s.key)}
                  disabled={s.terminal}
                  title={s.terminal ? undefined : (active ? 'Clear filter' : `Show only ${s.label}`)}
                  className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl border min-w-[132px] transition-all
                    ${amber ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}
                    ${active ? 'ring-2 ring-brand-400' : ''}
                    ${s.terminal ? 'cursor-default' : 'cursor-pointer hover:shadow-sm'}`}>
                  <S.Icon name={s.icon} className={`w-4 h-4 ${amber?'text-amber-500':'text-emerald-500'}`}/>
                  <span className={`text-2xl font-bold ${amber?'text-amber-700':'text-emerald-700'}`}>{s.count}</span>
                  <span className="text-[11px] text-slate-500 text-center leading-tight">{s.label}</span>
                </button>
                {i<stages.length-1 && <span className="text-slate-300 shrink-0">→</span>}
              </React.Fragment>
            );
          })}
        </div>
      </S.Card>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <S.Card className="p-4">
          <div className="text-xs text-slate-500">Pending Approvals</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{allPending.length}</div>
          <div className="text-xs text-slate-400 mt-1">{oldestDays!==null ? `oldest ${oldestDays}d` : 'across all stages'}</div>
        </S.Card>
        <S.Card className="p-4">
          <div className="text-xs text-slate-500">Total Approved</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{approved.length}</div>
          <div className="text-xs text-slate-400 mt-1">milestones + sub tasks</div>
        </S.Card>
        <S.Card className="p-4">
          <div className="text-xs text-slate-500">Implemented</div>
          <div className="text-2xl font-bold text-violet-600 mt-1">{implemented.length}</div>
          <div className="text-xs text-slate-400 mt-1">client-accepted</div>
        </S.Card>
        <S.Card className="p-4">
          <div className="text-xs text-slate-500">Awaiting Client Sign-off</div>
          <div className="text-2xl font-bold text-purple-600 mt-1">{clientPending.length}</div>
          <div className="text-xs text-slate-400 mt-1">sitting with Client Owner</div>
        </S.Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <S.Card className="p-4 lg:col-span-2 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="font-semibold text-slate-800">Pending Approvals ({pending.length})</div>
            <div className="flex items-center gap-2">
              <select value={projFilter} onChange={e=>setProjFilter(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none">
                <option value="All">All Projects</option>
                {projectNames.map(n=><option key={n} value={n}>{n}</option>)}
              </select>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search item…"
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none w-32 sm:w-40"/>
              {filtersActive && (
                <button onClick={()=>{ setActiveStage(null); setProjFilter('All'); setSearch(''); }} className="text-xs text-slate-400 hover:text-slate-600 whitespace-nowrap">Clear</button>
              )}
            </div>
          </div>
          {pending.length===0 ? (
            <div className="text-sm text-slate-400 py-8 text-center">{filtersActive ? 'Nothing pending matches these filters.' : 'Nothing is pending approval right now.'}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200"><tr><S.Th>Project</S.Th><S.Th>Item</S.Th><S.Th>Stage</S.Th><S.Th>Waiting On</S.Th><S.Th>Pending</S.Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {pending.map((e,i)=>(
                    <tr key={i} onClick={()=>goTo(e)} title="Open in Phase Management" className="cursor-pointer hover:bg-brand-50/50 transition-colors">
                      <S.Td className="text-slate-500 whitespace-nowrap">{e.project}</S.Td>
                      <S.Td className="font-medium max-w-[220px] truncate" title={e.item.name}>{e.item.name}</S.Td>
                      <S.Td><S.Badge cls={S.statusColor('Pending')}>{e.stage}</S.Badge></S.Td>
                      <S.Td className="text-slate-500 max-w-[140px] truncate" title={e.waitingOn}>{e.waitingOn}</S.Td>
                      <S.Td>{e.days!==null ? <span className={`font-medium ${e.days>=S.STUCK_APPROVAL_DAYS?'text-red-600':'text-slate-500'}`}>{e.days}d</span> : <span className="text-slate-300">—</span>}</S.Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </S.Card>
        <S.Card className="p-4">
          <div className="font-semibold text-slate-800 mb-3">Stage Breakdown</div>
          <div className="space-y-2.5">
            {(() => { const max = Math.max(1, ...stages.map(s=>s.count)); return stages.map(s=>(
              <div key={s.key} className="flex items-center gap-3">
                <div className="w-32 text-xs text-slate-500 truncate">{s.label}</div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full"><div className={`h-2 rounded-full ${s.terminal?'bg-violet-400':s.count>0?'bg-amber-400':'bg-emerald-400'}`} style={{width:`${Math.round(100*s.count/max)}%`}}></div></div>
                <div className="w-6 text-right text-xs font-medium text-slate-600">{s.count}</div>
              </div>
            )); })()}
          </div>
          <div className="text-xs text-slate-400 mt-4 pt-3 border-t border-slate-100">Click a row in Pending Approvals to open it in Phase Management with that project, phase and milestone pre-selected. Client Sign-off items are actioned by the Client Owner in Client Portal — decisions made there are reflected here immediately.</div>
        </S.Card>
      </div>
    </div>
  );
}
