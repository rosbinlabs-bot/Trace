import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

export default function ProjectMaster(){
  const { role } = React.useContext(S.RoleContext);
  const { admin } = React.useContext(S.AdminDataContext);
  const { email: myEmail, profile: myProfile } = React.useContext(S.CurrentUserContext);
  const { invoices, setInvoices } = React.useContext(S.InvoicesDataContext);
  const { settings, setSettings } = React.useContext(S.SettingsContext);
  const { team } = React.useContext(S.TeamDataContext);
  const addIndustry = (name) => setSettings(s => ({ ...s, industries: S.addUnique(s.industries, name) }));
  // rows/setRows now come from the shared ProjectsDataContext (App level) instead of a local copy,
  // so edits, confirms, and new projects made here are immediately visible to every other screen
  // that reads the live projects list (Dashboard, Gantt, Portal, Deliverables, Calendar, Risks,
  // Issues, Changes, Reports, Phases, Implementation, ProjectStructure, Documents).
  // _key is a stable internal identity, separate from the user-editable "MoU No." (id) field below.
  const { projects: rows, setProjects: setRows } = React.useContext(S.ProjectsDataContext);
  const [form, setForm] = useState(null);   // controlled edit copy
  const [isNew, setIsNew] = useState(false);
  const [extChooser, setExtChooser] = useState(false);   // extension With/Without billing chooser open
  const [reqMenuOpen, setReqMenuOpen] = useState(false); // special request popover open

  const openExisting = (p) => { setForm({ ...p }); setIsNew(false); setExtChooser(false); setReqMenuOpen(false); };
  const openNew = () => {
    setForm({ _key:S.uid('KEY'), id:'', name:'', client:'', category:'', industry:'', noOfSbu:'', consultingCategory:'', engagement:(settings.engagementTypes&&settings.engagementTypes[0])||'Fixed Scope', start:S.TODAY_ISO, end:S.TODAY_ISO, monthlyFee:0, strategicLead:'', projectHead:'', pm:'', associate:'', clients:[], clientLocation:'', clientWebsite:'', clientSoftware:[], status:'Yet to Start', priority:'Medium', billing:'Monthly', billingDueDate:'', completion:0, risk:'Low', margin:0, paymentStatus:'Pending', visitsMonth:0, visitsTotal:0, confirmed:false, extension:null, specialRequest:null, paymentReceipts:[] });
    setIsNew(true); setExtChooser(false); setReqMenuOpen(false);
  };
  const close = () => { setForm(null); setIsNew(false); setExtChooser(false); setReqMenuOpen(false); };
  const setF = (k,v) => setForm(f => ({ ...f, [k]: v }));

  const canEdit = form && (role === 'admin' || !form.confirmed);

  // MoU No. is manually entered and must be unique — validated live, blocks save while invalid.
  const mouError = !form ? '' : (!form.id || !form.id.trim())
    ? 'MoU No. is required.'
    : rows.some(r => r._key!==form._key && r.id && r.id.trim().toLowerCase()===form.id.trim().toLowerCase())
      ? 'This MoU No. is already used by another project.' : '';

  const save = (extra={}) => {
    if(mouError) return;
    const next = { ...form, ...extra };
    setRows(rs => isNew ? [...rs, next] : rs.map(r => r._key===next._key ? next : r));
    close();
  };

  // Lifecycle actions (extension / hold / termination / completion) bypass the normal
  // confirmed-project lock — they're the sanctioned channel for changing a locked project.
  const applyLifecycle = (patch) => {
    setRows(rs => rs.map(r => r._key===form._key ? {...r, ...patch} : r));
    setForm(f => ({...f, ...patch}));
  };
  const requestExtension = (type) => {
    applyLifecycle({ extension:{ type, on:S.TODAY_ISO } });
    setExtChooser(false); setReqMenuOpen(false);
  };
  const raiseSpecialRequest = (type) => {
    if(type==='Extension'){ setExtChooser(true); setReqMenuOpen(false); return; }
    const statusMap = { 'Project Hold Request':'On Hold', 'Project Termination Request':'Terminated', 'Project Completion Request':'Completed' };
    applyLifecycle({ status: statusMap[type], specialRequest:{ type, by:role, on:S.TODAY_ISO } });
    setReqMenuOpen(false);
  };
  const canRaiseRequest = role==='admin' || role==='projectHead' || role==='strategicLead';
  // Status is a workflow field — only these roles (or admin) may change it, and it can be updated
  // even on a confirmed/locked project via applyLifecycle, same channel used for hold/terminate/etc.
  const canEditStatus = role==='admin' || role==='projectHead' || role==='strategicLead';

  const PRIORITIES = ['High','Medium','Normal'];
  const BILLINGS = ['Monthly','One Time','Phase Wise'];
  const PEOPLE = team.map(t=>t.name);
  const CATEGORY_TIERS = (settings.categories && settings.categories.length) ? settings.categories : S.DEFAULT_PROJECT_SETTINGS.categories;
  const INDUSTRIES = (settings.industries && settings.industries.length) ? settings.industries : S.DEFAULT_PROJECT_SETTINGS.industries;
  const CONSULTING_CATEGORIES = (settings.consultingCategories && settings.consultingCategories.length) ? settings.consultingCategories : S.DEFAULT_PROJECT_SETTINGS.consultingCategories;
  const ENGAGEMENTS = (settings.engagementTypes && settings.engagementTypes.length) ? settings.engagementTypes : S.DEFAULT_PROJECT_SETTINGS.engagementTypes;

  // ---- client member helpers (multiple persons, one designated owner) ----
  const clients = form?.clients || [];
  const addClient = () => setForm(f => ({...f, clients:[...(f.clients||[]), { name:'', designation:'', phone:'', email:'', owner:(f.clients||[]).length===0 }]}));
  const setClient = (i,k,v) => setForm(f => ({...f, clients:(f.clients||[]).map((c,j)=> j===i?{...c,[k]:v}:c)}));
  const setOwner = (i) => setForm(f => ({...f, clients:(f.clients||[]).map((c,j)=>({...c, owner:j===i}))}));
  const removeClient = (i) => setForm(f => ({...f, clients:(f.clients||[]).filter((_,j)=>j!==i)}));
  // Client-type logins (Administration -> Users -> Add Client) already tagged to this project --
  // picking one from the dropdown below autofills a new client member row's Name/Email instead of
  // typing them by hand. Designation/Phone aren't part of a login record, so those stay manual.
  // Already-added emails are filtered out so the same login can't be picked twice.
  const availableClientLogins = (admin.users||[]).filter((u:any) =>
    u.type==='Client' && u.project===form?.id && !clients.some((c:any)=>c.email && u.email && c.email.toLowerCase()===u.email.toLowerCase()));
  const addClientFromLogin = (userId: string) => {
    const u = (admin.users||[]).find((x:any)=>x.id===userId);
    if(!u) return;
    setForm(f => ({...f, clients:[...(f.clients||[]), { name:u.name, designation:'', phone:'', email:u.email, owner:(f.clients||[]).length===0 }]}));
  };

  // ---- ERPs & software used by the client (manual, multi-entry tag list) ----
  const [softwareInput, setSoftwareInput] = useState('');
  const addSoftware = () => {
    const v = softwareInput.trim();
    if(!v) return;
    setForm(f => ({...f, clientSoftware:[...(f.clientSoftware||[]), v]}));
    setSoftwareInput('');
  };
  const removeSoftware = (i) => setForm(f => ({...f, clientSoftware:(f.clientSoftware||[]).filter((_,j)=>j!==i)}));

  // ---- payment receipts (Due Date / Amount / Receipt Status / Remarks) — kept editable even on a
  // locked project, UNTIL a receipt is confirmed via the tick button (confirmReceipt below), at
  // which point it's final: the row locks and a matching, already-locked, "Received" row is written
  // into the Billing Tracker/invoices table so it's what feeds Dashboard/Reports revenue.
  const RECEIPT_STATUSES = ['Pending','Received','Delayed','On Hold'];
  const myName = myProfile?.name;
  const iAmSuperAdmin = S.isSuperAdmin(myEmail, admin);
  const addReceipt = () => applyLifecycle({ paymentReceipts:[...(form.paymentReceipts||[]), { id:S.uid('PR'), due:S.TODAY_ISO, amount:0, status:'Pending', remarks:'' }] });
  const setReceipt = (i,k,v) => applyLifecycle({ paymentReceipts:(form.paymentReceipts||[]).map((r,j)=> j===i?{...r,[k]:v}:r) });
  const removeReceipt = (i) => applyLifecycle({ paymentReceipts:(form.paymentReceipts||[]).filter((_,j)=>j!==i) });
  const confirmReceipt = (i) => {
    const r = (form.paymentReceipts||[])[i];
    if (!r || r.confirmedAt) return;
    const now = new Date().toISOString();
    const who = myName || myEmail;
    applyLifecycle({ paymentReceipts:(form.paymentReceipts||[]).map((rr,j)=> j===i ? {...rr, status:'Received', confirmedAt:now, confirmedBy:who} : rr) });
    setInvoices((is:any[]) => [...is, {
      id:S.uid('INV'), project:form.id, invoiceDate:r.due||S.TODAY_ISO, dueDate:r.due||S.TODAY_ISO, receivedDate:S.TODAY_ISO,
      amount:Number(r.amount)||0, status:'Received', recordedBy:who, locked:true, lockedAt:now, lockedBy:who, autoGenerated:false,
    }]);
  };

  const months = form ? S.projTotalMonths(form) : 0;
  const revenue = form ? S.projTargetRevenue(form) : 0;

  // ---- Billing Tracker (invoices table) — a pure, read-only reflection of what's actually
  // happened: rows land here from confirmReceipt above (a Payment Receipt marked Received) or from
  // the database's generate_monthly_invoices cron job. Nothing is manually entered here anymore —
  // Payment Receipts is the one place billing gets recorded; only a Super Admin can remove a row to
  // correct a genuine mistake.
  const projectInvoices = (invoices||[]).filter(i=>i.project===form?.id).sort((a,b)=>(a.dueDate||'').localeCompare(b.dueDate||''));
  const removeInvoice = (id:string) => setInvoices((is:any[]) => is.filter(i=>i.id!==id));

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <S.SectionTitle sub="Click a project to view & edit. Confirmed projects can only be edited by an admin.">Project Master</S.SectionTitle>
        <button onClick={openNew} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-2 rounded-lg">+ New Project</button>
      </div>
      <S.Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200"><tr>
            <S.Th>MoU No.</S.Th><S.Th>Project</S.Th><S.Th>Client</S.Th><S.Th>Project Members</S.Th><S.Th>Monthly Fee</S.Th><S.Th>Total Revenue</S.Th><S.Th>Billing Due</S.Th><S.Th>Status</S.Th><S.Th>Lock</S.Th><S.Th>Days to Closure</S.Th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(p=>{ const rem = S.remainingLabel(p.end); const owner=(p.clients||[]).find(c=>c.owner); const dueSoon = S.billingDueSoon(p); return (
              <tr key={p._key} className="hover:bg-slate-50 cursor-pointer align-top" onClick={()=>openExisting(p)}>
                <S.Td className="font-mono text-xs">{p.id||'—'}</S.Td>
                <S.Td className="font-medium">{p.name}</S.Td>
                <S.Td>{p.client}</S.Td>
                <S.Td>
                  <div className="text-xs leading-relaxed min-w-[200px]">
                    <div><span className="text-slate-400">Strategic Lead:</span> {p.strategicLead||'—'}</div>
                    <div><span className="text-slate-400">Project Head:</span> {p.projectHead||'—'}</div>
                    <div><span className="text-slate-400">PM:</span> {p.pm||'—'} · <span className="text-slate-400">Associate:</span> {p.associate||'—'}</div>
                    <div><span className="text-slate-400">Client Owner:</span> {owner? <span className="text-emerald-700 font-medium">{owner.name}</span> : '—'}
                      {(p.clients||[]).length>1 && <span className="text-slate-400"> +{(p.clients||[]).length-1} more</span>}</div>
                  </div>
                </S.Td>
                <S.Td className="whitespace-nowrap">{S.inLakh(p.monthlyFee)}/mo</S.Td>
                <S.Td className="font-medium whitespace-nowrap">{S.inLakh(S.projTargetRevenue(p))}</S.Td>
                <S.Td>
                  {p.billingDueDate ? (
                    <div className={`text-xs font-medium whitespace-nowrap inline-flex items-center gap-1 ${dueSoon ? (S.daysLeft(p.billingDueDate)<0?'text-red-600':'text-amber-600') : 'text-slate-500'}`} title={p.billingDueDate}>
                      {dueSoon && <S.Icon name="financials" className="w-3 h-3"/>}
                      {S.daysLeft(p.billingDueDate)<0 ? `${Math.abs(S.daysLeft(p.billingDueDate))}d overdue` : S.daysLeft(p.billingDueDate)===0 ? 'Due today' : `in ${S.daysLeft(p.billingDueDate)}d`}
                    </div>
                  ) : <span className="text-slate-300 text-xs">—</span>}
                </S.Td>
                <S.Td><S.Badge cls={S.statusColor(p.status)}>{p.status}</S.Badge></S.Td>
                <S.Td>{p.confirmed ? <span title="Confirmed — admin-only edits"><S.Icon name="lock" className="w-3.5 h-3.5 text-slate-400"/></span> : <span className="text-slate-300" title="Draft — editable"><S.Icon name="edit" className="w-3.5 h-3.5"/></span>}</S.Td>
                <S.Td>
                  {S.needsExtension(p)
                    ? <span className="inline-flex items-center gap-1 text-red-600 font-medium whitespace-nowrap" title="End date passed while still In Progress"><S.Icon name="alert" className="w-3.5 h-3.5"/> Extension needed</span>
                    : p.extension
                      ? <span className="inline-flex items-center gap-1 text-amber-600 font-medium whitespace-nowrap" title={`Requested ${p.extension.on}`}><S.Icon name="refresh" className="w-3.5 h-3.5"/> Ext: {p.extension.type}</span>
                      : <span className={rem.cls+' font-medium whitespace-nowrap'}>{rem.txt}</span>}
                </S.Td>
              </tr>
            );})}
          </tbody>
        </table>
      </S.Card>

      {form && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={close}>
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 max-h-[88vh] overflow-auto" onClick={e=>e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold">{isNew ? 'New Project' : (form.name || 'Project')}</h3>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs font-mono text-slate-400">MoU No.: {form.id || '—'}</span>
                  {form.confirmed ? <S.Badge cls="bg-slate-200 text-slate-600"><span className="inline-flex items-center gap-1"><S.Icon name="lock" className="w-3 h-3"/> Confirmed</span></S.Badge> : <S.Badge cls="bg-amber-100 text-amber-700">Draft</S.Badge>}
                  {form.specialRequest && <S.Badge cls="bg-orange-100 text-orange-700">{form.specialRequest.type} · {form.specialRequest.on}</S.Badge>}
                  <S.Badge cls="bg-brand-50 text-brand-600">You: {S.ROLE_LABELS[role]||role}</S.Badge>
                </div>
              </div>
              <button className="text-slate-400 hover:text-slate-600" onClick={close}>✕</button>
            </div>

            {form.confirmed && role!=='admin' && (
              <div className="mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 flex items-center gap-2">
                <S.Icon name="lock" className="w-4 h-4 shrink-0"/> This project is confirmed. Editing is restricted to admin users. Switch the role to <b>admin</b> (top-right) to make changes.
              </div>
            )}

            {S.needsExtension(form) && (
              extChooser ? (
                <div className="mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                  <div className="mb-2">Select the extension clause:</div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={()=>requestExtension('With Billing')} className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg">Extension — With Billing</button>
                    <button onClick={()=>requestExtension('Without Billing')} className="text-xs bg-slate-500 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg">Extension — Without Billing</button>
                    <button onClick={()=>setExtChooser(false)} className="text-xs text-amber-700 underline">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="mb-4 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
                  <span className="flex items-center gap-2"><S.Icon name="alert" className="w-4 h-4 shrink-0"/> This project's end date has passed and it's still <b>In Progress</b>. Select an extension clause to proceed.</span>
                  <button onClick={()=>setExtChooser(true)} className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg whitespace-nowrap">Choose Extension</button>
                </div>
              )
            )}
            {form.extension && (
              <div className="mb-4 text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2">
                ✓ Extension recorded: <b>{form.extension.type}</b> (requested {form.extension.on}).
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">MoU No.</label>
                <input value={form.id} disabled={!canEdit} onChange={e=>setF('id', e.target.value)} placeholder="Enter MoU No."
                  className={`w-full border rounded-lg px-2 py-1.5 text-sm ${canEdit?'border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500':'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'} ${mouError?'border-red-300':''}`} />
                {mouError && <div className="text-[11px] text-red-500 mt-1">{mouError}</div>}
              </div>
              <S.TextF label="Project Name" value={form.name} canEdit={canEdit} onChange={v=>setF('name',v)} />
              <S.TextF label="Client" value={form.client} canEdit={canEdit} onChange={v=>setF('client',v)} />
              <S.TierF label="Category" value={form.category} canEdit={canEdit} onChange={v=>setF('category',v)} tiers={CATEGORY_TIERS} />
              <S.IndustryF label="Industry" value={form.industry} canEdit={canEdit} onChange={v=>setF('industry',v)} industries={INDUSTRIES} onAddIndustry={addIndustry} />
              <S.NumF label="No. Of SBU" value={form.noOfSbu} canEdit={canEdit} onChange={v=>setF('noOfSbu',v)} />
              <S.PeopleF label="Consulting Category" value={form.consultingCategory} canEdit={canEdit} onChange={v=>setF('consultingCategory',v)} people={CONSULTING_CATEGORIES} />
              <S.SelF label="Engagement Type" value={form.engagement} canEdit={canEdit} onChange={v=>setF('engagement',v)} opts={ENGAGEMENTS} />
              <S.DateF label="Start Date" value={form.start} canEdit={canEdit} onChange={v=>setF('start',v)} />
              <S.DateF label="End Date" value={form.end} canEdit={canEdit} onChange={v=>setF('end',v)} />
              <S.PeopleF label="Strategic Lead" value={form.strategicLead} canEdit={canEdit} onChange={v=>setF('strategicLead',v)} people={PEOPLE} />
              <S.PeopleF label="Project Head" value={form.projectHead} canEdit={canEdit} onChange={v=>setF('projectHead',v)} people={PEOPLE} />
              <S.PeopleF label="Project Manager" value={form.pm} canEdit={canEdit} onChange={v=>setF('pm',v)} people={PEOPLE} />
              <S.PeopleF label="Associate" value={form.associate} canEdit={canEdit} onChange={v=>setF('associate',v)} people={PEOPLE} />
              <div>
                <label className="text-xs text-slate-400 block mb-1">Status</label>
                <select value={form.status} disabled={!canEditStatus} onChange={e=>applyLifecycle({status:e.target.value})} className={S.fieldCls(canEditStatus)}>
                  {S.PROJECT_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                {!canEditStatus && <div className="text-[11px] text-slate-400 mt-1">Only Project Head or Strategic Lead can update status.</div>}
              </div>
              <S.SelF label="Priority" value={form.priority} canEdit={canEdit} onChange={v=>setF('priority',v)} opts={PRIORITIES} />
              <S.SelF label="Billing Type" value={form.billing} canEdit={canEdit} onChange={v=>setF('billing',v)} opts={BILLINGS} />
              <S.DateF label="Billing Due Date" value={form.billingDueDate} canEdit={canEdit} onChange={v=>setF('billingDueDate',v)} />
              <S.NumF label="Monthly Fee (₹)" value={form.monthlyFee} canEdit={canEdit} onChange={v=>setF('monthlyFee',v)} />
              <S.ReadF label="Completion %">{form.completion}%</S.ReadF>
              <S.NumF label="Onsite Visits (per Month)" value={form.visitsMonth} canEdit={canEdit} onChange={v=>setF('visitsMonth',v)} />
              <S.ReadF label="Total Visits (till date)">{form.visitsTotal}</S.ReadF>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Months Remaining</label>
                <div className={`w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-slate-100 ${S.remainingLabel(form.end).cls}`}>{S.remainingLabel(form.end).txt}</div>
              </div>
            </div>

            {/* Client members — multiple persons, one owner has status rights */}
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <div><span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Client Members</span>
                  <span className="ml-2 text-[11px] text-slate-400">The owner (●) is the only client with rights to change status where applicable.</span></div>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <select value="" disabled={availableClientLogins.length===0}
                      onChange={e=>{ if(e.target.value) addClientFromLogin(e.target.value); }}
                      title={availableClientLogins.length===0 ? 'No Client-type logins tagged to this project yet — add one in Administration → Users → Add Client' : 'Pick a Client login to autofill Name & Email'}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500">
                      <option value="">{availableClientLogins.length===0 ? 'No client logins for this project' : '+ Add from Client login…'}</option>
                      {availableClientLogins.map((u:any)=><option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                    </select>
                    <button onClick={addClient} className="text-xs text-brand-600 hover:text-brand-700 whitespace-nowrap">+ Add client member</button>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {clients.map((c,i)=>(
                  <div key={i} className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg p-2">
                    <button onClick={()=>canEdit&&setOwner(i)} disabled={!canEdit} title="Set as project owner"
                      className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] shrink-0 ${c.owner?'bg-emerald-500 border-emerald-500 text-white':'border-slate-300 text-transparent'} ${canEdit?'cursor-pointer':''}`}>●</button>
                    <input value={c.name} disabled={!canEdit} onChange={e=>setClient(i,'name',e.target.value)} placeholder="Key Person"
                      className={`flex-1 min-w-[130px] border rounded-lg px-2 py-1 text-sm ${canEdit?'border-slate-200 bg-white':'border-slate-200 bg-slate-100 text-slate-500'}`} />
                    <input value={c.designation||''} disabled={!canEdit} onChange={e=>setClient(i,'designation',e.target.value)} placeholder="Designation"
                      className={`flex-1 min-w-[120px] border rounded-lg px-2 py-1 text-sm ${canEdit?'border-slate-200 bg-white':'border-slate-200 bg-slate-100 text-slate-500'}`} />
                    <input value={c.phone||''} disabled={!canEdit} onChange={e=>setClient(i,'phone',e.target.value)} placeholder="Phone Number"
                      className={`flex-1 min-w-[130px] border rounded-lg px-2 py-1 text-sm ${canEdit?'border-slate-200 bg-white':'border-slate-200 bg-slate-100 text-slate-500'}`} />
                    <input value={c.email||''} disabled={!canEdit} onChange={e=>setClient(i,'email',e.target.value)} placeholder="Email"
                      className={`flex-1 min-w-[160px] border rounded-lg px-2 py-1 text-sm ${canEdit?'border-slate-200 bg-white':'border-slate-200 bg-slate-100 text-slate-500'}`} />
                    {c.owner && <S.Badge cls="bg-emerald-100 text-emerald-700">Project Owner</S.Badge>}
                    {canEdit && <button onClick={()=>removeClient(i)} className="text-xs text-red-400 hover:text-red-600 shrink-0">✕</button>}
                  </div>
                ))}
                {clients.length===0 && <div className="text-xs text-slate-400">No client members yet{canEdit?' — add at least one and mark the owner.':''}.</div>}
              </div>
            </div>

            {/* Client organization details — location, website, ERPs/software in use */}
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Client Organization Details</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Client Location</label>
                  <input value={form.clientLocation??''} disabled={!canEdit} onChange={e=>setF('clientLocation', e.target.value)} placeholder="City, Country"
                    className={`w-full border rounded-lg px-2 py-1.5 text-sm ${canEdit?'border-slate-200 bg-white':'border-slate-200 bg-slate-100 text-slate-500'}`} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Website Address</label>
                  <input value={form.clientWebsite??''} disabled={!canEdit} onChange={e=>setF('clientWebsite', e.target.value)} placeholder="www.example.com"
                    className={`w-full border rounded-lg px-2 py-1.5 text-sm ${canEdit?'border-slate-200 bg-white':'border-slate-200 bg-slate-100 text-slate-500'}`} />
                </div>
              </div>
              <div className="mt-3">
                <label className="text-xs text-slate-400 block mb-1">ERPs &amp; Software Used</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(form.clientSoftware||[]).map((s,i)=>(
                    <span key={i} className="inline-flex items-center gap-1 bg-violet-100 text-violet-700 rounded-full px-2 py-0.5 text-[11px]">
                      {s}{canEdit && <button onClick={()=>removeSoftware(i)} className="text-violet-400 hover:text-violet-600">×</button>}
                    </span>
                  ))}
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <input value={softwareInput} onChange={e=>setSoftwareInput(e.target.value)}
                        onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); addSoftware(); } }}
                        placeholder="e.g. SAP, Tally…" className="border border-slate-200 rounded-lg px-2 py-1 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                      <button onClick={addSoftware} className="text-xs text-brand-600 hover:text-brand-700 border border-dashed border-brand-300 rounded px-2 py-1">+ Add</button>
                    </div>
                  )}
                  {(!form.clientSoftware || form.clientSoftware.length===0) && !canEdit && <span className="text-xs text-slate-400">None listed.</span>}
                </div>
              </div>
            </div>

            {/* Revenue auto-calc */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              <S.Card className="p-3 bg-slate-50"><div className="text-xs text-slate-400">Total Project Months</div><div className="text-lg font-bold text-slate-800">{months.toFixed(1)}</div></S.Card>
              <S.Card className="p-3 bg-slate-50"><div className="text-xs text-slate-400">Monthly Fee</div><div className="text-lg font-bold text-slate-800">{S.fmt(form.monthlyFee)}</div></S.Card>
              <S.Card className="p-3 bg-brand-50"><div className="text-xs text-brand-600">Total Revenue (months × fee)</div><div className="text-lg font-bold text-brand-700">₹{S.fmt(revenue)}</div></S.Card>
            </div>

            {/* Payment Receipts — Due Date / Amount / Receipt Status / Remarks; editable until the
                tick button confirms a row as received, which locks it and writes a matching row
                into the Billing Tracker below (and into revenue). */}
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex justify-between items-start gap-3 mb-2">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide shrink-0">Payment Receipts</span>
                {!isNew && <button onClick={addReceipt} className="text-xs text-brand-600 hover:text-brand-700 whitespace-nowrap shrink-0">+ Add Payment Receipt</button>}
              </div>
              <div className="text-[11px] text-slate-400 mb-2">Tick ✓ once payment is actually received — that locks the row and logs it to the Billing Tracker &amp; revenue.</div>
              {(form.paymentReceipts||[]).length>0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[600px] border-separate" style={{borderSpacing:0}}>
                    <thead><tr className="text-slate-400 text-[10px] uppercase tracking-wide">
                      <th className="text-left font-medium py-1.5 pr-2 w-[130px]">Due Date</th><th className="text-left font-medium py-1.5 pr-2 w-[110px]">Amount (₹)</th>
                      <th className="text-left font-medium py-1.5 pr-2 w-[130px]">Receipt Status</th><th className="text-left font-medium py-1.5 pr-2">Remarks</th>
                      <th className="text-left font-medium py-1.5 pr-2 w-[70px]">Confirm</th><th className="w-[28px]"></th>
                    </tr></thead>
                    <tbody>
                      {form.paymentReceipts.map((r,i)=>{ const confirmed = !!r.confirmedAt; return (
                        <tr key={r.id} className={`border-t border-slate-200 ${confirmed?'bg-emerald-50/40':''}`}>
                          <td className="py-1.5 pr-2 align-middle">
                            <input type="date" value={r.due} disabled={confirmed} onChange={e=>setReceipt(i,'due',e.target.value)}
                              className={`h-7 w-full border rounded px-2 text-xs leading-none focus:outline-none ${confirmed?'border-slate-200 bg-slate-100 text-slate-400':'border-slate-200 bg-white focus:border-brand-400'}`} />
                          </td>
                          <td className="pr-2 align-middle">
                            <input type="text" inputMode="numeric" pattern="[0-9]*" value={r.amount===''||r.amount==null?'':String(r.amount)} disabled={confirmed}
                              onChange={e=>{ const d=e.target.value.replace(/[^0-9]/g,''); setReceipt(i,'amount', d===''?'':Number(d)); }}
                              className={`h-7 w-full border rounded px-2 text-xs leading-none focus:outline-none ${confirmed?'border-slate-200 bg-slate-100 text-slate-400':'border-slate-200 bg-white focus:border-brand-400'}`} />
                          </td>
                          <td className="pr-2 align-middle">
                            <div className="h-7 flex items-center">
                              {confirmed ? <S.Badge cls="bg-emerald-100 text-emerald-700">Received</S.Badge> : (
                                <select value={r.status} onChange={e=>setReceipt(i,'status',e.target.value)}
                                  className="h-7 w-full border border-slate-200 bg-white rounded px-2 text-xs leading-none focus:outline-none focus:border-brand-400">
                                  {RECEIPT_STATUSES.map(o=><option key={o}>{o}</option>)}
                                </select>
                              )}
                            </div>
                          </td>
                          <td className="pr-2 align-middle">
                            <input value={r.remarks} disabled={confirmed} onChange={e=>setReceipt(i,'remarks',e.target.value)} placeholder="Remarks"
                              className={`h-7 w-full border rounded px-2 text-xs leading-none focus:outline-none ${confirmed?'border-slate-200 bg-slate-100 text-slate-400':'border-slate-200 bg-white focus:border-brand-400'}`} />
                          </td>
                          <td className="pr-2 align-middle">
                            <div className="h-7 flex items-center">
                              {confirmed ? (
                                <div className="inline-flex items-center text-emerald-600" title={`Confirmed by ${r.confirmedBy||'—'} on ${new Date(r.confirmedAt).toLocaleString()}`}>
                                  <S.Icon name="checkcircle" className="w-4 h-4"/>
                                </div>
                              ) : (
                                <button onClick={()=>confirmReceipt(i)} title="Mark as received" className="w-6 h-6 rounded-full border border-emerald-300 text-emerald-500 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 flex items-center justify-center transition-colors">
                                  <S.Icon name="checkcircle" className="w-4 h-4"/>
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="align-middle">
                            <div className="h-7 flex items-center">
                              {!confirmed && <button onClick={()=>removeReceipt(i)} className="text-red-400 hover:text-red-600">✕</button>}
                            </div>
                          </td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs text-slate-400">{isNew ? 'Save the project first, then add payment receipts here.' : 'No payment receipts logged yet.'}</div>
              )}
            </div>

            {/* Billing Tracker — a read-only record of what's actually been billed. Rows land here
                automatically: either from ticking a Payment Receipt as received above, or from the
                database's generate_monthly_invoices cron job (see the "auto" badge), which fires on
                the same day-of-month every month based on the project's Billing Due Date. Nothing is
                entered here directly. */}
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Billing Tracker</span>
              <div className="text-[11px] text-slate-400 mb-2">Read-only history of confirmed receipts &amp; auto-generated invoices — timestamped when logged.</div>

              {projectInvoices.length>0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[640px] border-separate" style={{borderSpacing:0}}>
                    <thead><tr className="text-slate-400 text-[10px] uppercase tracking-wide">
                      <th className="text-left font-medium py-1.5 pr-2 w-[100px]">Invoice Date</th><th className="text-left font-medium py-1.5 pr-2 w-[100px]">Due Date</th>
                      <th className="text-left font-medium py-1.5 pr-2 w-[100px]">Received Date</th><th className="text-left font-medium py-1.5 pr-2 w-[100px]">Amount (₹)</th>
                      <th className="text-left font-medium py-1.5 pr-2 w-[90px]">Status</th><th className="text-left font-medium py-1.5 pr-2">Recorded</th>{iAmSuperAdmin && <th className="w-[28px]"></th>}
                    </tr></thead>
                    <tbody>
                      {projectInvoices.map(inv=>(
                        <tr key={inv.id} className="border-t border-slate-200">
                          <td className="py-1.5 pr-2 align-middle"><div className="h-7 flex items-center text-slate-600 whitespace-nowrap">{inv.invoiceDate||'—'}</div></td>
                          <td className="pr-2 align-middle"><div className="h-7 flex items-center text-slate-600 whitespace-nowrap">{inv.dueDate||'—'}</div></td>
                          <td className="pr-2 align-middle"><div className="h-7 flex items-center text-slate-600 whitespace-nowrap">{inv.receivedDate||'—'}</div></td>
                          <td className="pr-2 align-middle"><div className="h-7 flex items-center text-slate-700 font-medium whitespace-nowrap">₹{S.fmt(inv.amount)}</div></td>
                          <td className="pr-2 align-middle"><div className="h-7 flex items-center"><S.Badge cls={S.payColor(inv.status)}>{inv.status}</S.Badge></div></td>
                          <td className="pr-2 align-middle">
                            <div className="min-h-7 flex flex-col justify-center text-slate-500 whitespace-nowrap py-1">
                              {inv.autoGenerated ? <S.Badge cls="bg-violet-100 text-violet-700">auto</S.Badge> : (inv.recordedBy||'—')}
                              {inv.locked && (
                                <div className="mt-1 inline-flex items-center gap-1 text-slate-400" title={`Logged ${inv.lockedAt||''}`}>
                                  <S.Icon name="lock" className="w-3 h-3"/> {new Date(inv.lockedAt).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </td>
                          {iAmSuperAdmin && <td className="align-middle"><div className="h-7 flex items-center"><button onClick={()=>removeInvoice(inv.id)} title="Remove (correction only)" className="text-red-400 hover:text-red-600">✕</button></div></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs text-slate-400">{isNew ? 'Save the project first — invoices appear once a payment receipt is confirmed.' : 'No invoices logged yet — confirm a Payment Receipt above to log one.'}</div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-end justify-between gap-3 flex-wrap">
              <div className="relative">
                {canRaiseRequest && !isNew && (
                  <>
                    <button onClick={()=>setReqMenuOpen(o=>!o)} className="text-xs px-3 py-2 rounded-lg border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1"><S.Icon name="alert" className="w-3.5 h-3.5"/> Special Request</button>
                    {reqMenuOpen && (
                      <div className="absolute bottom-full left-0 mb-2 w-60 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-10">
                        {['Extension','Project Hold Request','Project Termination Request','Project Completion Request'].map(t=>(
                          <button key={t} onClick={()=>raiseSpecialRequest(t)} className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">{t}</button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <div className="text-xs text-slate-400 mt-2">
                  {canEdit ? 'You can edit this project.' : 'Read-only — confirmed projects need admin access.'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {role==='admin' && form.confirmed && (
                  <button onClick={()=>setF('confirmed', false)} className="text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Unlock</button>
                )}
                <button onClick={close} className="text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
                {canEdit && !form.confirmed && (
                  <>
                    <button onClick={()=>save()} disabled={!!mouError} className={`text-sm px-4 py-2 rounded-lg ${mouError?'bg-slate-100 text-slate-400 cursor-not-allowed':'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Save Draft</button>
                    <button onClick={()=>save({confirmed:true})} disabled={!!mouError} className={`text-sm px-4 py-2 rounded-lg text-white inline-flex items-center gap-1.5 ${mouError?'bg-brand-300 cursor-not-allowed':'bg-brand-500 hover:bg-brand-600'}`}>Confirm Project <S.Icon name="lock" className="w-3.5 h-3.5"/></button>
                  </>
                )}
                {canEdit && form.confirmed && (
                  <button onClick={()=>save()} disabled={!!mouError} className={`text-sm px-4 py-2 rounded-lg text-white ${mouError?'bg-brand-300 cursor-not-allowed':'bg-brand-500 hover:bg-brand-600'}`}>Save Changes</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

