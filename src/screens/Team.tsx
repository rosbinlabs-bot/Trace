import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as S from '../shared';

// Benchmark vs actual for one Team Productivity metric — green + filled bar once the actual meets
// or exceeds the benchmark (or, for a not-yet-benchmarked metric, once there's any actual at all),
// amber otherwise. Kept outside Team() since it doesn't need anything from that closure.
const MetricCell = ({ actual, benchmark, fmt, lowerIsBetter }: any) => {
  // actual can be null -- no items with the relevant dates yet for this person, so there's nothing
  // to score against the benchmark (distinct from an actual of 0, which IS a real, poor score).
  if(actual==null) return <span className="text-xs text-slate-300">No data yet</span>;
  // lowerIsBetter flips the comparison for a capacity-style target (e.g. "ideally two concurrent
  // projects") where exceeding the benchmark means overloaded, not high-performing.
  const met = lowerIsBetter ? (benchmark>0 ? actual<=benchmark : true) : (benchmark>0 ? actual>=benchmark : actual>0);
  const pct = benchmark>0 ? Math.min(100, Math.round(actual/benchmark*100)) : (actual>0?100:0);
  return (
    <div className="min-w-[92px]">
      <div className="flex items-baseline gap-1">
        <span className={`text-sm font-semibold ${met?'text-emerald-600':'text-slate-700'}`}>{fmt?fmt(actual):actual}</span>
        <span className="text-xs text-slate-400">/ {fmt?fmt(benchmark):benchmark}</span>
      </div>
      <div className="h-1 bg-slate-100 rounded-full mt-1 overflow-hidden"><div className={`h-full ${met?'bg-emerald-500':'bg-amber-400'}`} style={{width:pct+'%'}}></div></div>
    </div>
  );
};

const UTIL_BAND = (u:number) => u>90?'overloaded':u>75?'busy':'healthy';
const utilBarColor = (u:number) => u>90?'bg-red-500':u>75?'bg-amber-500':'bg-emerald-500';
const initials = (name:string) => (name||'').split(' ').map(x=>x[0]).join('');

