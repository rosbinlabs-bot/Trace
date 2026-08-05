import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

export default function Reports(){
  const { tree } = React.useContext(S.PhaseDataContext);
  const { risks, issues, changes } = React.useContext(S.GovernanceDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { team } = React.useContext(S.TeamDataContext);
  const { deliverables } = React.useContext(S.DeliverablesDataContext);
  const { invoices } = React.useContext(S.InvoicesDataContext);
  const [openGroup, setOpenGroup] = useState(Object.keys(S.REPORT_CATALOG)[0]);
  const [selectedReport, setSelectedReport] = useState('portfolio');

  // One flatten pass feeds every report below — same pattern used on the Dashboard.
  const allEntries = [];
  projects.forEach(p=>{
    (tree[p.id]||[]).forEach(ph=>{
      ph.milestones.forEach(ms=>{
        allEntries.push({ item:ms, project:p.name, projectObj:p, level:'Milestone' });
        (ms.subtasks||[]).forEach(s=> allEntries.push({ item:s, project:p.name, projectObj:p, level:'Sub Task' }));
      });
    });
  });
  const msOnly = allEntries.filter(e=>e.level==='Milestone');

  const perProjectCompletion = projects.map(p=>{
    const ms = msOnly.filter(e=>e.project===p.name);
    const pct = ms.length ? Math.round(100*ms.filter(e=>S.isApproved(e.item)).length/ms.length) : 0;
    return { p, pct, total: ms.length, approved: ms.filter(e=>S.isApproved(e.item)).length };
  });

  const statusCounts: any = {};
  allEntries.forEach(e=>{ const s=e.item.status||'Not Started'; statusCounts[s]=(statusCounts[s]||0)+1; });

  const overdueEntries = allEntries.filter(e=>S.isOverdue(e.item)).sort((a,b)=>(a.item.deadline||'').localeCompare(b.item.deadline||''));

  const pmPending = allEntries.filter(e=>e.item.review==='PM Verification');
  const headPending = allEntries.filter(e=>e.item.review==='Head Review');
  const clientPending = allEntries.filter(e=>e.item.review==='Implemented Review' && e.item.headApprovedImpl && !e.item.clientApprovedImpl);

  const approvedEntries = allEntries.filter(e=>S.isApproved(e.item));
  const implementedEntries = allEntries.filter(e=>e.item.status==='Implemented');
  const monthKey = S.CURRENT_MONTH_END.slice(0,7);
  const implementedThisMonth = implementedEntries.filter(e=>e.item.clientAcceptedDate && e.item.clientAcceptedDate.slice(0,7)===monthKey);

  const deptGroups: any = {};
  team.forEach(m=>{ (deptGroups[m.dept]=deptGroups[m.dept]||[]).push(m); });
  const deptStats = Object.entries(deptGroups).map(([d,members]: any) =>({ dept:d, avgUtil: Math.round(members.reduce((a,m)=>a+m.util,0)/members.length), count:members.length })).sort((a,b)=>b.avgUtil-a.avgUtil);

  const insights = S.computeInsights({ tree, risks, issues, changes, projects, team });

  // ---- Extra computed data feeding the additional 5+ reports per section below ----
  const roleGroups: any = {};
  team.forEach(m=>{ (roleGroups[m.role]=roleGroups[m.role]||[]).push(m); });
  const roleStats = Object.entries(roleGroups).map(([r,members]: any) =>({ role:r, count:members.length, avgUtil: Math.round(members.reduce((a,m)=>a+m.util,0)/members.length) })).sort((a,b)=>b.avgUtil-a.avgUtil);
  const capacityRanked = [...team].sort((a,b)=>a.util-b.util===0?0:(100-a.util)-(100-b.util));

  // Project Master's own paymentStatus field was removed (it never got updated once Billing
  // Tracker/Payment Receipts became the real source of truth) — derive the same "Payment" concept
  // live from actual invoices instead, so this and the reports below stay meaningful.
  const projPaymentStatus = (p:any) => {
    const inv = (invoices||[]).filter((i:any)=>i.project===p.id);
    if (!inv.length) return p.billingDueDate ? 'Pending' : '—';
    if (inv.some((i:any)=>i.status==='Delayed')) return 'Delayed';
    if (inv.some((i:any)=>i.status==='On Hold')) return 'On Hold';
    if (inv.every((i:any)=>i.status==='Received')) return 'Received';
    return 'Pending';
  };

  const clientGroups: any = {};
  projects.forEach(p=>{ (clientGroups[p.client]=clientGroups[p.client]||[]).push(p); });
  const clientStats = Object.entries(clientGroups).map(([client,projs]: any) =>({
    client, count: projs.length,
    totalMonthly: projs.reduce((a,p)=>a+(Number(p.monthlyFee)||0),0),
    worstPayment: (['Delayed','On Hold','Pending','Received'].find(s=>projs.some((p:any)=>projPaymentStatus(p)===s)))||'—',
    billingTypes: [...new Set(projs.map(p=>p.billing))].join(', '),
    atRisk: projs.filter(p=>p.risk==='High').length,
    statuses: [...new Set(projs.map(p=>p.status))].join(', '),
    sbus: projs.reduce((a,p)=>a+(Number(p.noOfSbu)||0),0),
    engagements: [...new Set(projs.map(p=>p.engagement))].join(', '),
    industries: [...new Set(projs.map(p=>p.industry))].join(', '),
    tier: [...new Set(projs.map(p=>p.category))].join(', '),
  }));

  const marginRanked = [...projects].sort((a,b)=>(a.margin||0)-(b.margin||0));
  const billingRanked = [...projects].sort((a,b)=>S.daysLeft(a.billingDueDate)-S.daysLeft(b.billingDueDate));
  const timelineRanked = [...projects].sort((a,b)=>S.daysLeft(a.end)-S.daysLeft(b.end));

  const miniTable = (rows, cols) => (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 border-b border-slate-200"><tr>{cols.map(c=><S.Th key={c}>{c}</S.Th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{rows}</tbody>
    </table>
  );

  const renderReportBody = () => {
    switch(selectedReport){
      case 'portfolio':
        return miniTable(
          perProjectCompletion.map(({p,pct}: any)=>(
            <tr key={p.id}>
              <S.Td className="font-medium">{p.name}</S.Td>
              <S.Td>{p.client}</S.Td>
              <S.Td>{p.pm||'—'}</S.Td>
              <S.Td><S.Badge cls={S.statusColor(p.status)}>{p.status}</S.Badge></S.Td>
              <S.Td>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-slate-100 rounded-full"><div className="h-2 bg-brand-500 rounded-full" style={{width:pct+'%'}}></div></div>
                  <span className="text-xs text-slate-500">{pct}%</span>
                </div>
              </S.Td>
              <S.Td><S.Badge cls={S.statusColor(p.risk==='High'?'At Risk':'In Progress')}>{p.risk}</S.Badge></S.Td>
            </tr>
          )), ['Project','Client','PM','Status','Milestone Completion','Risk']
        );
      case 'revenue':
        return (
          <div className="space-y-2.5">
            {projects.map(p=>{
              const target = S.projTargetRevenue(p), achieved = S.projInvoicedRevenue(p,invoices);
              const pct = target ? Math.round(achieved/target*100) : 0;
              return (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="w-40 text-sm text-slate-600 truncate" title={p.name}>{p.name}</div>
                  <div className="flex-1 h-4 bg-slate-100 rounded"><div className="h-4 bg-brand-500 rounded" style={{width:pct+'%'}}></div></div>
                  <div className="w-44 text-right text-xs text-slate-500 whitespace-nowrap">{S.inLakh(achieved)} / {S.inLakh(target)} · {pct}%</div>
                </div>
              );
            })}
          </div>
        );
      case 'riskdash':
        return (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <S.Card className="p-3 text-center"><div className="text-xs text-slate-500">Open Risks</div><div className="text-xl font-bold text-red-600">{risks.filter(r=>r.status==='Open'||r.status==='In Progress').length}</div></S.Card>
              <S.Card className="p-3 text-center"><div className="text-xs text-slate-500">Open Issues</div><div className="text-xl font-bold text-amber-600">{issues.filter(i=>i.status==='Open'||i.status==='In Progress').length}</div></S.Card>
              <S.Card className="p-3 text-center"><div className="text-xs text-slate-500">Pending Change Requests</div><div className="text-xl font-bold text-blue-600">{changes.filter(c=>c.status==='Pending').length}</div></S.Card>
            </div>
            <div className="text-xs text-slate-400 mb-1.5 uppercase tracking-wide">Risks</div>
            {miniTable(risks.map(r=>(
              <tr key={r.id}>
                <S.Td className="font-mono text-xs">{r.id}</S.Td><S.Td>{r.project}</S.Td><S.Td>{r.desc}</S.Td>
                <S.Td><S.Badge cls={S.statusColor(r.impact==='High'?'At Risk':'In Progress')}>{r.impact}</S.Badge></S.Td>
                <S.Td>{r.owner}</S.Td><S.Td><S.Badge cls={S.statusColor(r.status)}>{r.status}</S.Badge></S.Td>
              </tr>
            )), ['ID','Project','Description','Impact','Owner','Status'])}
            <div className="text-xs text-slate-400 mt-4 mb-1.5 uppercase tracking-wide">Issues</div>
            {miniTable(issues.map(i=>(
              <tr key={i.id}>
                <S.Td className="font-mono text-xs">{i.id}</S.Td><S.Td>{i.project}</S.Td><S.Td>{i.root}</S.Td>
                <S.Td><S.Badge cls={S.statusColor(i.severity==='High'?'At Risk':'In Progress')}>{i.severity}</S.Badge></S.Td>
                <S.Td>{i.assignee}</S.Td><S.Td><S.Badge cls={S.statusColor(i.status)}>{i.status}</S.Badge></S.Td>
              </tr>
            )), ['ID','Project','Root Cause','Severity','Assignee','Status'])}
          </div>
        );
      case 'margin':
        return miniTable(
          marginRanked.map(p=>(
            <tr key={p.id}>
              <S.Td className="font-medium">{p.name}</S.Td><S.Td>{p.client}</S.Td>
              <S.Td>{S.inLakh(p.monthlyFee)}/mo</S.Td>
              <S.Td>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-slate-100 rounded-full"><div className={`h-2 rounded-full ${p.margin<25?'bg-red-500':p.margin<35?'bg-amber-500':'bg-emerald-500'}`} style={{width:Math.min(100,p.margin)+'%'}}></div></div>
                  <span className={`text-xs font-medium ${p.margin<25?'text-red-600':p.margin<35?'text-amber-600':'text-emerald-600'}`}>{p.margin}%</span>
                </div>
              </S.Td>
              <S.Td><S.Badge cls={p.margin<25?'bg-red-100 text-red-700':p.margin<35?'bg-amber-100 text-amber-700':'bg-emerald-100 text-emerald-700'}>{p.margin<25?'Thin':p.margin<35?'Watch':'Healthy'}</S.Badge></S.Td>
            </tr>
          )), ['Project','Client','Monthly Fee','Margin','Health']
        );
      case 'billingsummary':
        return miniTable(
          billingRanked.map(p=>{ const d=S.daysLeft(p.billingDueDate); return (
            <tr key={p.id}>
              <S.Td className="font-medium">{p.name}</S.Td><S.Td>{p.client}</S.Td><S.Td>{p.billing}</S.Td>
              <S.Td>{p.billingDueDate||'—'}</S.Td>
              <S.Td className={d<0?'text-red-600 font-medium':d<=7?'text-amber-600 font-medium':'text-slate-500'}>{d<0?`${Math.abs(d)}d overdue`:d===0?'Due today':`${d}d left`}</S.Td>
              <S.Td><S.Badge cls={S.payColor(projPaymentStatus(p))}>{projPaymentStatus(p)}</S.Badge></S.Td>
            </tr>
          );}), ['Project','Client','Billing Type','Due Date','Status','Payment']
        );
      case 'phasecompletion':
        return miniTable(
          perProjectCompletion.map(({p,pct,total,approved}: any)=>(
            <tr key={p.id}>
              <S.Td className="font-medium">{p.name}</S.Td>
              <S.Td>{approved} of {total} milestones</S.Td>
              <S.Td>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-slate-100 rounded-full"><div className="h-2 bg-brand-500 rounded-full" style={{width:pct+'%'}}></div></div>
                  <span className="text-xs text-slate-500">{pct}%</span>
                </div>
              </S.Td>
            </tr>
          )), ['Project','Milestones Approved','Completion']
        );
      case 'deliverablestatus': {
        const total = allEntries.length || 1;
        return miniTable(
          Object.entries(statusCounts).sort((a:any,b:any)=>b[1]-a[1]).map(([s,c]: any) =>(
            <tr key={s}>
              <S.Td><S.Badge cls={S.statusColor(s)}>{s}</S.Badge></S.Td>
              <S.Td>{c}</S.Td>
              <S.Td>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-slate-100 rounded-full"><div className="h-2 bg-brand-500 rounded-full" style={{width:Math.round(100*c/total)+'%'}}></div></div>
                  <span className="text-xs text-slate-500">{Math.round(100*c/total)}%</span>
                </div>
              </S.Td>
            </tr>
          )), ['Status','Count','Share']
        );
      }
      case 'overdue':
        return overdueEntries.length===0
          ? <div className="text-sm text-slate-400">No overdue milestones or sub tasks — everything is on track.</div>
          : miniTable(overdueEntries.map((e,i)=>(
              <tr key={i}>
                <S.Td>{e.project}</S.Td><S.Td className="font-medium">{e.item.name}</S.Td><S.Td>{e.level}</S.Td>
                <S.Td>{e.item.deadline}</S.Td>
                <S.Td className="text-red-600 font-medium">{Math.abs(S.daysLeft(e.item.deadline))}d overdue</S.Td>
              </tr>
            )), ['Project','Item','Level','Deadline','Overdue By']);
      case 'pendingapprovals':
        return (
          <div className="space-y-5">
            <div>
              <div className="text-xs text-slate-400 mb-1.5 uppercase tracking-wide">PM Verification ({pmPending.length})</div>
              {pmPending.length===0 ? <div className="text-sm text-slate-400">Nothing pending.</div> : miniTable(pmPending.map((e,i)=>(<tr key={i}><S.Td>{e.project}</S.Td><S.Td className="font-medium">{e.item.name}</S.Td><S.Td>{e.level}</S.Td></tr>)), ['Project','Item','Level'])}
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1.5 uppercase tracking-wide">Head Review ({headPending.length})</div>
              {headPending.length===0 ? <div className="text-sm text-slate-400">Nothing pending.</div> : miniTable(headPending.map((e,i)=>(<tr key={i}><S.Td>{e.project}</S.Td><S.Td className="font-medium">{e.item.name}</S.Td><S.Td>{e.level}</S.Td></tr>)), ['Project','Item','Level'])}
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1.5 uppercase tracking-wide">Client Sign-off ({clientPending.length})</div>
              {clientPending.length===0 ? <div className="text-sm text-slate-400">Nothing pending.</div> : miniTable(clientPending.map((e,i)=>(<tr key={i}><S.Td>{e.project}</S.Td><S.Td className="font-medium">{e.item.name}</S.Td><S.Td>{e.level}</S.Td></tr>)), ['Project','Item','Level'])}
            </div>
          </div>
        );
      case 'deliverablebudget':
        // Reads the live `deliverables` Supabase table (hours/budget tracking separate from the
        // phase tree's milestones/sub tasks) instead of a hardcoded demo list.
        return deliverables.length===0 ? (
          <div className="text-sm text-slate-400 py-6 text-center">No deliverables recorded yet.</div>
        ) : miniTable(
          deliverables.map(d=>{
            const proj = projects.find(p=>p.name===d.project);
            return (
            <tr key={d.id}>
              <S.Td className="font-mono text-xs">{d.id}</S.Td>
              <S.Td className="font-medium">{d.name}</S.Td>
              <S.Td>{proj ? proj.name : d.project}</S.Td>
              <S.Td>{d.dept}</S.Td><S.Td>{d.owner}</S.Td>
              <S.Td>{d.hours}h</S.Td><S.Td>{S.inLakh(d.budget)}</S.Td>
              <S.Td><S.Badge cls={S.statusColor(d.status)}>{d.status}</S.Badge></S.Td>
            </tr>
            );
          }), ['ID','Deliverable','Project','Department','Owner','Hours','Budget','Status']
        );
      case 'timeline':
        return miniTable(
          timelineRanked.map(p=>{ const d=S.daysLeft(p.end); return (
            <tr key={p.id}>
              <S.Td className="font-medium">{p.name}</S.Td><S.Td>{p.client}</S.Td>
              <S.Td>{p.start}</S.Td><S.Td>{p.end}</S.Td>
              <S.Td className={d<0?'text-red-600 font-medium':d<=30?'text-amber-600 font-medium':'text-slate-500'}>{d<0?`${Math.abs(d)}d overdue`:`${d}d left`}</S.Td>
              <S.Td><S.Badge cls={S.statusColor(p.status)}>{p.status}</S.Badge></S.Td>
            </tr>
          );}), ['Project','Client','Start','End','Time Remaining','Status']
        );
      case 'utilization':
        return miniTable(team.map(m=>(
          <tr key={m.name}>
            <S.Td className="font-medium">{m.name}</S.Td><S.Td>{m.dept}</S.Td>
            <S.Td>
              <div className="flex items-center gap-2">
                <div className="w-28 h-2 bg-slate-100 rounded-full"><div className={`h-2 rounded-full ${m.util>90?'bg-red-500':m.util>75?'bg-amber-500':'bg-emerald-500'}`} style={{width:m.util+'%'}}></div></div>
                <span className="text-xs text-slate-500">{m.util}%</span>
              </div>
            </S.Td>
            <S.Td>{m.avail}</S.Td>
          </tr>
        )), ['Name','Department','Utilization','Availability']);
      case 'deptperf':
        return miniTable(deptStats.map(d=>(
          <tr key={d.dept}>
            <S.Td className="font-medium">{d.dept}</S.Td><S.Td>{d.count}</S.Td>
            <S.Td>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-100 rounded-full"><div className={`h-2 rounded-full ${d.avgUtil>90?'bg-red-500':d.avgUtil>75?'bg-amber-500':'bg-emerald-500'}`} style={{width:d.avgUtil+'%'}}></div></div>
                <span className="text-xs text-slate-500">{d.avgUtil}%</span>
              </div>
            </S.Td>
          </tr>
        )), ['Department','Consultants','Avg Utilization']);
      case 'availability':
        return miniTable([...team].sort((a,b)=>(Number(String(b.avail).replace('%',''))||0)-(Number(String(a.avail).replace('%',''))||0)).map(m=>(
          <tr key={m.name}><S.Td className="font-medium">{m.name}</S.Td><S.Td>{m.dept}</S.Td><S.Td>{m.avail}</S.Td><S.Td>{m.util}%</S.Td></tr>
        )), ['Name','Department','Availability','Utilization']);
      case 'roleworkload':
        return miniTable(roleStats.map(r=>(
          <tr key={r.role}>
            <S.Td className="font-medium">{r.role}</S.Td><S.Td>{r.count}</S.Td>
            <S.Td>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-slate-100 rounded-full"><div className={`h-2 rounded-full ${r.avgUtil>90?'bg-red-500':r.avgUtil>75?'bg-amber-500':'bg-emerald-500'}`} style={{width:r.avgUtil+'%'}}></div></div>
                <span className="text-xs text-slate-500">{r.avgUtil}%</span>
              </div>
            </S.Td>
          </tr>
        )), ['Role','Headcount','Avg Utilization']);
      case 'capacityforecast':
        return miniTable(capacityRanked.map(m=>{ const headroom = 100-m.util; return (
          <tr key={m.name}>
            <S.Td className="font-medium">{m.name}</S.Td><S.Td>{m.role}</S.Td><S.Td>{m.capacity}</S.Td>
            <S.Td className={headroom<10?'text-red-600 font-medium':headroom<25?'text-amber-600 font-medium':'text-emerald-600 font-medium'}>{headroom}% headroom</S.Td>
          </tr>
        );}), ['Name','Role','Weekly Capacity','Headroom']);
      case 'clientpending':
        return clientPending.length===0
          ? <div className="text-sm text-slate-400">No items awaiting client sign-off right now.</div>
          : miniTable(clientPending.map((e,i)=>(
              <tr key={i}><S.Td>{e.project}</S.Td><S.Td className="font-medium">{e.item.name}</S.Td><S.Td>{e.level}</S.Td><S.Td>{e.item.deadline||'—'}</S.Td></tr>
            )), ['Project','Item','Level','Deadline']);
      case 'approvaltracker':
        return (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <S.Card className="p-3 text-center"><div className="text-xs text-slate-500">Approved</div><div className="text-xl font-bold text-emerald-600">{approvedEntries.length}</div></S.Card>
              <S.Card className="p-3 text-center"><div className="text-xs text-slate-500">Implemented</div><div className="text-xl font-bold text-blue-600">{implementedEntries.length}</div></S.Card>
              <S.Card className="p-3 text-center"><div className="text-xs text-slate-500">Implemented This Month</div><div className="text-xl font-bold text-violet-600">{implementedThisMonth.length}</div></S.Card>
            </div>
            {implementedEntries.length===0 ? <div className="text-sm text-slate-400">No items implemented yet.</div> : miniTable(implementedEntries.map((e,i)=>(
              <tr key={i}><S.Td>{e.project}</S.Td><S.Td className="font-medium">{e.item.name}</S.Td><S.Td>{e.level}</S.Td><S.Td>{e.item.clientAcceptedDate||'—'}</S.Td></tr>
            )), ['Project','Item','Level','Client Accepted'])}
          </div>
        );
      case 'clientbilling':
        return miniTable(clientStats.map(c=>(
          <tr key={c.client}>
            <S.Td className="font-medium">{c.client}</S.Td><S.Td>{c.count}</S.Td>
            <S.Td>{S.inLakh(c.totalMonthly)}/mo</S.Td><S.Td>{c.billingTypes}</S.Td>
            <S.Td><S.Badge cls={S.payColor(c.worstPayment)}>{c.worstPayment}</S.Badge></S.Td>
          </tr>
        )), ['Client','Projects','Total Monthly Fee','Billing Types','Payment Status']);
      case 'clientrisk':
        return miniTable(clientStats.map(c=>(
          <tr key={c.client}>
            <S.Td className="font-medium">{c.client}</S.Td><S.Td>{c.count}</S.Td>
            <S.Td>{c.statuses}</S.Td>
            <S.Td>{c.atRisk>0 ? <S.Badge cls="bg-red-100 text-red-700">{c.atRisk} at risk</S.Badge> : <S.Badge cls="bg-emerald-100 text-emerald-700">Stable</S.Badge>}</S.Td>
          </tr>
        )), ['Client','Projects','Status Mix','Risk Flags']);
      case 'clientengagement':
        return miniTable(clientStats.map(c=>(
          <tr key={c.client}>
            <S.Td className="font-medium">{c.client}</S.Td><S.Td>{c.tier}</S.Td><S.Td>{c.industries}</S.Td>
            <S.Td>{c.engagements}</S.Td><S.Td>{c.sbus}</S.Td>
          </tr>
        )), ['Client','Category Tier','Industry','Engagement Type','Total SBUs']);
      default: return null;
    }
  };

  const currentLabel = (Object.values(S.REPORT_CATALOG).flat() as any[]).find((r:any)=>r.key===selectedReport)?.label || '';

  return (
    <div>
      <S.SectionTitle sub="Click a category to expand it, then a report name to view its live details">Reports</S.SectionTitle>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <S.Card className="lg:col-span-1 p-0 overflow-hidden h-fit">
          {Object.entries(S.REPORT_CATALOG).map(([g,reportList]: any) =>(
            <div key={g} className="border-b border-slate-100 last:border-b-0">
              <button onClick={()=>setOpenGroup(o=>o===g?null:g)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50">
                <span className="font-semibold text-slate-800 text-sm">{g}</span>
                <span className="text-slate-400 text-xs">{openGroup===g?'▼':'▶'}</span>
              </button>
              {openGroup===g && (
                <div className="pb-2">
                  {reportList.map(r=>(
                    <button key={r.key} onClick={()=>setSelectedReport(r.key)}
                      className={`w-full text-left px-6 py-2 text-sm transition-colors ${selectedReport===r.key?'bg-brand-50 text-brand-700 font-medium':'text-slate-600 hover:bg-slate-50'}`}>
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </S.Card>
        <div className="lg:col-span-3 space-y-4">
          <S.Card className="p-4 overflow-x-auto">
            <div className="font-semibold text-slate-800 mb-3">{currentLabel}</div>
            {renderReportBody()}
          </S.Card>
          <S.Card className="p-4 bg-gradient-to-br from-violet-50/60 to-white border border-violet-100">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center"><S.Icon name="sparkle" className="w-4 h-4 text-violet-500"/></span>
              <span className="font-semibold text-slate-800">AI Insights</span>
              <span className="text-xs text-slate-400">Auto-generated from live delivery data</span>
            </div>
            <S.AIInsightsList insights={insights}/>
          </S.Card>
        </div>
      </div>
    </div>
  );
}

// Generic "tag list" master editor (Industry / Consulting Category / Engagement Type). Defined at
// module scope, taking settings/setSettings as props, so its own draft-input state stays stable
// across re-renders (see the note above the ProjectMaster field helpers for why that matters).
