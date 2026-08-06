import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

export default function Dashboard(){
  const { tree } = React.useContext(S.PhaseDataContext);
  const { risks, issues, changes } = React.useContext(S.GovernanceDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { team } = React.useContext(S.TeamDataContext);
  const { invoices } = React.useContext(S.InvoicesDataContext);
  const dueBillings = projects.filter(S.billingDueSoon).sort((a,b)=>S.daysLeft(a.billingDueDate)-S.daysLeft(b.billingDueDate));
  const [billingDuesOpen, setBillingDuesOpen] = useState(true);
  const insights = S.computeInsights({ tree, risks, issues, changes, projects, team });

  // Flatten every phase/milestone/sub task across every project into one list, each entry keeping
  // its project name — this one pass feeds every KPI/widget/insight below, all from the same live
  // Phase Management tree (no separate mock numbers).
  const allEntries = [];
  projects.forEach(p=>{
    (tree[p.id]||[]).forEach(ph=>{
      ph.milestones.forEach(ms=>{
        allEntries.push({ item:ms, project:p.name, level:'Milestone' });
        (ms.subtasks||[]).forEach(s=> allEntries.push({ item:s, project:p.name, level:'Sub Task' }));
      });
    });
  });
  const msOnly = [];
  projects.forEach(p=>(tree[p.id]||[]).forEach(ph=>ph.milestones.forEach(ms=>msOnly.push(ms))));
  const stOnly = msOnly.flatMap(ms=>ms.subtasks||[]);

  const monthKey = S.CURRENT_MONTH_END.slice(0,7);
  const overdueEntries = allEntries.filter(e=>S.isOverdue(e.item));
  const todayEntries = allEntries.filter(e=>e.item.deadline===S.TODAY_ISO);
  const upcomingEntries = allEntries.filter(e=>e.item.deadline && e.item.deadline>S.TODAY_ISO && e.item.deadline<=S.addDays(S.TODAY_ISO,14) && !S.isApproved(e.item));
  const clientPendingEntries = allEntries.filter(e=>e.item.review==='Implemented Review' && e.item.headApprovedImpl && !e.item.clientApprovedImpl);
  // `review` is a generic 'Pending Review' sentinel now (level-based approval) — e.level tells a
  // pending Sub Task apart from a pending Milestone.
  const pmPendingEntries = allEntries.filter(e=>e.item.review==='Pending Review' && e.level==='Sub Task');
  const headPendingEntries = allEntries.filter(e=>e.item.review==='Pending Review' && e.level==='Milestone');
  const approvedEntries = allEntries.filter(e=>S.isApproved(e.item));
  const implementedEntries = allEntries.filter(e=>e.item.status==='Implemented');
  const implementedThisMonth = implementedEntries.filter(e=>e.item.clientAcceptedDate && e.item.clientAcceptedDate.slice(0,7)===monthKey);

  const msCompletionPct = msOnly.length ? Math.round(100*msOnly.filter(S.isApproved).length/msOnly.length) : 0;
  const stCompletionPct = stOnly.length ? Math.round(100*stOnly.filter(S.isApproved).length/stOnly.length) : 0;
  const avgUtil = team.length ? Math.round(team.reduce((a,m)=>a+m.util,0)/team.length) : 0;
  const avgAvail = team.length ? Math.round(team.reduce((a,m)=>a+(Number(String(m.avail).replace('%',''))||0),0)/team.length) : 0;
  const overloaded = team.filter(m=>m.util>90).length;
  const deptTotals: any = {};
  team.forEach(m=>{ (deptTotals[m.dept]=deptTotals[m.dept]||[]).push(m.util); });
  const busiestDept = Object.entries(deptTotals).map(([d,arr]: any) =>[d, Math.round(arr.reduce((a,b)=>a+b,0)/arr.length)]).sort((a:any,b:any)=>b[1]-a[1])[0];

  const risksOpen = risks.filter(r=>r.status==='Open'||r.status==='In Progress').length;
  const issuesOpen = issues.filter(i=>i.status==='Open'||i.status==='In Progress').length;
  const openRisksIssues = risksOpen+issuesOpen;
  const totalRisksIssues = risks.length+issues.length;
  const changesPending = changes.filter(c=>c.status==='Pending').length;
  const extensionNeeded = projects.filter(S.needsExtension).length;
  const activeProjects = projects.filter(p=>p.status==='In Progress').length;

  const kpis = [
    { label:'Active Projects', value:activeProjects, sub:`of ${projects.length} total`, tone:'text-blue-600' },
    { label:"Today's Deliverables", value:todayEntries.length, sub:`${overdueEntries.length} overdue overall`, tone:'text-amber-600' },
    { label:'Overdue Activities', value:overdueEntries.length, sub:`across ${new Set(overdueEntries.map(e=>e.project)).size} project(s)`, tone:'text-red-600' },
    { label:'Pending Client Approvals', value:clientPendingEntries.length, sub:'awaiting sign-off in Client Portal', tone:'text-purple-600' },
    { label:'Pending Internal Approvals', value:pmPendingEntries.length+headPendingEntries.length, sub:`${pmPendingEntries.length} Sub Task · ${headPendingEntries.length} Milestone`, tone:'text-amber-600' },
    { label:'Upcoming Deliverables', value:upcomingEntries.length, sub:'next 14 days', tone:'text-blue-600' },
  ];
  const widgets = [
    { t:'Milestone Completion', v:`${msCompletionPct}%`, bar:msCompletionPct },
    { t:'Sub Task Completion', v:`${stCompletionPct}%`, bar:stCompletionPct },
    { t:'Consultant Utilization', v:`${avgUtil}%`, bar:avgUtil },
    { t:'Open Risks & Issues', v:`${openRisksIssues}`, bar: totalRisksIssues ? Math.round(100*openRisksIssues/totalRisksIssues) : 0 },
    { t:'Pending Change Requests', v:`${changesPending} of ${changes.length}`, bar: changes.length ? Math.round(100*changesPending/changes.length) : 0 },
    { t:'Implemented Items', v:`${implementedEntries.length} total`, bar: approvedEntries.length ? Math.round(100*implementedEntries.length/approvedEntries.length) : 0 },
  ];
  const bottomCards = [
    { t:'Busiest Department', v: busiestDept ? `${busiestDept[0]} · ${busiestDept[1]}%` : '—' },
    { t:'Consultants Overloaded', v: `${overloaded} > 90% util` },
    { t:'Projects Needing Extension', v: `${extensionNeeded}` },
    { t:'Avg Resource Availability', v: `${avgAvail}%` },
    { t:'Implemented This Month', v: `${implementedThisMonth.length}` },
  ];

  return (
    <div>
      <S.SectionTitle sub="Executive view of complete organizational delivery performance, live from Phase Management, Team and Governance data">Executive Dashboard</S.SectionTitle>

      {dueBillings.length>0 && (
        <S.Card className="mb-4 overflow-hidden border-l-4 border-l-amber-400">
          <button onClick={()=>setBillingDuesOpen(o=>!o)} className="w-full flex items-center gap-2 px-4 py-3 text-left bg-amber-50/40">
            <span className="text-slate-400 text-xs w-3 shrink-0">{billingDuesOpen?'▼':'▶'}</span>
            <S.Icon name="financials" className="w-4 h-4 text-amber-500"/>
            <span className="font-semibold text-slate-800">Upcoming Billing Dues</span>
            <S.Badge cls="bg-amber-100 text-amber-700">{dueBillings.length}</S.Badge>
            <span className="text-xs text-slate-400 ml-auto">Due within 7 days</span>
          </button>
          {billingDuesOpen && (
            <div className="px-4 pb-4 space-y-1.5">
              {dueBillings.map(p=>{ const d = S.daysLeft(p.billingDueDate); return (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm bg-white rounded-lg px-3 py-2 border border-amber-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-slate-700 truncate">{p.name}</span>
                    <span className="text-xs text-slate-400 truncate">{p.client}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs whitespace-nowrap">
                    <span className="text-slate-500">Lead: <b className="text-slate-700">{S.projectLeadName(p)||'—'}</b></span>
                    <span className="text-slate-400">Due {p.billingDueDate}</span>
                    <span className={`font-medium ${d<0?'text-red-600':'text-amber-600'}`}>{d<0?`${Math.abs(d)}d overdue`:d===0?'Due today':`in ${d}d`}</span>
                  </div>
                </div>
              );})}
            </div>
          )}
        </S.Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {kpis.map(k=>(
          <S.Card key={k.label} className="p-4">
            <div className="text-xs text-slate-500">{k.label}</div>
            <div className={`text-2xl font-bold mt-1 ${k.tone}`}>{k.value}</div>
            <div className="text-xs text-slate-400 mt-1">{k.sub}</div>
          </S.Card>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        {widgets.map(w=>(
          <S.Card key={w.t} className="p-4">
            <div className="flex justify-between items-center mb-2"><span className="text-sm text-slate-600">{w.t}</span><span className="font-semibold text-slate-800">{w.v}</span></div>
            <div className="h-2 bg-slate-100 rounded-full"><div className="h-2 bg-brand-500 rounded-full" style={{width:w.bar+'%'}}></div></div>
          </S.Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <S.Card className="p-4 lg:col-span-2">
          {(() => {
            const maxTarget = Math.max(...projects.map(S.projTargetRevenue));
            const totalTarget = projects.reduce((a,p)=>a+S.projTargetRevenue(p),0);
            const totalAchieved = projects.reduce((a,p)=>a+S.projInvoicedRevenue(p,invoices),0);
            return (<>
              <div className="flex justify-between items-center mb-3">
                <div className="font-semibold text-slate-800">Revenue — Target vs Achievement</div>
                <div className="text-xs text-slate-500">Achieved <span className="font-semibold text-emerald-600">{S.inLakh(totalAchieved)}</span> of <span className="font-semibold text-slate-700">{S.inLakh(totalTarget)}</span> ({Math.round(totalAchieved/totalTarget*100)}%)</div>
              </div>
              <div className="space-y-2.5">
                {projects.map(p=>{
                  const target = S.projTargetRevenue(p), achieved = S.projInvoicedRevenue(p,invoices);
                  const pct = target ? Math.round(achieved/target*100) : 0;
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <div className="w-36 text-sm text-slate-600 truncate" title={p.name}>{p.name}</div>
                      <div className="flex-1 h-5 bg-slate-100 rounded relative" title={`Target ${S.inLakh(target)}`} style={{width:'100%'}}>
                        <div className="absolute inset-y-0 left-0 bg-slate-200 rounded" style={{width:Math.round(target/maxTarget*100)+'%'}}></div>
                        <div className="absolute inset-y-0 left-0 bg-brand-500 rounded text-[10px] text-white px-2 flex items-center" style={{width:Math.round(achieved/maxTarget*100)+'%'}}>{S.inLakh(achieved)}</div>
                      </div>
                      <div className="w-28 text-right text-xs text-slate-400 whitespace-nowrap">/ {S.inLakh(target)} · {pct}%</div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-3 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-brand-500 rounded-sm inline-block"></span>Achieved (invoiced to date, from Billing Tracker)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-slate-200 rounded-sm inline-block"></span>Target (total months × fee)</span>
              </div>
            </>);
          })()}
        </S.Card>
        <S.Card className="p-4">
          <div className="font-semibold text-slate-800 mb-3">Risk / High Priority Projects</div>
          <div className="space-y-2">
            {projects.filter(p=>p.risk==='High'||p.priority==='High').map(p=>(
              <div key={p.id} className="flex justify-between items-center text-sm">
                <span className="text-slate-600 truncate">{p.name}</span>
                <S.Badge cls={S.statusColor(p.risk==='High'?'At Risk':'In Progress')}>{p.risk} risk</S.Badge>
              </div>
            ))}
          </div>
        </S.Card>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
        {bottomCards.map(c=>(
          <S.Card key={c.t} className="p-4 text-center">
            <div className="text-xs text-slate-500 mb-1">{c.t}</div>
            <div className="text-lg font-semibold text-slate-700">{c.v}</div>
          </S.Card>
        ))}
      </div>

      {/* AI Insights — a short, prioritized list of observations computed live from the same tree/
          governance/team data as everything above. Shared with the Reports page. */}
      <S.Card className="p-4 mt-4 bg-gradient-to-br from-violet-50/60 to-white border border-violet-100">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center"><S.Icon name="sparkle" className="w-4 h-4 text-violet-500"/></span>
          <span className="font-semibold text-slate-800">AI Insights</span>
          <span className="text-xs text-slate-400">Auto-generated from live delivery data</span>
        </div>
        <S.AIInsightsList insights={insights}/>
      </S.Card>
    </div>
  );
}

