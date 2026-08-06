import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';
import * as db from '../db';

function TagListSetting({ title, hint, field, placeholder, settings, setSettings }: any){
  const [draft, setDraft] = useState('');
  const list = settings[field] || [];
  const add = () => {
    const v = draft.trim();
    if(!v) return;
    if(list.some(x=>x.toLowerCase()===v.toLowerCase())){ setDraft(''); return; }
    setSettings(s => ({ ...s, [field]: [...(s[field]||[]), v] }));
    setDraft('');
  };
  const remove = (i) => setSettings(s => ({ ...s, [field]: (s[field]||[]).filter((_,j)=>j!==i) }));
  return (
    <S.Card className="p-4">
      <div className="font-semibold text-slate-800">{title}</div>
      {hint && <div className="text-xs text-slate-400 mt-0.5 mb-3">{hint}</div>}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {list.map((v,i)=>(
          <span key={i} className="inline-flex items-center gap-1 bg-violet-100 text-violet-700 rounded-full px-2 py-0.5 text-[11px]">
            {v}<button onClick={()=>remove(i)} className="text-violet-400 hover:text-violet-600">×</button>
          </span>
        ))}
        {list.length===0 && <span className="text-xs text-slate-400">None yet.</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}
          placeholder={placeholder} className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        <button onClick={add} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-1.5 whitespace-nowrap">+ Add</button>
      </div>
    </S.Card>
  );
}

// Manages the master lists that back the New Project form's Category, Industry, Consulting Category
// and Engagement Type dropdowns. Lives under Administration -> Project Settings.
function ProjectSettingsPanel(){
  const { settings, setSettings } = React.useContext(S.SettingsContext);

  const [tierCode, setTierCode] = useState('');
  const [tierLabel, setTierLabel] = useState('');
  const addTier = () => {
    const code = tierCode.trim().toUpperCase();
    const label = tierLabel.trim();
    if(!code || !label) return;
    if(settings.categories.some(c=>c.code.toUpperCase()===code)) return;
    setSettings(s => ({ ...s, categories:[...s.categories, { code, label }] }));
    setTierCode(''); setTierLabel('');
  };
  const removeTier = (code) => setSettings(s => ({ ...s, categories: s.categories.filter(c=>c.code!==code) }));
  const editTierLabel = (code, label) => setSettings(s => ({ ...s, categories: s.categories.map(c=>c.code===code?{...c,label}:c) }));
  const resetDefaults = () => setSettings(S.DEFAULT_PROJECT_SETTINGS);

  return (
    <div>
      <div className="flex justify-between items-start mb-4 gap-3 flex-wrap">
        <div className="text-sm text-slate-500 max-w-2xl">These lists power the dropdowns on the New Project form — Category, Industry, Consulting Category and Engagement Type. Add or remove options here and they apply immediately across the app.</div>
        <button onClick={resetDefaults} className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 whitespace-nowrap">Reset to Defaults</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <S.Card className="p-4">
          <div className="font-semibold text-slate-800">Category (Client Tier)</div>
          <div className="text-xs text-slate-400 mt-0.5 mb-3">A = Premium, B = Medium Class, C = Normal Class by default — codes and labels are fully editable.</div>
          <div className="space-y-2 mb-3">
            {settings.categories.map(c=>(
              <div key={c.code} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
                <span className="font-mono text-xs font-semibold text-slate-500 w-6">{c.code}</span>
                <input value={c.label} onChange={e=>editTierLabel(c.code, e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <button onClick={()=>removeTier(c.code)} className="text-xs text-red-400 hover:text-red-600">✕</button>
              </div>
            ))}
            {settings.categories.length===0 && <div className="text-xs text-slate-400">No categories defined yet.</div>}
          </div>
          <div className="flex items-center gap-1.5">
            <input value={tierCode} onChange={e=>setTierCode(e.target.value)} placeholder="Code (e.g. D)" maxLength={3}
              className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <input value={tierLabel} onChange={e=>setTierLabel(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTier();}}} placeholder="Label (e.g. Strategic)"
              className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <button onClick={addTier} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-1.5 whitespace-nowrap">+ Add</button>
          </div>
        </S.Card>

        <TagListSetting title="Industry" hint="Top industries shown in the New Project Industry dropdown. New industries can also be added inline from the form itself." field="industries" placeholder="e.g. Aviation" settings={settings} setSettings={setSettings} />
        <TagListSetting title="Consulting Category" hint="Options offered in the New Project Consulting Category dropdown." field="consultingCategories" placeholder="e.g. Strategy Advisory" settings={settings} setSettings={setSettings} />
        <TagListSetting title="Engagement Type" hint="Options offered in the New Project Engagement Type dropdown." field="engagementTypes" placeholder="e.g. Retainer Plus" settings={settings} setSettings={setSettings} />
        <TagListSetting title="Phase / Milestone / Sub Task Status" hint="Shared status vocabulary used across Phase Management (Not Started / In Progress are picked freely; Completed and Implemented still require their normal approvals)." field="itemStatuses" placeholder="e.g. Blocked" settings={settings} setSettings={setSettings} />
      </div>
    </div>
  );
}

/* ===================== Administration sub-panels ===================== */

// Small reusable "simple tag list" editor — add/remove plain strings — used for template lists.
function SimpleListEditor({ list, onChange, placeholder }: any){
  const [draft, setDraft] = useState('');
  const add = () => { const v=draft.trim(); if(!v) return; onChange([...(list||[]), v]); setDraft(''); };
  const remove = (i) => onChange(list.filter((_,idx)=>idx!==i));
  return (
    <div>
      <div className="space-y-1.5 mb-2">
        {(list||[]).map((v,i)=>(
          <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <span className="flex-1 text-sm text-slate-700 truncate">{v}</span>
            <button onClick={()=>remove(i)} className="text-slate-300 hover:text-red-500"><S.Icon name="trash" className="w-3.5 h-3.5"/></button>
          </div>
        ))}
        {(!list||list.length===0) && <div className="text-xs text-slate-400">Nothing added yet.</div>}
      </div>
      <div className="flex gap-1.5">
        <input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}} placeholder={placeholder||'Add new…'}
          className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        <button onClick={add} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-1.5 whitespace-nowrap">+ Add</button>
      </div>
    </div>
  );
}

