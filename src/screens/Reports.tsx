import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

export default function Reports(){
  const { tree } = React.useContext(S.PhaseDataContext);
  const { risks, issues, changes } = React.useContext(S.GovernanceDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { team } = React.useContext(S.TeamDataContext);
  const { deliverables } = React.useContext(S.DeliverablesDataContext);
  const { invoices } = React.useContext(S.InvoicesDataContext);
  const { admin } = React.useContext(S.AdminDataContext);
  const { role } = React.useContext(S.RoleContext);
  const { profile: myProfile } = React.useContext(S.CurrentUserContext);
  const myName = myProfile?.name;
  // Same restriction Issues.tsx enforces -- only whoever raised/is assigned/is tagged (plus
  // Admin/L1) sees an issue's content, so it can't leak into this portfolio table for anyone else.
  const visibleIssues = issues.filter((i: any) => S.issueVisibleTo(i, projects.find((p: any) => p.name === i.project), role, myName));
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

  // `review` is a generic 'Pending Review' sentinel now (level-based approval, not a fixed role name)
  // — e.level ('Sub Task'/'Milestone') is what tells these two apart.
  const pmPending = allEntries.filter(e=>e.item.review==='Pending Review' && e.level==='Sub Task');
  const headPending = allEntries.filter(e=>e.item.review==='Pending Review' && e.level==='Milestone');
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
  const billingRanked = [...projects].sort((a,b)=>S.daysLeft(S.nextBillingDueDate(a)||a.end)-S.daysLeft(S.nextBillingDueDate(b)||b.end));
  const timelineRanked = [...projects].sort((a,b)=>S.daysLeft(a.end)-S.daysLeft(b.end));

  // ============================================================================================
  // ---- Chart data: every number/bucket the charts below (existing reports + the 9 new ones)
  // read from. Kept as one block, computed unconditionally like everything above -- these are all
  // cheap array passes over data that's already loaded, not worth memoizing separately.
  // ============================================================================================
  const months12 = S.lastNMonths(12);

  // Revenue Trend — actual cash collected per month (Received invoices only, by receivedDate).
  const revenueTrendData = S.sumByMonth(invoices, 'receivedDate', 'amount', months12, (i:any)=>i.status==='Received');
  // Delivery Velocity — milestones/sub tasks that reached a real "done" date (client-accepted, or
  // approved) per month. S.itemDoneDate prefers clientAcceptedDate, falls back to actualDate.
  const velocitySource = allEntries.filter(e=>S.itemDoneDate(e.item)).map(e=>({ date: S.itemDoneDate(e.item) }));
  const velocityData = S.countByMonth(velocitySource, 'date', months12);
  // Risk & Issue Trend — how many of each were raised per month (addedAt).
  const riskMonthly = S.countByMonth(risks, 'addedAt', months12);
  const issueMonthly = S.countByMonth(issues, 'addedAt', months12);
  const riskIssueTrendData = months12.map((m,i)=>({ month:m.label, Risks:riskMonthly[i].count, Issues:issueMonthly[i].count }));

  // Utilization Distribution — headcount bucketed by utilization band.
  const utilBuckets = [
    { label:'Under 50%', test:(u:number)=>u<50 },
    { label:'50–75%', test:(u:number)=>u>=50&&u<75 },
    { label:'75–90%', test:(u:number)=>u>=75&&u<90 },
    { label:'90%+', test:(u:number)=>u>=90 },
  ];
  const utilDistData = utilBuckets.map(b=>({ bucket:b.label, count: team.filter((m:any)=>b.test(Number(m.util)||0)).length }));
  const utilRanked = [...team].sort((a:any,b:any)=>(b.util||0)-(a.util||0)).map((m:any)=>({ name:m.name, util:m.util||0 }));
  const availRanked = [...team].map((m:any)=>({ name:m.name, avail:Number(String(m.avail).replace('%',''))||0 })).sort((a:any,b:any)=>b.avail-a.avail);
  const headroomRanked = capacityRanked.map((m:any)=>({ name:m.name, headroom: 100-(Number(m.util)||0) })).sort((a:any,b:any)=>a.headroom-b.headroom);

  // Client Revenue Contribution — top 10 clients by total monthly fee across their projects.
  const clientRevenueRanked = [...clientStats].sort((a:any,b:any)=>b.totalMonthly-a.totalMonthly).slice(0,10).map((c:any)=>({ client:c.client, revenue:c.totalMonthly }));
  const clientRevenueSorted = [...clientStats].sort((a:any,b:any)=>b.totalMonthly-a.totalMonthly);
  const clientBillingDonutData = (() => {
    const top5 = clientRevenueSorted.slice(0,5).map((c:any)=>({ name:c.client, value:c.totalMonthly }));
    const othersSum = clientRevenueSorted.slice(5).reduce((a:number,c:any)=>a+c.totalMonthly,0);
    return othersSum>0 ? [...top5, { name:'Others', value:othersSum, color:'#94a3b8' }] : top5;
  })();
  // Client Risk Heat — at-risk project count per client, worst first.
  const clientRiskRanked = [...clientStats].sort((a:any,b:any)=>b.atRisk-a.atRisk).map((c:any)=>({ client:c.client, atRisk:c.atRisk }));
  const clientsAtRiskCount = clientStats.filter((c:any)=>c.atRisk>0).length;
  const clientRiskMixData = [
    { name:'Stable', value: clientStats.length - clientsAtRiskCount, color:'#10b981' },
    { name:'At Risk', value: clientsAtRiskCount, color:'#ef4444' },
  ];

  // Industry / Engagement / Billing Type / Category mixes — all simple "count projects by field".
  const countProjectsBy = (field:string) => {
    const counts: any = {};
    projects.forEach((p:any)=>{ const k=p[field]||'Unspecified'; counts[k]=(counts[k]||0)+1; });
    return Object.entries(counts).map(([name,value]:any)=>({name,value}));
  };
  const industryMixData = countProjectsBy('industry');
  const engagementMixData = countProjectsBy('engagement');
  const billingTypeMixData = countProjectsBy('billing');
  const categoryMixData = countProjectsBy('category');

  // Collections Aging — how much (and how many invoices) are overdue-and-unreceived, bucketed.
  const agingBucketDefs = ['Not Due Yet','0–30d Overdue','31–60d Overdue','61–90d Overdue','90d+ Overdue'];
  const agingData = (() => {
    const amt: any = {}, cnt: any = {};
    agingBucketDefs.forEach(k=>{ amt[k]=0; cnt[k]=0; });
    (invoices||[]).filter((i:any)=>i.status!=='Received').forEach((i:any)=>{
      const dl = S.daysLeft(i.dueDate||S.TODAY_ISO);
      let key = 'Not Due Yet';
      if (dl<0) { const od=Math.abs(dl); key = od<=30?'0–30d Overdue': od<=60?'31–60d Overdue': od<=90?'61–90d Overdue':'90d+ Overdue'; }
      amt[key]+=(Number(i.amount)||0); cnt[key]+=1;
    });
    return agingBucketDefs.map(k=>({ bucket:k, amount:amt[k], count:cnt[k] }));
  })();

  // Revenue Vs Delivery summary donut (portfolio-wide collected vs remaining target).
  const totalTargetRevenue = projects.reduce((a:number,p:any)=>a+S.projTargetRevenue(p),0);
  const totalAchievedRevenue = projects.reduce((a:number,p:any)=>a+S.projInvoicedRevenue(p,invoices),0);
  const revenueSplitData = [
    { name:'Collected', value: totalAchievedRevenue, color:'#10b981' },
    { name:'Remaining', value: Math.max(0, totalTargetRevenue-totalAchievedRevenue), color:'#e2e8f0' },
  ];
  // Portfolio status mix (project-level status, for the Portfolio Summary report).
  const projStatusData = countProjectsBy('status');
  // Margin health mix (Thin / Watch / Healthy, same thresholds the table's badge already uses).
  const marginHealthData = (() => {
    const c = { Thin:0, Watch:0, Healthy:0 };
    projects.forEach((p:any)=>{ const m=p.margin||0; if(m<25) c.Thin++; else if(m<35) c.Watch++; else c.Healthy++; });
    return [
      { name:'Thin (<25%)', value:c.Thin, color:'#ef4444' },
      { name:'Watch (25–35%)', value:c.Watch, color:'#f59e0b' },
      { name:'Healthy (35%+)', value:c.Healthy, color:'#10b981' },
    ];
  })();
  // Payment status mix (Received/Pending/Delayed/On Hold across projects, for Billing & Payment Status).
  const paymentStatusMixData = (() => {
    const counts: any = {};
    projects.forEach((p:any)=>{ const k=projPaymentStatus(p); counts[k]=(counts[k]||0)+1; });
    const tone: any = { Received:'#10b981', Pending:'#f59e0b', Delayed:'#ef4444', 'On Hold':'#f97316' };
    return Object.entries(counts).map(([name,value]:any)=>({ name, value, color: tone[name]||'#94a3b8' }));
  })();
  // Risk impact / issue severity mix (for the Risk Dashboard).
  const sevMix = (rows:any[], field:string) => {
    const counts: any = {};
    rows.forEach((r:any)=>{ const k=r[field]||'Unspecified'; counts[k]=(counts[k]||0)+1; });
    const tone: any = { High:'#ef4444', Medium:'#f59e0b', Low:'#10b981' };
    return Object.entries(counts).map(([name,value]:any)=>({ name, value, color: tone[name]||'#94a3b8' }));
  };
  const riskImpactData = sevMix(risks, 'impact');
  const issueSeverityData = sevMix(visibleIssues, 'severity');
  // Completion % per project, ranked worst-first (Phase Completion).
  const completionRanked = [...perProjectCompletion].sort((a:any,b:any)=>a.pct-b.pct).map((x:any)=>({ project:x.p.name, pct:x.pct }));
  // Overdue count by project (Overdue Activities).
  const overdueByProjectData = (() => {
    const counts: any = {};
    overdueEntries.forEach(e=>{ counts[e.project]=(counts[e.project]||0)+1; });
    return Object.entries(counts).sort((a:any,b:any)=>b[1]-a[1]).map(([project,count]:any)=>({project,count}));
  })();
  // Pending approvals by stage (Pending Approvals).
  const approvalsByStageData = [
    { stage:'Sub Task', count: pmPending.length },
    { stage:'Milestone', count: headPending.length },
    { stage:'Client', count: clientPending.length },
  ];
  // Deliverable budget by department (Deliverable Budget & Hours).
  const budgetByDeptData = (() => {
    const sums: any = {};
    deliverables.forEach((d:any)=>{ const k=d.dept||'Unspecified'; sums[k]=(sums[k]||0)+(Number(d.budget)||0); });
    return Object.entries(sums).map(([dept,budget]:any)=>({dept,budget}));
  })();
  // Days-remaining buckets across all projects (Project Timeline).
  const timelineBucketDefs = [
    { label:'Overdue', test:(d:number)=>d<0 },
    { label:'<30d', test:(d:number)=>d>=0&&d<30 },
    { label:'30–90d', test:(d:number)=>d>=30&&d<90 },
    { label:'90d+', test:(d:number)=>d>=90 },
  ];
  const timelineBucketData = timelineBucketDefs.map(b=>({ bucket:b.label, count: projects.filter((p:any)=>b.test(S.daysLeft(p.end))).length }));
  // Approval Tracker summary bars.
  const approvalTrackerData = [
    { cat:'Approved', count: approvedEntries.length },
    { cat:'Implemented', count: implementedEntries.length },
    { cat:'This Month', count: implementedThisMonth.length },
  ];

  const miniTable = (rows, cols) => (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 border-b border-slate-200"><tr>{cols.map(c=><S.Th key={c}>{c}</S.Th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{rows}</tbody>
    </table>
  );

  const renderReportBody = () => {
    switch(selectedReport){
      case 'portfolio':
        return (
          <div>
            <S.ChartBlock title="Projects by Status" sub={`${projects.length} project(s) across the portfolio`}>
              <S.BarChartMini data={projStatusData.map((d:any)=>({status:d.name, count:d.value}))} xKey="status" bars={[{key:'count', color:'#3b5bdb'}]} height={200}/>
            </S.ChartBlock>
            {miniTable(
              perProjectCompletion.map(({p,pct}: any)=>(
                <tr key={p.id}>
                  <S.Td className="font-medium">{p.name}</S.Td>
                  <S.Td>{S.projectManagerName(p, admin)||'—'}</S.Td>
                  <S.Td><S.Badge cls={S.statusColor(p.status)}>{p.status}</S.Badge></S.Td>
                  <S.Td>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-slate-100 rounded-full"><div className="h-2 bg-brand-500 rounded-full" style={{width:pct+'%'}}></div></div>
                      <span className="text-xs text-slate-500">{pct}%</span>
                    </div>
                  </S.Td>
                  <S.Td><S.Badge cls={S.statusColor(p.risk==='High'?'At Risk':'In Progress')}>{p.risk}</S.Badge></S.Td>
                </tr>
              )), ['Project','Project Manager','Status','Milestone Completion','Risk']
            )}
          </div>
        );
      case 'revenue':
        return (
          <div>
            <S.ChartBlock title="Portfolio Collections" sub={`₹${S.fmt(totalAchievedRevenue)} collected of a ₹${S.fmt(totalTargetRevenue)} target`}>
              <S.DonutChartMini data={revenueSplitData} height={200}/>
            </S.ChartBlock>
            <div className="text-xs text-slate-400 mb-2 uppercase tracking-wide">By Project</div>
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
          </div>
        );
      case 'revenuetrend':
        return (
          <S.ChartBlock title="Collected Revenue by Month" sub="Sum of invoices marked Received, by the date they were received">
            <S.BarChartMini data={revenueTrendData} xKey="month" bars={[{key:'amount', color:'#3b5bdb', name:'Collected (₹)'}]} height={300}/>
          </S.ChartBlock>
        );
      case 'billingaging':
        return (
          <div>
            <S.ChartBlock title="Outstanding Amount by Age" sub="Invoices not yet marked Received, bucketed by days past due">
              <S.BarChartMini data={agingData} xKey="bucket" bars={[{key:'amount', color:'#ef4444', name:'Amount (₹)'}]} height={240}/>
            </S.ChartBlock>
            {miniTable(agingData.map((a:any)=>(
              <tr key={a.bucket}>
                <S.Td className="font-medium">{a.bucket}</S.Td>
                <S.Td>{a.count}</S.Td>
                <S.Td>₹{S.fmt(a.amount)}</S.Td>
              </tr>
            )), ['Age Bucket','Invoice Count','Amount Outstanding'])}
          </div>
        );
      case 'portfoliomix':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <S.ChartBlock title="By Billing Type"><S.DonutChartMini data={billingTypeMixData}/></S.ChartBlock>
            <S.ChartBlock title="By Category Tier"><S.DonutChartMini data={categoryMixData}/></S.ChartBlock>
          </div>
        );
      case 'riskdash':
        return (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <S.Card className="p-3 text-center"><div className="text-xs text-slate-500">Open Risks</div><div className="text-xl font-bold text-red-600">{risks.filter((r: any)=>r.status==='Open'||r.status==='In Progress').length}</div></S.Card>
              <S.Card className="p-3 text-center"><div className="text-xs text-slate-500">Open Issues</div><div className="text-xl font-bold text-amber-600">{issues.filter(i=>i.status==='Open'||i.status==='In Progress').length}</div></S.Card>
              <S.Card className="p-3 text-center"><div className="text-xs text-slate-500">Pending Change Requests</div><div className="text-xl font-bold text-blue-600">{changes.filter(c=>c.status==='Pending').length}</div></S.Card>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <S.ChartBlock title="Risks by Impact"><S.DonutChartMini data={riskImpactData} height={190}/></S.ChartBlock>
              <S.ChartBlock title="Issues by Severity"><S.DonutChartMini data={issueSeverityData} height={190}/></S.ChartBlock>
            </div>
            <div className="text-xs text-slate-400 mb-1.5 uppercase tracking-wide">Risks</div>
            {miniTable(risks.map(r=>(
              <tr key={r.id}>
                <S.Td className="font-mono text-xs">{r.id}</S.Td><S.Td>{r.project}</S.Td><S.Td>{r.desc}</S.Td>
                <S.Td><S.Badge cls={S.statusColor(r.impact==='High'?'At Risk':'In Progress')}>{r.impact}</S.Badge></S.Td>
                <S.Td>{r.supportBy}</S.Td><S.Td><S.Badge cls={S.statusColor(r.status)}>{r.status}</S.Badge></S.Td>
              </tr>
            )), ['ID','Project','Description','Impact','Supporting By','Status'])}
            <div className="text-xs text-slate-400 mt-4 mb-1.5 uppercase tracking-wide">Issues {role!=='admin' && <span className="normal-case text-slate-300">(only issues you raised, are assigned, or are tagged on)</span>}</div>
            {miniTable(visibleIssues.map(i=>(
              <tr key={i.id}>
                <S.Td className="font-mono text-xs">{i.id}</S.Td><S.Td>{i.project}</S.Td><S.Td>{i.desc}</S.Td>
                <S.Td><S.Badge cls={S.statusColor(i.severity==='High'?'At Risk':'In Progress')}>{i.severity}</S.Badge></S.Td>
                <S.Td>{i.assignee}</S.Td><S.Td><S.Badge cls={S.statusColor(i.pendingStatus?'Pending Sign-off':i.status)}>{i.pendingStatus?`Pending Sign-off (${i.pendingStatus})`:i.status}</S.Badge></S.Td>
              </tr>
            )), ['ID','Project','Description','Severity','Assignee','Status'])}
          </div>
        );
      case 'margin':
        return (
          <div>
            <S.ChartBlock title="Margin Health Mix"><S.DonutChartMini data={marginHealthData} height={190}/></S.ChartBlock>
            {miniTable(
              marginRanked.map(p=>(
                <tr key={p.id}>
                  <S.Td className="font-medium">{p.name}</S.Td>
                  <S.Td>{S.inLakh(p.monthlyFee)}/mo</S.Td>
                  <S.Td>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-slate-100 rounded-full"><div className={`h-2 rounded-full ${p.margin<25?'bg-red-500':p.margin<35?'bg-amber-500':'bg-emerald-500'}`} style={{width:Math.min(100,p.margin)+'%'}}></div></div>
                      <span className={`text-xs font-medium ${p.margin<25?'text-red-600':p.margin<35?'text-amber-600':'text-emerald-600'}`}>{p.margin}%</span>
                    </div>
                  </S.Td>
                  <S.Td><S.Badge cls={p.margin<25?'bg-red-100 text-red-700':p.margin<35?'bg-amber-100 text-amber-700':'bg-emerald-100 text-emerald-700'}>{p.margin<25?'Thin':p.margin<35?'Watch':'Healthy'}</S.Badge></S.Td>
                </tr>
              )), ['Project','Monthly Fee','Margin','Health']
            )}
          </div>
        );
      case 'billingsummary':
        return (
          <div>
            <S.ChartBlock title="Payment Status Mix"><S.DonutChartMini data={paymentStatusMixData} height={190}/></S.ChartBlock>
            {miniTable(
              billingRanked.map(p=>{ const due=S.nextBillingDueDate(p); const d=due?S.daysLeft(due):null; return (
                <tr key={p.id}>
                  <S.Td className="font-medium">{p.name}</S.Td><S.Td>{p.billing}</S.Td>
                  <S.Td>{due||'—'}</S.Td>
                  <S.Td className={d==null?'text-slate-400':d<0?'text-red-600 font-medium':d<=7?'text-amber-600 font-medium':'text-slate-500'}>{d==null?'—':d<0?`${Math.abs(d)}d overdue`:d===0?'Due today':`${d}d left`}</S.Td>
                  <S.Td><S.Badge cls={S.payColor(projPaymentStatus(p))}>{projPaymentStatus(p)}</S.Badge></S.Td>
                </tr>
              );}), ['Project','Billing Type','Due Date','Status','Payment']
            )}
          </div>
        );
      case 'phasecompletion':
        return (
          <div>
            <S.ChartBlock title="Milestone Completion by Project" sub="Lowest completion first">
              <S.HBarChartMini data={completionRanked} xKey="project" barKey="pct" color="#3b5bdb" name="Completion %"/>
            </S.ChartBlock>
            {miniTable(
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
            )}
          </div>
        );
      case 'deliverablestatus': {
        const total = allEntries.length || 1;
        const statusMixData = Object.entries(statusCounts).map(([name,value]:any)=>({name,value}));
        return (
          <div>
            <S.ChartBlock title="Milestone / Sub Task Status Mix"><S.DonutChartMini data={statusMixData} height={220}/></S.ChartBlock>
            {miniTable(
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
            )}
          </div>
        );
      }
      case 'overdue':
        return overdueEntries.length===0
          ? <div className="text-sm text-slate-400">No overdue milestones or sub tasks — everything is on track.</div>
          : (
            <div>
              <S.ChartBlock title="Overdue Items by Project">
                <S.HBarChartMini data={overdueByProjectData} xKey="project" barKey="count" color="#ef4444" name="Overdue Items"/>
              </S.ChartBlock>
              {miniTable(overdueEntries.map((e,i)=>(
                <tr key={i}>
                  <S.Td>{e.project}</S.Td><S.Td className="font-medium">{e.item.name}</S.Td><S.Td>{e.level}</S.Td>
                  <S.Td>{e.item.deadline}</S.Td>
                  <S.Td className="text-red-600 font-medium">{Math.abs(S.daysLeft(e.item.deadline))}d overdue</S.Td>
                </tr>
              )), ['Project','Item','Level','Deadline','Overdue By'])}
            </div>
          );
      case 'pendingapprovals':
        return (
          <div className="space-y-5">
            <S.ChartBlock title="Pending Approvals by Stage">
              <S.BarChartMini data={approvalsByStageData} xKey="stage" bars={[{key:'count', color:'#8b5cf6'}]} height={180}/>
            </S.ChartBlock>
            <div>
              <div className="text-xs text-slate-400 mb-1.5 uppercase tracking-wide">Sub Task Approval ({pmPending.length})</div>
              {pmPending.length===0 ? <div className="text-sm text-slate-400">Nothing pending.</div> : miniTable(pmPending.map((e,i)=>(<tr key={i}><S.Td>{e.project}</S.Td><S.Td className="font-medium">{e.item.name}</S.Td><S.Td>{e.level}</S.Td></tr>)), ['Project','Item','Level'])}
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1.5 uppercase tracking-wide">Milestone Approval ({headPending.length})</div>
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
        ) : (
          <div>
            <S.ChartBlock title="Budget by Department">
              <S.BarChartMini data={budgetByDeptData} xKey="dept" bars={[{key:'budget', color:'#3b5bdb', name:'Budget (₹)'}]} height={220}/>
            </S.ChartBlock>
            {miniTable(
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
            )}
          </div>
        );
      case 'timeline':
        return (
          <div>
            <S.ChartBlock title="Projects by Time Remaining">
              <S.BarChartMini data={timelineBucketData} xKey="bucket" bars={[{key:'count', color:'#3b5bdb'}]} height={200}/>
            </S.ChartBlock>
            {miniTable(
              timelineRanked.map(p=>{ const d=S.daysLeft(p.end); return (
                <tr key={p.id}>
                  <S.Td className="font-medium">{p.name}</S.Td>
                  <S.Td>{p.start}</S.Td><S.Td>{p.end}</S.Td>
                  <S.Td className={d<0?'text-red-600 font-medium':d<=30?'text-amber-600 font-medium':'text-slate-500'}>{d<0?`${Math.abs(d)}d overdue`:`${d}d left`}</S.Td>
                  <S.Td><S.Badge cls={S.statusColor(p.status)}>{p.status}</S.Badge></S.Td>
                </tr>
              );}), ['Project','Start','End','Time Remaining','Status']
            )}
          </div>
        );
      case 'velocity':
        return (
          <S.ChartBlock title="Milestones & Sub Tasks Completed by Month" sub="Counted on client-accepted date, falling back to the internal approval date">
            <S.LineChartMini data={velocityData} xKey="month" lines={[{key:'count', color:'#3b5bdb', name:'Completed'}]} height={300}/>
          </S.ChartBlock>
        );
      case 'riskissuetrend':
        return (
          <S.ChartBlock title="Risks & Issues Raised by Month">
            <S.LineChartMini data={riskIssueTrendData} xKey="month" lines={[{key:'Risks', color:'#ef4444'},{key:'Issues', color:'#f59e0b'}]} height={300}/>
          </S.ChartBlock>
        );
      case 'utilization':
        return (
          <div>
            <S.ChartBlock title="Utilization by Consultant">
              <S.HBarChartMini data={utilRanked} xKey="name" barKey="util" color="#3b5bdb" name="Utilization %"/>
            </S.ChartBlock>
            {miniTable(team.map(m=>(
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
            )), ['Name','Department','Utilization','Availability'])}
          </div>
        );
      case 'deptperf':
        return (
          <div>
            <S.ChartBlock title="Average Utilization by Department">
              <S.BarChartMini data={deptStats} xKey="dept" bars={[{key:'avgUtil', color:'#3b5bdb', name:'Avg Utilization %'}]} height={220}/>
            </S.ChartBlock>
            {miniTable(deptStats.map(d=>(
              <tr key={d.dept}>
                <S.Td className="font-medium">{d.dept}</S.Td><S.Td>{d.count}</S.Td>
                <S.Td>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-2 bg-slate-100 rounded-full"><div className={`h-2 rounded-full ${d.avgUtil>90?'bg-red-500':d.avgUtil>75?'bg-amber-500':'bg-emerald-500'}`} style={{width:d.avgUtil+'%'}}></div></div>
                    <span className="text-xs text-slate-500">{d.avgUtil}%</span>
                  </div>
                </S.Td>
              </tr>
            )), ['Department','Consultants','Avg Utilization'])}
          </div>
        );
      case 'availability':
        return (
          <div>
            <S.ChartBlock title="Availability by Consultant">
              <S.HBarChartMini data={availRanked} xKey="name" barKey="avail" color="#10b981" name="Availability"/>
            </S.ChartBlock>
            {miniTable([...team].sort((a,b)=>(Number(String(b.avail).replace('%',''))||0)-(Number(String(a.avail).replace('%',''))||0)).map(m=>(
              <tr key={m.name}><S.Td className="font-medium">{m.name}</S.Td><S.Td>{m.dept}</S.Td><S.Td>{m.avail}</S.Td><S.Td>{m.util}%</S.Td></tr>
            )), ['Name','Department','Availability','Utilization'])}
          </div>
        );
      case 'roleworkload':
        return (
          <div>
            <S.ChartBlock title="Average Utilization by Role">
              <S.BarChartMini data={roleStats} xKey="role" bars={[{key:'avgUtil', color:'#8b5cf6', name:'Avg Utilization %'}]} height={220}/>
            </S.ChartBlock>
            {miniTable(roleStats.map(r=>(
              <tr key={r.role}>
                <S.Td className="font-medium">{r.role}</S.Td><S.Td>{r.count}</S.Td>
                <S.Td>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-2 bg-slate-100 rounded-full"><div className={`h-2 rounded-full ${r.avgUtil>90?'bg-red-500':r.avgUtil>75?'bg-amber-500':'bg-emerald-500'}`} style={{width:r.avgUtil+'%'}}></div></div>
                    <span className="text-xs text-slate-500">{r.avgUtil}%</span>
                  </div>
                </S.Td>
              </tr>
            )), ['Role','Headcount','Avg Utilization'])}
          </div>
        );
      case 'capacityforecast':
        return (
          <div>
            <S.ChartBlock title="Headroom by Consultant" sub="Least headroom (most stretched) first">
              <S.HBarChartMini data={headroomRanked} xKey="name" barKey="headroom" color="#f59e0b" name="Headroom %"/>
            </S.ChartBlock>
            {miniTable(capacityRanked.map(m=>{ const headroom = 100-m.util; return (
              <tr key={m.name}>
                <S.Td className="font-medium">{m.name}</S.Td><S.Td>{m.role}</S.Td><S.Td>{m.capacity}</S.Td>
                <S.Td className={headroom<10?'text-red-600 font-medium':headroom<25?'text-amber-600 font-medium':'text-emerald-600 font-medium'}>{headroom}% headroom</S.Td>
              </tr>
            );}), ['Name','Role','Weekly Capacity','Headroom'])}
          </div>
        );
      case 'utildist':
        return (
          <S.ChartBlock title="Consultants by Utilization Band">
            <S.BarChartMini data={utilDistData} xKey="bucket" bars={[{key:'count', color:'#3b5bdb'}]} height={260}/>
          </S.ChartBlock>
        );
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
            <S.ChartBlock title="Approval Funnel">
              <S.BarChartMini data={approvalTrackerData} xKey="cat" bars={[{key:'count', color:'#3b5bdb'}]} height={200}/>
            </S.ChartBlock>
            {implementedEntries.length===0 ? <div className="text-sm text-slate-400">No items implemented yet.</div> : miniTable(implementedEntries.map((e,i)=>(
              <tr key={i}><S.Td>{e.project}</S.Td><S.Td className="font-medium">{e.item.name}</S.Td><S.Td>{e.level}</S.Td><S.Td>{e.item.clientAcceptedDate||'—'}</S.Td></tr>
            )), ['Project','Item','Level','Client Accepted'])}
          </div>
        );
      case 'clientbilling':
        return (
          <div>
            <S.ChartBlock title="Monthly Fee Share by Client" sub="Top 5 clients, remainder grouped as Others">
              <S.DonutChartMini data={clientBillingDonutData}/>
            </S.ChartBlock>
            {miniTable(clientStats.map(c=>(
              <tr key={c.client}>
                <S.Td className="font-medium">{c.client}</S.Td><S.Td>{c.count}</S.Td>
                <S.Td>{S.inLakh(c.totalMonthly)}/mo</S.Td><S.Td>{c.billingTypes}</S.Td>
                <S.Td><S.Badge cls={S.payColor(c.worstPayment)}>{c.worstPayment}</S.Badge></S.Td>
              </tr>
            )), ['Client','Projects','Total Monthly Fee','Billing Types','Payment Status'])}
          </div>
        );
      case 'clientrisk':
        return (
          <div>
            <S.ChartBlock title="Client Health Mix"><S.DonutChartMini data={clientRiskMixData} height={190}/></S.ChartBlock>
            {miniTable(clientStats.map(c=>(
              <tr key={c.client}>
                <S.Td className="font-medium">{c.client}</S.Td><S.Td>{c.count}</S.Td>
                <S.Td>{c.statuses}</S.Td>
                <S.Td>{c.atRisk>0 ? <S.Badge cls="bg-red-100 text-red-700">{c.atRisk} at risk</S.Badge> : <S.Badge cls="bg-emerald-100 text-emerald-700">Stable</S.Badge>}</S.Td>
              </tr>
            )), ['Client','Projects','Status Mix','Risk Flags'])}
          </div>
        );
      case 'clientengagement':
        return (
          <div>
            <S.ChartBlock title="Engagement Type Mix"><S.DonutChartMini data={engagementMixData} height={190}/></S.ChartBlock>
            {miniTable(clientStats.map(c=>(
              <tr key={c.client}>
                <S.Td className="font-medium">{c.client}</S.Td><S.Td>{c.tier}</S.Td><S.Td>{c.industries}</S.Td>
                <S.Td>{c.engagements}</S.Td><S.Td>{c.sbus}</S.Td>
              </tr>
            )), ['Client','Category Tier','Industry','Engagement Type','Total SBUs'])}
          </div>
        );
      case 'clientrevenue':
        return (
          <S.ChartBlock title="Top Clients by Monthly Fee">
            <S.HBarChartMini data={clientRevenueRanked} xKey="client" barKey="revenue" color="#3b5bdb" name="Monthly Fee (₹)"/>
          </S.ChartBlock>
        );
      case 'clientriskheat':
        return (
          <S.ChartBlock title="At-Risk Projects by Client">
            <S.HBarChartMini data={clientRiskRanked} xKey="client" barKey="atRisk" color="#ef4444" name="At-Risk Projects"/>
          </S.ChartBlock>
        );
      case 'clientmix':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <S.ChartBlock title="By Industry"><S.DonutChartMini data={industryMixData}/></S.ChartBlock>
            <S.ChartBlock title="By Engagement Type"><S.DonutChartMini data={engagementMixData}/></S.ChartBlock>
          </div>
        );
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