export default function Team(){
  // Team is now a live, computed roster (S.computeTeamRoster in shared.tsx) -- every non-Client
  // Administration -> Users record, decorated with utilization/availability derived from real active
  // project assignments. There's no add/remove step here any more: membership follows Users
  // automatically, which is also what fixed the old gap where a person added in Users but never
  // manually added here was invisible to Project Master's team picker, Calendar's roster and every
  // Team Report. Add/remove/deactivate a person from Administration -> Users; Department and Weekly
  // Capacity (the two fields that live on the person, not derivable from project data) are still
  // editable right here, they just write through to that same Users record now.
  const { team } = React.useContext(S.TeamDataContext);
  const { admin, patchAdmin } = React.useContext(S.AdminDataContext);
  const { settings } = React.useContext(S.SettingsContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { tree } = React.useContext(S.PhaseDataContext);
  const { role } = React.useContext(S.RoleContext);
  const { logActivity } = React.useContext(S.ActivityLogContext);
  const canEdit = role==='admin';
  // Department Master (Administration -> Project Settings -> Masters -> Department Master) is the
  // single source of truth for department names, same list Administration -> Users' own Department
  // column now uses.
  const DEPT_OPTS = (settings.departments && settings.departments.length) ? settings.departments : S.DEFAULT_PROJECT_SETTINGS.departments;
  const deptOptsFor = (current:string) => (current && !DEPT_OPTS.includes(current)) ? [...DEPT_OPTS, current] : DEPT_OPTS;

  const [tab, setTab] = useState<'roster'|'orgchart'|'capacity'>('roster');
  const [productivityOpen, setProductivityOpen] = useState(false);

  // Search & filters -- new, since the roster is no longer a short hand-picked list; it's everyone.
  const [q, setQ] = useState('');
  const [fDept, setFDept] = useState('');
  const [fRole, setFRole] = useState('');
  const [fLevel, setFLevel] = useState('');
  const [fBand, setFBand] = useState('');
  const roleOpts = useMemo(() => Array.from(new Set(team.map((m:any)=>m.role).filter(Boolean))).sort(), [team]);
  const deptOptsPresent = useMemo(() => Array.from(new Set(team.map((m:any)=>m.dept).filter(Boolean))).sort(), [team]);
  const levelOpts = useMemo(() => S.HIERARCHY_LEVELS.filter(l=>team.some((m:any)=>m.level===l)), [team]);
  const filteredTeam = useMemo(() => team.filter((m:any) => {
    if(q && !m.name.toLowerCase().includes(q.toLowerCase())) return false;
    if(fDept && m.dept!==fDept) return false;
    if(fRole && m.role!==fRole) return false;
    if(fLevel && m.level!==fLevel) return false;
    if(fBand && UTIL_BAND(m.util)!==fBand) return false;
    return true;
  }), [team, q, fDept, fRole, fLevel, fBand]);
  const filtersActive = !!(q || fDept || fRole || fLevel || fBand);
  const clearFilters = () => { setQ(''); setFDept(''); setFRole(''); setFLevel(''); setFBand(''); };

  const avgUtil = team.length ? Math.round(team.reduce((a:number,m:any)=>a+m.util,0)/team.length) : 0;
  const avgAvail = team.length ? Math.round(team.reduce((a:number,m:any)=>a+(Number(String(m.avail).replace('%',''))||0),0)/team.length) : 0;
  const overloaded = team.filter((m:any)=>m.util>90);

  const setDept = (id:string, dept:string) => { if(!canEdit) return; patchAdmin('users', (us:any[]) => us.map(u=>u.id===id?{...u,dept}:u)); const m=team.find((x:any)=>x.id===id); logActivity({ module:'Team Management', action:`Updated ${m?.name||id}'s department to "${dept}"` }); };
  const setCapacity = (id:string, capacity:string) => { if(!canEdit) return; patchAdmin('users', (us:any[]) => us.map(u=>u.id===id?{...u,capacity}:u)); const m=team.find((x:any)=>x.id===id); logActivity({ module:'Team Management', action:`Updated ${m?.name||id}'s weekly capacity to "${capacity}"` }); };

  // Team Productivity — benchmarks come from Administration -> Team Productivity (keyed by the
  // teammate's Users id, which every team[] entry now carries directly); every actual below is
  // derived live from Project Master + Phase Management, the same way the rest of the app computes
  // its numbers — nothing here is typed in by hand. Three aspects: how reliably someone's own
  // deliverables land on time, how many active projects they're carrying at once (ideally two), and
  // how reliably their work clears client sign-off on time. A member is "on" a project if they appear
  // anywhere in that project's team[] (Project Master -> Project Team); a milestone/sub task is
  // "theirs" if their name is in its assignees[] (Phase Management).
  const CATEGORY_TIERS = (settings.categories && settings.categories.length) ? settings.categories : S.DEFAULT_PROJECT_SETTINGS.categories;
  const projectsFor = (name:string) => projects.filter((p:any)=>name && (p.team||[]).some((t:any)=>t.name===name));
  // Every milestone + sub task across every project, flattened once (not once per team member) --
  // same pattern Dashboard.tsx's own tree flatten uses, memoized for the same reason (avoid
  // rebuilding this on every Realtime event from any teammate's edit anywhere in the tenant). Also
  // the basis for the Capacity Planning forecast below.
  const allItems = useMemo(() => {
    const out: any[] = [];
    projects.forEach((p:any) => {
      (tree[p.id]||[]).forEach((ph:any) => {
        (ph.milestones||[]).forEach((ms:any) => {
          out.push(ms);
          (ms.subtasks||[]).forEach((s:any) => out.push(s));
        });
      });
    });
    return out;
  }, [tree, projects]);
  const itemsAssignedTo = (name:string) => allItems.filter((it:any)=>(it.assignees||[]).includes(name));
  const productivityFor = (m:any) => {
    // 1) On-Time Deliverable Completion — of this person's own items that are actually done (approved,
    // with both a deadline and a completion date logged), what share finished on or before deadline.
    const mine = itemsAssignedTo(m.name);
    const doneWithDates = mine.filter((it:any)=>S.isApproved(it) && it.deadline && it.actualDate);
    const onTimeCount = doneWithDates.filter((it:any)=>it.actualDate<=it.deadline).length;
    const onTimePct = doneWithDates.length ? Math.round(onTimeCount/doneWithDates.length*100) : null;
    // 2) Projects Handling at a Time — current active-project count, already computed live in `team`.
    const concurrentProjects = m.activeProjectCount;
    // 3) On-Time Client Sign-off — of this person's own items the client has actually signed off on
    // (clientApprovedImpl, via the Client Portal), what share were signed off on or before deadline.
    const signedOff = mine.filter((it:any)=>it.clientApprovedImpl && it.deadline && it.clientAcceptedDate);
    const signedOffOnTime = signedOff.filter((it:any)=>it.clientAcceptedDate<=it.deadline).length;
    const clientSignoffPct = signedOff.length ? Math.round(signedOffOnTime/signedOff.length*100) : null;
    const bench = { ...S.DEFAULT_PRODUCTIVITY_BENCHMARK, ...((m.id && (admin.productivity||{})[m.id]) || {}) };
    return {
      onTimeDelivery: { benchmark:bench.onTimeDelivery, actual:onTimePct },
      concurrentProjects: { benchmark:bench.concurrentProjects, actual:concurrentProjects },
      onTimeClientSignoff: { benchmark:bench.onTimeClientSignoff, actual:clientSignoffPct },
    };
  };
  const pctFmt = (v:any) => `${v}%`;

  // Capacity Planning — forward-looking load per person for the next 6 weeks, built from each
  // person's own open (not-yet-approved) assigned milestones/sub tasks, bucketed by which week their
  // deadline falls in. Genuinely new: unlike the old single-number "headroom" report, this shows
  // *when* someone gets stretched, not just how stretched they are right now.
  const WEEKS = 6;
  const weeks = useMemo(() => Array.from({length:WEEKS}, (_,i) => ({
    start: S.addDays(S.TODAY_ISO, i*7),
    end: S.addDays(S.TODAY_ISO, i*7+6),
  })), []);
  const loadFor = (name:string, weekIdx:number) => {
    const w = weeks[weekIdx];
    return itemsAssignedTo(name).filter((it:any)=>!S.isApproved(it) && it.deadline && it.deadline>=w.start && it.deadline<=w.end).length;
  };
  const loadCellCls = (n:number) => n===0?'bg-slate-50 text-slate-300':n<=2?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700';

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <S.SectionTitle sub="Consultants, associates, managers, partners — roles, utilization & capacity">Team Management</S.SectionTitle>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            <button onClick={()=>setTab('roster')} title="Roster" className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors ${tab==='roster'?'bg-white text-brand-700 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
              <S.Icon name="list" className="w-3.5 h-3.5"/> Roster
            </button>
            <button onClick={()=>setTab('orgchart')} title="Org Chart" className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors ${tab==='orgchart'?'bg-white text-brand-700 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
              <S.Icon name="grid" className="w-3.5 h-3.5"/> Org Chart
            </button>
            <button onClick={()=>setTab('capacity')} title="Capacity Planning" className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors ${tab==='capacity'?'bg-white text-brand-700 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
              <S.Icon name="calendar" className="w-3.5 h-3.5"/> Capacity Planning
            </button>
          </div>
        </div>
      </div>
      <div className="text-xs text-slate-400 mb-3">Everyone here is a teammate in <Link to="/admin" className="text-brand-600 hover:text-brand-700">Administration → Users</Link> — add, remove or deactivate someone there and it's reflected here automatically.</div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <S.Card className="p-4 text-center"><div className="text-xs text-slate-500">Team Size</div><div className="text-2xl font-bold text-slate-800 mt-1">{team.length}</div></S.Card>
        <S.Card className="p-4 text-center"><div className="text-xs text-slate-500">Avg Utilization</div><div className="text-2xl font-bold text-blue-600 mt-1">{avgUtil}%</div></S.Card>
        <S.Card className="p-4 text-center"><div className="text-xs text-slate-500">Avg Availability</div><div className="text-2xl font-bold text-emerald-600 mt-1">{avgAvail}%</div></S.Card>
        <S.Card className="p-4 text-center"><div className="text-xs text-slate-500">Overloaded (&gt;90%)</div><div className="text-2xl font-bold text-red-600 mt-1">{overloaded.length}</div></S.Card>
      </div>

      {tab==='roster' && (<>
        <S.Card className="p-3 mb-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Search</label>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Name…" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Department</label>
              <select value={fDept} onChange={e=>setFDept(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">All</option>{deptOptsPresent.map((d:any)=><option key={d} value={d}>{d}</option>)}
              </select></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Designation</label>
              <select value={fRole} onChange={e=>setFRole(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">All</option>{roleOpts.map((r:any)=><option key={r} value={r}>{r}</option>)}
              </select></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Level</label>
              <select value={fLevel} onChange={e=>setFLevel(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">All</option>{levelOpts.map((l:any)=><option key={l} value={l}>{l}</option>)}
              </select></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Utilization</label>
              <select value={fBand} onChange={e=>setFBand(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">All</option><option value="healthy">Healthy</option><option value="busy">Busy</option><option value="overloaded">Overloaded</option>
              </select></div>
            {filtersActive && <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5">Clear filters</button>}
            <div className="text-xs text-slate-400 ml-auto self-center">{filteredTeam.length} of {team.length}</div>
          </div>
        </S.Card>

        <S.Card className="overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr><S.Th>Name</S.Th><S.Th>Designation</S.Th><S.Th>Level</S.Th><S.Th>Department</S.Th><S.Th>Utilization</S.Th><S.Th>Availability</S.Th><S.Th>Weekly Capacity</S.Th><S.Th>Status</S.Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTeam.map((m:any)=>(
                <tr key={m.id||m.name} className="hover:bg-slate-50">
                  <S.Td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold shrink-0">{initials(m.name)}</div>
                      <span className="font-medium text-slate-800 whitespace-nowrap">{m.name}</span>
                    </div>
                  </S.Td>
                  <S.Td className="text-slate-600 whitespace-nowrap">{m.role || '—'}</S.Td>
                  <S.Td>{m.level ? <S.Badge cls="bg-violet-50 text-violet-700">{m.level}</S.Badge> : <span className="text-slate-300">—</span>}</S.Td>
                  <S.Td>
                    {canEdit ? (
                      <select aria-label={`Department for ${m.name}`} value={m.dept||''} onChange={e=>setDept(m.id,e.target.value)}
                        className="w-28 border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1.5 py-1 text-sm text-slate-600 focus:outline-none bg-transparent focus:bg-white">
                        <option value="">— Select —</option>
                        {deptOptsFor(m.dept).map(d=><option key={d} value={d}>{d}</option>)}
                      </select>
                    ) : (m.dept || '—')}
                  </S.Td>
                  <S.Td>
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <div className="w-16 h-2 bg-slate-100 rounded-full shrink-0"><div className={`h-2 rounded-full ${utilBarColor(m.util)}`} style={{width:Math.min(100,m.util||0)+'%'}}></div></div>
                      <span className="text-xs text-slate-500">{m.util}%</span>
                    </div>
                  </S.Td>
                  <S.Td className="text-slate-500">{m.avail}</S.Td>
                  <S.Td>
                    {canEdit ? (
                      <input aria-label={`Weekly capacity for ${m.name}`} defaultValue={m.capacity} placeholder="e.g. 40h/wk" onBlur={e=>setCapacity(m.id,e.target.value)}
                        className="w-24 border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1.5 py-1 text-sm text-slate-600 focus:outline-none bg-transparent focus:bg-white"/>
                    ) : (m.capacity || '—')}
                  </S.Td>
                  <S.Td>{m.util>90 ? <S.Badge cls="bg-red-100 text-red-700">Overloaded</S.Badge> : <S.Badge cls="bg-emerald-100 text-emerald-700">Healthy</S.Badge>}</S.Td>
                </tr>
              ))}
              {filteredTeam.length===0 && (
                <tr><td colSpan={8} className="text-center text-sm text-slate-400 py-8">{team.length===0 ? <>No team members yet — add one in <Link to="/admin" className="text-brand-600 hover:text-brand-700">Administration → Users</Link>.</> : 'No one matches these filters.'}</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </S.Card>
      </>)}

      {tab==='orgchart' && (
        // Tiered by Hierarchy Level (L1 = most senior) rather than an individual manager-report tree
        // -- the app doesn't have a "reports to" field on a person, only the L1-L9 seniority tier
        // (Administration -> Users -> Hierarchy Level), so this groups by that, which is the honest
        // shape of the data available.
        <div>
          {levelOpts.length===0 && <div className="text-sm text-slate-400 py-8 text-center">No team members yet.</div>}
          {[...levelOpts].sort((a,b)=>S.levelNum(a)-S.levelNum(b)).map(level=>{
            const members = filteredTeam.filter((m:any)=>m.level===level);
            if(!members.length) return null;
            const designation = S.designationForLevel(level, admin);
            return (
              <div key={level} className="mb-5">
                <div className="flex items-center gap-2 mb-2.5 pb-1.5 border-b border-slate-200">
                  <S.Badge cls="bg-violet-50 text-violet-700">{level}</S.Badge>
                  <span className="font-semibold text-slate-700 text-sm">{designation || 'Unmapped designation'}</span>
                  <S.Badge cls="bg-slate-100 text-slate-500">{members.length} member{members.length===1?'':'s'}</S.Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {members.map((m:any)=>(
                    <S.Card key={m.id||m.name} className="p-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold shrink-0">{initials(m.name)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-800 truncate text-sm">{m.name}</div>
                          <div className="text-xs text-slate-400 truncate">{m.role}{m.dept?` · ${m.dept}`:''}</div>
                        </div>
                        {m.util>90 && <S.Badge cls="bg-red-100 text-red-700 shrink-0">{m.util}%</S.Badge>}
                      </div>
                    </S.Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab==='capacity' && (
        <S.Card className="overflow-hidden">
          <div className="px-4 pt-3 pb-2">
            <div className="font-semibold text-slate-800">Capacity Planning — Next {WEEKS} Weeks</div>
            <div className="text-xs text-slate-400 mt-0.5">Count of each person's own open (not yet approved) milestones/sub tasks whose deadline falls in that week — where the load is coming from, not just how stretched someone is right now.</div>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <S.Th>Name</S.Th>
                {weeks.map((w,i)=><S.Th key={i}>{w.start.slice(5)} – {w.end.slice(5)}</S.Th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTeam.map((m:any)=>(
                <tr key={m.id||m.name} className="hover:bg-slate-50">
                  <S.Td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[11px] font-semibold shrink-0">{initials(m.name)}</div>
                      <span className="font-medium text-slate-800 whitespace-nowrap">{m.name}</span>
                    </div>
                  </S.Td>
                  {weeks.map((w,i)=>{ const n = loadFor(m.name, i); return (
                    <S.Td key={i}><div className={`text-center rounded px-2 py-1 text-xs font-medium ${loadCellCls(n)}`}>{n||'—'}</div></S.Td>
                  );})}
                </tr>
              ))}
              {filteredTeam.length===0 && (
                <tr><td colSpan={WEEKS+1} className="text-center text-sm text-slate-400 py-8">No team members yet.</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </S.Card>
      )}

      {/* Team Productivity — benchmarks set in Administration -> Team Productivity, actuals computed
          live from Project Master + Phase Management (see productivityFor above). Collapsible — click
          the header to expand/collapse; open by default. */}
      <S.Card className="overflow-hidden mt-5">
        <button onClick={()=>setProductivityOpen(o=>!o)} className="w-full flex items-center justify-between gap-2 px-4 pt-3 pb-2 text-left">
          <div>
            <div className="font-semibold text-slate-800 inline-flex items-center gap-1.5">
              <span className="text-slate-400 text-xs w-3 inline-block">{productivityOpen?'▼':'▶'}</span>
              Team Productivity — Benchmarks vs Actuals
            </div>
            <div className="text-xs text-slate-400 mt-0.5">Benchmarks are set in Administration → Team Productivity. Actuals are live — on-time % is measured against each person's own assigned milestones/sub tasks in Phase Management, and current project load comes from Project Master (a Premium-tier project counts as two).</div>
          </div>
        </button>
        {productivityOpen && (
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr><S.Th>Name</S.Th><S.Th>On-Time Deliverable Completion</S.Th><S.Th>Projects Handling at a Time</S.Th><S.Th>On-Time Client Sign-off</S.Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {team.map((m:any)=>{
              const p = productivityFor(m);
              return (
                <tr key={m.id||m.name} className="hover:bg-slate-50">
                  <S.Td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[11px] font-semibold shrink-0">{initials(m.name)}</div>
                      <span className="font-medium text-slate-800 whitespace-nowrap">{m.name}</span>
                    </div>
                  </S.Td>
                  <S.Td><MetricCell actual={p.onTimeDelivery.actual} benchmark={p.onTimeDelivery.benchmark} fmt={pctFmt}/></S.Td>
                  <S.Td><MetricCell actual={p.concurrentProjects.actual} benchmark={p.concurrentProjects.benchmark} lowerIsBetter/></S.Td>
                  <S.Td><MetricCell actual={p.onTimeClientSignoff.actual} benchmark={p.onTimeClientSignoff.benchmark} fmt={pctFmt}/></S.Td>
                </tr>
              );
            })}
            {team.length===0 && (
              <tr><td colSpan={4} className="text-center text-sm text-slate-400 py-8">Add team members in Administration → Users to see productivity benchmarks.</td></tr>
            )}
          </tbody>
        </table>
        </div>
        )}
      </S.Card>
    </div>
  );
}

// Client-facing page. Deliberately minimal per spec: a pipeline of items awaiting the Client
// Owner's sign-off (only reachable once the Project Head has already approved them), plus a
// read-only, phase-wise timeline showing nothing but name / deadline / status at every level.