function RolesPermissionsPanel(){
  const { admin, patchAdmin } = React.useContext(S.AdminDataContext);
  const setLevel = (designation, level) => patchAdmin('designationLevel', dl => ({ ...dl, [designation]: level }));
  const setCap = (mod, level, cap) => patchAdmin('matrix', m => ({ ...m, [mod]: { ...m[mod], [level]: cap } }));
  const resetDefaults = () => { patchAdmin('designationLevel', ()=>({...S.DEFAULT_DESIGNATION_LEVEL})); patchAdmin('matrix', ()=>JSON.parse(JSON.stringify(S.DEFAULT_PERMISSION_MATRIX))); };
  return (
    <div className="space-y-5">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div className="text-sm text-slate-500 max-w-2xl">Every person is assigned one <b>designation</b>. Each designation maps to exactly one <b>permission level</b>, which drives the capability matrix below. Both are fully editable.</div>
        <button onClick={resetDefaults} className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 whitespace-nowrap">Reset to Defaults</button>
      </div>

      <S.Card className="p-4">
        <div className="font-semibold text-slate-800 mb-1 flex items-center gap-2"><S.Icon name="briefcase" className="w-4 h-4 text-slate-400"/> Designation → Permission Level</div>
        <div className="text-xs text-slate-400 mb-3">Associate, Project Manager, Project Head, Strategic Lead and BD each hold one of four permission levels.</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {S.DESIGNATIONS.map(d=>(
            <div key={d} className="border border-slate-200 rounded-lg p-3">
              <div className="text-sm font-medium text-slate-700 mb-2">{d}</div>
              <select value={admin.designationLevel[d]} onChange={e=>setLevel(d, e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {S.PERMISSION_LEVELS.map(l=><option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          ))}
        </div>
      </S.Card>

      <S.Card className="p-4 overflow-x-auto">
        <div className="font-semibold text-slate-800 mb-1 flex items-center gap-2"><S.Icon name="shield" className="w-4 h-4 text-slate-400"/> Capability Matrix</div>
        <div className="text-xs text-slate-400 mb-3">What each permission level can do, per module. Click any cell to change it.</div>
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr><S.Th>Module</S.Th>{S.PERMISSION_LEVELS.map(l=><S.Th key={l}>{l}</S.Th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {S.PERMISSION_MODULES.map(mod=>(
              <tr key={mod}>
                <S.Td className="font-medium whitespace-nowrap">{mod}</S.Td>
                {S.PERMISSION_LEVELS.map(level=>{
                  const cap = (admin.matrix[mod]||{})[level] || 'None';
                  return (
                    <S.Td key={level}>
                      <select value={cap} onChange={e=>setCap(mod, level, e.target.value)}
                        className={`text-xs font-medium rounded-full px-2 py-1 border-0 focus:outline-none focus:ring-2 focus:ring-brand-400 ${S.CAPABILITY_COLOR[cap]}`}>
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
  const { role } = React.useContext(S.RoleContext); // 'admin' covers both Admin and Super Admin permission levels (see deriveRole in shared.tsx)
  const canEditUsers = role === 'admin';
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<any>({ name:'', email:'', designation:'Associate', password: defaultPasswordFor('') });
  const [pwTouched, setPwTouched] = useState(false); // true once the admin manually edits the password field, so we stop overwriting it as the name changes
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [resetFor, setResetFor] = useState<any>(null); // { user, password }
  const [editingId, setEditingId] = useState<string|null>(null); // id of the user row currently being edited (Name/Email)
  const [editDraft, setEditDraft] = useState<any>({ name:'', email:'' });
  const [busy, setBusy] = useState<string|null>(null); // user id currently mid-action
  const [err, setErr] = useState('');

  const setDraftName = (name: string) => setDraft(d => ({ ...d, name, password: pwTouched ? d.password : defaultPasswordFor(name) }));

  const addUser = async () => {
    setErr('');
    const name = draft.name.trim(), email = draft.email.trim();
    if(!name || !email || !draft.password || draft.password.length<8) { setErr('Name, email and an 8+ character password are required.'); return; }
    if(admin.users.some((u:any)=>u.email.toLowerCase()===email.toLowerCase())) { setErr('A user with that email already exists.'); return; }
    setBusy('adding');
    try {
      await db.createUserAccount(email, draft.password, name);
      patchAdmin('users', (us:any[]) => [...us, { id:S.uid('USR'), name, email, designation:draft.designation, status:'Active', joined: S.TODAY_ISO }]);
      setDraft({ name:'', email:'', designation:'Associate', password: defaultPasswordFor('') }); setPwTouched(false); setAdding(false);
    } catch(e:any) { setErr(e.message || 'Could not create the login.'); }
    setBusy(null);
  };
  const setDesignation = (id, designation) => patchAdmin('users', (us:any[]) => us.map(u=>u.id===id?{...u,designation}:u));
  const approveUser = (u:any) => patchAdmin('users', (us:any[]) => us.map(x=>x.id===u.id?{...x,status:'Active'}:x));
  const toggleSuspend = async (u:any) => {
    setErr(''); setBusy(u.id);
    try {
      await db.setUserBanned(u.email, u.status==='Active');
      patchAdmin('users', (us:any[]) => us.map(x=>x.id===u.id?{...x,status:x.status==='Active'?'Suspended':'Active'}:x));
    } catch(e:any) { setErr(e.message || 'Could not update that account.'); }
    setBusy(null);
  };
  const removeUser = async (u:any) => {
    setErr(''); setBusy(u.id);
    try {
      await db.deleteUserAccount(u.email);
      patchAdmin('users', (us:any[]) => us.filter(x=>x.id!==u.id));
      setConfirmRemove(null);
    } catch(e:any) { setErr(e.message || 'Could not remove that account.'); }
    setBusy(null);
  };
  const doReset = async () => {
    if(!resetFor || !resetFor.password || resetFor.password.length<8) { setErr('Password must be at least 8 characters.'); return; }
    setErr(''); setBusy(resetFor.user.id);
    try { await db.resetUserPassword(resetFor.user.email, resetFor.password); setResetFor(null); }
    catch(e:any) { setErr(e.message || 'Could not reset that password.'); }
    setBusy(null);
  };
  const startEdit = (u:any) => { setErr(''); setEditingId(u.id); setEditDraft({ name:u.name, email:u.email }); };
  const cancelEdit = () => { setEditingId(null); setErr(''); };
  const saveEdit = async (u:any) => {
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
      setEditingId(null);
    } catch(e:any) { setErr(e.message || 'Could not update that user.'); }
    setBusy(null);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-3 gap-3 flex-wrap">
        <div className="text-sm text-slate-500 max-w-2xl">Everyone who can sign in, their designation and derived permission level. Deactivate blocks sign-in but keeps the record; Remove deletes the login entirely. Only Admin/Super Admin accounts can manage users.</div>
        <button onClick={()=>setAdding(a=>!a)} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-2 whitespace-nowrap inline-flex items-center gap-1.5"><S.Icon name="userplus" className="w-3.5 h-3.5"/> Add User</button>
      </div>

      {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</div>}

      {adding && (
        <S.Card className="p-3 mb-3 border-2 border-dashed border-brand-300 bg-brand-50/30">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Name</label>
              <input value={draft.name} onChange={e=>setDraftName(e.target.value)} placeholder="Full name" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Email</label>
              <input value={draft.email} onChange={e=>setDraft(d=>({...d,email:e.target.value}))} placeholder="name@company.com" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Designation</label>
              <select value={draft.designation} onChange={e=>setDraft(d=>({...d,designation:e.target.value}))} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {S.DESIGNATIONS.map(d=><option key={d}>{d}</option>)}
              </select></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Temporary Password</label>
              <div className="flex gap-1">
                <input value={draft.password} onChange={e=>{setPwTouched(true); setDraft(d=>({...d,password:e.target.value}));}} placeholder="8+ characters" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                <button type="button" title="Reset to default (first 4 letters of name + 1234)" onClick={()=>{setPwTouched(false); setDraft(d=>({...d,password:defaultPasswordFor(d.name)}));}} className="text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg px-2"><S.Icon name="refresh" className="w-3.5 h-3.5"/></button>
              </div></div>
            <div className="flex gap-1.5">
              <button onClick={addUser} disabled={busy==='adding'} className="flex-1 text-xs bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg px-3 py-2">{busy==='adding'?'Adding…':'Add'}</button>
              <button onClick={()=>{setAdding(false);setErr('');}} className="flex-1 text-xs border border-slate-200 text-slate-500 rounded-lg px-3 py-2 hover:bg-slate-50">Cancel</button>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-2">They can sign in immediately with this email/password, and should change it after their first login.</div>
        </S.Card>
      )}

      {resetFor && (
        <S.Card className="p-3 mb-3 border-2 border-dashed border-amber-300 bg-amber-50/30">
          <div className="text-xs text-slate-600 mb-2">Reset password for <b>{resetFor.user.name}</b> ({resetFor.user.email})</div>
          <div className="flex gap-1.5 items-end">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[10px] text-slate-400">New Password</label>
              <input value={resetFor.password} onChange={e=>setResetFor(r=>({...r,password:e.target.value}))} placeholder="8+ characters" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
            </div>
            <button type="button" title="Reset to default (first 4 letters of name + 1234)" onClick={()=>setResetFor(r=>({...r,password:defaultPasswordFor(r.user.name)}))} className="text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg px-2 py-1.5"><S.Icon name="refresh" className="w-3.5 h-3.5"/></button>
            <button onClick={doReset} disabled={busy===resetFor.user.id} className="text-xs bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg px-3 py-2 whitespace-nowrap">{busy===resetFor.user.id?'Resetting…':'Reset Password'}</button>
            <button onClick={()=>{setResetFor(null);setErr('');}} className="text-xs border border-slate-200 text-slate-500 rounded-lg px-3 py-2 hover:bg-slate-50 whitespace-nowrap">Cancel</button>
          </div>
        </S.Card>
      )}

      <S.Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr><S.Th>Name</S.Th><S.Th>Email</S.Th><S.Th>Designation</S.Th><S.Th>Permission Level</S.Th><S.Th>Status</S.Th><S.Th>Joined</S.Th><S.Th>Actions</S.Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {admin.users.map((u:any)=>{
              const isEditing = editingId===u.id;
              return (
              <tr key={u.id} className={u.status==='Suspended'?'bg-slate-50/60 opacity-70':u.status==='Pending Approval'?'bg-amber-50/40':isEditing?'bg-brand-50/30':''}>
                <S.Td className="font-medium whitespace-nowrap">
                  {isEditing
                    ? <input autoFocus value={editDraft.name} onChange={e=>setEditDraft(d=>({...d,name:e.target.value}))} className="border border-slate-200 rounded-lg px-2 py-1 text-sm w-full min-w-[8rem] focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                    : u.name}
                </S.Td>
                <S.Td className="text-slate-500 whitespace-nowrap">
                  {isEditing
                    ? <input type="email" value={editDraft.email} onChange={e=>setEditDraft(d=>({...d,email:e.target.value}))} className="border border-slate-200 rounded-lg px-2 py-1 text-sm w-full min-w-[10rem] focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                    : u.email}
                </S.Td>
                <S.Td>
                  {canEditUsers ? (
                    <select value={u.designation} onChange={e=>setDesignation(u.id, e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500">
                      {S.DESIGNATIONS.map(d=><option key={d}>{d}</option>)}
                    </select>
                  ) : u.designation}
                </S.Td>
                <S.Td><S.Badge cls="bg-brand-50 text-brand-700">{admin.designationLevel[u.designation]||'—'}</S.Badge></S.Td>
                <S.Td>
                  {u.status==='Active' ? <S.Badge cls="bg-emerald-100 text-emerald-700">Active</S.Badge>
                    : u.status==='Pending Approval' ? <S.Badge cls="bg-amber-100 text-amber-700">Pending Approval</S.Badge>
                    : <S.Badge cls="bg-slate-200 text-slate-600">Deactivated</S.Badge>}
                </S.Td>
                <S.Td className="text-slate-400 whitespace-nowrap">{u.joined}</S.Td>
                <S.Td>
                  {isEditing ? (
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <button onClick={()=>saveEdit(u)} disabled={busy===u.id} className="text-xs text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 rounded px-2 py-1">{busy===u.id?'Saving…':'Save'}</button>
                      <button onClick={cancelEdit} disabled={busy===u.id} className="text-xs text-slate-400 hover:text-slate-600 px-1">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      {u.status==='Pending Approval' && (
                        <button onClick={()=>approveUser(u)} title="Approve this sign-up" disabled={busy===u.id} className="text-xs text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 rounded px-2 py-1 inline-flex items-center gap-1"><S.Icon name="checkcircle" className="w-3.5 h-3.5"/> Approve</button>
                      )}
                      {canEditUsers && (
                        <button onClick={()=>startEdit(u)} title="Edit name/email" disabled={busy===u.id} className="text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded px-1.5 py-1 disabled:opacity-40">
                          <S.Icon name="edit" className="w-3.5 h-3.5"/>
                        </button>
                      )}
                      <button onClick={()=>{setErr('');setResetFor({user:u,password:defaultPasswordFor(u.name)});}} title="Reset password" disabled={busy===u.id} className="text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded px-1.5 py-1 disabled:opacity-40">
                        <S.Icon name="lock" className="w-3.5 h-3.5"/>
                      </button>
                      <button onClick={()=>toggleSuspend(u)} title={u.status==='Active'?'Deactivate user':'Reactivate user'} disabled={busy===u.id} className="text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded px-1.5 py-1 disabled:opacity-40">
                        <S.Icon name={u.status==='Active'?'ban':'checkcircle'} className="w-3.5 h-3.5"/>
                      </button>
                      {confirmRemove===u.id ? (
                        <span className="inline-flex items-center gap-1">
                          <button onClick={()=>removeUser(u)} disabled={busy===u.id} className="text-xs text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 rounded px-2 py-1">{busy===u.id?'Removing…':'Confirm'}</button>
                          <button onClick={()=>setConfirmRemove(null)} className="text-xs text-slate-400 hover:text-slate-600 px-1">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={()=>{setErr('');setConfirmRemove(u.id);}} title="Remove user" disabled={busy===u.id} className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded px-1.5 py-1 disabled:opacity-40"><S.Icon name="trash" className="w-3.5 h-3.5"/></button>
                      )}
                    </div>
                  )}
                </S.Td>
              </tr>
              );
            })}
            {admin.users.length===0 && (
              <tr><td colSpan={7} className="text-center text-sm text-slate-400 py-8">No users yet — click "Add User" above.</td></tr>
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
const CompanyField = ({label, value, type, onChange}: any) => (
  <div className="flex flex-col gap-1">
    <label className="text-[10px] text-slate-400">{label}</label>
    <input type={type||'text'} value={value||''} onChange={e=>onChange(e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
  </div>
);

function CompanyPanel(){
  const { admin, patchAdmin } = React.useContext(S.AdminDataContext);
  const c = admin.company;
  const set = (k,v) => patchAdmin('company', co => ({ ...co, [k]:v }));
  return (
    <div>
      <div className="text-sm text-slate-500 mb-4 max-w-2xl flex items-center gap-2"><S.Icon name="building" className="w-4 h-4 text-slate-400 shrink-0"/> Legal, contact and localization details used across invoices, exports and client-facing documents. Changes save instantly.</div>
      <S.Card className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <CompanyField label="Legal Name" value={c.legalName} onChange={v=>set('legalName',v)}/>
        <CompanyField label="Display Name" value={c.displayName} onChange={v=>set('displayName',v)}/>
        <CompanyField label="GSTIN" value={c.gstin} onChange={v=>set('gstin',v)}/>
        <CompanyField label="CIN" value={c.cin} onChange={v=>set('cin',v)}/>
        <CompanyField label="Website" value={c.website} onChange={v=>set('website',v)}/>
        <CompanyField label="Industry" value={c.industry} onChange={v=>set('industry',v)}/>
        <CompanyField label="Founded" value={c.founded} onChange={v=>set('founded',v)}/>
        <CompanyField label="Employee Count" value={c.employeeCount} onChange={v=>set('employeeCount',v)}/>
        <CompanyField label="Primary Contact" value={c.primaryContact} onChange={v=>set('primaryContact',v)}/>
        <CompanyField label="Support Email" type="email" value={c.supportEmail} onChange={v=>set('supportEmail',v)}/>
        <CompanyField label="Phone" value={c.phone} onChange={v=>set('phone',v)}/>
        <CompanyField label="Time Zone" value={c.timezone} onChange={v=>set('timezone',v)}/>
        <CompanyField label="Currency" value={c.currency} onChange={v=>set('currency',v)}/>
        <CompanyField label="Fiscal Year Start" value={c.fiscalYearStart} onChange={v=>set('fiscalYearStart',v)}/>
        <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
          <label className="text-[10px] text-slate-400">Registered Address</label>
          <textarea value={c.address||''} onChange={e=>set('address',e.target.value)} rows={2} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        </div>
      </S.Card>
    </div>
  );
}

function BillingPanel(){
  const { admin, patchAdmin } = React.useContext(S.AdminDataContext);
  const b = admin.billing;
  const set = (k,v) => patchAdmin('billing', bl => ({ ...bl, [k]:v }));
  const daysToRenewal = b.plan==='Annual' ? S.daysLeft(b.renewalDate) : null;
  return (
    <div className="space-y-4">
      <S.Card className="p-4">
        <div className="font-semibold text-slate-800 mb-3">Plan</div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 w-fit mb-4">
          {['Annual','Forever'].map(p=>(
            <button key={p} onClick={()=>set('plan',p)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${b.plan===p?'bg-white text-brand-700 shadow-sm':'text-slate-500'}`}>{p}</button>
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
              <input type="checkbox" checked={!!b.autoRenew} onChange={e=>set('autoRenew', e.target.checked)}/> Auto-renew
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
          <input value={b.paymentMethod} onChange={e=>set('paymentMethod',e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-400">Billing Contact</label>
          <input value={b.billingContact} onChange={e=>set('billingContact',e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
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
  const toggle = (key, channel) => patchAdmin('notifications', n => ({ ...n, categories: n.categories.map(c=>c.key===key?{...c,[channel]:!c[channel]}:c) }));
  return (
    <div>
      <div className="text-sm text-slate-500 mb-4 max-w-2xl">Choose how each category of activity reaches your team — by email, in-app, or both.</div>
      <S.Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200"><tr><S.Th>Category</S.Th><S.Th>Email</S.Th><S.Th>In-App</S.Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {admin.notifications.categories.map(c=>(
              <tr key={c.key}>
                <S.Td className="font-medium">{c.label}</S.Td>
                <S.Td><input type="checkbox" checked={c.email} onChange={()=>toggle(c.key,'email')}/></S.Td>
                <S.Td><input type="checkbox" checked={c.inApp} onChange={()=>toggle(c.key,'inApp')}/></S.Td>
              </tr>
            ))}
          </tbody>
        </table>
      </S.Card>
    </div>
  );
}

// Branch and Holiday Calendar editors each need their own draft-input state, so — same reasoning
// as TagListSetting/SimpleListEditor — they're standalone components rather than inline hooks
// inside a switch-case (which would violate the Rules of Hooks as `item` changes).
function BranchEditor({ branches, setExtras }: any){
  const [name,setName]=useState(''), [city,setCity]=useState('');
  const add=()=>{ if(!name.trim())return; setExtras('branches', b=>[...b,{id:S.uid('BR'),name:name.trim(),city:city.trim()}]); setName(''); setCity(''); };
  const remove=(id)=>setExtras('branches', b=>b.filter(x=>x.id!==id));
  return (
    <div>
      <div className="space-y-1.5 mb-3">
        {branches.map(b=>(
          <div key={b.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <span className="flex-1 text-sm text-slate-700">{b.name}</span><span className="text-xs text-slate-400">{b.city}</span>
            <button onClick={()=>remove(b.id)} className="text-slate-300 hover:text-red-500"><S.Icon name="trash" className="w-3.5 h-3.5"/></button>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Branch name" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        <input value={city} onChange={e=>setCity(e.target.value)} placeholder="City" className="w-32 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        <button onClick={add} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-1.5">+ Add</button>
      </div>
    </div>
  );
}
function HolidayEditor({ holidays, setExtras }: any){
  const [date,setDate]=useState(''), [name,setName]=useState('');
  const add=()=>{ if(!date||!name.trim())return; setExtras('holidays', h=>[...h,{date,name:name.trim()}].sort((a,b)=>a.date.localeCompare(b.date))); setDate(''); setName(''); };
  const remove=(idx)=>setExtras('holidays', h=>h.filter((_,i)=>i!==idx));
  return (
    <div>
      <div className="space-y-1.5 mb-3">
        {holidays.map((h,i)=>(
          <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm">
            <span className="font-mono text-xs text-slate-400 w-24">{h.date}</span><span className="flex-1 text-slate-700">{h.name}</span>
            <button onClick={()=>remove(i)} className="text-slate-300 hover:text-red-500"><S.Icon name="trash" className="w-3.5 h-3.5"/></button>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Holiday name" className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        <button onClick={add} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-1.5">+ Add</button>
      </div>
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
  const extras = admin.extras;
  const setExtras = (k, updater) => patchAdmin('extras', ex => ({ ...ex, [k]: typeof updater==='function'?updater(ex[k]):updater }));

  switch(item){
    case 'Company':
      return <div><div className="text-sm text-slate-500 mb-3">Full company profile lives in its own tab.</div><button onClick={()=>setTab('company')} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-2">Open Company Settings</button></div>;
    case 'Roles':
    case 'Permissions':
      return <div><div className="text-sm text-slate-500 mb-3">Designation-to-permission mapping and the full capability matrix live in their own tab.</div><button onClick={()=>setTab('roles')} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-2">Open Roles & Permissions</button></div>;
    case 'Notification Rules':
      return <div><div className="text-sm text-slate-500 mb-3">Per-category email / in-app rules live in their own tab.</div><button onClick={()=>setTab('notifications')} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-2">Open Notifications</button></div>;

    case 'Branch':
      return <BranchEditor branches={extras.branches} setExtras={setExtras}/>;
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
      return <HolidayEditor holidays={extras.holidays} setExtras={setExtras}/>;
    case 'Working Days': {
      const wd = extras.workingDays;
      const toggleDay = (d) => setExtras('workingDays', w=>({...w, [d]:!w[d]}));
      const setTime = (k,v) => setExtras('workingDays', w=>({...w, [k]:v}));
      return (
        <div>
          <div className="flex flex-wrap gap-2 mb-4">
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>(
              <button key={d} onClick={()=>toggleDay(d)} className={`w-12 py-2 rounded-lg text-xs font-medium border ${wd[d]?'bg-brand-500 border-brand-500 text-white':'border-slate-200 text-slate-400 hover:bg-slate-50'}`}>{d}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Working hours</span>
            <input type="time" value={wd.start} onChange={e=>setTime('start',e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"/>
            <span className="text-slate-400">to</span>
            <input type="time" value={wd.end} onChange={e=>setTime('end',e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"/>
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
      return <SimpleListEditor list={extras.templates[item]} placeholder={`Add ${item.toLowerCase().slice(0,-1)}…`} onChange={v=>setExtras('templates', t=>({...t,[item]:v}))}/>;
    case 'Status Master':
      return <SimpleListEditor list={settings.itemStatuses} placeholder="e.g. Blocked" onChange={v=>setSettings(s=>({...s,itemStatuses:v}))}/>;
    case 'Priority Master':
      return <SimpleListEditor list={settings.priorityLevels} placeholder="e.g. Critical" onChange={v=>setSettings(s=>({...s,priorityLevels:v}))}/>;
    case 'Function Master':
      return <SimpleListEditor list={settings.functions} placeholder="e.g. Legal" onChange={v=>setSettings(s=>({...s,functions:v}))}/>;
    case 'Backup':
      return (
        <div>
          <div className="text-sm text-slate-500 mb-3">Last backup: <b className="text-slate-700">{extras.lastBackup}</b></div>
          <button onClick={()=>setExtras('lastBackup', ()=>new Date().toISOString().slice(0,16).replace('T',' '))} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-2 inline-flex items-center gap-1.5"><S.Icon name="refresh" className="w-3.5 h-3.5"/> Run Backup Now</button>
        </div>
      );
    case 'Integrations':
      return (
        <div className="space-y-2">
          {extras.integrations.map((it,i)=>(
            <div key={it.name} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
              <div><div className="text-sm font-medium text-slate-700">{it.name}</div><div className="text-xs text-slate-400">{it.desc}</div></div>
              <button onClick={()=>setExtras('integrations', arr=>arr.map((x,idx)=>idx===i?{...x,connected:!x.connected}:x))}
                className={`text-xs rounded-lg px-3 py-1.5 whitespace-nowrap ${it.connected?'bg-emerald-100 text-emerald-700 hover:bg-emerald-200':'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
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
  const groups = {
    'Organization':['Company','Branch','Departments','Holiday Calendar','Working Days'],
    'Access':['Roles','Permissions','Audit Logs'],
    'Templates':['Project Templates','Phase Templates','Deliverable Templates','Email Templates'],
    'Masters':['Status Master','Priority Master','Function Master','Notification Rules'],
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
    ['notifications','Notifications'],
    ['projectSettings','Project Settings'],
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
      {tab==='notifications' && <NotificationsPanel/>}
      {tab==='projectSettings' && <ProjectSettingsPanel/>}
    </div>
  );
}

