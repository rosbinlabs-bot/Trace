import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';
import * as db from '../db';

function TagListSetting({ title, hint, field, placeholder, settings, setSettings, canEdit=true }: any){
  const { logActivity } = React.useContext(S.ActivityLogContext);
  const [draft, setDraft] = useState('');
  const list = settings[field] || [];
  const add = () => {
    if(!canEdit) return;
    const v = draft.trim();
    if(!v) return;
    if(list.some(x=>x.toLowerCase()===v.toLowerCase())){ setDraft(''); return; }
    setSettings(s => ({ ...s, [field]: [...(s[field]||[]), v] }));
    logActivity({ module:'Project Settings', action: `Added "${v}" to ${title}` });
    setDraft('');
  };
  const remove = (i) => { if(!canEdit) return; const v=list[i]; setSettings(s => ({ ...s, [field]: (s[field]||[]).filter((_,j)=>j!==i) })); logActivity({ module:'Project Settings', action: `Removed "${v}" from ${title}` }); };
  return (
    <S.Card className="p-4">
      <div className="font-semibold text-slate-800">{title}</div>
      {hint && <div className="text-xs text-slate-400 mt-0.5 mb-3">{hint}</div>}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {list.map((v,i)=>(
          <span key={i} className="inline-flex items-center gap-1 bg-violet-100 text-violet-700 rounded-full px-2 py-0.5 text-[11px]">
            {v}{canEdit && <button onClick={()=>remove(i)} className="text-violet-400 hover:text-violet-600">×</button>}
          </span>
        ))}
        {list.length===0 && <span className="text-xs text-slate-400">None yet.</span>}
      </div>
      {canEdit && (
        <div className="flex items-center gap-1.5">
          <input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}
            placeholder={placeholder} className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <button onClick={add} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-1.5 whitespace-nowrap">+ Add</button>
        </div>
      )}
    </S.Card>
  );
}

