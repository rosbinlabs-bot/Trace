import React from 'react';
import * as S from '../shared';

export default function Dashboard(){
  const { tree } = React.useContext(S.PhaseDataContext);
  const { risks, issues, changes } = React.useContext(S.GovernanceDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { team } = React.useContext(S.TeamDataContext);
  const { invoices } = React.useContext(S.InvoicesDataContext);
  const { admin } = React.useContext(S.AdminDataContext);
  const dueBillings = projects.filter(S.billingDueSoon).sort((a,b)=>S.daysLeft(a.billingDueDate)-S.daysLeft(b.billingDueDate));
  const [billingDuesOpen, setBillingDuesOpen] = React.useState(true);
  const insights = S.computeInsights({ tree, risks, issues, changes, projects, team });

  // Flatten every phase/milestone/sub task across every project into one list, each entry keeping
  // its project name — this one pass feeds every KPI/widget/insight below, all from the same live
  // Phase Management tree (no separate mock numbers).
  const allEntries: any[] = [];
  projects.forEach((p:any)=>{
    (tree[p.id]||[]).forEach((ph:any)=>{
      ph.milestones.forEach((ms:any)=>{
        allEntries.push({ item:ms, project:p.name, level:'Milestone' });
        (ms.subtasks||[]).forEach((s:any)=> allEntries.push({ item:s, project:p.name, level:'Sub Task' }));
      });
    });
  });
  const msOnly: any[] = [];
  projects.forEach((p:any)=>(tree[p.id]||[]).forEach((ph:any)=>ph.milestones.forEach((ms:any)=>msOnly.push(ms))));
  const stOnly = msOnly.flatMap((ms:any)=>ms.subtasks||[]);

  const monthKey = S.CURRENT_MONTH_END.slice(0,7);
  const overdueEntries = allEntries.filter(e=>S.isOverdue(e.item));
  const todayEntries = allEntries.filter(e=>e.item.deadline===S.TODAY_ISO);
  const upcomingEntries = allEntries.filter(e=>e.item.deadline && e.item.deadline>S.TODAY_ISO && e.item.deadline<=S.addDays(S.TODAY_ISO,14) && !S.isApproved(e.item));
  const clientPendingEntries = allEntries.filter(e=>e.item.review==='Implemented Review' && e.item.headApprovedImpl && !e.item.clientApprovedImpl);
  // `review` is a generic 'Pending Review' sentinel now (level-based approval) — e.level tells a
  // pending Sub Task apart from a pending Milestone.
  const pmPendingEntries = allEntries.filter(e=>e.item.review==='Pending Review' && e.level==='Sub Task');
  const headPendingEntries = allEntries.filter(e=>e.item.review==='Pending Review' && e.level==='Milestone');
  const pendingReviewEntries = [...pmPendingEntries, ...headPendingEntries];
  const approvedEntries = allEntries.filter(e=>S.isApproved(e.item));
  const implementedEntries = allEntries.filter(e=>e.item.status==='Implemented');
  const implementedThisMonth = implementedEntries.filter(e=>e.item.clientAcceptedDate && e.item.clientAcceptedDate.slice(0,7)===monthKey);

  const msCompletionPct = msOnly.length ? Math.round(100*msOnly.filter(S.isApproved).length/msOnly.length) : 0;
  const stCompletionPct = stOnly.length ? Math.round(100*stOnly.filter(S.isApproved).length/stOnly.length) : 0;
  const avgUtil = team.length ? Math.round(team.reduce((a:number,m:any)=>a+m.util,0)/team.length) : 0;
  const avgAvail = team.length ? Math.round(team.reduce((a:number,m:any)=>a+(Number(String(m.avail).replace('%',''))||0),0)/team.length) : 0;
  const overloaded = team.filter((m:any)=>m.util>90).length;
  const deptTotals: any = {};
  team.forEach((m:any)=>{ (deptTotals[m.dept]=deptTotals[m.dept]||[]).push(m.util); });
  const deptAvg = Object.entries(deptTotals).map(([d,arr]: any) =>[d, Math.round(arr.reduce((a:number,b:number)=>a+b,0)/arr.length)]).sort((a:any,b:any)=>b[1]-a[1]);
  const busiestDept = deptAvg[0];

  // ---- on-time delivery rate — replaces the old unused `margin`/`sla` legacy columns (never
  // exposed in any edit UI, so always empty for real projects) with something computed live: of
  // everything approved so far that had a deadline, what share finished on or before it. ----
  const doneWithDeadline = allEntries.filter(e=>S.isApproved(e.item) && e.item.deadline && e.item.actualDate);
  const onTimeCount = doneWithDeadline.filter(e=>e.item.actualDate<=e.item.deadline).length;
  const onTimeRate = doneWithDeadline.length ? Math.round(100*onTimeCount/doneWithDeadline.length) : null;

  // ---- risk coverage — of every still-open risk, how many have someone tagged Supporting By ----
  const openRisks = risks.filter((r:any)=>r.status!=='Closed' && r.status!=='Mitigated');
  const highImpactOpenRisks = openRisks.filter((r:any)=>r.impact==='High');
  const unassignedHighRisks = highImpactOpenRisks.filter((r:any)=>!r.supportBy);
  const riskCoverage = openRisks.length ? Math.round(100*openRisks.filter((r:any)=>r.supportBy).length/openRisks.length) : 100;

  // ---- portfolio health (Red/Amber/Green) per project — derived from real signals (overdue
  // deliverables, an unaddressed High-impact risk, a lapsed end date with no extension on file)
  // rather than the legacy `project.risk` column, which nothing in the UI ever sets. ----
  const projectOpenRisks = (p:any) => openRisks.filter((r:any)=>r.project===p.name);
  const projectHealth = (p:any) => {
    const overdue = allEntries.some(e=>e.project===p.name && S.isOverdue(e.item));
    const highRisk = projectOpenRisks(p).some((r:any)=>r.impact==='High');
    if (overdue || highRisk || S.needsExtension(p)) return 'red';
    const dueSoon = upcomingEntries.some(e=>e.project===p.name);
    if (dueSoon || projectOpenRisks(p).length>0) return 'amber';
    return 'green';
  };
  const trackedProjects = projects.filter((p:any)=>p.status!=='Completed' && p.status!=='Dropped');
  const healthCounts = { red:0, amber:0, green:0 };
  trackedProjects.forEach((p:any)=>{ (healthCounts as any)[projectHealth(p)]++; });
  const projCompletionPct = (p:any) => {
    const mss = (tree[p.id]||[]).flatMap((ph:any)=>ph.milestones||[]);
    return mss.length ? Math.round(100*mss.filter(S.isApproved).length/mss.length) : 0;
  };
  const nextMilestoneFor = (p:any) => {
    const mss = (tree[p.id]||[]).flatMap((ph:any)=>ph.milestones||[]).filter((m:any)=>!S.isApproved(m) && m.deadline);
    if (!mss.length) return null;
    return [...mss].sort((a:any,b:any)=>a.deadline<b.deadline?-1:1)[0];
  };

  const risksOpenCount = openRisks.length;
  const issuesOpen = issues.filter((i:any)=>i.status==='Open'||i.status==='In Progress');
  const changesPending = changes.filter((c:any)=>c.status==='Pending');
  const extNeeded = projects.filter(S.needsExtension);
  const activeProjectsList = projects.filter((p:any)=>p.status==='In Progress');
  const activeProjects = activeProjectsList.length;

  // ---- approval bottlenecks — who's actually sitting on a pending decision, and for how long
  // (via reviewSince, stamped the moment an item first queues for review). ----
  const daysPending = (item:any) => item.reviewSince ? Math.max(0, -S.daysLeft(item.reviewSince)) : null;
  const approverFor = (entry:any) => {
    const p = projects.find((pp:any)=>pp.name===entry.project);
    if (!p) return { name:'—', level:'' };
    const kind = entry.level==='Milestone' ? 'milestone' : 'subtask';
    const level = S.approverLevelFor(kind, p);
    const roster = S.buildRoster(p, admin);
    const name = roster.find((r:any)=>r.level===level)?.name || `Anyone at ${level}`;
    return { name, level };
  };
  const bottlenecks = [...pendingReviewEntries]
    .map(e=>({ ...e, days:daysPending(e.item), approver:approverFor(e) }))
    .sort((a,b)=>(b.days??-1)-(a.days??-1))
    .slice(0,5);
  const oldestPending = bottlenecks[0];

  // ---- collections aging — real, from Billing Tracker invoices (dueDate/amount/status), not
  // reconstructed from anywhere else. ----
  const openInvoices = invoices.filter((i:any)=>i.status!=='Received' && i.dueDate);
  const overdueDaysOf = (i:any) => -S.daysLeft(i.dueDate);
  const aging = { notDue:0, d30:0, d60:0, d90:0 };
  openInvoices.forEach((i:any)=>{
    const d = overdueDaysOf(i); const amt = Number(i.amount)||0;
    if (d<=0) aging.notDue+=amt; else if (d<=30) aging.d30+=amt; else if (d<=60) aging.d60+=amt; else aging.d90+=amt;
  });
  const totalOverdue = aging.d30+aging.d60+aging.d90;
  const overdueInvoices = openInvoices.filter((i:any)=>overdueDaysOf(i)>0)
    .sort((a:any,b:any)=>overdueDaysOf(b)-overdueDaysOf(a)).slice(0,5);
  const projectOf = (invProjectId:string) => projects.find((p:any)=>p.id===invProjectId);

  // ---- immediate project capacity — bench now, plus what frees up as active projects close.
  // Bench = consultants below 70% utilization; their spare capacity comes from the `avail` field
  // when it's a parseable percentage, else estimated as (100 - util). Projects "closing soon" are
  // active, at least 70% through their milestones, ending within 90 days — each one's whole team
  // is counted as freed capacity on its end date. ----
  const parseAvail = (s:any) => { const n = Number(String(s||'').replace('%','')); return isNaN(n) ? null : n; };
  const benchMembers = team.filter((m:any)=>m.util<70);
  const benchFTE = benchMembers.reduce((sum:number,m:any)=>{ const a=parseAvail(m.avail); return sum + (a!=null ? a/100 : Math.max(0,100-m.util)/100); },0);
  const avgTeamSize = activeProjectsList.length ? Math.max(1, Math.round(activeProjectsList.reduce((s:number,p:any)=>s+(p.team||[]).length,0)/activeProjectsList.length)) : 1;
  const closingSoon = activeProjectsList
    .filter((p:any)=>{ const d=S.daysLeft(p.end); return p.end && d>=0 && d<=90 && projCompletionPct(p)>=70; })
    .sort((a:any,b:any)=>S.daysLeft(a.end)-S.daysLeft(b.end));
  const freedFTEWithin = (days:number) => closingSoon.filter((p:any)=>S.daysLeft(p.end)<=days).reduce((s:number,p:any)=>s+(p.team||[]).length,0);
  const slotsWithin = (fte:number) => Math.floor(fte/avgTeamSize);
  const slotsNow = slotsWithin(benchFTE);
  const slots30 = slotsWithin(benchFTE+freedFTEWithin(30));
  const slots60 = slotsWithin(benchFTE+freedFTEWithin(60));

  // ---- risk register snapshot — highest severity first (probability + impact score) ----
  const sevScore = (v:string) => v==='High'?2:v==='Medium'?1:0;
  const riskSnapshot = [...risks].sort((a:any,b:any)=>(sevScore(b.prob)+sevScore(b.impact))-(sevScore(a.prob)+sevScore(a.impact))).slice(0,6);
  const issuesBySeverity = { High:0, Medium:0, Low:0 };
  issuesOpen.forEach((i:any)=>{ if((issuesBySeverity as any)[i.severity]!==undefined) (issuesBySeverity as any)[i.severity]++; });

  // A few more insights layered on top of S.computeInsights, specific to panels only this page
  // shows (capacity, collections aging, approver/overload correlation) — same {icon,tone,text} shape.
  const extraInsights: any[] = [];
  if (bottlenecks.length) {
    const overApprover = bottlenecks.find(b=>team.some((m:any)=>m.name===b.approver.name && m.util>90));
    if (overApprover) extraInsights.push({ icon:'flame', tone:'amber', text:`${overApprover.approver.name} is both the approver on a stuck decision and running above 90% utilization — the bottleneck and the overload are the same person.` });
  }
  if (closingSoon.length) {
    const p = closingSoon[0];
    extraInsights.push({ icon:'rocket', tone:'blue', text:`${p.name} is ${projCompletionPct(p)}% complete and closes in ${S.daysLeft(p.end)}d, freeing ${(p.team||[]).length} consultant(s) — good timing to line up the next engagement for them.` });
  }
  if (overdueInvoices.length) {
    const inv = overdueInvoices[0]; const proj = projectOf(inv.project);
    extraInsights.push({ icon:'financials', tone:'rose', text:`${proj?proj.name:'An'} invoice of ${S.inLakh(Number(inv.amount)||0)} is ${overdueDaysOf(inv)} days overdue — the single largest collections risk in the portfolio right now.` });
  }
  const allInsights = [...extraInsights, ...insights];

  const kpis = [
    { label:'Active Projects', value:activeProjects, sub:`of ${projects.length} total`, tone:'text-blue-600' },
    { label:'Portfolio Health', value:`${healthCounts.green}/${healthCounts.amber}/${healthCounts.red}`, sub:'green / amber / red', tone:'text-slate-700' },
    { label:'Revenue Collected', value: (()=>{ const t=projects.reduce((a:number,p:any)=>a+S.projTargetRevenue(p),0); const ach=projects.reduce((a:number,p:any)=>a+S.projInvoicedRevenue(p,invoices),0); return t? `${Math.round(100*ach/t)}%` : '—'; })(), sub:'invoiced to date', tone:'text-emerald-600' },
    { label:'On-Time Delivery', value: onTimeRate!==null ? `${onTimeRate}%` : '—', sub:`${doneWithDeadline.length} completed w/ deadline`, tone:'text-blue-600' },
    { label:'Utilization', value:`${avgUtil}%`, sub:`${overloaded} overloaded`, tone:'text-amber-600' },
    { label:'High-Impact Risks', value:highImpactOpenRisks.length, sub:`${unassignedHighRisks.length} unassigned`, tone:'text-red-600' },
    { label:'Risk Coverage', value:`${riskCoverage}%`, sub:`${openRisks.filter((r:any)=>r.supportBy).length} of ${openRisks.length} open risks`, tone:'text-purple-600' },
    { label:'Approvals Pending', value:pendingReviewEntries.length, sub: oldestPending && oldestPending.days!==null ? `oldest ${oldestPending.days}d` : 'awaiting review', tone:'text-amber-600' },
  ];

  return (
    <div>
      <S.SectionTitle sub="Executive view of complete organizational delivery performance, live from Project Master, Phase Management, Billing, Risk Management and Team Management">Executive Dashboard</S.SectionTitle>

      {/* Decisions needed — the handful of things that actually need a COO call right now, each
          pointing at the item and where to act on it. Everything here is a real live query, not a
          separate tracked list. */}
      {(unassignedHighRisks.length>0 || oldestPending || overdueInvoices.length>0 || extNeeded.length>0 || changesPending.length>0) && (
        <S.Card className="mb-4 overflow-hidden border-l-4 border-l-red-400">
          <div className="px-4 py-3 bg-red-50/40 flex items-center gap-2">
            <S.Icon name="alert" className="w-4 h-4 text-red-500"/>
            <span className="font-semibold text-slate-800">Decisions Needed</span>
          </div>
          <div className="px-4 pb-3 divide-y divide-slate-100">
            {unassignedHighRisks.length>0 && (
              <div className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span className="text-slate-700">{unassignedHighRisks.length} high-impact risk{unassignedHighRisks.length===1?'':'s'} with no one tagged Supporting By</span>
                <span className="text-xs text-slate-400 whitespace-nowrap">Risk Management</span>
              </div>
            )}
            {oldestPending && oldestPending.days!==null && oldestPending.days>=3 && (
              <div className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span className="text-slate-700">Approval stuck {oldestPending.days}d on {oldestPending.approver.name} ({oldestPending.approver.level}) — {(oldestPending.item as any).name}, {oldestPending.project}</span>
                <span className="text-xs text-slate-400 whitespace-nowrap">Phase Management</span>
              </div>
            )}
            {totalOverdue>0 && (
              <div className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span className="text-slate-700">{S.inLakh(totalOverdue)} in overdue collections{aging.d90>0?`, ${S.inLakh(aging.d90)} aged past 60 days`:''}</span>
                <span className="text-xs text-slate-400 whitespace-nowrap">Billing Tracker</span>
              </div>
            )}
            {extNeeded.length>0 && (
              <div className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span className="text-slate-700">{extNeeded.length} project{extNeeded.length===1?'':'s'} past end date, extension not yet confirmed</span>
                <span className="text-xs text-slate-400 whitespace-nowrap">Project Master</span>
              </div>
            )}
            {changesPending.length>0 && (
              <div className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span className="text-slate-700">{changesPending.length} change request{changesPending.length===1?'':'s'} awaiting a decision</span>
                <span className="text-xs text-slate-400 whitespace-nowrap">Change Requests</span>
              </div>
            )}
          </div>
        </S.Card>
      )}

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
              {dueBillings.map((p:any)=>{ const d = S.daysLeft(p.billingDueDate); return (
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {kpis.map(k=>(
          <S.Card key={k.label} className="p-4">
            <div className="text-xs text-slate-500">{k.label}</div>
            <div className={`text-2xl font-bold mt-1 ${k.tone}`}>{k.value}</div>
            <div className="text-xs text-slate-400 mt-1">{k.sub}</div>
          </S.Card>
        ))}
      </div>

      {/* Project health matrix — every active/on-hold project scannable in one table: who leads it,
          how healthy it is, how far along, how much is collected, and what's due next. */}
      <S.Card className="p-4 mb-4 overflow-hidden">
        <div className="font-semibold text-slate-800 mb-3">Project Health Matrix</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200"><tr><S.Th>Project</S.Th><S.Th>Client</S.Th><S.Th>Lead</S.Th><S.Th>Health</S.Th><S.Th>Complete</S.Th><S.Th>Collected</S.Th><S.Th>Risk</S.Th><S.Th>Team</S.Th><S.Th>Next Milestone</S.Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {[...trackedProjects].sort((a:any,b:any)=>{ const order:any={red:0,amber:1,green:2}; return order[projectHealth(a)]-order[projectHealth(b)]; }).map((p:any)=>{
                const health = projectHealth(p);
                const healthDot = health==='red' ? 'text-red-600' : health==='amber' ? 'text-amber-600' : 'text-emerald-600';
                const target = S.projTargetRevenue(p), achieved = S.projInvoicedRevenue(p,invoices);
                const collectedPct = target ? Math.round(100*achieved/target) : 0;
                const openR = projectOpenRisks(p);
                const worstRisk = openR.some((r:any)=>r.impact==='High') ? 'High' : openR.some((r:any)=>r.impact==='Medium') ? 'Medium' : openR.length ? 'Low' : 'None';
                const nm = nextMilestoneFor(p);
                const nmOverdue = nm && S.isOverdue(nm);
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <S.Td className="font-medium">{p.name}</S.Td>
                    <S.Td className="text-slate-500">{p.client||'—'}</S.Td>
                    <S.Td>{S.projectLeadName(p)||'—'}</S.Td>
                    <S.Td><span className={healthDot}>●</span> <span className="capitalize">{health}</span></S.Td>
                    <S.Td>{projCompletionPct(p)}%</S.Td>
                    <S.Td>{collectedPct}%</S.Td>
                    <S.Td><span className={S.priorityColor(worstRisk==='None'?'':worstRisk)}>{worstRisk}</span></S.Td>
                    <S.Td>{(p.team||[]).length}</S.Td>
                    <S.Td className={nmOverdue?'text-red-600':''}>{nm ? `${nm.name} — ${nm.deadline}${nmOverdue?' (overdue)':''}` : '—'}</S.Td>
                  </tr>
                );
              })}
              {trackedProjects.length===0 && <tr><td colSpan={9} className="text-center text-sm text-slate-400 py-8">No active projects.</td></tr>}
            </tbody>
          </table>
        </div>
      </S.Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        <S.Card className="p-4 overflow-hidden">
          <div className="font-semibold text-slate-800 mb-3">Milestones — Next 14 Days</div>
          <div className="space-y-1.5 max-h-72 overflow-auto">
            {[...allEntries].filter(e=>e.level==='Milestone' && !S.isApproved(e.item) && e.item.deadline && e.item.deadline<=S.addDays(S.TODAY_ISO,14))
              .sort((a,b)=>a.item.deadline<b.item.deadline?-1:1).map((e,i)=>{
                const overdue = S.isOverdue(e.item);
                return (
                  <div key={i} className="flex justify-between items-center text-sm bg-slate-50 rounded-lg px-3 py-2">
                    <span className="text-slate-700 truncate">{e.item.name} <span className="text-slate-400">— {e.project}</span></span>
                    <span className={`text-xs whitespace-nowrap ${overdue?'text-red-600 font-medium':'text-slate-500'}`}>{e.item.deadline}{overdue?' · overdue':''}</span>
                  </div>
                );
              })}
            {allEntries.filter(e=>e.level==='Milestone' && !S.isApproved(e.item) && e.item.deadline && e.item.deadline<=S.addDays(S.TODAY_ISO,14)).length===0 && <div className="text-sm text-slate-400">Nothing due in the next 14 days.</div>}
          </div>
        </S.Card>
        <S.Card className="p-4">
          <div className="font-semibold text-slate-800 mb-3">Approval Bottlenecks</div>
          <div className="space-y-1.5">
            {bottlenecks.map((b,i)=>(
              <div key={i} className="flex justify-between items-center text-sm bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-slate-700 truncate">{(b.item as any).name} <span className="text-slate-400">— {b.project}</span></span>
                <span className="text-xs text-slate-500 whitespace-nowrap">{b.approver.name} · {b.days!==null?`${b.days}d`:'pending'}</span>
              </div>
            ))}
            {bottlenecks.length===0 && <div className="text-sm text-slate-400">No approvals waiting right now.</div>}
          </div>
        </S.Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <S.Card className="p-4 lg:col-span-2">
          {(() => {
            const maxTarget = Math.max(1, ...projects.map(S.projTargetRevenue));
            const totalTarget = projects.reduce((a:number,p:any)=>a+S.projTargetRevenue(p),0);
            const totalAchieved = projects.reduce((a:number,p:any)=>a+S.projInvoicedRevenue(p,invoices),0);
            return (<>
              <div className="flex justify-between items-center mb-3">
                <div className="font-semibold text-slate-800">Revenue — Target vs Achievement</div>
                <div className="text-xs text-slate-500">Achieved <span className="font-semibold text-emerald-600">{S.inLakh(totalAchieved)}</span> of <span className="font-semibold text-slate-700">{S.inLakh(totalTarget)}</span> ({totalTarget?Math.round(totalAchieved/totalTarget*100):0}%)</div>
              </div>
              <div className="space-y-2.5">
                {projects.map((p:any)=>{
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
          <div className="font-semibold text-slate-800 mb-3">Collections Aging</div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-emerald-50 rounded-lg p-2"><div className="text-[11px] text-emerald-700">Not yet due</div><div className="text-sm font-bold text-emerald-700">{S.inLakh(aging.notDue)}</div></div>
            <div className="bg-amber-50 rounded-lg p-2"><div className="text-[11px] text-amber-700">1–30 days</div><div className="text-sm font-bold text-amber-700">{S.inLakh(aging.d30)}</div></div>
            <div className="bg-orange-50 rounded-lg p-2"><div className="text-[11px] text-orange-700">31–60 days</div><div className="text-sm font-bold text-orange-700">{S.inLakh(aging.d60)}</div></div>
            <div className="bg-red-50 rounded-lg p-2"><div className="text-[11px] text-red-700">60+ days</div><div className="text-sm font-bold text-red-700">{S.inLakh(aging.d90)}</div></div>
          </div>
          <div className="space-y-1">
            {overdueInvoices.map((inv:any)=>{ const proj = projectOf(inv.project); return (
              <div key={inv.id} className="flex justify-between text-xs bg-slate-50 rounded px-2 py-1.5">
                <span className="text-slate-600 truncate">{proj?proj.name:'—'}</span>
                <span className="text-slate-500 whitespace-nowrap">{S.inLakh(Number(inv.amount)||0)} · {overdueDaysOf(inv)}d</span>
              </div>
            );})}
            {overdueInvoices.length===0 && <div className="text-xs text-slate-400">No overdue invoices.</div>}
          </div>
        </S.Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        <S.Card className="p-4">
          <div className="font-semibold text-slate-800 mb-3">Utilization by Department</div>
          <div className="space-y-2.5">
            {deptAvg.map(([d,pct]:any)=>(
              <div key={d} className="flex items-center gap-3">
                <div className="w-28 text-sm text-slate-600 truncate">{d||'Unassigned'}</div>
                <div className="flex-1 h-2.5 bg-slate-100 rounded-full"><div className={`h-2.5 rounded-full ${pct>90?'bg-red-500':pct>75?'bg-amber-500':'bg-emerald-500'}`} style={{width:Math.min(100,pct)+'%'}}></div></div>
                <div className="w-10 text-right text-xs text-slate-500">{pct}%</div>
              </div>
            ))}
            {deptAvg.length===0 && <div className="text-sm text-slate-400">No team members yet.</div>}
          </div>
        </S.Card>
        <S.Card className="p-4">
          <div className="font-semibold text-slate-800 mb-3">Risk Register Snapshot</div>
          <div className="space-y-1.5">
            {riskSnapshot.map((r:any)=>(
              <div key={r.id} className="flex justify-between items-center text-sm bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-slate-700 truncate">{r.desc} <span className="text-slate-400">— {r.project}</span></span>
                <span className={`text-xs whitespace-nowrap ${r.supportBy?'text-slate-500':'text-red-600 font-medium'}`}>{r.supportBy||'Unassigned'}</span>
              </div>
            ))}
            {riskSnapshot.length===0 && <div className="text-sm text-slate-400">No risks logged yet.</div>}
          </div>
        </S.Card>
      </div>

      {/* Immediate project capacity — bench now, and what frees up as active projects close, so
          new-business decisions are grounded in actual current + near-term headcount. */}
      <S.Card className="p-4 mb-4">
        <div className="font-semibold text-slate-800 mb-3">Immediate Project Capacity</div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-brand-50 rounded-lg p-3"><div className="text-xs text-brand-700">Slots now</div><div className="text-xl font-bold text-brand-800">{slotsNow}</div><div className="text-[11px] text-brand-600 mt-0.5">{benchFTE.toFixed(1)} FTE on bench</div></div>
          <div className="bg-brand-50 rounded-lg p-3"><div className="text-xs text-brand-700">Within 30 days</div><div className="text-xl font-bold text-brand-800">{slots30}</div><div className="text-[11px] text-brand-600 mt-0.5">+{freedFTEWithin(30)} FTE freeing up</div></div>
          <div className="bg-brand-50 rounded-lg p-3"><div className="text-xs text-brand-700">Within 60 days</div><div className="text-xl font-bold text-brand-800">{slots60}</div><div className="text-[11px] text-brand-600 mt-0.5">+{freedFTEWithin(60)} FTE freeing up</div></div>
        </div>
        <div className="text-xs text-slate-400 mb-1.5 uppercase tracking-wide">Projects closing soon (≥70% complete, within 90 days)</div>
        <div className="space-y-1">
          {closingSoon.map((p:any)=>(
            <div key={p.id} className="flex justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
              <span className="text-slate-700">{p.name} <span className="text-slate-400">— {projCompletionPct(p)}% complete</span></span>
              <span className="text-xs text-slate-500 whitespace-nowrap">{p.end} · {S.daysLeft(p.end)}d · frees {(p.team||[]).length}</span>
            </div>
          ))}
          {closingSoon.length===0 && <div className="text-sm text-slate-400">No active projects closing within 90 days yet.</div>}
        </div>
        <div className="text-xs text-slate-400 mt-3 uppercase tracking-wide">Bench today ({benchMembers.length})</div>
        <div className="text-sm text-slate-600 mt-1">{benchMembers.length ? benchMembers.map((m:any)=>`${m.name} (${m.dept||'—'}, ${m.util}%)`).join(', ') : 'No one below 70% utilization right now.'}</div>
      </S.Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <S.Card className="p-4 text-center"><div className="text-xs text-slate-500 mb-1">Busiest Department</div><div className="text-lg font-semibold text-slate-700">{busiestDept ? `${busiestDept[0]} · ${busiestDept[1]}%` : '—'}</div></S.Card>
        <S.Card className="p-4 text-center"><div className="text-xs text-slate-500 mb-1">Consultants Overloaded</div><div className="text-lg font-semibold text-slate-700">{overloaded} &gt; 90% util</div></S.Card>
        <S.Card className="p-4 text-center"><div className="text-xs text-slate-500 mb-1">Open Issues</div><div className="text-lg font-semibold text-slate-700">{issuesBySeverity.High}H / {issuesBySeverity.Medium}M / {issuesBySeverity.Low}L</div></S.Card>
        <S.Card className="p-4 text-center"><div className="text-xs text-slate-500 mb-1">Avg Resource Availability</div><div className="text-lg font-semibold text-slate-700">{avgAvail}%</div></S.Card>
        <S.Card className="p-4 text-center"><div className="text-xs text-slate-500 mb-1">Implemented This Month</div><div className="text-lg font-semibold text-slate-700">{implementedThisMonth.length}</div></S.Card>
      </div>

      {/* AI Insights — a short, prioritized list of observations computed live from the same tree/
          governance/team data as everything above. Shared with the Reports page, plus a few extra
          observations specific to this page's panels. */}
      <S.Card className="p-4 bg-gradient-to-br from-violet-50/60 to-white border border-violet-100">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center"><S.Icon name="sparkle" className="w-4 h-4 text-violet-500"/></span>
          <span className="font-semibold text-slate-800">AI Insights</span>
          <span className="text-xs text-slate-400">Auto-generated from live delivery data</span>
        </div>
        <S.AIInsightsList insights={allInsights}/>
      </S.Card>
    </div>
  );
}
