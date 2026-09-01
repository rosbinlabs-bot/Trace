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
const BAND_META: any = {
  healthy: { label:'Healthy', dot:'bg-emerald-500', badge:'bg-emerald-100 text-emerald-700' },
  busy: { label:'Busy', dot:'bg-amber-500', badge:'bg-amber-100 text-amber-700' },
  overloaded: { label:'Overloaded', dot:'bg-red-500', badge:'bg-red-100 text-red-700' },
};

export default function Team(){
  // Team is now a live, computed roster (S.computeTeamRoster in shared.tsx) -- every non-Client
  // Administration -> Users record, decorated with utilization/availability derived from real active
  // project assignments. There's no add/remove step here any more: membership follows Users
  // automatically. Add/remove/deactivate a person from Administration -> Users; Department and Weekly
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

  // Three ways to look at the same live roster, all landing on the same underlying data --
  // "Unified Roster" (a flat table, click a row to expand its detail beneath it in place),
  // "Workload Board" (grouped by how stretched someone is, click a card for a side panel), and
  // "Directory" (a person list with one person's full picture always visible alongside it). Chosen
  // over picking a single one -- each answers a different question ("scan everyone" vs. "who has
  // room for this" vs. "tell me about this one person") and none of them replaces the others.
  const [tab, setTab] = useState<'roster'|'board'|'directory'>('roster');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id:string) => setExpandedIds(s => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const [drawerId, setDrawerId] = useState<string|null>(null);
  const [dirId, setDirId] = useState<string|null>(null);

  // Search & filters -- shared across all three views, since the roster is no longer a short
  // hand-picked list; it's everyone.
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
  const activeProjectNames = (name:string) => projectsFor(name).filter((p:any)=>p.status==='In Progress').map((p:any)=>p.name);
  // Every milestone + sub task across every project, flattened once (not once per team member) --
  // same pattern Dashboard.tsx's own tree flatten uses, memoized for the same reason (avoid
  // rebuilding this on every Realtime event from any teammate's edit anywhere in the tenant). Also
  // the basis for the 6-week forecast in each person's detail panel below.
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

  // 6-week forward load per person, built from each person's own open (not-yet-approved) assigned
  // milestones/sub tasks, bucketed by which week their deadline falls in -- surfaced in every
  // person's detail panel below (not a separate tab) so it's always one click away, not a whole
  // extra screen.
  const WEEKS = 6;
  const weeks = useMemo(() => Array.from({length:WEEKS}, (_,i) => ({
    start: S.addDays(S.TODAY_ISO, i*7),
    end: S.addDays(S.TODAY_ISO, i*7+6),
  })), []);
  const loadFor = (name:string, weekIdx:number) => {
    const w = weeks[weekIdx];
    return itemsAssignedTo(name).filter((it:any)=>!S.isApproved(it) && it.deadline && it.deadline>=w.start && it.deadline<=w.end).length;
  };

  // Shared detail content -- active projects, 6-week forecast, productivity vs. benchmark -- used by
  // all three views (the Unified Roster's expanded row, the Workload Board's side panel, and the
  // Directory's detail pane) so a person's "full picture" always looks the same wherever it's opened.
  const PersonDetail = ({ m }: any) => {
    const names = activeProjectNames(m.name);
    const p = productivityFor(m);
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">Active Projects</div>
          <div className="flex flex-wrap gap-1.5">
            {names.length ? names.map((n:string)=><span key={n} className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1">{n}</span>) : <span className="text-xs text-slate-300">None right now</span>}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">Next {WEEKS} Weeks</div>
          <div className="flex items-end gap-1.5 h-10">
            {weeks.map((w:any,i:number)=>{ const n = loadFor(m.name,i); const h = 8+n*7; const cls = n===0?'bg-slate-200':n<=2?'bg-amber-400':'bg-red-500'; return (
              <div key={i} title={`${w.start.slice(5)} – ${w.end.slice(5)}: ${n} due`} className={`w-3.5 rounded-t ${cls}`} style={{height:h}}></div>
            );})}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">Productivity</div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-500">On-Time Delivery</span><MetricCell actual={p.onTimeDelivery.actual} benchmark={p.onTimeDelivery.benchmark} fmt={pctFmt}/></div>
            <div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-500">Concurrent Projects</span><MetricCell actual={p.concurrentProjects.actual} benchmark={p.concurrentProjects.benchmark} lowerIsBetter/></div>
            <div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-500">On-Time Sign-off</span><MetricCell actual={p.onTimeClientSignoff.actual} benchmark={p.onTimeClientSignoff.benchmark} fmt={pctFmt}/></div>
          </div>
        </div>
      </div>
    );
  };

  const drawerPerson = drawerId ? team.find((m:any)=>m.id===drawerId) : null;
  const dirPerson = (dirId && filteredTeam.some((m:any)=>m.id===dirId)) ? filteredTeam.find((m:any)=>m.id===dirId) : filteredTeam[0];

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <S.SectionTitle sub="Consultants, associates, managers, partners — roles, utilization & capacity">Team Management</S.SectionTitle>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 shrink-0">
          <button onClick={()=>setTab('roster')} title="Unified Roster" className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors ${tab==='roster'?'bg-white text-brand-700 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
            <S.Icon name="list" className="w-3.5 h-3.5"/> Unified Roster
          </button>
          <button onClick={()=>setTab('board')} title="Workload Board" className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors ${tab==='board'?'bg-white text-brand-700 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
            <S.Icon name="grid" className="w-3.5 h-3.5"/> Workload Board
          </button>
          <button onClick={()=>setTab('directory')} title="Directory" className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors ${tab==='directory'?'bg-white text-brand-700 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
            <S.Icon name="userplus" className="w-3.5 h-3.5"/> Directory
          </button>
        </div>
      </div>
      <div className="text-xs text-slate-400 mb-3">Everyone here is a teammate in <Link to="/admin" className="text-brand-600 hover:text-brand-700">Administration → Users</Link> — add, remove or deactivate someone there and it's reflected here automatically.</div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <S.Card className="p-4 text-center"><div className="text-xs text-slate-500">Team Size</div><div className="text-2xl font-bold text-slate-800 mt-1">{team.length}</div></S.Card>
        <S.Card className="p-4 text-center"><div className="text-xs text-slate-500">Avg Utilization</div><div className="text-2xl font-bold text-blue-600 mt-1">{avgUtil}%</div></S.Card>
        <S.Card className="p-4 text-center"><div className="text-xs text-slate-500">Avg Availability</div><div className="text-2xl font-bold text-emerald-600 mt-1">{avgAvail}%</div></S.Card>
        <S.Card className="p-4 text-center"><div className="text-xs text-slate-500">Overloaded (&gt;90%)</div><div className="text-2xl font-bold text-red-600 mt-1">{overloaded.length}</div></S.Card>
      </div>

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

      {/* ================= Unified Roster — click a row to expand its detail in place ================= */}
      {tab==='roster' && (
        <S.Card className="overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr><S.Th></S.Th><S.Th>Name</S.Th><S.Th>Designation</S.Th><S.Th>Level</S.Th><S.Th>Department</S.Th><S.Th>Utilization</S.Th><S.Th>Availability</S.Th><S.Th>Weekly Capacity</S.Th><S.Th>Status</S.Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTeam.map((m:any)=>{
                const open = expandedIds.has(m.id||m.name);
                return (
                <React.Fragment key={m.id||m.name}>
                  <tr className="hover:bg-slate-50">
                    <S.Td>
                      <button onClick={()=>toggleExpanded(m.id||m.name)} aria-expanded={open} aria-label={`${open?'Collapse':'Expand'} ${m.name}`} className="text-slate-400 hover:text-brand-600 w-5 h-5 flex items-center justify-center">
                        <span className="text-[10px]">{open?'▼':'▶'}</span>
                      </button>
                    </S.Td>
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
                    <S.Td><S.Badge cls={BAND_META[UTIL_BAND(m.util)].badge}>{BAND_META[UTIL_BAND(m.util)].label}</S.Badge></S.Td>
                  </tr>
                  {open && (
                    <tr className="bg-slate-50/70">
                      <td></td>
                      <td colSpan={8} className="px-4 py-3.5"><PersonDetail m={m}/></td>
                    </tr>
                  )}
                </React.Fragment>
                );
              })}
              {filteredTeam.length===0 && (
                <tr><td colSpan={9} className="text-center text-sm text-slate-400 py-8">{team.length===0 ? <>No team members yet — add one in <Link to="/admin" className="text-brand-600 hover:text-brand-700">Administration → Users</Link>.</> : 'No one matches these filters.'}</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </S.Card>
      )}

      {/* ================= Workload Board — grouped by headroom, click a card for the side panel ================= */}
      {tab==='board' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['healthy','busy','overloaded'] as const).map(bandKey=>{
            const members = filteredTeam.filter((m:any)=>UTIL_BAND(m.util)===bandKey);
            const meta = BAND_META[bandKey];
            return (
              <S.Card key={bandKey} className="p-3">
                <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-slate-100">
                  <span className={`w-2 h-2 rounded-full ${meta.dot}`}></span>
                  <span className="font-semibold text-slate-700 text-sm">{meta.label}</span>
                  <span className="text-xs text-slate-400 ml-auto">{members.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {members.map((m:any)=>(
                    <button key={m.id||m.name} onClick={()=>setDrawerId(m.id)} className="text-left bg-slate-50 hover:border-brand-300 border border-slate-100 rounded-xl p-2.5 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[11px] font-semibold shrink-0">{initials(m.name)}</div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{m.name}</div>
                          <div className="text-[11px] text-slate-400 truncate">{m.role}{m.dept?` · ${m.dept}`:''}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full"><div className={`h-1.5 rounded-full ${utilBarColor(m.util)}`} style={{width:Math.min(100,m.util||0)+'%'}}></div></div>
                        <span className="text-[11px] text-slate-500 shrink-0">{m.util}%</span>
                      </div>
                    </button>
                  ))}
                  {members.length===0 && <div className="text-xs text-slate-300 text-center py-4">Nobody here</div>}
                </div>
              </S.Card>
            );
          })}
        </div>
      )}

      {/* Workload Board side panel */}
      {tab==='board' && drawerPerson && (
        <>
          <div onClick={()=>setDrawerId(null)} className="fixed inset-0 bg-slate-900/30 z-30"></div>
          <div className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white border-l border-slate-200 shadow-xl z-40 overflow-y-auto">
            <div className="p-4 border-b border-slate-100 flex items-start gap-3">
              <div className="w-11 h-11 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold shrink-0">{initials(drawerPerson.name)}</div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-800">{drawerPerson.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">{drawerPerson.role} · {drawerPerson.level || '—'} · {drawerPerson.dept || 'No department'}</div>
              </div>
              <S.Badge cls={BAND_META[UTIL_BAND(drawerPerson.util)].badge}>{BAND_META[UTIL_BAND(drawerPerson.util)].label}</S.Badge>
              <button onClick={()=>setDrawerId(null)} aria-label="Close" className="text-slate-400 hover:text-slate-600 w-6 h-6 flex items-center justify-center shrink-0">✕</button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400 uppercase tracking-wide">Department</label>
                  {canEdit ? (
                    <select value={drawerPerson.dept||''} onChange={e=>setDept(drawerPerson.id,e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                      <option value="">— Select —</option>
                      {deptOptsFor(drawerPerson.dept).map((d:any)=><option key={d} value={d}>{d}</option>)}
                    </select>
                  ) : <div className="text-sm font-medium text-slate-700">{drawerPerson.dept || '—'}</div>}
                </div>
                <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400 uppercase tracking-wide">Weekly Capacity</label>
                  {canEdit ? (
                    <input defaultValue={drawerPerson.capacity} onBlur={e=>setCapacity(drawerPerson.id,e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                  ) : <div className="text-sm font-medium text-slate-700">{drawerPerson.capacity || '—'}</div>}
                </div>
                <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400 uppercase tracking-wide">Utilization</label><div className="text-sm font-semibold text-slate-700">{drawerPerson.util}%</div></div>
                <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400 uppercase tracking-wide">Availability</label><div className="text-sm font-semibold text-slate-700">{drawerPerson.avail}</div></div>
              </div>
              <PersonDetail m={drawerPerson}/>
            </div>
          </div>
        </>
      )}

      {/* ================= Directory — a person list with the full picture always alongside it ================= */}
      {tab==='directory' && (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-3 items-start">
          <S.Card className="overflow-hidden">
            {filteredTeam.map((m:any)=>(
              <button key={m.id||m.name} onClick={()=>setDirId(m.id)}
                className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 border-b border-slate-50 last:border-b-0 transition-colors ${dirPerson && (dirPerson.id===m.id) ? 'bg-brand-50 border-l-2 border-l-brand-500' : 'hover:bg-slate-50 border-l-2 border-l-transparent'}`}>
                <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[11px] font-semibold shrink-0">{initials(m.name)}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 truncate">{m.name}</div>
                  <div className="text-[11px] text-slate-400 truncate">{m.role}</div>
                </div>
                <span className={`w-2 h-2 rounded-full shrink-0 ${BAND_META[UTIL_BAND(m.util)].dot}`}></span>
              </button>
            ))}
            {filteredTeam.length===0 && <div className="text-center text-sm text-slate-400 py-8 px-3">No one matches these filters.</div>}
          </S.Card>

          {dirPerson ? (
            <S.Card className="p-4">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100 mb-4">
                <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-base font-semibold shrink-0">{initials(dirPerson.name)}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800 text-base">{dirPerson.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{dirPerson.role} · {dirPerson.level || '—'}</div>
                </div>
                <S.Badge cls={BAND_META[UTIL_BAND(dirPerson.util)].badge}>{BAND_META[UTIL_BAND(dirPerson.util)].label}</S.Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400 uppercase tracking-wide">Department</label>
                  {canEdit ? (
                    <select value={dirPerson.dept||''} onChange={e=>setDept(dirPerson.id,e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                      <option value="">— Select —</option>
                      {deptOptsFor(dirPerson.dept).map((d:any)=><option key={d} value={d}>{d}</option>)}
                    </select>
                  ) : <div className="text-sm font-medium text-slate-700">{dirPerson.dept || '—'}</div>}
                </div>
                <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400 uppercase tracking-wide">Weekly Capacity</label>
                  {canEdit ? (
                    <input defaultValue={dirPerson.capacity} onBlur={e=>setCapacity(dirPerson.id,e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                  ) : <div className="text-sm font-medium text-slate-700">{dirPerson.capacity || '—'}</div>}
                </div>
                <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400 uppercase tracking-wide">Utilization</label><div className="text-sm font-semibold text-slate-700">{dirPerson.util}%</div></div>
                <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400 uppercase tracking-wide">Availability</label><div className="text-sm font-semibold text-slate-700">{dirPerson.avail}</div></div>
              </div>
              <PersonDetail m={dirPerson}/>
            </S.Card>
          ) : (
            <S.Card className="p-8 text-center text-sm text-slate-400">No one matches these filters.</S.Card>
          )}
        </div>
      )}

    </div>
  );
}

// Client-facing page. Deliberately minimal per spec: a pipeline of items awaiting the Client
// Owner's sign-off (only reachable once the Project Head has already approved them), plus a
// read-only, phase-wise timeline showing nothing but name / deadline / status at every level.