// Manages the master lists that back the New Project form's Category, Industry, Consulting Category
// and Engagement Type dropdowns. Lives under Administration -> Project Settings.
function ProjectSettingsPanel(){
  const { settings, setSettings } = React.useContext(S.SettingsContext);
  const { admin } = React.useContext(S.AdminDataContext);
  const { email } = React.useContext(S.CurrentUserContext);
  const { logActivity } = React.useContext(S.ActivityLogContext);
  const logSettings = (action: string) => logActivity({ module:'Project Settings', action });
  // Every Administration sub-panel independently re-checks the Administration module capability
  // (rather than trusting a parent wrapper) so it stays correctly locked down even if reached some
  // other way -- View means read/browse only, Edit or above is required to actually change anything.
  const canEdit = S.capAtLeast(S.capabilityFor('Administration', email, admin), 'Edit');

  const [tierCode, setTierCode] = useState('');
  const [tierLabel, setTierLabel] = useState('');
  const addTier = () => {
    if(!canEdit) return;
    const code = tierCode.trim().toUpperCase();
    const label = tierLabel.trim();
    if(!code || !label) return;
    if(settings.categories.some(c=>c.code.toUpperCase()===code)) return;
    setSettings(s => ({ ...s, categories:[...s.categories, { code, label }] }));
    logSettings(`Added category "${code} - ${label}"`);
    setTierCode(''); setTierLabel('');
  };
  const removeTier = (code) => { if(!canEdit) return; setSettings(s => ({ ...s, categories: s.categories.filter(c=>c.code!==code) })); logSettings(`Removed category "${code}"`); };
  const editTierLabel = (code, label) => { if(!canEdit) return; setSettings(s => ({ ...s, categories: s.categories.map(c=>c.code===code?{...c,label}:c) })); };
  const resetDefaults = () => { if(canEdit){ setSettings(S.DEFAULT_PROJECT_SETTINGS); logSettings('Reset Project Settings to defaults'); } };

  return (
    <div>
      {!canEdit && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">You have view-only access here — ask a Super Admin for Edit access on Administration to change these lists.</div>}
      <div className="flex justify-between items-start mb-4 gap-3 flex-wrap">
        <div className="text-sm text-slate-500 max-w-2xl">These lists power the dropdowns on the New Project form — Category, Industry, Consulting Category and Engagement Type. Add or remove options here and they apply immediately across the app.</div>
        {canEdit && <button onClick={resetDefaults} className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 whitespace-nowrap">Reset to Defaults</button>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <S.Card className="p-4">
          <div className="font-semibold text-slate-800">Category (Client Tier)</div>
          <div className="text-xs text-slate-400 mt-0.5 mb-3">A = Premium, B = Medium Class, C = Normal Class by default — codes and labels are fully editable.</div>
          <div className="space-y-2 mb-3">
            {settings.categories.map(c=>(
              <div key={c.code} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
                <span className="font-mono text-xs font-semibold text-slate-500 w-6">{c.code}</span>
                <input value={c.label} disabled={!canEdit} onChange={e=>editTierLabel(c.code, e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                {canEdit && <button onClick={()=>removeTier(c.code)} className="text-xs text-red-400 hover:text-red-600">✕</button>}
              </div>
            ))}
            {settings.categories.length===0 && <div className="text-xs text-slate-400">No categories defined yet.</div>}
          </div>
          {canEdit && (
            <div className="flex items-center gap-1.5">
              <input value={tierCode} onChange={e=>setTierCode(e.target.value)} placeholder="Code (e.g. D)" maxLength={3}
                className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <input value={tierLabel} onChange={e=>setTierLabel(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTier();}}} placeholder="Label (e.g. Strategic)"
                className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <button onClick={addTier} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-1.5 whitespace-nowrap">+ Add</button>
            </div>
          )}
        </S.Card>

        <TagListSetting title="Industry" hint="Top industries shown in the New Project Industry dropdown. New industries can also be added inline from the form itself." field="industries" placeholder="e.g. Aviation" settings={settings} setSettings={setSettings} canEdit={canEdit} />
        <TagListSetting title="Consulting Category" hint="Options offered in the New Project Consulting Category dropdown." field="consultingCategories" placeholder="e.g. Strategy Advisory" settings={settings} setSettings={setSettings} canEdit={canEdit} />
        <TagListSetting title="Engagement Type" hint="Options offered in the New Project Engagement Type dropdown." field="engagementTypes" placeholder="e.g. Retainer Plus" settings={settings} setSettings={setSettings} canEdit={canEdit} />
        <TagListSetting title="Phase / Milestone / Sub Task Status" hint="Shared status vocabulary used across Phase Management (Not Started / In Progress are picked freely; Completed and Implemented still require their normal approvals)." field="itemStatuses" placeholder="e.g. Blocked" settings={settings} setSettings={setSettings} canEdit={canEdit} />
      </div>
    </div>
  );
}

/* ===================== Administration sub-panels ===================== */

// Small reusable "simple tag list" editor — add/remove plain strings — used for template lists.
function SimpleListEditor({ list, onChange, placeholder, canEdit=true }: any){
  const [draft, setDraft] = useState('');
  const add = () => { if(!canEdit) return; const v=draft.trim(); if(!v) return; onChange([...(list||[]), v]); setDraft(''); };
  const remove = (i) => { if(!canEdit) return; onChange(list.filter((_,idx)=>idx!==i)); };
  return (
    <div>
      <div className="space-y-1.5 mb-2">
        {(list||[]).map((v,i)=>(
          <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <span className="flex-1 text-sm text-slate-700 truncate">{v}</span>
            {canEdit && <button onClick={()=>remove(i)} className="text-slate-300 hover:text-red-500"><S.Icon name="trash" className="w-3.5 h-3.5"/></button>}
          </div>
        ))}
        {(!list||list.length===0) && <div className="text-xs text-slate-400">Nothing added yet.</div>}
      </div>
      {canEdit && (
        <div className="flex gap-1.5">
          <input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}} placeholder={placeholder||'Add new…'}
            className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
          <button onClick={add} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-1.5 whitespace-nowrap">+ Add</button>
        </div>
      )}
    </div>
  );
}

function RolesPermissionsPanel(){
  const { admin, patchAdmin } = React.useContext(S.AdminDataContext);
  const { email } = React.useContext(S.CurrentUserContext);
  const { logActivity } = React.useContext(S.ActivityLogContext);
  const logRoles = (action: string) => logActivity({ module:'Roles & Permissions', action });
  // Deliberately a HIGHER bar than the rest of Administration (Edit): this panel rewrites the rules
  // themselves, so an Edit-level Admin (who can otherwise manage Users/Company/Billing) still can't
  // grant themselves more access by editing the matrix -- only Full (Super Admin by default) can.
  const canEditRoles = S.capAtLeast(S.capabilityFor('Administration', email, admin), 'Full');
  const designations = S.designationsList(admin);
  const [newDesignation, setNewDesignation] = useState('');
  const [designationDrafts, setDesignationDrafts] = useState<{[k:string]:string}>({});
  const usersWithDesignation = (d:string) => (admin.users||[]).filter((u:any)=>u.designation===d);
  const setLevel = (designation, level) => { if(!canEditRoles) return; patchAdmin('designationLevel', dl => ({ ...dl, [designation]: level })); logRoles(`Set "${designation}" permission level to "${level}"`); };
  const setHierarchyLevel = (designation, level) => { if(!canEditRoles) return; patchAdmin('designationHierarchyLevel', dl => ({ ...(dl||{}), [designation]: level })); logRoles(`Set "${designation}" hierarchy level to "${level}"`); };
  const setCap = (mod, level, cap) => { if(!canEditRoles) return; patchAdmin('matrix', m => ({ ...m, [mod]: { ...m[mod], [level]: cap } })); logRoles(`Set "${mod}" capability for "${level}" to "${cap}"`); };
  const resetDefaults = () => { if(!canEditRoles) return; patchAdmin('designations', ()=>[...S.DEFAULT_DESIGNATIONS]); patchAdmin('designationLevel', ()=>({...S.DEFAULT_DESIGNATION_LEVEL})); patchAdmin('designationHierarchyLevel', ()=>({...S.DEFAULT_HIERARCHY_LEVEL})); patchAdmin('matrix', ()=>JSON.parse(JSON.stringify(S.DEFAULT_PERMISSION_MATRIX))); logRoles('Reset Roles & Permissions to defaults'); };
  // Designations are admin-editable (added 2026-08-31): add / rename / remove them here, then link
  // each one's Permission Level and Hierarchy Level in the two tables below. A brand-new designation
  // seeds at the lowest tier of both (Officer / L9) -- least-privilege by default until deliberately
  // raised, rather than silently inheriting whatever the first PERMISSION_LEVELS/HIERARCHY_LEVELS
  // option happens to be.
  const addDesignation = () => {
    if(!canEditRoles) return;
    const v = newDesignation.trim();
    if(!v || designations.some(d=>d.toLowerCase()===v.toLowerCase())){ setNewDesignation(''); return; }
    patchAdmin('designations', () => [...designations, v]);
    patchAdmin('designationLevel', dl => ({ ...dl, [v]: 'Officer' }));
    patchAdmin('designationHierarchyLevel', dl => ({ ...(dl||{}), [v]: 'L9' }));
    logRoles(`Added designation "${v}"`);
    setNewDesignation('');
  };
  // Renames the designation everywhere it's referenced -- the designations list itself, both level
  // maps (moving the value from the old key to the new one), and every teammate currently holding it
  // (Administration -> Users) -- so nobody's account silently falls back to "no designation" mid-edit.
  const renameDesignation = (oldName:string, rawNew:string) => {
    const clearDraft = () => setDesignationDrafts(ds=>{ const next={...ds}; delete next[oldName]; return next; });
    if(!canEditRoles){ clearDraft(); return; }
    const v = rawNew.trim();
    if(!v || v===oldName){ clearDraft(); return; }
    if(designations.some(d=>d!==oldName && d.toLowerCase()===v.toLowerCase())){ clearDraft(); return; }
    patchAdmin('designations', () => designations.map(d=>d===oldName?v:d));
    patchAdmin('designationLevel', dl => { const cp={...dl}; cp[v]=cp[oldName]; delete cp[oldName]; return cp; });
    patchAdmin('designationHierarchyLevel', dl => { const cp={...(dl||{})}; cp[v]=cp[oldName]; delete cp[oldName]; return cp; });
    const affected = usersWithDesignation(oldName);
    if(affected.length) patchAdmin('users', (us:any[]) => us.map((u:any)=>u.designation===oldName ? {...u, designation:v} : u));
    logRoles(`Renamed designation "${oldName}" to "${v}"${affected.length?` (updated ${affected.length} teammate${affected.length===1?'':'s'})`:''}`);
    clearDraft();
  };
  // Blocked while anyone currently holds the designation (reassign them first, in Administration ->
  // Users) and while it's the last remaining one -- both enforced on the button itself (disabled +
  // tooltip) below, this is just a safety net against a stale click slipping through.
  const removeDesignation = (d:string) => {
    if(!canEditRoles || designations.length<=1 || usersWithDesignation(d).length) return;
    if(!window.confirm(`Remove designation "${d}"?\n\nThis cannot be undone.`)) return;
    patchAdmin('designations', () => designations.filter(x=>x!==d));
    patchAdmin('designationLevel', dl => { const cp={...dl}; delete cp[d]; return cp; });
    patchAdmin('designationHierarchyLevel', dl => { const cp={...(dl||{})}; delete cp[d]; return cp; });
    logRoles(`Removed designation "${d}"`);
  };
  return (
    <div className="space-y-5">
      {!canEditRoles && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">You have view-only access to Roles & Permissions — only a Super Admin (Full capability on Administration) can change designations, designation levels or the capability matrix.</div>}
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div className="text-sm text-slate-500 max-w-2xl">Every person is assigned one <b>designation</b>. Each designation maps to exactly one <b>permission level</b>, which drives the capability matrix below. Designations, and both level mappings, are fully editable. The <b>Client</b> column is separate — it's not assigned via designation, it applies automatically to every Client-type login added from Administration → Users → Add Client.</div>
        {canEditRoles && <button onClick={resetDefaults} className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 whitespace-nowrap">Reset to Defaults</button>}
      </div>

      <S.Card className="p-4">
        <div className="font-semibold text-slate-800 mb-1 flex items-center gap-2"><S.Icon name="briefcase" className="w-4 h-4 text-slate-400"/> Designations</div>
        <div className="text-xs text-slate-400 mb-3">Rename, add or remove designations here — Permission Level and Hierarchy Level for each are linked in the two tables below. A designation currently held by someone can't be removed until they're reassigned in Administration → Users.</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
          {designations.map(d=>{
            const inUse = usersWithDesignation(d);
            return (
              <div key={d} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <input value={designationDrafts[d] ?? d} disabled={!canEditRoles}
                  onChange={e=>setDesignationDrafts(ds=>({...ds, [d]:e.target.value}))}
                  onBlur={()=>renameDesignation(d, designationDrafts[d] ?? d)}
                  onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();(e.target as HTMLInputElement).blur();}}}
                  className="flex-1 min-w-0 bg-transparent text-sm text-slate-700 focus:outline-none disabled:text-slate-400"/>
                {canEditRoles && (
                  <button onClick={()=>removeDesignation(d)} disabled={inUse.length>0 || designations.length<=1}
                    title={inUse.length>0 ? `Held by ${inUse.length} teammate${inUse.length===1?'':'s'} — reassign them first` : designations.length<=1 ? 'At least one designation is required' : 'Remove designation'}
                    className="text-slate-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-slate-300 shrink-0"><S.Icon name="trash" className="w-3.5 h-3.5"/></button>
                )}
              </div>
            );
          })}
        </div>
        {canEditRoles && (
          <div className="flex gap-1.5">
            <input value={newDesignation} onChange={e=>setNewDesignation(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addDesignation();}}} placeholder="Add new designation…"
              className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
            <button onClick={addDesignation} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-1.5 whitespace-nowrap">+ Add</button>
          </div>
        )}
      </S.Card>

      <S.Card className="p-4">
        <div className="font-semibold text-slate-800 mb-1 flex items-center gap-2"><S.Icon name="briefcase" className="w-4 h-4 text-slate-400"/> Designation → Permission Level</div>
        <div className="text-xs text-slate-400 mb-3">Each designation above holds one of four permission levels.</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {designations.map(d=>(
            <div key={d} className="border border-slate-200 rounded-lg p-3">
              <div className="text-sm font-medium text-slate-700 mb-2">{d}</div>
              <select value={admin.designationLevel[d] || 'Officer'} disabled={!canEditRoles} onChange={e=>setLevel(d, e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
                {S.PERMISSION_LEVELS.map(l=><option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          ))}
        </div>
      </S.Card>

      <S.Card className="p-4">
        <div className="font-semibold text-slate-800 mb-1 flex items-center gap-2"><S.Icon name="structure" className="w-4 h-4 text-slate-400"/> Designation → Hierarchy Level</div>
        <div className="text-xs text-slate-400 mb-3">A separate axis from Permission Level above — this is seniority (L1 = most senior, up to L9), not capability. Project Master's Project Team and Phase Management's whole approval chain (who approves Sub Tasks/Milestones/Phases, and the Implemented escalation order) are driven entirely by hierarchy level. This table just sets the default level a designation seeds when picked; each person's actual level (Administration → Users, or their entry on a specific project's team) can still be set individually.</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {designations.map(d=>(
            <div key={d} className="border border-slate-200 rounded-lg p-3">
              <div className="text-sm font-medium text-slate-700 mb-2">{d}</div>
              <select value={S.designationHierarchyLevel(d, admin)} disabled={!canEditRoles} onChange={e=>setHierarchyLevel(d, e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
                {S.HIERARCHY_LEVELS.map(l=><option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          ))}
        </div>
      </S.Card>

      <S.Card className="p-4 overflow-x-auto">
        <div className="font-semibold text-slate-800 mb-1 flex items-center gap-2"><S.Icon name="shield" className="w-4 h-4 text-slate-400"/> Capability Matrix</div>
        <div className="text-xs text-slate-400 mb-3">What each permission level — and Client logins — can do, per module. Click any cell to change it.</div>
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr><S.Th>Module</S.Th>{S.MATRIX_COLUMNS.map(l=><S.Th key={l}>{l}</S.Th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {S.PERMISSION_MODULES.map(mod=>(
              <tr key={mod}>
                <S.Td className="font-medium whitespace-nowrap">{mod}</S.Td>
                {S.MATRIX_COLUMNS.map(level=>{
                  const cap = (admin.matrix[mod]||{})[level] || 'None';
                  return (
                    <S.Td key={level}>
                      <select value={cap} disabled={!canEditRoles} onChange={e=>setCap(mod, level, e.target.value)}
                        className={`text-xs font-medium rounded-full px-2 py-1 border-0 disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-brand-400 ${S.CAPABILITY_COLOR[cap]}`}>
                        {S.CAPABILITY_LEVELS.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </S.Td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </S.Card>
    </div>
  );
}

// Default password rule: first 4 letters of the person's name (lowercased, spaces/punctuation
// stripped) + "1234" — e.g. "Abin C Pascal" -> "abin1234". Always exactly 8 characters, which meets
// the 8-char minimum enforced below. Falls back to "user1234" when no name has been typed yet.
const defaultPasswordFor = (name: string) => {
  const letters = (name || '').replace(/[^a-zA-Z]/g, '').toLowerCase();
  const base = letters.slice(0, 4) || 'user';
  return base + '1234';
};

function UsersPanel(){
  const { admin, patchAdmin } = React.useContext(S.AdminDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { settings } = React.useContext(S.SettingsContext);
  const { email } = React.useContext(S.CurrentUserContext);
  const { logActivity } = React.useContext(S.ActivityLogContext);
  // Department Master is the single source of truth for department names (same list Project
  // Settings -> Masters -> Department Master edits) -- if a teammate already has a dept value from
  // before this list existed, or one outside the master list, it's kept as a selectable option too.
  const DEPT_OPTS = (settings.departments && settings.departments.length) ? settings.departments : S.DEFAULT_PROJECT_SETTINGS.departments;
  const deptOptsFor = (current: string) => (current && !DEPT_OPTS.includes(current)) ? [...DEPT_OPTS, current] : DEPT_OPTS;
  const logUser = (action: string) => logActivity({ module:'Administration', action });
  // Derived from the actual Administration capability (configurable in Roles & Permissions), not a
  // hardcoded role==='admin' shortcut -- by default Admin permission level is 'View' on Administration
  // (browse only) and Super Admin is 'Full', so only Super Admin can manage users out of the box. A
  // Super Admin can grant Admin-level staff Edit (or Full) on Administration if they want them to
  // manage users too.
  const canEditUsers = S.capAtLeast(S.capabilityFor('Administration', email, admin), 'Edit');
  // Custom permission-level override — bypasses the standard designation -> level mapping for one
  // specific account (e.g. an Associate, normally Officer level, manually bumped to Admin). This is
  // deliberately a harder gate than canEditUsers: it's the one control in the app that can hand out
  // Super Admin rights outright, so only an actual Super Admin (not just anyone with Edit on
  // Administration) may touch it.
  const iAmSuperAdmin = S.isSuperAdmin(email, admin);
  // addMode drives the two-step "+ Add User" flow: null (closed) -> 'menu' (choose Teammate vs
  // Client) -> 'teammate' or 'client' (the actual form). Teammate keeps the original single-step
  // form/behavior untouched; Client is new (see addClient below).
  const [addMode, setAddMode] = useState<null|'menu'|'teammate'|'client'>(null);
  const [draft, setDraft] = useState<any>({ name:'', email:'', designation:'Associate', level:S.DEFAULT_HIERARCHY_LEVEL['Associate'], dept:'', capacity:'40h/wk', password: defaultPasswordFor('') });
  const [levelTouched, setLevelTouched] = useState(false); // true once the admin manually picks a level, so we stop re-defaulting it as the designation changes
  const [pwTouched, setPwTouched] = useState(false); // true once the admin manually edits the password field, so we stop overwriting it as the name changes
  const [clientDraft, setClientDraft] = useState<any>({ name:'', email:'', projectId:'', password: defaultPasswordFor('') });
  const [clientPwTouched, setClientPwTouched] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [resetFor, setResetFor] = useState<any>(null); // { user, password }
  // Set once a reset has actually gone through, so the admin gets a clear on-screen confirmation --
  // previously the panel just silently closed on success (same as every other action here), which
  // reads as "nothing happened" / "reset password isn't working" when there's no toast system in
  // this app to surface a transient success message instead.
  const [resetDone, setResetDone] = useState<any>(null); // { name, email, password } | null
  const [editingId, setEditingId] = useState<string|null>(null); // id of the user row currently being edited (Name/Email)
  const [editDraft, setEditDraft] = useState<any>({ name:'', email:'' });
  const [busy, setBusy] = useState<string|null>(null); // user id currently mid-action
  const [err, setErr] = useState('');

  const setDraftName = (name: string) => setDraft(d => ({ ...d, name, password: pwTouched ? d.password : defaultPasswordFor(name) }));
  const setClientDraftName = (name: string) => setClientDraft(d => ({ ...d, name, password: clientPwTouched ? d.password : defaultPasswordFor(name) }));

  const addUser = async () => {
    if(!canEditUsers) return;
    setErr('');
    const name = draft.name.trim(), email = draft.email.trim();
    if(!name || !email || !draft.password || draft.password.length<8) { setErr('Name, email and an 8+ character password are required.'); return; }
    if(admin.users.some((u:any)=>u.email.toLowerCase()===email.toLowerCase())) { setErr('A user with that email already exists.'); return; }
    setBusy('adding');
    try {
      await db.createUserAccount(email, draft.password, name);
      patchAdmin('users', (us:any[]) => [...us, { id:S.uid('USR'), name, email, designation:draft.designation, level:draft.level||S.designationHierarchyLevel(draft.designation, admin)||'L9', dept:draft.dept||'', capacity:draft.capacity||'40h/wk', status:'Active', joined: S.TODAY_ISO, password: draft.password }]);
      logUser(`Added teammate "${name}" (${email}, ${draft.designation})`);
      setDraft({ name:'', email:'', designation:'Associate', level:S.DEFAULT_HIERARCHY_LEVEL['Associate'], dept:'', capacity:'40h/wk', password: defaultPasswordFor('') }); setPwTouched(false); setLevelTouched(false); setAddMode(null);
    } catch(e:any) { setErr(e.message || 'Could not create the login.'); }
    setBusy(null);
  };
  // A Client-type login is hard-restricted (see deriveRole/CLIENT_NAV in shared.tsx and the route
  // table in App.tsx's Shell) to the Client Portal + Project Structure for exactly ONE tagged
  // project — no designation/permission level, since it never touches the staff permission ladder.
  const addClient = async () => {
    if(!canEditUsers) return;
    setErr('');
    const name = clientDraft.name.trim(), email = clientDraft.email.trim();
    if(!name || !email || !clientDraft.projectId) { setErr('Name, email and a project are required.'); return; }
    if(!clientDraft.password || clientDraft.password.length<8) { setErr('An 8+ character password is required.'); return; }
    if(admin.users.some((u:any)=>u.email.toLowerCase()===email.toLowerCase())) { setErr('A user with that email already exists.'); return; }
    setBusy('adding');
    try {
      await db.createUserAccount(email, clientDraft.password, name);
      patchAdmin('users', (us:any[]) => [...us, { id:S.uid('USR'), name, email, type:'Client', project:clientDraft.projectId, status:'Active', joined: S.TODAY_ISO, password: clientDraft.password }]);
      logUser(`Added client login "${name}" (${email})`);
      setClientDraft({ name:'', email:'', projectId:'', password: defaultPasswordFor('') }); setClientPwTouched(false); setAddMode(null);
    } catch(e:any) { setErr(e.message || 'Could not create the login.'); }
    setBusy(null);
  };
  const setDesignation = (id, designation) => { if(!canEditUsers) return; patchAdmin('users', (us:any[]) => us.map(u=>u.id===id?{...u,designation}:u)); const u=admin.users.find((x:any)=>x.id===id); logUser(`Changed ${u?.name||id}'s designation to "${designation}"`); };
  const setHierarchyLevel = (id, level) => { if(!canEditUsers) return; patchAdmin('users', (us:any[]) => us.map(u=>u.id===id?{...u,level}:u)); const u=admin.users.find((x:any)=>x.id===id); logUser(`Changed ${u?.name||id}'s hierarchy level to "${level}"`); };
  // Department and Weekly Capacity -- moved here from the old Team Management roster (see
  // S.computeTeamRoster) so a person's identity/attributes live in exactly one place; edited inline
  // in the Team table below, same onBlur pattern Team Management's own inline fields already used.
  const setDept = (id, dept) => { if(!canEditUsers) return; patchAdmin('users', (us:any[]) => us.map(u=>u.id===id?{...u,dept}:u)); };
  const setCapacity = (id, capacity) => { if(!canEditUsers) return; patchAdmin('users', (us:any[]) => us.map(u=>u.id===id?{...u,capacity}:u)); const u=admin.users.find((x:any)=>x.id===id); logUser(`Updated ${u?.name||id}'s weekly capacity to "${capacity}"`); };
  // '' clears the override (back to the standard designation -> level mapping); any PERMISSION_LEVELS
  // value pins that account to that level regardless of designation.
  const setPermissionOverride = (id, level) => { if(!iAmSuperAdmin) return; patchAdmin('users', (us:any[]) => us.map(u=>u.id===id?{...u,permissionOverride:level||null}:u)); const u=admin.users.find((x:any)=>x.id===id); logUser(`${level?`Set custom permission override "${level}"`:'Cleared custom permission override'} for ${u?.name||id}`); };
  const setClientProject = (id, projectId) => { if(!canEditUsers) return; patchAdmin('users', (us:any[]) => us.map(u=>u.id===id?{...u,project:projectId}:u)); };
  const approveUser = (u:any) => { if(!canEditUsers) return; patchAdmin('users', (us:any[]) => us.map(x=>x.id===u.id?{...x,status:'Active'}:x)); logUser(`Approved pending signup for "${u.name}"`); };
  const toggleSuspend = async (u:any) => {
    if(!canEditUsers) return;
    setErr(''); setBusy(u.id);
    try {
      await db.setUserBanned(u.email, u.status==='Active');
      patchAdmin('users', (us:any[]) => us.map(x=>x.id===u.id?{...x,status:x.status==='Active'?'Suspended':'Active'}:x));
      logUser(`${u.status==='Active'?'Deactivated':'Reactivated'} "${u.name}"`);
    } catch(e:any) { setErr(e.message || 'Could not update that account.'); }
    setBusy(null);
  };
  const removeUser = async (u:any) => {
    if(!canEditUsers) return;
    setErr(''); setBusy(u.id);
    try {
      await db.deleteUserAccount(u.email);
      patchAdmin('users', (us:any[]) => us.filter(x=>x.id!==u.id));
      logUser(`Removed login "${u.name}" (${u.email})`);
      setConfirmRemove(null);
    } catch(e:any) { setErr(e.message || 'Could not remove that account.'); }
    setBusy(null);
  };
  const doReset = async () => {
    if(!canEditUsers || !resetFor) return;
    setErr(''); setBusy(resetFor.user.id);
    try {
      await db.resetUserPassword(resetFor.user.email, resetFor.password);
      patchAdmin('users', (us:any[]) => us.map(x=>x.id===resetFor.user.id?{...x,password:resetFor.password}:x));
      logUser(`Reset password for "${resetFor.user.name}"`);
      setResetDone({ name: resetFor.user.name, email: resetFor.user.email, password: resetFor.password });
      setResetFor(null);
    }
    catch(e:any) { setErr(e.message || 'Could not reset that password.'); }
    setBusy(null);
  };
  const startEdit = (u:any) => { if(!canEditUsers) return; setErr(''); setEditingId(u.id); setEditDraft({ name:u.name, email:u.email }); };
  const cancelEdit = () => { setEditingId(null); setErr(''); };
  const saveEdit = async (u:any) => {
    if(!canEditUsers) return;
    const name = editDraft.name.trim(), email = editDraft.email.trim();
    if(!name || !email) { setErr('Name and email are required.'); return; }
    if(admin.users.some((x:any)=>x.id!==u.id && x.email.toLowerCase()===email.toLowerCase())) { setErr('A user with that email already exists.'); return; }
    setErr(''); setBusy(u.id);
    try {
      // Email is the Supabase Auth sign-in identifier, so any change has to go through the edge
      // function (service role key) to keep the login and the profile record in sync; Name alone
      // could be a local-only patch, but routing both through the same call keeps this simple.
      await db.updateUserProfile(u.email, { name, email });
      patchAdmin('users', (us:any[]) => us.map(x=>x.id===u.id?{...x,name,email}:x));
      logUser(`Edited user "${u.name}" -> name "${name}", email "${email}"`);
      setEditingId(null);
    } catch(e:any) { setErr(e.message || 'Could not update that user.'); }
    setBusy(null);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-3 gap-3 flex-wrap">
        <div className="text-sm text-slate-500 max-w-2xl">Everyone who can sign in, their designation and derived permission level. Deactivate blocks sign-in but keeps the record; Remove deletes the login entirely. Password shows the last one set here — if someone signs in and changes it themselves afterward, this won't reflect that.</div>
        {canEditUsers && <button onClick={()=>setAddMode(m=>m?null:'menu')} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-2 whitespace-nowrap inline-flex items-center gap-1.5"><S.Icon name="userplus" className="w-3.5 h-3.5"/> Add User</button>}
      </div>

      {!canEditUsers && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">You have view-only access here — ask a Super Admin for Edit access on Administration to manage users.</div>}
      {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</div>}

      {canEditUsers && addMode==='menu' && (
        <S.Card className="p-3 mb-3 border-2 border-dashed border-brand-300 bg-brand-50/30">
          <div className="text-xs text-slate-500 mb-2">What kind of user are you adding?</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button onClick={()=>setAddMode('teammate')} className="text-left border border-slate-200 hover:border-brand-400 bg-white rounded-lg px-3 py-2.5 transition-colors">
              <div className="text-sm font-medium text-slate-800 inline-flex items-center gap-1.5"><S.Icon name="userplus" className="w-3.5 h-3.5 text-brand-500"/> Add Teammate</div>
              <div className="text-xs text-slate-400 mt-0.5">Internal staff — designation, permission level and full app access.</div>
            </button>
            <button onClick={()=>setAddMode('client')} className="text-left border border-slate-200 hover:border-brand-400 bg-white rounded-lg px-3 py-2.5 transition-colors">
              <div className="text-sm font-medium text-slate-800 inline-flex items-center gap-1.5"><S.Icon name="building" className="w-3.5 h-3.5 text-brand-500"/> Add Client</div>
              <div className="text-xs text-slate-400 mt-0.5">External client, tagged to one project — Client Portal + Project Structure only, nothing else.</div>
            </button>
          </div>
        </S.Card>
      )}

      {addMode==='teammate' && (
        <S.Card className="p-3 mb-3 border-2 border-dashed border-brand-300 bg-brand-50/30">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-slate-600 inline-flex items-center gap-1.5"><S.Icon name="userplus" className="w-3.5 h-3.5 text-brand-500"/> Add Teammate</div>
            <button onClick={()=>setAddMode('menu')} className="text-[11px] text-slate-400 hover:text-slate-600">Change type</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 lg:grid-cols-8 gap-2 items-end">
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Name</label>
              <input autoComplete="off" value={draft.name} onChange={e=>setDraftName(e.target.value)} placeholder="Full name" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Email</label>
              <input autoComplete="off" value={draft.email} onChange={e=>setDraft(d=>({...d,email:e.target.value}))} placeholder="name@company.com" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Designation</label>
              <select value={draft.designation} onChange={e=>{ const designation=e.target.value; setDraft(d=>({...d,designation, level: levelTouched ? d.level : (S.designationHierarchyLevel(designation, admin)||d.level) })); }} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {S.designationsList(admin).map(d=><option key={d}>{d}</option>)}
              </select></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Level</label>
              <select value={draft.level} onChange={e=>{setLevelTouched(true); setDraft(d=>({...d,level:e.target.value}));}} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {S.HIERARCHY_LEVELS.map(l=><option key={l}>{l}</option>)}
              </select></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Department</label>
              <select value={draft.dept} onChange={e=>setDraft(d=>({...d,dept:e.target.value}))} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">— Select —</option>
                {deptOptsFor(draft.dept).map(d=><option key={d} value={d}>{d}</option>)}
              </select></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Weekly Capacity</label>
              <input value={draft.capacity} onChange={e=>setDraft(d=>({...d,capacity:e.target.value}))} placeholder="e.g. 40h/wk" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Temporary Password</label>
              <div className="flex gap-1">
                <input autoComplete="new-password" value={draft.password} onChange={e=>{setPwTouched(true); setDraft(d=>({...d,password:e.target.value}));}} placeholder="8+ characters" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                <button type="button" title="Reset to default (first 4 letters of name + 1234)" aria-label="Reset password to default" onClick={()=>{setPwTouched(false); setDraft(d=>({...d,password:defaultPasswordFor(d.name)}));}} className="text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg px-2"><S.Icon name="refresh" className="w-3.5 h-3.5"/></button>
              </div></div>
            <div className="flex gap-1.5">
              <button onClick={addUser} disabled={busy==='adding'} className="flex-1 text-xs bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg px-3 py-2">{busy==='adding'?'Adding…':'Add'}</button>
              <button onClick={()=>{setAddMode(null);setErr('');}} className="flex-1 text-xs border border-slate-200 text-slate-500 rounded-lg px-3 py-2 hover:bg-slate-50">Cancel</button>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-2">They can sign in immediately with this email/password, and should change it after their first login.</div>
        </S.Card>
      )}

      {addMode==='client' && (
        <S.Card className="p-3 mb-3 border-2 border-dashed border-violet-300 bg-violet-50/30">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-slate-600 inline-flex items-center gap-1.5"><S.Icon name="building" className="w-3.5 h-3.5 text-violet-500"/> Add Client</div>
            <button onClick={()=>setAddMode('menu')} className="text-[11px] text-slate-400 hover:text-slate-600">Change type</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Name</label>
              <input autoComplete="off" value={clientDraft.name} onChange={e=>setClientDraftName(e.target.value)} placeholder="Client contact name" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"/></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Email</label>
              <input autoComplete="off" value={clientDraft.email} onChange={e=>setClientDraft(d=>({...d,email:e.target.value}))} placeholder="name@clientcompany.com" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"/></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Project</label>
              <select value={clientDraft.projectId} onChange={e=>setClientDraft(d=>({...d,projectId:e.target.value}))} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                <option value="">Select project…</option>
                {projects.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Temporary Password</label>
              <div className="flex gap-1">
                <input autoComplete="new-password" value={clientDraft.password} onChange={e=>{setClientPwTouched(true); setClientDraft(d=>({...d,password:e.target.value}));}} placeholder="8+ characters" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-violet-500"/>
                <button type="button" title="Reset to default (first 4 letters of name + 1234)" aria-label="Reset password to default" onClick={()=>{setClientPwTouched(false); setClientDraft(d=>({...d,password:defaultPasswordFor(d.name)}));}} className="text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg px-2"><S.Icon name="refresh" className="w-3.5 h-3.5"/></button>
              </div></div>
            <div className="flex gap-1.5">
              <button onClick={addClient} disabled={busy==='adding'} className="flex-1 text-xs bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white rounded-lg px-3 py-2">{busy==='adding'?'Adding…':'Add'}</button>
              <button onClick={()=>{setAddMode(null);setErr('');}} className="flex-1 text-xs border border-slate-200 text-slate-500 rounded-lg px-3 py-2 hover:bg-slate-50">Cancel</button>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-2">This login is hard-restricted to the Client Portal and Project Structure for the selected project only — no other screen, and no edit access anywhere in the app.</div>
        </S.Card>
      )}

      {resetFor && (
        <S.Card className="p-3 mb-3 border-2 border-dashed border-amber-300 bg-amber-50/30">
          <div className="text-xs text-slate-600 mb-2">Reset password for <b>{resetFor.user.name}</b> ({resetFor.user.email})</div>
          <div className="flex gap-1.5 items-center flex-wrap">
            <div className="text-xs text-slate-500">New password will be:</div>
            <div className="text-sm font-mono font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">{resetFor.password}</div>
            <button onClick={doReset} disabled={busy===resetFor.user.id} className="text-xs bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg px-3 py-2 whitespace-nowrap">{busy===resetFor.user.id?'Resetting…':'Reset Password'}</button>
            <button onClick={()=>{setResetFor(null);setErr('');}} className="text-xs border border-slate-200 text-slate-500 rounded-lg px-3 py-2 hover:bg-slate-50 whitespace-nowrap">Cancel</button>
          </div>
          <div className="text-[11px] text-slate-400 mt-2">Always the first 4 letters of their name + "1234" — same rule new logins get. They'll be asked to set their own password on next sign-in.</div>
        </S.Card>
      )}

      {resetDone && (
        <S.Card className="p-3 mb-3 border-2 border-dashed border-emerald-300 bg-emerald-50/40">
          <div className="flex items-start gap-2">
            <S.Icon name="checkcircle" className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5"/>
            <div className="text-xs text-slate-600 flex-1">
              <div className="font-medium text-emerald-700 mb-0.5">Password reset for {resetDone.name}</div>
              <div>New password: <b className="font-mono">{resetDone.password}</b> — share this with them directly. They'll be asked to set their own password the next time they sign in with it.</div>
            </div>
            <button onClick={()=>setResetDone(null)} className="text-xs border border-emerald-200 text-emerald-700 rounded-lg px-3 py-1.5 hover:bg-emerald-100 whitespace-nowrap">Done</button>
          </div>
        </S.Card>
      )}

      {(() => {
        // Actions cell is identical for both Team and Client rows — shared here so the two tables
        // below don't have to duplicate the edit/reset/suspend/remove logic.
        const ActionsCell = ({u}:any) => {
          const isEditing = editingId===u.id;
          return isEditing ? (
            <div className="flex items-center gap-1 whitespace-nowrap">
              <button onClick={()=>saveEdit(u)} disabled={busy===u.id} className="text-xs text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 rounded px-2 py-1">{busy===u.id?'Saving…':'Save'}</button>
              <button onClick={cancelEdit} disabled={busy===u.id} className="text-xs text-slate-400 hover:text-slate-600 px-1">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-1 whitespace-nowrap">
              {canEditUsers && u.status==='Pending Approval' && (
                <button onClick={()=>approveUser(u)} title="Approve this sign-up" disabled={busy===u.id} className="text-xs text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 rounded px-2 py-1 inline-flex items-center gap-1"><S.Icon name="checkcircle" className="w-3.5 h-3.5"/> Approve</button>
              )}
              {canEditUsers && (
                <>
                  <button onClick={()=>startEdit(u)} title="Edit name/email" aria-label={`Edit name/email for ${u.name}`} disabled={busy===u.id} className="text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded px-1.5 py-1 disabled:opacity-40">
                    <S.Icon name="edit" className="w-3.5 h-3.5"/>
                  </button>
                  <button onClick={()=>{setErr('');setResetFor({user:u,password:defaultPasswordFor(u.name)});}} title="Reset password" aria-label={`Reset password for ${u.name}`} disabled={busy===u.id} className="text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded px-1.5 py-1 disabled:opacity-40">
                    <S.Icon name="lock" className="w-3.5 h-3.5"/>
                  </button>
                  <button onClick={()=>toggleSuspend(u)} title={u.status==='Active'?'Deactivate user':'Reactivate user'} aria-label={`${u.status==='Active'?'Deactivate':'Reactivate'} ${u.name}`} disabled={busy===u.id} className="text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded px-1.5 py-1 disabled:opacity-40">
                    <S.Icon name={u.status==='Active'?'ban':'checkcircle'} className="w-3.5 h-3.5"/>
                  </button>
                  {confirmRemove===u.id ? (
                    <span className="inline-flex items-center gap-1">
                      <button onClick={()=>removeUser(u)} disabled={busy===u.id} className="text-xs text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded px-2 py-1">{busy===u.id?'Removing…':'Confirm'}</button>
                      <button onClick={()=>setConfirmRemove(null)} className="text-xs text-slate-400 hover:text-slate-600 px-1">Cancel</button>
                    </span>
                  ) : (
                    <button onClick={()=>{setErr('');setConfirmRemove(u.id);}} title="Remove user" aria-label={`Remove ${u.name}`} disabled={busy===u.id} className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded px-1.5 py-1 disabled:opacity-40"><S.Icon name="trash" className="w-3.5 h-3.5"/></button>
                  )}
                </>
              )}
              {!canEditUsers && <span className="text-xs text-slate-300">—</span>}
            </div>
          );
        };
        const NameEmailCells = ({u}:any) => {
          const isEditing = editingId===u.id;
          return (<>
            <S.Td className="font-medium whitespace-nowrap">
              {isEditing
                ? <input autoFocus autoComplete="off" value={editDraft.name} onChange={e=>setEditDraft(d=>({...d,name:e.target.value}))} className="border border-slate-200 rounded-lg px-2 py-1 text-sm w-full min-w-[8rem] focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                : u.name}
            </S.Td>
            <S.Td className="text-slate-500 whitespace-nowrap">
              {isEditing
                ? <input type="email" autoComplete="off" value={editDraft.email} onChange={e=>setEditDraft(d=>({...d,email:e.target.value}))} className="border border-slate-200 rounded-lg px-2 py-1 text-sm w-full min-w-[10rem] focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                : u.email}
            </S.Td>
          </>);
        };
        const StatusCell = ({u}:any) => (
          u.status==='Active' ? <S.Badge cls="bg-emerald-100 text-emerald-700">Active</S.Badge>
            : u.status==='Pending Approval' ? <S.Badge cls="bg-amber-100 text-amber-700">Pending Approval</S.Badge>
            : <S.Badge cls="bg-slate-200 text-slate-600">Deactivated</S.Badge>
        );
        const rowCls = (u:any, isEditing:boolean) => u.status==='Suspended'?'bg-slate-50/60 opacity-70':u.status==='Pending Approval'?'bg-amber-50/40':isEditing?'bg-brand-50/30':'';

        const teamUsers = admin.users.filter((u:any)=>u.type!=='Client');
        const clientUsers = admin.users.filter((u:any)=>u.type==='Client');

        return (<>
          {/* Team — internal staff with a designation and derived permission level */}
          <div className="flex items-center gap-2 mb-2 mt-1">
            <S.Icon name="team" className="w-4 h-4 text-brand-600"/>
            <span className="text-sm font-semibold text-slate-700">Team</span>
            <S.Badge cls="bg-brand-50 text-brand-700">{teamUsers.length}</S.Badge>
          </div>
          <S.Card className="overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr><S.Th>Name</S.Th><S.Th>Email</S.Th><S.Th>Password</S.Th><S.Th>Designation</S.Th><S.Th>Permission Level</S.Th><S.Th>Hierarchy Level</S.Th><S.Th>Department</S.Th><S.Th>Weekly Capacity</S.Th><S.Th>Status</S.Th><S.Th>Joined</S.Th><S.Th>Actions</S.Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teamUsers.map((u:any)=>{
                  const isEditing = editingId===u.id;
                  return (
                  <tr key={u.id} className={rowCls(u, isEditing)}>
                    {NameEmailCells({u})}
                    <S.Td className="font-mono text-xs">{canEditUsers ? (u.password || '—') : '—'}</S.Td>
                    <S.Td>
                      {canEditUsers ? (
                        <select value={u.designation} onChange={e=>setDesignation(u.id, e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500">
                          {S.designationsList(admin).map(d=><option key={d}>{d}</option>)}
                        </select>
                      ) : u.designation}
                    </S.Td>
                    <S.Td>
                      {/* Standard result (from designation) always shown; a Super Admin can additionally
                          pin this account to a specific level regardless of designation via the small
                          "Custom" selector underneath — bypassing the standard rule entirely. */}
                      <S.Badge cls={u.permissionOverride ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'}>{admin.designationLevel[u.designation]||'—'}{u.permissionOverride && ` → ${u.permissionOverride}`}</S.Badge>
                      {iAmSuperAdmin && (
                        <select value={u.permissionOverride||''} onChange={e=>setPermissionOverride(u.id, e.target.value)} title="Custom override — bypasses the standard designation-based rule for this account only" aria-label={`Custom permission override for ${u.name}`} className="block mt-1 border border-amber-200 bg-amber-50/40 rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-amber-400">
                          <option value="">Custom: none (use default)</option>
                          {S.PERMISSION_LEVELS.map(l=><option key={l} value={l}>Custom: {l}</option>)}
                        </select>
                      )}
                    </S.Td>
                    <S.Td>
                      {canEditUsers ? (
                        <select value={u.level||''} onChange={e=>setHierarchyLevel(u.id, e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500">
                          <option value="">—</option>
                          {S.HIERARCHY_LEVELS.map(l=><option key={l}>{l}</option>)}
                        </select>
                      ) : <S.Badge cls="bg-violet-50 text-violet-700">{u.level||'—'}</S.Badge>}
                    </S.Td>
                    <S.Td>
                      {canEditUsers ? (
                        <select value={u.dept||''} onChange={e=>setDept(u.id, e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                          <option value="">— Select —</option>
                          {deptOptsFor(u.dept).map(d=><option key={d} value={d}>{d}</option>)}
                        </select>
                      ) : (u.dept || '—')}
                    </S.Td>
                    <S.Td>
                      {canEditUsers ? (
                        <input defaultValue={u.capacity||'40h/wk'} placeholder="e.g. 40h/wk" onBlur={e=>setCapacity(u.id, e.target.value)} className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                      ) : (u.capacity || '—')}
                    </S.Td>
                    <S.Td>{StatusCell({u})}</S.Td>
                    <S.Td className="text-slate-400 whitespace-nowrap">{u.joined}</S.Td>
                    <S.Td>{ActionsCell({u})}</S.Td>
                  </tr>
                  );
                })}
                {teamUsers.length===0 && (
                  <tr><td colSpan={11} className="text-center text-sm text-slate-400 py-8">No team members yet — click "Add User" above.</td></tr>
                )}
              </tbody>
            </table>
          </S.Card>

          {/* Clients — external logins hard-restricted to one project's Client Portal + Structure */}
          <div className="flex items-center gap-2 mb-2">
            <S.Icon name="building" className="w-4 h-4 text-violet-600"/>
            <span className="text-sm font-semibold text-slate-700">Clients</span>
            <S.Badge cls="bg-violet-50 text-violet-700">{clientUsers.length}</S.Badge>
          </div>
          <S.Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr><S.Th>Name</S.Th><S.Th>Email</S.Th><S.Th>Password</S.Th><S.Th>Project</S.Th><S.Th>Access</S.Th><S.Th>Status</S.Th><S.Th>Joined</S.Th><S.Th>Actions</S.Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clientUsers.map((u:any)=>{
                  const isEditing = editingId===u.id;
                  return (
                  <tr key={u.id} className={rowCls(u, isEditing)}>
                    {NameEmailCells({u})}
                    <S.Td className="font-mono text-xs">{canEditUsers ? (u.password || '—') : '—'}</S.Td>
                    <S.Td>
                      {canEditUsers ? (
                        <select value={u.project||''} onChange={e=>setClientProject(u.id, e.target.value)} className="border border-slate-200 rounded-lg px-1.5 py-1 text-xs max-w-[9rem] focus:outline-none focus:ring-2 focus:ring-violet-500">
                          <option value="">— no project —</option>
                          {projects.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs text-slate-500 truncate max-w-[9rem] inline-block">{projects.find((p:any)=>p.id===u.project)?.name || 'No project'}</span>
                      )}
                    </S.Td>
                    <S.Td><S.Badge cls="bg-slate-100 text-slate-500">Restricted</S.Badge></S.Td>
                    <S.Td>{StatusCell({u})}</S.Td>
                    <S.Td className="text-slate-400 whitespace-nowrap">{u.joined}</S.Td>
                    <S.Td>{ActionsCell({u})}</S.Td>
                  </tr>
                  );
                })}
                {clientUsers.length===0 && (
                  <tr><td colSpan={8} className="text-center text-sm text-slate-400 py-8">No clients yet — click "Add User" above and choose Add Client.</td></tr>
                )}
              </tbody>
            </table>
          </S.Card>
        </>);
      })()}
    </div>
  );
}

// Team Productivity Settings — per-teammate benchmarks that Team Management measures live actuals
// against (No. of Projects, Team Size, Billing Target, On Site Visits Per Project). Keyed by the
// teammate's Administration -> Users id rather than name, so a later name edit doesn't orphan their
// benchmark. Uses the same uncontrolled-input + onBlur pattern as Team Management's inline row
// editors, for the same reason (no re-render/focus loss on every keystroke).
function ProductivityPanel(){
  const { admin, patchAdmin } = React.useContext(S.AdminDataContext);
  const { email } = React.useContext(S.CurrentUserContext);
  const { logActivity } = React.useContext(S.ActivityLogContext);
  const canEdit = S.capAtLeast(S.capabilityFor('Administration', email, admin), 'Edit');
  const teammates = (admin.users||[]).filter((u:any)=>u.type!=='Client');
  const benchFor = (userId:string) => ({ ...S.DEFAULT_PRODUCTIVITY_BENCHMARK, ...((admin.productivity||{})[userId]||{}) });
  const setBench = (userId:string, key:string, val:string) => {
    if(!canEdit) return;
    const num = Number(val)||0;
    patchAdmin('productivity', (prod:any) => ({ ...(prod||{}), [userId]: { ...S.DEFAULT_PRODUCTIVITY_BENCHMARK, ...((prod||{})[userId]||{}), [key]: num } }));
    const u = teammates.find((x:any)=>x.id===userId);
    logActivity({ module:'Team Productivity', action: `Set ${u?.name||userId}'s "${key}" benchmark to ${num}` });
  };
  return (
    <div>
      <div className="text-sm text-slate-500 mb-4 max-w-2xl">Per-teammate targets that Team Management measures live actuals against — projects, team size, billing and onsite visits are all pulled from Project Master and Billing Tracker, not entered by hand. A Premium-tier project counts as <b>two</b> projects toward the "No. of Projects" actual.</div>
      {!canEdit && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">You have view-only access here — ask a Super Admin for Edit access on Administration to change benchmarks.</div>}
      <S.Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr><S.Th>Teammate</S.Th><S.Th>Designation</S.Th>{S.PRODUCTIVITY_METRICS.map((m:any)=><S.Th key={m.key}>{m.label}</S.Th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {teammates.map((u:any)=>{
              const b = benchFor(u.id);
              return (
                <tr key={u.id} className="hover:bg-slate-50">
                  <S.Td className="font-medium whitespace-nowrap">{u.name}</S.Td>
                  <S.Td className="text-slate-500 whitespace-nowrap">{u.designation||'—'}</S.Td>
                  {S.PRODUCTIVITY_METRICS.map((m:any)=>(
                    <S.Td key={m.key}>
                      <div className="flex items-center gap-1">
                        {m.unit && <span className="text-xs text-slate-400">{m.unit}</span>}
                        <input type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={b[m.key]} disabled={!canEdit}
                          onBlur={e=>setBench(u.id, m.key, e.target.value.replace(/[^0-9]/g,''))}
                          className="w-20 border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1.5 py-1 text-sm text-slate-600 focus:outline-none bg-transparent focus:bg-white disabled:cursor-not-allowed"/>
                      </div>
                    </S.Td>
                  ))}
                </tr>
              );
            })}
            {teammates.length===0 && (
              <tr><td colSpan={2+S.PRODUCTIVITY_METRICS.length} className="text-center text-sm text-slate-400 py-8">No teammates yet — add them in the Users tab.</td></tr>
            )}
          </tbody>
        </table>
      </S.Card>
    </div>
  );
}

// Defined ONCE at module scope, not inside CompanyPanel's render body — an inline component
// definition gets a fresh function identity every keystroke, which makes React unmount+remount the
// underlying <input> and drop focus after every character (same bug class documented for
// ProjectMaster's TextF/NumF/etc. in shared.tsx; this was the Administration -> Company version of it).
const CompanyField = ({label, value, type, onChange, disabled}: any) => (
  <div className="flex flex-col gap-1">
    <label className="text-[10px] text-slate-400">{label}</label>
    <input type={type||'text'} value={value||''} disabled={disabled} onChange={e=>onChange(e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"/>
  </div>
);

// Text fields that save on every keystroke (via patchAdmin's own debounce) would otherwise spam the
// activity log with one entry per character. This coalesces rapid edits to the same field into a
// single log entry, fired ~1s after the user stops typing that field — mirrors the debounce comment
// on patchAdmin itself, just applied to the log write rather than the DB write.
function useDebouncedFieldLog(logActivity: any, module: string){
  const timers = React.useRef<Record<string, any>>({});
  return (field: string, action: string) => {
    if(timers.current[field]) clearTimeout(timers.current[field]);
    timers.current[field] = setTimeout(() => { logActivity({ module, action }); delete timers.current[field]; }, 1000);
  };
}

function CompanyPanel(){
  const { admin, patchAdmin } = React.useContext(S.AdminDataContext);
  const { email } = React.useContext(S.CurrentUserContext);
  const { logActivity } = React.useContext(S.ActivityLogContext);
  const canEdit = S.capAtLeast(S.capabilityFor('Administration', email, admin), 'Edit');
  const logField = useDebouncedFieldLog(logActivity, 'Company');
  const c = admin.company;
  const set = (k,v) => { if(!canEdit) return; patchAdmin('company', co => ({ ...co, [k]:v })); logField(k, `Updated Company "${k}"`); };
  return (
    <div>
      {!canEdit && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">You have view-only access here — ask a Super Admin for Edit access on Administration to change the company profile.</div>}
      <div className="text-sm text-slate-500 mb-4 max-w-2xl flex items-center gap-2"><S.Icon name="building" className="w-4 h-4 text-slate-400 shrink-0"/> Legal, contact and localization details used across invoices, exports and client-facing documents. Changes save instantly.</div>
      <S.Card className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <CompanyField label="Legal Name" value={c.legalName} disabled={!canEdit} onChange={v=>set('legalName',v)}/>
        <CompanyField label="Display Name" value={c.displayName} disabled={!canEdit} onChange={v=>set('displayName',v)}/>
        <CompanyField label="GSTIN" value={c.gstin} disabled={!canEdit} onChange={v=>set('gstin',v)}/>
        <CompanyField label="CIN" value={c.cin} disabled={!canEdit} onChange={v=>set('cin',v)}/>
        <CompanyField label="Website" value={c.website} disabled={!canEdit} onChange={v=>set('website',v)}/>
        <CompanyField label="Industry" value={c.industry} disabled={!canEdit} onChange={v=>set('industry',v)}/>
        <CompanyField label="Founded" value={c.founded} disabled={!canEdit} onChange={v=>set('founded',v)}/>
        <CompanyField label="Employee Count" value={c.employeeCount} disabled={!canEdit} onChange={v=>set('employeeCount',v)}/>
        <CompanyField label="Primary Contact" value={c.primaryContact} disabled={!canEdit} onChange={v=>set('primaryContact',v)}/>
        <CompanyField label="Support Email" type="email" value={c.supportEmail} disabled={!canEdit} onChange={v=>set('supportEmail',v)}/>
        <CompanyField label="Phone" value={c.phone} disabled={!canEdit} onChange={v=>set('phone',v)}/>
        <CompanyField label="Time Zone" value={c.timezone} disabled={!canEdit} onChange={v=>set('timezone',v)}/>
        <CompanyField label="Currency" value={c.currency} disabled={!canEdit} onChange={v=>set('currency',v)}/>
        <CompanyField label="Fiscal Year Start" value={c.fiscalYearStart} disabled={!canEdit} onChange={v=>set('fiscalYearStart',v)}/>
        <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
          <label className="text-[10px] text-slate-400">Registered Address</label>
          <textarea value={c.address||''} disabled={!canEdit} onChange={e=>set('address',e.target.value)} rows={2} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        </div>
      </S.Card>
    </div>
  );
}

function BillingPanel(){
  const { admin, patchAdmin } = React.useContext(S.AdminDataContext);
  const { email } = React.useContext(S.CurrentUserContext);
  const { logActivity } = React.useContext(S.ActivityLogContext);
  // Billing lives inside Administration for this panel (the Financials & Billing matrix module
  // instead gates the Payment Receipts / Billing Tracker sections inside a project in Project Master),
  // so this respects the Administration capability like the rest of these panels.
  const canEdit = S.capAtLeast(S.capabilityFor('Administration', email, admin), 'Edit');
  const logField = useDebouncedFieldLog(logActivity, 'Billing');
  const b = admin.billing;
  const set = (k,v) => {
    if(!canEdit) return;
    patchAdmin('billing', bl => ({ ...bl, [k]:v }));
    // Plan/auto-renew are discrete, meaningful toggles -- log those immediately; free-text fields
    // (payment method, billing contact) are debounced like Company's fields above.
    if(k==='plan') logActivity({ module:'Billing', action: `Changed plan to "${v}"` });
    else if(k==='autoRenew') logActivity({ module:'Billing', action: `${v?'Enabled':'Disabled'} auto-renew` });
    else logField(k, `Updated Billing "${k}"`);
  };
  const daysToRenewal = b.plan==='Annual' ? S.daysLeft(b.renewalDate) : null;
  return (
    <div className="space-y-4">
      {!canEdit && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">You have view-only access here — ask a Super Admin for Edit access on Administration to change billing.</div>}
      <S.Card className="p-4">
        <div className="font-semibold text-slate-800 mb-3">Plan</div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 w-fit mb-4">
          {['Annual','Forever'].map(p=>(
            <button key={p} disabled={!canEdit} onClick={()=>set('plan',p)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed ${b.plan===p?'bg-white text-brand-700 shadow-sm':'text-slate-500'}`}>{p}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <S.Card className="p-3"><div className="text-xs text-slate-500">Tier</div><div className="text-lg font-semibold text-slate-800 mt-0.5">{b.tier}</div></S.Card>
          <S.Card className="p-3"><div className="text-xs text-slate-500">Seats Used</div><div className="text-lg font-semibold text-slate-800 mt-0.5">{b.seatsUsed} / {b.seats}</div></S.Card>
          <S.Card className="p-3"><div className="text-xs text-slate-500">Price / Seat / Month</div><div className="text-lg font-semibold text-slate-800 mt-0.5">₹{S.fmt(b.pricePerSeatMonthly)}</div></S.Card>
          <S.Card className="p-3">
            <div className="text-xs text-slate-500">{b.plan==='Annual' ? 'Renews' : 'Purchased'}</div>
            <div className="text-lg font-semibold text-slate-800 mt-0.5">{b.plan==='Annual' ? b.renewalDate : b.perpetualPurchaseDate}</div>
          </S.Card>
        </div>
        {b.plan==='Annual' ? (
          <div className={`text-sm rounded-lg px-3 py-2 flex items-center gap-2 ${daysToRenewal<=30?'bg-amber-50 text-amber-800 border border-amber-200':'bg-slate-50 text-slate-600 border border-slate-200'}`}>
            <S.Icon name="refresh" className="w-4 h-4 shrink-0"/> Annual subscription renews on <b className="mx-1">{b.renewalDate}</b> ({daysToRenewal}d away).
            <label className="ml-auto inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
              <input type="checkbox" checked={!!b.autoRenew} disabled={!canEdit} onChange={e=>set('autoRenew', e.target.checked)}/> Auto-renew
            </label>
          </div>
        ) : (
          <div className="text-sm rounded-lg px-3 py-2 flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200">
            <S.Icon name="checkcircle" className="w-4 h-4 shrink-0"/> Forever (perpetual) license — purchased {b.perpetualPurchaseDate}. No renewal required; optional annual support/maintenance can be added separately.
          </div>
        )}
      </S.Card>

      <S.Card className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-400">Payment Method</label>
          <input value={b.paymentMethod} disabled={!canEdit} onChange={e=>set('paymentMethod',e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-400">Billing Contact</label>
          <input value={b.billingContact} disabled={!canEdit} onChange={e=>set('billingContact',e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        </div>
      </S.Card>

      <S.Card className="overflow-hidden">
        <div className="px-4 pt-3 pb-1 font-semibold text-slate-800">Invoice History</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200"><tr><S.Th>Invoice</S.Th><S.Th>Date</S.Th><S.Th>Amount</S.Th><S.Th>Status</S.Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {b.invoices.map(inv=>(
              <tr key={inv.id}><S.Td className="font-mono text-xs">{inv.id}</S.Td><S.Td>{inv.date}</S.Td><S.Td>₹{S.fmt(inv.amount)}</S.Td><S.Td><S.Badge cls="bg-emerald-100 text-emerald-700">{inv.status}</S.Badge></S.Td></tr>
            ))}
          </tbody>
        </table>
      </S.Card>
    </div>
  );
}

function NotificationsPanel(){
  const { admin, patchAdmin } = React.useContext(S.AdminDataContext);
  const { email } = React.useContext(S.CurrentUserContext);
  const { logActivity } = React.useContext(S.ActivityLogContext);
  const canEdit = S.capAtLeast(S.capabilityFor('Administration', email, admin), 'Edit');
  const toggle = (key, channel) => {
    if(!canEdit) return;
    let next = false;
    patchAdmin('notifications', n => ({ ...n, categories: n.categories.map(c=>{ if(c.key!==key) return c; next = !c[channel]; return {...c,[channel]:next}; }) }));
    const cat = (admin.notifications?.categories||[]).find((c:any)=>c.key===key);
    logActivity({ module:'Notifications', action: `${next?'Enabled':'Disabled'} ${channel==='inApp'?'in-app':'email'} notifications for "${cat?.label||key}"` });
  };
  return (
    <div>
      {!canEdit && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">You have view-only access here — ask a Super Admin for Edit access on Administration to change notification rules.</div>}
      <div className="text-sm text-slate-500 mb-4 max-w-2xl">Choose how each category of activity reaches your team — by email, in-app, or both.</div>
      <S.Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200"><tr><S.Th>Category</S.Th><S.Th>Email</S.Th><S.Th>In-App</S.Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {admin.notifications.categories.map(c=>(
              <tr key={c.key}>
                <S.Td className="font-medium">{c.label}</S.Td>
                <S.Td><input type="checkbox" checked={c.email} disabled={!canEdit} onChange={()=>toggle(c.key,'email')}/></S.Td>
                <S.Td><input type="checkbox" checked={c.inApp} disabled={!canEdit} onChange={()=>toggle(c.key,'inApp')}/></S.Td>
              </tr>
            ))}
          </tbody>
        </table>
      </S.Card>
    </div>
  );
}

// User Login Log Book — last tab in Administration, Super Admin only (S.isSuperAdmin gates both the
// tab button itself in Admin() below and this panel's body, same defense-in-depth pattern the rest
// of this file uses e.g. canEditUsers/iAmSuperAdmin in UsersPanel). Two feeds, both fetched on demand
// (not part of the app's normal startup load — see db.ts's comment on fetchLoginLogs/fetchActivityLogs
// for why): Login History is one row per session start (App.tsx's recordLogin-equivalent write, see
// its own comment on why that's "session start" and not strictly "password submitted"); Changes Made
// is every logActivity() call fired from around the app (S.ActivityLogContext) as real actions
// actually commit — status changes, project/user/risk/issue edits, and so on, not raw keystrokes.
function LoginLogBookPanel(){
  const { admin } = React.useContext(S.AdminDataContext);
  const [logins, setLogins] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [view, setView] = useState<'logins'|'activity'>('logins');
  const [userFilter, setUserFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');

  const load = () => {
    setLoading(true); setErr('');
    Promise.all([db.fetchLoginLogs(), db.fetchActivityLogs()])
      .then(([l, a]) => { setLogins(l); setActivity(a); })
      .catch((e: any) => setErr(e.message || 'Could not load the log book.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A row's own userName is stamped at write time (see App.tsx) so history stays readable even if
  // the account is later renamed/deactivated; falls back to a live Administration -> Users lookup by
  // email, then the raw email itself, for any older row written before that stamp existed.
  const nameFor = (email: string, stamped: string) => stamped || (admin.users || []).find((u: any) => (u.email || '').toLowerCase() === (email || '').toLowerCase())?.name || email;

  const modules = useMemo(() => Array.from(new Set(activity.map((a: any) => a.module))).sort() as string[], [activity]);

  const matchesUser = (email: string, stamped: string) => {
    if (!userFilter) return true;
    const q = userFilter.toLowerCase();
    return nameFor(email, stamped).toLowerCase().includes(q) || (email || '').toLowerCase().includes(q);
  };
  const filteredLogins = logins.filter((l: any) => matchesUser(l.userEmail, l.userName));
  const filteredActivity = activity.filter((a: any) => matchesUser(a.userEmail, a.userName) && (!moduleFilter || a.module === moduleFilter));

  const fmt = (at: string) => at ? new Date(at).toLocaleString() : '—';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <S.Icon name="shield" className="w-4 h-4 text-brand-600"/>
          <span className="text-sm font-semibold text-slate-700">User Login Log Book</span>
          <S.Badge cls="bg-amber-50 text-amber-700">Super Admin only</S.Badge>
        </div>
        <button onClick={load} disabled={loading} className="text-xs bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5">
          <S.Icon name="refresh" className="w-3.5 h-3.5"/> Refresh
        </button>
      </div>

      {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{err}</div>}

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 mb-4 text-xs w-fit">
        <button onClick={()=>setView('logins')} className={`px-3 py-1.5 rounded-md font-medium transition-colors ${view==='logins'?'bg-white text-brand-700 shadow-sm':'text-slate-500'}`}>Login History</button>
        <button onClick={()=>setView('activity')} className={`px-3 py-1.5 rounded-md font-medium transition-colors ${view==='activity'?'bg-white text-brand-700 shadow-sm':'text-slate-500'}`}>Changes Made</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input value={userFilter} onChange={e=>setUserFilter(e.target.value)} placeholder="Filter by user name or email…" className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        {view==='activity' && (
          <select value={moduleFilter} onChange={e=>setModuleFilter(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">All modules</option>
            {modules.map((m: string)=><option key={m}>{m}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-8 text-center">Loading…</div>
      ) : view==='logins' ? (
        <S.Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200"><tr><S.Th>User</S.Th><S.Th>Email</S.Th><S.Th>Login Time</S.Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogins.map((l: any)=>(
                <tr key={l.id}>
                  <S.Td className="font-medium text-slate-700 whitespace-nowrap">{nameFor(l.userEmail, l.userName)}</S.Td>
                  <S.Td className="text-slate-500">{l.userEmail}</S.Td>
                  <S.Td className="text-slate-400 whitespace-nowrap">{fmt(l.at)}</S.Td>
                </tr>
              ))}
              {filteredLogins.length===0 && <tr><td colSpan={3} className="text-center text-sm text-slate-400 py-8">No sign-ins recorded yet.</td></tr>}
            </tbody>
          </table>
        </S.Card>
      ) : (
        <S.Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200"><tr><S.Th>User</S.Th><S.Th>Module</S.Th><S.Th>Change</S.Th><S.Th>Project</S.Th><S.Th>Time</S.Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filteredActivity.map((a: any)=>(
                <tr key={a.id}>
                  <S.Td className="font-medium text-slate-700 whitespace-nowrap">{nameFor(a.userEmail, a.userName)}</S.Td>
                  <S.Td><S.Badge cls="bg-slate-100 text-slate-600">{a.module}</S.Badge></S.Td>
                  <S.Td className="text-slate-600">{a.action}</S.Td>
                  <S.Td className="text-slate-400 whitespace-nowrap">{a.project || '—'}</S.Td>
                  <S.Td className="text-slate-400 whitespace-nowrap" title={fmt(a.at)}>{S.relativeTime(a.at)}</S.Td>
                </tr>
              ))}
              {filteredActivity.length===0 && <tr><td colSpan={5} className="text-center text-sm text-slate-400 py-8">No activity recorded yet.</td></tr>}
            </tbody>
          </table>
        </S.Card>
      )}
    </div>
  );
}

// Branch and Holiday Calendar editors each need their own draft-input state, so — same reasoning
// as TagListSetting/SimpleListEditor — they're standalone components rather than inline hooks
// inside a switch-case (which would violate the Rules of Hooks as `item` changes).
function BranchEditor({ branches, setExtras, canEdit=true }: any){
  const { logActivity } = React.useContext(S.ActivityLogContext);
  const [name,setName]=useState(''), [city,setCity]=useState('');
  const add=()=>{ if(!canEdit || !name.trim())return; setExtras('branches', b=>[...b,{id:S.uid('BR'),name:name.trim(),city:city.trim()}]); logActivity({ module:'Administration', action:`Added branch "${name.trim()}"` }); setName(''); setCity(''); };
  const remove=(id)=>{ if(!canEdit) return; const b=branches.find(x=>x.id===id); setExtras('branches', b=>b.filter(x=>x.id!==id)); logActivity({ module:'Administration', action:`Removed branch "${b?.name||id}"` }); };
  return (
    <div>
      <div className="space-y-1.5 mb-3">
        {branches.map(b=>(
          <div key={b.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <span className="flex-1 text-sm text-slate-700">{b.name}</span><span className="text-xs text-slate-400">{b.city}</span>
            {canEdit && <button onClick={()=>remove(b.id)} className="text-slate-300 hover:text-red-500"><S.Icon name="trash" className="w-3.5 h-3.5"/></button>}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="flex gap-1.5">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Branch name" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
          <input value={city} onChange={e=>setCity(e.target.value)} placeholder="City" className="w-32 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
          <button onClick={add} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-1.5">+ Add</button>
        </div>
      )}
    </div>
  );
}
function HolidayEditor({ holidays, setExtras, canEdit=true }: any){
  const { logActivity } = React.useContext(S.ActivityLogContext);
  const [date,setDate]=useState(''), [name,setName]=useState('');
  const add=()=>{ if(!canEdit || !date||!name.trim())return; setExtras('holidays', h=>[...h,{date,name:name.trim()}].sort((a,b)=>a.date.localeCompare(b.date))); logActivity({ module:'Administration', action:`Added holiday "${name.trim()}" (${date})` }); setDate(''); setName(''); };
  const remove=(idx)=>{ if(!canEdit) return; const h=holidays[idx]; setExtras('holidays', h=>h.filter((_,i)=>i!==idx)); logActivity({ module:'Administration', action:`Removed holiday "${h?.name||''}"` }); };
  return (
    <div>
      <div className="space-y-1.5 mb-3">
        {holidays.map((h,i)=>(
          <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm">
            <span className="font-mono text-xs text-slate-400 w-24">{h.date}</span><span className="flex-1 text-slate-700">{h.name}</span>
            {canEdit && <button onClick={()=>remove(i)} className="text-slate-300 hover:text-red-500"><S.Icon name="trash" className="w-3.5 h-3.5"/></button>}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="flex gap-1.5">
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Holiday name" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
          <button onClick={add} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-1.5">+ Add</button>
        </div>
      )}
    </div>
  );
}

// Everything reachable from the Overview grouped list — each item now opens real, working content
// instead of a dead row. Shortcut items just switch the parent tab. This component itself must stay
// hook-free in its per-case branches (see BranchEditor/HolidayEditor above for why).
function AdminOverviewDetail({ item, setTab }: any){
  const { admin, patchAdmin } = React.useContext(S.AdminDataContext);
  const { settings, setSettings } = React.useContext(S.SettingsContext);
  const { team } = React.useContext(S.TeamDataContext);
  const { email } = React.useContext(S.CurrentUserContext);
  const { logActivity } = React.useContext(S.ActivityLogContext);
  const canEdit = S.capAtLeast(S.capabilityFor('Administration', email, admin), 'Edit');
  const extras = admin.extras;
  const setExtras = (k, updater) => { if(!canEdit) return; patchAdmin('extras', ex => ({ ...ex, [k]: typeof updater==='function'?updater(ex[k]):updater })); };
  // Plain string list editors (SimpleListEditor for templates/masters) only hand back the whole new
  // array, so diff against the array we already have in hand to describe what actually changed.
  const logListDiff = (label: string, oldList: string[], newList: string[]) => {
    const added = (newList||[]).filter(v=>!(oldList||[]).includes(v));
    const removed = (oldList||[]).filter(v=>!(newList||[]).includes(v));
    added.forEach(v => logActivity({ module:'Administration', action: `Added "${v}" to ${label}` }));
    removed.forEach(v => logActivity({ module:'Administration', action: `Removed "${v}" from ${label}` }));
  };

  switch(item){
    case 'Company':
      return <div><div className="text-sm text-slate-500 mb-3">Full company profile lives in its own tab.</div><button onClick={()=>setTab('company')} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-2">Open Company Settings</button></div>;
    case 'Roles':
    case 'Permissions':
      return <div><div className="text-sm text-slate-500 mb-3">Designation-to-permission mapping and the full capability matrix live in their own tab.</div><button onClick={()=>setTab('roles')} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-2">Open Roles & Permissions</button></div>;
    case 'Notification Rules':
      return <div><div className="text-sm text-slate-500 mb-3">Per-category email / in-app rules live in their own tab.</div><button onClick={()=>setTab('notifications')} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-2">Open Notifications</button></div>;

    case 'Branch':
      return <BranchEditor branches={extras.branches} setExtras={setExtras} canEdit={canEdit}/>;
    case 'Departments': {
      const deptCounts: any = {}; team.forEach(m=>{ deptCounts[m.dept]=(deptCounts[m.dept]||0)+1; });
      return (
        <div>
          <div className="text-xs text-slate-400 mb-2">Auto-derived from Team Management — add a member to a new department there and it will appear here.</div>
          <div className="space-y-1.5">
            {Object.entries(deptCounts).map(([d,c]: any) =>(
              <div key={d} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm">
                <span className="text-slate-700">{d}</span><S.Badge cls="bg-slate-100 text-slate-500">{c} member{c===1?'':'s'}</S.Badge>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'Holiday Calendar':
      return <HolidayEditor holidays={extras.holidays} setExtras={setExtras} canEdit={canEdit}/>;
    case 'Working Days': {
      const wd = extras.workingDays;
      const toggleDay = (d) => { setExtras('workingDays', w=>({...w, [d]:!w[d]})); logActivity({ module:'Administration', action: `${wd[d]?'Removed':'Added'} "${d}" ${wd[d]?'from':'to'} Working Days` }); };
      const setTime = (k,v) => { setExtras('workingDays', w=>({...w, [k]:v})); logActivity({ module:'Administration', action: `Set Working Days "${k}" time to ${v}` }); };
      return (
        <div>
          <div className="flex flex-wrap gap-2 mb-4">
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>(
              <button key={d} disabled={!canEdit} onClick={()=>toggleDay(d)} className={`w-12 py-2 rounded-lg text-xs font-medium border disabled:cursor-not-allowed ${wd[d]?'bg-brand-500 border-brand-500 text-white':'border-slate-200 text-slate-400 hover:bg-slate-50'}`}>{d}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Working hours</span>
            <input type="time" value={wd.start} disabled={!canEdit} onChange={e=>setTime('start',e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"/>
            <span className="text-slate-400">to</span>
            <input type="time" value={wd.end} disabled={!canEdit} onChange={e=>setTime('end',e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"/>
          </div>
        </div>
      );
    }
    case 'Audit Logs':
      return (
        <div className="space-y-1.5">
          {extras.auditLogs.map((a,i)=>(
            <div key={i} className="flex items-start gap-3 text-sm bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              <span className="text-xs text-slate-400 whitespace-nowrap w-32">{a.when}</span>
              <span className="font-medium text-slate-700 whitespace-nowrap">{a.user}</span>
              <span className="text-slate-500">{a.action}</span>
            </div>
          ))}
        </div>
      );
    case 'Project Templates': case 'Phase Templates': case 'Deliverable Templates': case 'Email Templates':
      return <SimpleListEditor list={extras.templates[item]} placeholder={`Add ${item.toLowerCase().slice(0,-1)}…`} onChange={v=>{ logListDiff(item, extras.templates[item], v); setExtras('templates', t=>({...t,[item]:v})); }} canEdit={canEdit}/>;
    case 'Status Master':
      return <SimpleListEditor list={settings.itemStatuses} placeholder="e.g. Blocked" onChange={v=>{ if(!canEdit) return; logListDiff('Status Master', settings.itemStatuses, v); setSettings(s=>({...s,itemStatuses:v})); }} canEdit={canEdit}/>;
    case 'Priority Master':
      return <SimpleListEditor list={settings.priorityLevels} placeholder="e.g. Critical" onChange={v=>{ if(!canEdit) return; logListDiff('Priority Master', settings.priorityLevels, v); setSettings(s=>({...s,priorityLevels:v})); }} canEdit={canEdit}/>;
    case 'Function Master':
      return <SimpleListEditor list={settings.functions} placeholder="e.g. Legal" onChange={v=>{ if(!canEdit) return; logListDiff('Function Master', settings.functions, v); setSettings(s=>({...s,functions:v})); }} canEdit={canEdit}/>;
    case 'Department Master':
      return <SimpleListEditor list={settings.departments} placeholder="e.g. Legal" onChange={v=>{ if(!canEdit) return; logListDiff('Department Master', settings.departments, v); setSettings(s=>({...s,departments:v})); }} canEdit={canEdit}/>;
    case 'Backup':
      return (
        <div>
          <div className="text-sm text-slate-500 mb-3">Last backup: <b className="text-slate-700">{extras.lastBackup}</b></div>
          {canEdit && <button onClick={()=>{ setExtras('lastBackup', ()=>new Date().toISOString().slice(0,16).replace('T',' ')); logActivity({ module:'Administration', action: 'Ran a manual backup' }); }} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-2 inline-flex items-center gap-1.5"><S.Icon name="refresh" className="w-3.5 h-3.5"/> Run Backup Now</button>}
        </div>
      );
    case 'Integrations':
      return (
        <div className="space-y-2">
          {extras.integrations.map((it,i)=>(
            <div key={it.name} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
              <div><div className="text-sm font-medium text-slate-700">{it.name}</div><div className="text-xs text-slate-400">{it.desc}</div></div>
              <button disabled={!canEdit} onClick={()=>{ setExtras('integrations', arr=>arr.map((x,idx)=>idx===i?{...x,connected:!x.connected}:x)); logActivity({ module:'Administration', action: `${it.connected?'Disconnected':'Connected'} integration "${it.name}"` }); }}
                className={`text-xs rounded-lg px-3 py-1.5 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 ${it.connected?'bg-emerald-100 text-emerald-700 hover:bg-emerald-200':'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                {it.connected?'Connected':'Connect'}
              </button>
            </div>
          ))}
        </div>
      );
    default:
      return <div className="text-sm text-slate-400">Select an item from the left.</div>;
  }
}

export default function Admin(){
  const [tab, setTab] = useState('overview');
  const { admin } = React.useContext(S.AdminDataContext);
  const { email } = React.useContext(S.CurrentUserContext);
  // User Login Log Book is the one tab in Administration gated on actual Super Admin permission
  // level (S.isSuperAdmin), not just the Administration capability matrix like every other tab here
  // -- per the request, nobody below Super Admin should even see this tab exists.
  const iAmSuperAdmin = S.isSuperAdmin(email, admin);
  // If permissions changed under someone currently sitting on this tab (e.g. their Super Admin
  // override was just revoked in another tab), fall back rather than leave them stranded on a panel
  // whose tab button no longer renders.
  React.useEffect(() => { if (tab==='loginLogBook' && !iAmSuperAdmin) setTab('overview'); }, [tab, iAmSuperAdmin]);
  const groups = {
    'Organization':['Company','Branch','Departments','Holiday Calendar','Working Days'],
    'Access':['Roles','Permissions','Audit Logs'],
    'Templates':['Project Templates','Phase Templates','Deliverable Templates','Email Templates'],
    'Masters':['Status Master','Priority Master','Function Master','Department Master','Notification Rules'],
    'System':['Backup','Integrations'],
  };
  const [selectedGroup, setSelectedGroup] = useState(Object.keys(groups)[0]);
  const [selectedItem, setSelectedItem] = useState(groups[Object.keys(groups)[0]][0]);
  const TABS = [
    ['overview','Overview'],
    ['company','Company'],
    ['billing','Billing'],
    ['roles','Roles & Permissions'],
    ['users','Users'],
    ['productivity','Team Productivity'],
    ['notifications','Notifications'],
    ['projectSettings','Project Settings'],
    ...(iAmSuperAdmin ? [['loginLogBook','User Login Log Book']] : []),
  ];
  return (
    <div>
      <S.SectionTitle sub="Company configuration, roles & permissions, users, billing and integrations">Administration</S.SectionTitle>
      <div className="flex gap-1 border-b border-slate-200 mb-4 pb-px overflow-x-auto">
        {TABS.map(([id,label]: any) =>(
          <button key={id} onClick={()=>setTab(id)}
            className={`px-4 py-2.5 text-sm rounded-t-lg border-b-2 -mb-px whitespace-nowrap transition-colors ${tab===id?'border-brand-500 text-brand-700 bg-white font-medium':'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab==='overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <S.Card className="lg:col-span-1 p-0 overflow-hidden h-fit">
            {Object.entries(groups).map(([g,items]: any) =>(
              <div key={g} className="border-b border-slate-100 last:border-b-0">
                <button onClick={()=>setSelectedGroup(g)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm transition-colors ${selectedGroup===g?'bg-brand-50 text-brand-700 font-medium':'text-slate-600 hover:bg-slate-50'}`}>
                  <span>{g}</span>
                  <S.Badge cls="bg-slate-100 text-slate-500">{items.length}</S.Badge>
                </button>
                {selectedGroup===g && (
                  <div className="pb-1">
                    {items.map(it=>(
                      <button key={it} onClick={()=>setSelectedItem(it)}
                        className={`w-full text-left px-6 py-1.5 text-xs transition-colors ${selectedItem===it?'text-brand-700 font-medium bg-brand-50/60':'text-slate-500 hover:bg-slate-50'}`}>
                        {it}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </S.Card>
          <S.Card className="lg:col-span-3 p-4">
            <div className="font-semibold text-slate-800 mb-3">{selectedItem}</div>
            <AdminOverviewDetail item={selectedItem} setTab={setTab}/>
          </S.Card>
        </div>
      )}
      {tab==='company' && <CompanyPanel/>}
      {tab==='billing' && <BillingPanel/>}
      {tab==='roles' && <RolesPermissionsPanel/>}
      {tab==='users' && <UsersPanel/>}
      {tab==='productivity' && <ProductivityPanel/>}
      {tab==='notifications' && <NotificationsPanel/>}
      {tab==='projectSettings' && <ProjectSettingsPanel/>}
      {tab==='loginLogBook' && iAmSuperAdmin && <LoginLogBookPanel/>}
    </div>
  );
}

