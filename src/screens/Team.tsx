import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

// Benchmark vs actual for one Team Productivity metric — green + filled bar once the actual meets
// or exceeds the benchmark (or, for a not-yet-benchmarked metric, once there's any actual at all),
// amber otherwise. Kept outside Team() since it doesn't need anything from that closure.
const MetricCell = ({ actual, benchmark, fmt }: any) => {
  const met = benchmark>0 ? actual>=benchmark : actual>0;
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

export default function Team(){
  const { team, setTeam } = React.useContext(S.TeamDataContext);
  const { admin } = React.useContext(S.AdminDataContext);
  const { settings } = React.useContext(S.SettingsContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { invoices } = React.useContext(S.InvoicesDataContext);
  // Only Admin/Super Admin can permanently remove a team member's roster entry.
  const { role } = React.useContext(S.RoleContext);
  const canDelete = role==='admin';
  // Department Master (Administration -> Project Settings -> Masters -> Department Master) is the
  // single source of truth for department names now, so two people can't add the same department
  // spelled two different ways ("Delivery" vs "delivery"). If a member already has a dept value from
  // before this list existed, or one outside the master list, it's kept as a selectable option too
  // rather than silently dropped.
  const DEPT_OPTS = (settings.departments && settings.departments.length) ? settings.departments : S.DEFAULT_PROJECT_SETTINGS.departments;
  const deptOptsFor = (current) => (current && !DEPT_OPTS.includes(current)) ? [...DEPT_OPTS, current] : DEPT_OPTS;
  // List view is the default per product decision — grid stays available as a toggle.
  const [view, setView] = useState('list');
  const [adding, setAdding] = useState(false);
  const blankDraft: any = { name:'', role:'', dept:'', util:0, avail:'', capacity:'40h/wk' };
  const [draft, setDraft] = useState<any>(blankDraft);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [productivityOpen, setProductivityOpen] = useState(false);
  const avgUtil = team.length ? Math.round(team.reduce((a,m)=>a+m.util,0)/team.length) : 0;
  const avgAvail = team.length ? Math.round(team.reduce((a,m)=>a+(Number(String(m.avail).replace('%',''))||0),0)/team.length) : 0;
  const overloaded = team.filter(m=>m.util>90);
  const deptGroups: any = {};
  team.forEach(m=>{ (deptGroups[m.dept]=deptGroups[m.dept]||[]).push(m); });
  const depts = Object.entries(deptGroups).sort((a:any,b:any)=>b[1].length-a[1].length);
  const initials = (name) => name.split(' ').map(x=>x[0]).join('');
  const utilBarColor = (u) => u>90?'bg-red-500':u>75?'bg-amber-500':'bg-emerald-500';

  // Pick from the people already added in Administration -> Users, instead of retyping a name —
  // selecting one pre-fills their designation as a starting Role; everything else (department,
  // utilization, availability, capacity) is left blank/default and can be edited inline in the
  // table right after adding.
  const availableUsers = (admin.users||[]).filter((u:any) => u.type!=='Client' && !team.some(m=>m.name===u.name));
  const pickUser = (name) => {
    const u = availableUsers.find((x:any)=>x.name===name);
    setDraft(d => ({ ...d, name: name||'', role: u ? u.designation : d.role }));
  };

  const addMember = () => {
    const name = draft.name.trim();
    if(!name || team.some(m=>m.name.toLowerCase()===name.toLowerCase())) return;
    setTeam(ts => [...ts, { ...draft, name, util:Number(draft.util)||0 }]);
    setDraft(blankDraft); setAdding(false);
  };
  const removeMember = (name) => { if(!canDelete) return; setTeam(ts => ts.filter(m=>m.name!==name)); setConfirmRemove(null); };
  const patchMember = (name, key, val) => setTeam(ts => ts.map(m => m.name===name ? { ...m, [key]: key==='util' ? (Number(val)||0) : val } : m));

  // Team Productivity — benchmarks come from Administration -> Team Productivity (keyed by the
  // teammate's Users id); every actual below is derived live from Project Master + Billing Tracker,
  // the same way the rest of the app computes its numbers — nothing here is typed in by hand. A
  // member is "on" a project if they appear anywhere in that project's team[] (Project Master ->
  // Project Team, hierarchy-level based — replaces the old 4 fixed named-role fields); a Premium-tier
  // project counts as TWO projects toward the "No. of Projects" actual (S.projectWeight), everything
  // else counts it once.
  const usersByName: any = {};
  (admin.users||[]).forEach((u:any)=>{ usersByName[u.name]=u; });
  const CATEGORY_TIERS = (settings.categories && settings.categories.length) ? settings.categories : S.DEFAULT_PROJECT_SETTINGS.categories;
  const projectsFor = (name:string) => projects.filter((p:any)=>name && (p.team||[]).some((t:any)=>t.name===name));
  const productivityFor = (m:any) => {
    const mine = projectsFor(m.name);
    const actualProjects = mine.reduce((a:number,p:any)=>a+S.projectWeight(p, CATEGORY_TIERS), 0);
    const colleagues = new Set();
    mine.forEach((p:any)=>{ (p.team||[]).forEach((t:any)=>{ if(t.name && t.name!==m.name) colleagues.add(t.name); }); });
    const actualBilling = mine.reduce((a:number,p:any)=>a+S.projInvoicedRevenue(p, invoices), 0);
    const actualVisits = mine.length ? Math.round((mine.reduce((a:number,p:any)=>a+(Number(p.visitsMonth)||0),0)/mine.length)*10)/10 : 0;
    const u = usersByName[m.name];
    const bench = { ...S.DEFAULT_PRODUCTIVITY_BENCHMARK, ...((u && (admin.productivity||{})[u.id]) || {}) };
    return {
      projects: { benchmark:bench.projects, actual:actualProjects },
      teamSize: { benchmark:bench.teamSize, actual:colleagues.size },
      billingTarget: { benchmark:bench.billingTarget, actual:actualBilling },
      onsiteVisits: { benchmark:bench.onsiteVisits, actual:actualVisits },
    };
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <S.SectionTitle sub="Consultants, associates, managers, partners — roles, utilization & capacity">Team Management</S.SectionTitle>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={()=>setAdding(a=>!a)} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-2 whitespace-nowrap inline-flex items-center gap-1.5"><S.Icon name="userplus" className="w-3.5 h-3.5"/> Add Team Member</button>
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            <button onClick={()=>setView('list')} title="List view" className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors ${view==='list'?'bg-white text-brand-700 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
              <S.Icon name="list" className="w-3.5 h-3.5"/> List
            </button>
            <button onClick={()=>setView('grid')} title="Grid view" className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors ${view==='grid'?'bg-white text-brand-700 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
              <S.Icon name="grid" className="w-3.5 h-3.5"/> Grid
            </button>
          </div>
        </div>
      </div>

      {adding && (
        <S.Card className="p-3 mb-4 border-2 border-dashed border-brand-300 bg-brand-50/30">
          <div className="text-xs text-slate-500 mb-2">Pick someone already added in Administration → Users. Their designation fills in as a starting Role — department, utilization, availability and capacity can be filled in afterwards, right in the table below.</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 items-end">
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Name</label>
              {availableUsers.length>0 ? (
                <select value={draft.name} onChange={e=>pickUser(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">— Select —</option>
                  {availableUsers.map((u:any)=><option key={u.id} value={u.name}>{u.name} · {u.designation}</option>)}
                </select>
              ) : (
                <input value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} placeholder="Full name" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
              )}
            </div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Role</label>
              <input value={draft.role} onChange={e=>setDraft(d=>({...d,role:e.target.value}))} placeholder="e.g. Project Manager" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Department</label>
              <select value={draft.dept} onChange={e=>setDraft(d=>({...d,dept:e.target.value}))} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">— Select —</option>
                {deptOptsFor(draft.dept).map(d=><option key={d} value={d}>{d}</option>)}
              </select></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Utilization %</label>
              <input type="text" inputMode="numeric" pattern="[0-9]*" value={draft.util} onChange={e=>setDraft(d=>({...d,util:e.target.value.replace(/[^0-9]/g,'')}))} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Availability</label>
              <input value={draft.avail} onChange={e=>setDraft(d=>({...d,avail:e.target.value}))} placeholder="e.g. 30%" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Capacity</label>
              <input value={draft.capacity} onChange={e=>setDraft(d=>({...d,capacity:e.target.value}))} placeholder="e.g. 40h/wk" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
          </div>
          <div className="flex gap-1.5 mt-2">
            <button onClick={addMember} disabled={!draft.name.trim()} className="text-xs bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white rounded-lg px-3 py-2">Add</button>
            <button onClick={()=>{setAdding(false);setDraft(blankDraft);}} className="text-xs border border-slate-200 text-slate-500 rounded-lg px-3 py-2 hover:bg-slate-50">Cancel</button>
            {availableUsers.length>1 && (
              <button onClick={()=>{ setTeam(ts => [...ts, ...availableUsers.map((u:any)=>({ name:u.name, role:u.designation, dept:'', util:0, avail:'', capacity:'40h/wk' }))]); setAdding(false); setDraft(blankDraft); }}
                className="text-xs border border-brand-300 text-brand-700 rounded-lg px-3 py-2 hover:bg-brand-50 ml-auto">Add all {availableUsers.length} remaining users</button>
            )}
          </div>
        </S.Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 mt-3">
        <S.Card className="p-4 text-center"><div className="text-xs text-slate-500">Team Size</div><div className="text-2xl font-bold text-slate-800 mt-1">{team.length}</div></S.Card>
        <S.Card className="p-4 text-center"><div className="text-xs text-slate-500">Avg Utilization</div><div className="text-2xl font-bold text-blue-600 mt-1">{avgUtil}%</div></S.Card>
        <S.Card className="p-4 text-center"><div className="text-xs text-slate-500">Avg Availability</div><div className="text-2xl font-bold text-emerald-600 mt-1">{avgAvail}%</div></S.Card>
        <S.Card className="p-4 text-center"><div className="text-xs text-slate-500">Overloaded (&gt;90%)</div><div className="text-2xl font-bold text-red-600 mt-1">{overloaded.length}</div></S.Card>
      </div>

      {view==='list' ? (
        <S.Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr><S.Th>Name</S.Th><S.Th>Role</S.Th><S.Th>Department</S.Th><S.Th>Utilization</S.Th><S.Th>Availability</S.Th><S.Th>Capacity</S.Th><S.Th>Status</S.Th><S.Th>Actions</S.Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {team.map(m=>(
                <tr key={m.name} className="hover:bg-slate-50">
                  <S.Td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold shrink-0">{initials(m.name)}</div>
                      <span className="font-medium text-slate-800 whitespace-nowrap">{m.name}</span>
                    </div>
                  </S.Td>
                  <S.Td>
                    <input defaultValue={m.role} placeholder="e.g. Project Manager" onBlur={e=>patchMember(m.name,'role',e.target.value)}
                      className="w-32 border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1.5 py-1 text-sm text-slate-600 focus:outline-none bg-transparent focus:bg-white"/>
                  </S.Td>
                  <S.Td>
                    <select value={m.dept||''} onChange={e=>patchMember(m.name,'dept',e.target.value)}
                      className="w-28 border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1.5 py-1 text-sm text-slate-600 focus:outline-none bg-transparent focus:bg-white">
                      <option value="">— Select —</option>
                      {deptOptsFor(m.dept).map(d=><option key={d} value={d}>{d}</option>)}
                    </select>
                  </S.Td>
                  <S.Td>
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <div className="w-16 h-2 bg-slate-100 rounded-full shrink-0"><div className={`h-2 rounded-full ${utilBarColor(m.util)}`} style={{width:Math.min(100,m.util||0)+'%'}}></div></div>
                      <input type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={m.util} onBlur={e=>patchMember(m.name,'util',e.target.value.replace(/[^0-9]/g,''))}
                        className="w-12 border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1 py-1 text-xs text-slate-500 focus:outline-none bg-transparent focus:bg-white"/>
                      <span className="text-xs text-slate-400">%</span>
                    </div>
                  </S.Td>
                  <S.Td>
                    <input defaultValue={m.avail} placeholder="e.g. 30%" onBlur={e=>patchMember(m.name,'avail',e.target.value)}
                      className="w-20 border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1.5 py-1 text-sm text-slate-600 focus:outline-none bg-transparent focus:bg-white"/>
                  </S.Td>
                  <S.Td>
                    <input defaultValue={m.capacity} placeholder="e.g. 40h/wk" onBlur={e=>patchMember(m.name,'capacity',e.target.value)}
                      className="w-24 border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1.5 py-1 text-sm text-slate-600 focus:outline-none bg-transparent focus:bg-white"/>
                  </S.Td>
                  <S.Td>{m.util>90 ? <S.Badge cls="bg-red-100 text-red-700">Overloaded</S.Badge> : <S.Badge cls="bg-emerald-100 text-emerald-700">Healthy</S.Badge>}</S.Td>
                  <S.Td>
                    {!canDelete ? null : confirmRemove===m.name ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <button onClick={()=>removeMember(m.name)} className="text-xs text-white bg-red-500 hover:bg-red-600 rounded px-2 py-1">Confirm</button>
                        <button onClick={()=>setConfirmRemove(null)} className="text-xs text-slate-500 hover:bg-slate-100 rounded px-2 py-1">Cancel</button>
                      </span>
                    ) : (
                      <button onClick={()=>setConfirmRemove(m.name)} title="Remove" className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded px-2 py-1 text-xs"><S.Icon name="trash" className="w-3.5 h-3.5"/></button>
                    )}
                  </S.Td>
                </tr>
              ))}
              {team.length===0 && (
                <tr><td colSpan={8} className="text-center text-sm text-slate-400 py-8">No team members yet — click "Add Team Member" above.</td></tr>
              )}
            </tbody>
          </table>
        </S.Card>
      ) : (
        depts.map(([dept,members]: any) =>(
          <div key={dept} className="mb-6">
            <div className="flex items-center gap-2 mb-2.5 pb-1.5 border-b border-slate-200">
              <span className="font-semibold text-slate-700 text-sm">{dept}</span>
              <S.Badge cls="bg-slate-100 text-slate-500">{members.length} member{members.length===1?'':'s'}</S.Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {members.map(m=>(
                <S.Card key={m.name} className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold shrink-0">{initials(m.name)}</div>
                    <div className="min-w-0"><div className="font-medium text-slate-800 truncate">{m.name}</div><div className="text-xs text-slate-400 truncate">{m.role}</div></div>
                    {m.util>90 && <S.Badge cls="bg-red-100 text-red-700 ml-auto shrink-0">overloaded</S.Badge>}
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Utilization</span><span>{m.util}%</span></div>
                  <div className="h-2 bg-slate-100 rounded-full mb-2.5"><div className={`h-2 rounded-full ${utilBarColor(m.util)}`} style={{width:m.util+'%'}}></div></div>
                  <div className="flex justify-between text-xs text-slate-400"><span>Available: {m.avail}</span><span>Capacity: {m.capacity}</span></div>
                </S.Card>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Team Productivity — benchmarks set in Administration -> Team Productivity, actuals computed
          live from Project Master + Billing Tracker (see productivityFor above). Collapsible — click
          the header to expand/collapse; open by default. */}
      <S.Card className="overflow-hidden mt-5">
        <button onClick={()=>setProductivityOpen(o=>!o)} className="w-full flex items-center justify-between gap-2 px-4 pt-3 pb-2 text-left">
          <div>
            <div className="font-semibold text-slate-800 inline-flex items-center gap-1.5">
              <span className="text-slate-400 text-xs w-3 inline-block">{productivityOpen?'▼':'▶'}</span>
              Team Productivity — Benchmarks vs Actuals
            </div>
            <div className="text-xs text-slate-400 mt-0.5">Benchmarks are set in Administration → Team Productivity. Actuals are live — projects, team size and billing come from Project Master and Billing Tracker; a Premium-tier project counts as two projects.</div>
          </div>
        </button>
        {productivityOpen && (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr><S.Th>Name</S.Th><S.Th>No. of Projects</S.Th><S.Th>Team Size</S.Th><S.Th>Billing Target</S.Th><S.Th>On Site Visits / Project</S.Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {team.map(m=>{
              const p = productivityFor(m);
              return (
                <tr key={m.name} className="hover:bg-slate-50">
                  <S.Td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[11px] font-semibold shrink-0">{initials(m.name)}</div>
                      <span className="font-medium text-slate-800 whitespace-nowrap">{m.name}</span>
                    </div>
                  </S.Td>
                  <S.Td><MetricCell actual={p.projects.actual} benchmark={p.projects.benchmark}/></S.Td>
                  <S.Td><MetricCell actual={p.teamSize.actual} benchmark={p.teamSize.benchmark}/></S.Td>
                  <S.Td><MetricCell actual={p.billingTarget.actual} benchmark={p.billingTarget.benchmark} fmt={S.inLakh}/></S.Td>
                  <S.Td><MetricCell actual={p.onsiteVisits.actual} benchmark={p.onsiteVisits.benchmark}/></S.Td>
                </tr>
              );
            })}
            {team.length===0 && (
              <tr><td colSpan={5} className="text-center text-sm text-slate-400 py-8">Add team members above to see productivity benchmarks.</td></tr>
            )}
          </tbody>
        </table>
        )}
      </S.Card>
    </div>
  );
}

// Client-facing page. Deliberately minimal per spec: a pipeline of items awaiting the Client
// Owner's sign-off (only reachable once the Project Head has already approved them), plus a
// read-only, phase-wise timeline showing nothing but name / deadline / status at every level.
