import React, { useState, useEffect } from 'react';
import * as S from '../shared';
import * as db from '../db';

// The platform-level home screen for hello@rosbinlabs.com. Deliberately outside the normal
// Shell/BrowserRouter tree — the platform superadmin has no tenant_id and no admin_data.users
// record anywhere, so none of the regular per-tenant screens make sense for this account. This is
// its entire world: see every tenant, spin up new ones, and hand each one an owner login.
const genTempPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i=0;i<12;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
};

export default function SuperAdminPanel({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<any>({ tenantName:'', tenantSlug:'', ownerName:'', ownerEmail:'', ownerPassword: genTempPassword() });
  const [created, setCreated] = useState<any>(null);

  const refresh = () => {
    setLoading(true);
    db.listTenants().then(setTenants).catch((e:any)=>setErr(e.message||String(e))).finally(()=>setLoading(false));
  };
  useEffect(() => { refresh(); }, []);

  const slugify = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

  const submit = async () => {
    setErr('');
    if (!draft.tenantName.trim() || !draft.ownerName.trim() || !draft.ownerEmail.trim() || draft.ownerPassword.length<8) {
      setErr('Organization name, owner name/email and an 8+ character password are required.'); return;
    }
    const slug = slugify(draft.tenantSlug || draft.tenantName);
    if (!slug) { setErr('Could not derive a company code from that name — set one explicitly.'); return; }
    setBusy(true);
    try {
      await db.createTenant(draft.tenantName.trim(), slug, draft.ownerName.trim(), draft.ownerEmail.trim(), draft.ownerPassword);
      setCreated({ slug, ownerEmail: draft.ownerEmail.trim(), ownerPassword: draft.ownerPassword });
      setDraft({ tenantName:'', tenantSlug:'', ownerName:'', ownerEmail:'', ownerPassword: genTempPassword() });
      setCreating(false);
      refresh();
    } catch (e: any) { setErr(e.message || 'Could not create that tenant.'); }
    setBusy(false);
  };

  return (
    <div className="h-screen overflow-y-auto bg-slate-100">
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-5 sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center">
            <S.Icon name="shield" className="w-4.5 h-4.5" />
          </div>
          <div>
            <div className="font-semibold text-slate-800 text-sm leading-tight">Rosbin Labs — Super Admin</div>
            <div className="text-[10px] text-slate-400 leading-tight">Multi-tenant console</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{email}</span>
          <button onClick={onSignOut} className="text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg px-3 py-1.5">Sign Out</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <div className="text-xl font-semibold text-slate-800">Tenants</div>
            <div className="text-sm text-slate-500">Every organization running on Trace PMT, fully isolated from one another.</div>
          </div>
          <button onClick={()=>{setCreating(c=>!c);setErr('');setCreated(null);}} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-2 inline-flex items-center gap-1.5"><S.Icon name="plus" className="w-3.5 h-3.5"/> New Tenant</button>
        </div>

        {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</div>}
        {created && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
            Tenant "{created.slug}" created. Owner can sign in immediately with <b>{created.ownerEmail}</b> / <b>{created.ownerPassword}</b> — share this once, they should change it after first login.
          </div>
        )}

        {creating && (
          <S.Card className="p-4 mb-4 border-2 border-dashed border-brand-300 bg-brand-50/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400">Organization Name</label>
                <input value={draft.tenantName} onChange={e=>setDraft((d:any)=>({...d,tenantName:e.target.value}))} placeholder="Acme Consulting" className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400">Company Code (used at sign-up)</label>
                <input value={draft.tenantSlug} onChange={e=>setDraft((d:any)=>({...d,tenantSlug:e.target.value}))} placeholder={slugify(draft.tenantName)||'auto from name'} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400">Owner Name</label>
                <input value={draft.ownerName} onChange={e=>setDraft((d:any)=>({...d,ownerName:e.target.value}))} placeholder="Full name" className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400">Owner Email</label>
                <input value={draft.ownerEmail} onChange={e=>setDraft((d:any)=>({...d,ownerEmail:e.target.value}))} placeholder="owner@company.com" className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-[11px] text-slate-400">Temporary Password</label>
                <div className="flex gap-1">
                  <input value={draft.ownerPassword} onChange={e=>setDraft((d:any)=>({...d,ownerPassword:e.target.value}))} className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
                  <button type="button" onClick={()=>setDraft((d:any)=>({...d,ownerPassword:genTempPassword()}))} className="text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg px-2"><S.Icon name="refresh" className="w-3.5 h-3.5"/></button>
                </div>
              </div>
            </div>
            <div className="flex gap-1.5 mt-3">
              <button onClick={submit} disabled={busy} className="text-xs bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg px-3 py-2">{busy?'Creating…':'Create Tenant + Owner'}</button>
              <button onClick={()=>{setCreating(false);setErr('');}} className="text-xs border border-slate-200 text-slate-500 rounded-lg px-3 py-2 hover:bg-slate-50">Cancel</button>
            </div>
            <div className="text-[11px] text-slate-400 mt-2">The owner becomes that tenant's Strategic Lead (Super Admin permission level) — they can add, edit and remove their own users from Administration → Users once signed in. This company code is also what their staff enters on the sign-up screen to join.</div>
          </S.Card>
        )}

        <S.Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr><S.Th>Organization</S.Th><S.Th>Company Code</S.Th><S.Th>Owner</S.Th><S.Th>Status</S.Th><S.Th>Created</S.Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map((t:any)=>(
                <tr key={t.id}>
                  <S.Td className="font-medium">{t.name}</S.Td>
                  <S.Td><span className="font-mono text-xs bg-slate-100 rounded px-1.5 py-0.5">{t.slug}</span></S.Td>
                  <S.Td className="text-slate-500">{t.owner_email}</S.Td>
                  <S.Td><S.Badge cls={t.status==='Active'?'bg-emerald-100 text-emerald-700':'bg-slate-200 text-slate-600'}>{t.status}</S.Badge></S.Td>
                  <S.Td className="text-slate-400 whitespace-nowrap">{(t.created_at||'').slice(0,10)}</S.Td>
                </tr>
              ))}
              {!loading && tenants.length===0 && (
                <tr><td colSpan={5} className="text-center text-sm text-slate-400 py-8">No tenants yet — click "New Tenant" above.</td></tr>
              )}
            </tbody>
          </table>
        </S.Card>
      </main>
    </div>
  );
}
