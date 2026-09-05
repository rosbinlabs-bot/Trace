import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import * as S from '../shared';
import * as db from '../db';

export default function ProjectMaster(){
  const location = useLocation();
  const { role } = React.useContext(S.RoleContext);
  const { admin, patchAdmin } = React.useContext(S.AdminDataContext);
  const { email: myEmail, profile: myProfile } = React.useContext(S.CurrentUserContext);
  const { logActivity } = React.useContext(S.ActivityLogContext);
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
  // Monthly Fee / Total Collection are sensitive figures visible to everyone who can see this list
  // (Officer level and up) -- masked by default, revealed with one click via the eye icon in the
  // column headers. Resets to hidden on every fresh visit/reload rather than remembering a choice.
  const [showFinancials, setShowFinancials] = useState(false);

  const openExisting = (p) => { setForm({ ...p }); setIsNew(false); setExtChooser(false); setReqMenuOpen(false); };
  const openNew = () => {
    setForm({ _key:S.uid('KEY'), id:'', name:'', client:'', category:'', industry:'', noOfSbu:'', consultingCategory:'', engagement:(settings.engagementTypes&&settings.engagementTypes[0])||'Fixed Scope', start:S.TODAY_ISO, end:S.TODAY_ISO, monthlyFee:0, team:[], guests:[], clients:[], clientLocation:'', clientWebsite:'', clientSoftware:[], status:'Yet to Start', priority:'Medium', billing:'Monthly', billingDueDate:'', completion:0, risk:'Low', margin:0, paymentStatus:'Pending', visitsMonth:0, visitsTotal:0, confirmed:false, extension:null, specialRequest:null, paymentReceipts:[] });
    setIsNew(true); setExtChooser(false); setReqMenuOpen(false);
  };
  const close = () => { setForm(null); setIsNew(false); setExtChooser(false); setReqMenuOpen(false); };

  // Deep link from a notification click (shared.tsx's notificationTarget, e.g. "Billing Due Soon") —
  // opens that project's detail view directly instead of leaving the list for the user to search.
  React.useEffect(() => {
    const projectId = (location.state as any)?.projectId;
    if (!projectId) return;
    const row = rows.find((r:any) => r.id === projectId);
    if (row) openExisting(row);
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const setF = (k,v) => setForm(f => ({ ...f, [k]: v }));

  // Billing Due Date is stored as a full DATE, but for Monthly billing only its DAY OF MONTH is ever
  // read (see S.nextBillingDueDate / the database's generate_monthly_invoices() function, which both
  // extract just the day, clamped to the shorter month's last day, to recur the due date every
  // month). Asking for a full calendar date here was misleading -- it looked like a one-time due
  // date, and the rest of the app used to treat it that way too, so a project just got more
  // "overdue" every month forever instead of billing on schedule. For Monthly billing this now asks
  // only for the day (1st-31st); the underlying stored value is still a real date (anchored to this
  // project's Start Date, or today if unset) so the database column and its existing cron function
  // need no changes. One Time / Phase Wise billing still gets a real literal due date, since those
  // aren't recurring.
  const billingDayOf = (iso) => { const d = Number(String(iso||'').slice(8,10)); return Number.isFinite(d) && d>=1 && d<=31 ? d : null; };
  const setBillingDay = (day) => {
    const anchor = (form.start || S.TODAY_ISO).slice(0,7);
    const [y,m] = anchor.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const clamped = Math.min(day, lastDay);
    setF('billingDueDate', `${y}-${String(m).padStart(2,'0')}-${String(clamped).padStart(2,'0')}`);
  };
  const ordinal = (n) => { const s=['th','st','nd','rd'], v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); };

  const canEdit = form && (role === 'admin' || !form.confirmed);
  // Who can create a brand-new project: anyone with Edit+ on the 'Project Master' capability-matrix
  // module -- under the default matrix that's Manager/Admin/Super Admin, and excludes Officer (View
  // only by default) and Client (None), exactly "anyone except Officer-level users" while staying
  // configurable from Administration -> Roles & Permissions rather than a hardcoded role check.
  const canCreateProject = S.capAtLeast(S.capabilityFor('Project Master', myEmail, admin), 'Edit');
  // Financials & Billing is a real Roles & Permissions matrix module (Administration -> Roles &
  // Permissions shows it as fully editable, defaulting to Officer:None/Manager:View/Admin:Edit/
  // Super Admin:Full), but nothing in this screen actually checked it -- Monthly Fee, Total
  // Collection, Payment Receipts and the Billing Tracker were all visible and editable to anyone who
  // could open a project here at all, regardless of what the matrix said. Wiring it in for real:
  // View unlocks seeing the figures, Edit (and the existing lock/confirmed rule) unlocks changing them.
  const financeCap = S.capabilityFor('Financials & Billing', myEmail, admin);
  const canViewFinancials = S.capAtLeast(financeCap, 'View');
  const canEditFinancials = !!canEdit && S.capAtLeast(financeCap, 'Edit');

  // MoU No. is manually entered and must be unique — validated live, blocks save while invalid.
  const mouError = !form ? '' : (!form.id || !form.id.trim())
    ? 'MoU No. is required.'
    : rows.some(r => r._key!==form._key && r.id && r.id.trim().toLowerCase()===form.id.trim().toLowerCase())
      ? 'This MoU No. is already used by another project.' : '';

  // The database's own primary key for a project IS this MoU No. (a historical shortcut -- there's
  // no separate stable internal id), and the Billing Tracker (invoices), Phase Management tree, and
  // Monthly Plan rows all reference a project by that same key with ON DELETE CASCADE. So editing an
  // EXISTING project's MoU No. isn't an in-place rename under the hood -- it deletes the old row
  // (cascading away its invoices/phase data/monthly plan) and inserts a new one under the new MoU No.
  // Payment Receipts themselves are safe (they live on the project record itself, which carries over),
  // but everything in those three linked tables for this project is gone, silently, the moment this
  // saves. Until that's replaced with a real stable key, the only safe thing to do here is stop and
  // make the person confirm they understand the cost before it happens.
  const save = (extra={}) => {
    if(mouError) return;
    const next = { ...form, ...extra };
    if (!isNew) {
      const original = rows.find(r => r._key === next._key);
      if (original && (original.id||'') !== (next.id||'')) {
        const ok = window.confirm(
          `You're changing the MoU No. from "${original.id}" to "${next.id}".\n\n` +
          `This will PERMANENTLY DELETE this project's Billing Tracker (invoice/collection) history, ` +
          `Phase Management data, and Monthly Plan for "${original.id}" -- they do not carry over to ` +
          `the new MoU No. and this cannot be undone.\n\n` +
          `Payment Receipts themselves are safe. Continue anyway?`
        );
        if (!ok) return;
      }
    }
    setRows(rs => isNew ? [...rs, next] : rs.map(r => r._key===next._key ? next : r));
    logActivity({ module:'Project Master', action: isNew ? `Created project "${next.name||next.id||''}"` : `Edited project "${next.name||next.id||''}"`, project: next.name });
    close();
  };

  // Lifecycle actions (extension / hold / termination / completion) bypass the normal
  // confirmed-project lock — they're the sanctioned channel for changing a locked project.
  const applyLifecycle = (patch) => {
    setRows(rs => rs.map(r => r._key===form._key ? {...r, ...patch} : r));
    setForm(f => ({...f, ...patch}));
    logActivity({ module:'Project Master', action: `Updated project "${form?.name||form?.id||''}" (${Object.keys(patch).join(', ')})`, project: form?.name });
  };
  const requestExtension = (type) => {
    applyLifecycle({ extension:{ type, on:S.TODAY_ISO } });
    setExtChooser(false); setReqMenuOpen(false);
  };
  const raiseSpecialRequest = (type) => {
    if(type==='Extension'){ setExtChooser(true); setReqMenuOpen(false); return; }
    if(type==='Project Hold Request' && !iAmSuperAdmin){ setReqMenuOpen(false); return; }
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

  // ---- Project Team (by hierarchy level) — replaces the old 4 fixed Strategic Lead/Project Head/PM/
  // Associate pickers. Every downstream approval decision in Phase Management is driven by this list
  // (see S.approverLevelFor/implementChainFor), so who's on it and at what level really matters, not
  // just who's "the PM" by title. Picking a name defaults its level from that person's designation
  // (Administration -> Roles & Permissions -> Designation -> Hierarchy Level), editable afterward.
  const teamList = form?.team || [];
  const personDesignation = (name:string) => (admin.users||[]).find((u:any)=>u.name===name)?.designation;
  const defaultLevelFor = (name:string) => S.designationHierarchyLevel(personDesignation(name), admin) || S.HIERARCHY_LEVELS[S.HIERARCHY_LEVELS.length-1];
  const setTeamList = (list:any[]) => setF('team', list);
  const addTeamMember = () => setTeamList([...teamList, { name:'', level:S.HIERARCHY_LEVELS[0] }]);
  const setTeamMemberName = (i:number, name:string) => setTeamList(teamList.map((t:any,j:number)=> j===i?{...t, name, level:defaultLevelFor(name)||t.level}:t));
  const setTeamMemberLevel = (i:number, level:string) => setTeamList(teamList.map((t:any,j:number)=> j===i?{...t, level}:t));
  const removeTeamMember = (i:number) => setTeamList(teamList.filter((_:any,j:number)=>j!==i));

  // ---- Guest Teammates — tags an EXISTING teammate (already has a normal login elsewhere in the
  // app) with read-only, Phase-Management-only access to THIS project, without adding them to the
  // approval-chain Project Team above. No new account, no email/password -- just picking a name from
  // a dropdown of teammates not already tagged to this project (either as full Team or as a Guest
  // here already). Staged into the form like every other field, saved with the rest of the project.
  const guestList: string[] = form?.guests || [];
  const setGuestList = (list:string[]) => setF('guests', list);
  const addGuestRow = () => setGuestList([...guestList, '']);
  const setGuestName = (i:number, name:string) => setGuestList(guestList.map((g,j)=> j===i?name:g));
  const removeGuestRow = (i:number) => setGuestList(guestList.filter((_,j)=>j!==i));
  // Candidates for row `i`: active teammates (not Client-type) who aren't on this project's Team, and
  // aren't already picked in a DIFFERENT guest row -- but the row's own current pick stays selectable
  // in its own dropdown so it doesn't disappear out from under you while editing.
  const guestCandidatesFor = (i:number) => (admin.users||[]).filter((u:any)=>
    u.type!=='Client' && u.status==='Active' &&
    !teamList.some((t:any)=>t.name===u.name) &&
    !guestList.some((g,j)=>j!==i && g===u.name));

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
  // 'Partial' (added 2026-08-24) is for a receipt where some but not all of the amount has come in --
  // Received Amt/Received Date below capture what's actually landed so far, while the receipt itself
  // stays open (not confirmed/locked) until the remaining balance is collected. Dashboard's Collections
  // Aging reads the outstanding balance (amount - receivedAmount) straight off this master via
  // S.outstandingCollections — see shared.tsx.
  const RECEIPT_STATUSES = ['Pending','Partial','Received','Delayed','On Hold'];
  const myName = myProfile?.name;
  const iAmSuperAdmin = S.isSuperAdmin(myEmail, admin);
  const addReceipt = () => applyLifecycle({ paymentReceipts:[...(form.paymentReceipts||[]), { id:S.uid('PR'), due:S.TODAY_ISO, amount:0, status:'Pending', receivedAmount:0, receivedDate:'', remarks:'' }] });
  const setReceipt = (i,k,v) => applyLifecycle({ paymentReceipts:(form.paymentReceipts||[]).map((r,j)=> j===i?{...r,[k]:v}:r) });
  const removeReceipt = (i) => applyLifecycle({ paymentReceipts:(form.paymentReceipts||[]).filter((_,j)=>j!==i) });
  const confirmReceipt = (i) => {
    const r = (form.paymentReceipts||[])[i];
    if (!r || r.confirmedAt) return;
    const now = new Date().toISOString();
    const who = myName || myEmail;
    const invoice = {
      id:S.uid('INV'), project:form.id, invoiceDate:r.due||S.TODAY_ISO, dueDate:r.due||S.TODAY_ISO, receivedDate:S.TODAY_ISO,
      amount:Number(r.amount)||0, status:'Received', recordedBy:who, locked:true, lockedAt:now, lockedBy:who, autoGenerated:false,
    };
    // invoiceId lets a later Super Admin correction (unconfirmReceipt below) find and remove exactly
    // this invoice, instead of guessing which Billing Tracker row it wrote.
    applyLifecycle({ paymentReceipts:(form.paymentReceipts||[]).map((rr,j)=> j===i ? {...rr, status:'Received', confirmedAt:now, confirmedBy:who, invoiceId:invoice.id} : rr) });
    setInvoices((is:any[]) => [...is, invoice]);
    // Fire this one immediately -- see db.upsertInvoiceNow's comment. A discrete confirm click
    // shouldn't be at the mercy of the 700ms debounce window on setInvoices.
    db.upsertInvoiceNow(invoice).catch((e) => console.error('Failed to record invoice for confirmed receipt:', e));
  };

  const months = form ? S.projTotalMonths(form) : 0;
  const revenue = form ? S.projTargetRevenue(form) : 0;

  // ---- Billing Tracker (invoices table) — a pure, read-only reflection of what's actually
  // happened: rows land here from confirmReceipt above (a Payment Receipt marked Received) or from
  // the database's generate_monthly_invoices cron job. Nothing is manually entered here anymore —
  // Payment Receipts is the one place billing gets recorded; only a Super Admin can remove a row to
  // correct a genuine mistake.
  const projectInvoices = (invoices||[]).filter(i=>i.project===form?.id).sort((a,b)=>(a.dueDate||'').localeCompare(b.dueDate||''));
  const removeInvoice = (id:string) => {
    setInvoices((is:any[]) => is.filter(i=>i.id!==id));
    db.deleteInvoiceNow(id).catch((e) => console.error('Failed to delete invoice:', e));
  };

  // ---- Super Admin only: reopen a Payment Receipt that was confirmed 'Received' by mistake -- e.g.
  // it turns out only a partial amount actually came in, but the row was ticked anyway (a real case:
  // a receipt's own Remarks said "Balance to be received" while its Receipt Status still read
  // Received/locked). Clears the confirm lock so the row is editable again (Receipt Status/Received
  // Amt/Received Date -- typically re-marked Partial with the real amount), and removes the matching
  // Billing Tracker invoice confirmReceipt wrote at the time, so a stale 'Received' invoice doesn't
  // keep counting toward revenue/collections after the receipt itself is corrected. Receipts confirmed
  // before 2026-08-24 don't carry `invoiceId` (added above); for those this best-effort matches by
  // project+dueDate+amount+status so old data can still be corrected -- if no unique match is found,
  // the receipt still reopens and the admin removes the stale invoice manually from Billing Tracker
  // below via its own "✕ Remove (correction only)" control.
  const unconfirmReceipt = (i) => {
    if (!iAmSuperAdmin) return;
    const r = (form.paymentReceipts||[])[i];
    if (!r || !r.confirmedAt) return;
    const matchId = r.invoiceId || (invoices||[]).find((inv:any)=>
      inv.project===form.id && inv.dueDate===r.due && Number(inv.amount)===Number(r.amount) && inv.status==='Received' && !inv.autoGenerated
    )?.id;
    applyLifecycle({ paymentReceipts:(form.paymentReceipts||[]).map((rr,j)=> j===i ? {...rr, confirmedAt:'', confirmedBy:'', invoiceId:''} : rr) });
    if (matchId) removeInvoice(matchId);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <S.SectionTitle sub="Click a project to view & edit. Confirmed projects can only be edited by an admin.">Project Master</S.SectionTitle>
        {canCreateProject && <button onClick={openNew} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-2 rounded-lg">+ New Project</button>}
      </div>
      <S.Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200"><tr>
            <S.Th>MoU No.</S.Th><S.Th>Project</S.Th><S.Th>Consulting Category</S.Th><S.Th>Project Members</S.Th>
            <S.Th>
              <span className="inline-flex items-center gap-1">
                Monthly Fee
                <button onClick={(e)=>{e.stopPropagation(); setShowFinancials(v=>!v);}} title={showFinancials?'Hide financial figures':'Show financial figures'} aria-label={showFinancials?'Hide financial figures':'Show financial figures'} className="text-slate-400 hover:text-slate-600 normal-case font-normal">
                  <S.Icon name={showFinancials?'eye':'eyeoff'} className="w-3.5 h-3.5"/>
                </button>
              </span>
            </S.Th>
            <S.Th>Revenue Realized</S.Th><S.Th>Status</S.Th><S.Th>Start Date</S.Th><S.Th>End Date</S.Th><S.Th>Days to Closure</S.Th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(p=>{ const rem = S.remainingLabel(p.end); const owner=(p.clients||[]).find(c=>c.owner); const collected = S.projInvoicedRevenue(p, invoices); return (
              <tr key={p._key} className="hover:bg-slate-50 cursor-pointer align-top" onClick={()=>openExisting(p)}>
                <S.Td className="font-mono text-xs">{p.id||'—'}</S.Td>
                <S.Td className="font-medium">{p.name}</S.Td>
                <S.Td>{p.consultingCategory||'—'}</S.Td>
                <S.Td>
                  <div className="text-xs leading-relaxed min-w-[200px]">
                    {(() => { const shown = (p.team||[]).filter((t:any)=>t.level==='L3'||t.level==='L4').slice().sort((a:any,b:any)=>S.levelNum(a.level)-S.levelNum(b.level)); return shown.length ? shown.map((t:any,i:number)=>(
                      <div key={i}><span className="text-slate-400">{t.level}:</span> {t.name||'—'}</div>
                    )) : <div className="text-slate-400">No L3/L4 assigned</div>; })()}
                    {owner && <div><span className="text-slate-400">Client Owner:</span> <span className="text-emerald-700 font-medium">{owner.name}</span>
                      {(p.clients||[]).length>1 && <span className="text-slate-400"> +{(p.clients||[]).length-1} more</span>}</div>}
                  </div>
                </S.Td>
                <S.Td className="whitespace-nowrap">{showFinancials ? `${S.inLakh(p.monthlyFee)}/mo` : '••••••'}</S.Td>
                <S.Td className="font-medium whitespace-nowrap" title={showFinancials ? `Collected ₹${S.fmt(collected)} of a ₹${S.fmt(S.projTargetRevenue(p))} target` : ''}>{showFinancials ? `${S.inLakh(collected)} / ${S.inLakh(S.projTargetRevenue(p))}` : '•••• / ••••'}</S.Td>
                <S.Td><S.Badge cls={S.statusColor(p.status)}>{p.status}</S.Badge></S.Td>
                <S.Td className="whitespace-nowrap">{p.start ? p.start.split('-').reverse().join('/') : '—'}</S.Td>
                <S.Td className="whitespace-nowrap">{p.end ? p.end.split('-').reverse().join('/') : '—'}</S.Td>
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
        </div>
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
              <div>
                <label className="text-xs text-slate-400 block mb-1">Status</label>
                {form.status==='On Hold' ? (
                  iAmSuperAdmin ? (
                    <button type="button" onClick={()=>applyLifecycle({status:'In Progress'})} title="Click to remove hold and resume the project" className="text-xs px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium">
                      On Hold — click to Resume
                    </button>
                  ) : (
                    <S.Badge cls={S.statusColor('On Hold')}>On Hold</S.Badge>
                  )
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <select value={form.status} disabled={!canEditStatus} onChange={e=>applyLifecycle({status:e.target.value})} className={S.fieldCls(canEditStatus)}>
                      {S.PROJECT_STATUSES.filter(s=>s!=='On Hold').map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                    {iAmSuperAdmin && (
                      <button type="button" onClick={()=>applyLifecycle({status:'On Hold'})} title="Freeze Phase Management until resumed" className="text-xs px-2.5 py-1.5 rounded-lg border border-amber-300 text-amber-600 hover:bg-amber-50 whitespace-nowrap">
                        Put on hold
                      </button>
                    )}
                  </div>
                )}
                {!canEditStatus && form.status!=='On Hold' && <div className="text-[11px] text-slate-400 mt-1">Only Project Head or Strategic Lead can update status.</div>}
                {form.status==='On Hold' && !iAmSuperAdmin && <div className="text-[11px] text-slate-400 mt-1">Only a Super Admin can resume this project.</div>}
              </div>
              <S.SelF label="Priority" value={form.priority} canEdit={canEdit} onChange={v=>setF('priority',v)} opts={PRIORITIES} />
              <S.SelF label="Billing Type" value={form.billing} canEdit={canEdit} onChange={v=>setF('billing',v)} opts={BILLINGS} />
              {form.billing==='Monthly' ? (
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Billing Day of Month</label>
                  <select value={billingDayOf(form.billingDueDate)||''} disabled={!canEdit} onChange={e=>setBillingDay(Number(e.target.value))} className={S.fieldCls(canEdit)}>
                    <option value="" disabled>Select a day…</option>
                    {Array.from({length:31},(_,i)=>i+1).map(d=><option key={d} value={d}>{ordinal(d)}</option>)}
                  </select>
                  <div className="text-[11px] text-slate-400 mt-1">Bills every month on this day until the project closes (clamped to the last day in shorter months).{S.nextBillingDueDate(form) ? ` Next due: ${S.nextBillingDueDate(form)}.` : ''}</div>
                </div>
              ) : (
                <S.DateF label="Billing Due Date" value={form.billingDueDate} canEdit={canEdit} onChange={v=>setF('billingDueDate',v)} />
              )}
              {canViewFinancials ? (
                <S.NumF label="Monthly Fee (₹)" value={form.monthlyFee} canEdit={canEditFinancials} onChange={v=>setF('monthlyFee',v)} />
              ) : (
                <div><label className="text-xs text-slate-400 block mb-1">Monthly Fee (₹)</label><div className="text-sm text-slate-300 py-1.5">Restricted</div></div>
              )}
              <S.ReadF label="Completion %">{form.completion}%</S.ReadF>
              <S.NumF label="Onsite Visits (per Month)" value={form.visitsMonth} canEdit={canEdit} onChange={v=>setF('visitsMonth',v)} />
              <S.ReadF label="Total Visits (till date)">{form.visitsTotal}</S.ReadF>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Months Remaining</label>
                <div className={`w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-slate-100 ${S.remainingLabel(form.end).cls}`}>{S.remainingLabel(form.end).txt}</div>
              </div>
            </div>

            {/* Project Team — dynamic hierarchy-level list, drives Phase Management's whole approval
                chain (see S.approverLevelFor/implementChainFor). Replaces the old 4 fixed role pickers. */}
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <div><span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Project Team (by Level)</span>
                  <span className="ml-2 text-[11px] text-slate-400">L1 is most senior. Approval in Phase Management is driven entirely by who's here and at what level.</span></div>
                {canEdit && <button onClick={addTeamMember} className="text-xs text-brand-600 hover:text-brand-700 whitespace-nowrap">+ Add team member</button>}
              </div>
              <div className="space-y-2">
                {teamList.map((t:any,i:number)=>(
                  <div key={i} className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg p-2">
                    <select value={t.name} disabled={!canEdit} onChange={e=>setTeamMemberName(i,e.target.value)}
                      className={`flex-1 min-w-[150px] border rounded-lg px-2 py-1 text-sm ${canEdit?'border-slate-200 bg-white':'border-slate-200 bg-slate-100 text-slate-500'}`}>
                      <option value="">— Select —</option>
                      {PEOPLE.map((p:string)=><option key={p} value={p}>{p}</option>)}
                    </select>
                    <select value={t.level} disabled={!canEdit} onChange={e=>setTeamMemberLevel(i,e.target.value)}
                      className={`w-36 border rounded-lg px-2 py-1 text-sm ${canEdit?'border-slate-200 bg-white':'border-slate-200 bg-slate-100 text-slate-500'}`}>
                      {S.HIERARCHY_LEVELS.map(l=>{ const d=S.designationForLevel(l,admin); return <option key={l} value={l}>{l}{d?` · ${d}`:''}</option>; })}
                    </select>
                    {canEdit && <button onClick={()=>removeTeamMember(i)} className="text-xs text-red-400 hover:text-red-600 shrink-0">✕</button>}
                  </div>
                ))}
                {teamList.length===0 && <div className="text-xs text-slate-400">No team members yet{canEdit?' — add at least one and assign a level.':''}.</div>}
              </div>
            </div>

            {/* Guest Teammates — pick from existing teammates not already tagged to this project
                (as Team or as a Guest here already); no other details needed, they already have a
                login. Grants read-only Phase Management + attachment download for this project only. */}
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex justify-between items-center mb-2">
                <div><span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Guest Teammates</span>
                  <span className="ml-2 text-[11px] text-slate-400">Can view Phase Management and download sub task attachments for this project only — no other access.</span></div>
                {canEdit && <button onClick={addGuestRow} className="text-xs text-brand-600 hover:text-brand-700 whitespace-nowrap">+ Add guest</button>}
              </div>
              <div className="space-y-2">
                {guestList.map((g,i)=>{
                  const candidates = guestCandidatesFor(i);
                  return (
                    <div key={i} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-2">
                      <select value={g} disabled={!canEdit} onChange={e=>setGuestName(i,e.target.value)}
                        className={`flex-1 border rounded-lg px-2 py-1 text-sm ${canEdit?'border-slate-200 bg-white':'border-slate-200 bg-slate-100 text-slate-500'}`}>
                        <option value="">— Select teammate —</option>
                        {g && !candidates.some((u:any)=>u.name===g) && <option value={g}>{g}</option>}
                        {candidates.map((u:any)=><option key={u.id} value={u.name}>{u.name}</option>)}
                      </select>
                      {canEdit && <button onClick={()=>removeGuestRow(i)} className="text-xs text-red-400 hover:text-red-600 shrink-0">✕</button>}
                    </div>
                  );
                })}
                {guestList.length===0 && <div className="text-xs text-slate-400">No guest teammates yet{canEdit?' — pick a teammate not already on this project.':''}.</div>}
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
                    <button onClick={()=>canEdit&&setOwner(i)} disabled={!canEdit} title="Set as project owner" aria-label={c.owner ? `${c.name||'This client contact'} is the project owner` : `Set ${c.name||'this client contact'} as project owner`}
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

            {/* Revenue auto-calc — Monthly Fee / Total Collection / Total Value are gated by the
                Financials & Billing capability (see canViewFinancials above), same as Payment
                Receipts and the Billing Tracker below. Total Project Months isn't a financial figure
                on its own, so it stays visible either way. */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <S.Card className="p-3 bg-slate-50"><div className="text-xs text-slate-400">Total Project Months</div><div className="text-lg font-bold text-slate-800">{months.toFixed(1)}</div></S.Card>
              {canViewFinancials ? (
                <>
                  <S.Card className="p-3 bg-slate-50"><div className="text-xs text-slate-400">Monthly Fee</div><div className="text-lg font-bold text-slate-800">{S.fmt(form.monthlyFee)}</div></S.Card>
                  <S.Card className="p-3 bg-emerald-50"><div className="text-xs text-emerald-600">Total Collection (actual)</div><div className="text-lg font-bold text-emerald-700">₹{S.fmt(S.projInvoicedRevenue(form, invoices))}</div></S.Card>
                  <S.Card className="p-3 bg-brand-50"><div className="text-xs text-brand-600">Total Value (months × fee)</div><div className="text-lg font-bold text-brand-700">₹{S.fmt(revenue)}</div></S.Card>
                </>
              ) : (
                <S.Card className="p-3 bg-slate-50 col-span-3 flex items-center justify-center text-xs text-slate-400">You don't have access to view financial figures for this project.</S.Card>
              )}
            </div>

            {canViewFinancials && (<>
            {/* Payment Receipts — Due Date / Amount / Receipt Status / Remarks; editable until the
                tick button confirms a row as received, which locks it and writes a matching row
                into the Billing Tracker below (and into revenue). Requires Financials & Billing
                Edit+ (canEditFinancials) to add/change/confirm/remove a row -- View-only accounts
                see the same table but every control is disabled. */}
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="flex justify-between items-start gap-3 mb-2">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide shrink-0">Payment Receipts</span>
                {!isNew && canEditFinancials && <button onClick={addReceipt} className="text-xs text-brand-600 hover:text-brand-700 whitespace-nowrap shrink-0">+ Add Payment Receipt</button>}
              </div>
              <div className="text-[11px] text-slate-400 mb-2">Every field here saves automatically as you type or select — there's nothing else to click. Tick ✓ only once payment is actually received in full; that's a separate, deliberate action that locks the row and logs it to the Billing Tracker &amp; revenue. For a part-payment, set status to Partial and log what's actually landed in Received Amt/Received Date — the ✓ stays disabled until Received Amt reaches the full Amount, so it can't be confirmed by mistake. A confirmed row entered in error (e.g. ticked before the money actually came in) can be reopened via the amber unlock icon — Super Admin only.</div>
              {(form.paymentReceipts||[]).length>0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[880px] border-separate" style={{borderSpacing:0}}>
                    <thead><tr className="text-slate-400 text-[10px] uppercase tracking-wide">
                      <th className="text-left font-medium py-1.5 pr-2 w-[130px]">Due Date</th><th className="text-left font-medium py-1.5 pr-2 w-[110px]">Amount (₹)</th>
                      <th className="text-left font-medium py-1.5 pr-2 w-[120px]">Receipt Status</th>
                      <th className="text-left font-medium py-1.5 pr-2 w-[110px]">Received Amt (₹)</th><th className="text-left font-medium py-1.5 pr-2 w-[130px]">Received Date</th>
                      <th className="text-left font-medium py-1.5 pr-2">Remarks</th>
                      <th className="text-left font-medium py-1.5 pr-2 w-[92px]">Confirm</th><th className="w-[28px]"></th>
                    </tr></thead>
                    <tbody>
                      {form.paymentReceipts.map((r,i)=>{ const confirmed = !!r.confirmedAt; const locked = confirmed || !canEditFinancials; const partialEditable = !locked && r.status==='Partial';
                        // Every field on this row already autosaves on change (setReceipt -> applyLifecycle,
                        // same as the rest of this form) -- there is no separate "save" step. The green
                        // checkmark is a DIFFERENT action: "mark fully received", which locks the row and
                        // writes a Billing Tracker invoice for whatever's currently in Amount. A real
                        // incident: a reopened row was set to Partial with a real Received Amt logged, but
                        // the checkmark was still clickable and got pressed anyway (habit, since it's the
                        // only button on the row) -- it silently discarded the Partial status and locked in
                        // the (by-then-also-edited) Amount as if the whole thing had been received. Guard:
                        // disable the checkmark whenever the row reads Partial and Received Amt hasn't
                        // actually reached Amount yet, so "mark fully received" can't fire on money that
                        // isn't actually fully in.
                        const fullyCovered = r.status!=='Partial' || (Number(r.receivedAmount)||0) >= (Number(r.amount)||0);
                        return (
                        <tr key={r.id} className={`border-t border-slate-200 ${confirmed?'bg-emerald-50/40':''}`}>
                          <td className="py-1.5 pr-2 align-middle">
                            <input type="date" value={r.due} disabled={locked} onChange={e=>setReceipt(i,'due',e.target.value)}
                              className={`h-7 w-full border rounded px-2 text-xs leading-none focus:outline-none ${locked?'border-slate-200 bg-slate-100 text-slate-400':'border-slate-200 bg-white focus:border-brand-400'}`} />
                          </td>
                          <td className="pr-2 align-middle">
                            <input type="text" inputMode="numeric" pattern="[0-9]*" value={r.amount===''||r.amount==null?'':String(r.amount)} disabled={locked}
                              onChange={e=>{ const d=e.target.value.replace(/[^0-9]/g,''); setReceipt(i,'amount', d===''?'':Number(d)); }}
                              className={`h-7 w-full border rounded px-2 text-xs leading-none focus:outline-none ${locked?'border-slate-200 bg-slate-100 text-slate-400':'border-slate-200 bg-white focus:border-brand-400'}`} />
                          </td>
                          <td className="pr-2 align-middle">
                            <div className="h-7 flex items-center">
                              {confirmed ? <S.Badge cls="bg-emerald-100 text-emerald-700">Received</S.Badge> : !canEditFinancials ? <span className="text-slate-500">{r.status}</span> : (
                                <select value={r.status} onChange={e=>setReceipt(i,'status',e.target.value)}
                                  className="h-7 w-full border border-slate-200 bg-white rounded px-2 text-xs leading-none focus:outline-none focus:border-brand-400">
                                  {RECEIPT_STATUSES.map(o=><option key={o}>{o}</option>)}
                                </select>
                              )}
                            </div>
                          </td>
                          <td className="pr-2 align-middle">
                            <input type="text" inputMode="numeric" pattern="[0-9]*" value={r.receivedAmount===''||r.receivedAmount==null?'':String(r.receivedAmount)}
                              disabled={!partialEditable} placeholder="0"
                              onChange={e=>{ const d=e.target.value.replace(/[^0-9]/g,''); setReceipt(i,'receivedAmount', d===''?'':Number(d)); }}
                              className={`h-7 w-full border rounded px-2 text-xs leading-none focus:outline-none ${!partialEditable?'border-slate-200 bg-slate-100 text-slate-400':'border-slate-200 bg-white focus:border-brand-400'}`} />
                          </td>
                          <td className="pr-2 align-middle">
                            <input type="date" value={r.receivedDate||''} disabled={!partialEditable} onChange={e=>setReceipt(i,'receivedDate',e.target.value)}
                              className={`h-7 w-full border rounded px-2 text-xs leading-none focus:outline-none ${!partialEditable?'border-slate-200 bg-slate-100 text-slate-400':'border-slate-200 bg-white focus:border-brand-400'}`} />
                          </td>
                          <td className="pr-2 align-middle">
                            <input value={r.remarks} disabled={locked} onChange={e=>setReceipt(i,'remarks',e.target.value)} placeholder="Remarks"
                              className={`h-7 w-full border rounded px-2 text-xs leading-none focus:outline-none ${locked?'border-slate-200 bg-slate-100 text-slate-400':'border-slate-200 bg-white focus:border-brand-400'}`} />
                          </td>
                          <td className="pr-2 align-middle">
                            <div className="h-7 flex items-center gap-1.5">
                              {confirmed ? (
                                <>
                                  <div className="inline-flex items-center text-emerald-600" title={`Confirmed by ${r.confirmedBy||'—'} on ${new Date(r.confirmedAt).toLocaleString()}`}>
                                    <S.Icon name="checkcircle" className="w-4 h-4"/>
                                  </div>
                                  {iAmSuperAdmin && (
                                    <button onClick={()=>unconfirmReceipt(i)}
                                      title="Reopen for correction (Super Admin) — clears the confirm lock and removes the matching Billing Tracker invoice, so you can re-mark this Partial with the real amount received"
                                      aria-label="Reopen payment receipt for correction"
                                      className="w-6 h-6 rounded-full border border-amber-300 text-amber-500 hover:bg-amber-500 hover:text-white hover:border-amber-500 flex items-center justify-center transition-colors">
                                      <S.Icon name="unlock" className="w-3.5 h-3.5"/>
                                    </button>
                                  )}
                                </>
                              ) : canEditFinancials ? (
                                fullyCovered ? (
                                  <button onClick={()=>confirmReceipt(i)} title="Mark as received" aria-label="Mark payment as received" className="w-6 h-6 rounded-full border border-emerald-300 text-emerald-500 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 flex items-center justify-center transition-colors">
                                    <S.Icon name="checkcircle" className="w-4 h-4"/>
                                  </button>
                                ) : (
                                  <button disabled title="This row is Partial and Received Amt hasn't reached the full Amount yet, so it can't be confirmed as fully received. Your Status/Received Amt/Received Date edits already saved automatically — nothing else to click." aria-label="Cannot mark as received while Partial and not fully covered" className="w-6 h-6 rounded-full border border-slate-200 text-slate-300 flex items-center justify-center cursor-not-allowed">
                                    <S.Icon name="checkcircle" className="w-4 h-4"/>
                                  </button>
                                )
                              ) : null}
                            </div>
                          </td>
                          <td className="align-middle">
                            <div className="h-7 flex items-center">
                              {!confirmed && canEditFinancials && <button onClick={()=>removeReceipt(i)} className="text-red-400 hover:text-red-600">✕</button>}
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
                entered here directly. Viewing this section requires Financials & Billing View+
                (already gated by the canViewFinancials wrapper around this whole block); removing a
                row stays Super-Admin-only regardless of the matrix, same as before. */}
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
                          {iAmSuperAdmin && <td className="align-middle"><div className="h-7 flex items-center"><button onClick={()=>removeInvoice(inv.id)} title="Remove (correction only)" aria-label={`Remove invoice ${inv.id||''}`} className="text-red-400 hover:text-red-600">✕</button></div></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs text-slate-400">{isNew ? 'Save the project first — invoices appear once a payment receipt is confirmed.' : 'No invoices logged yet — confirm a Payment Receipt above to log one.'}</div>
              )}
            </div>
            </>)}

            {/* Actions */}
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-end justify-between gap-3 flex-wrap">
              <div className="relative">
                {canRaiseRequest && !isNew && (
                  <>
                    <button onClick={()=>setReqMenuOpen(o=>!o)} className="text-xs px-3 py-2 rounded-lg border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1"><S.Icon name="alert" className="w-3.5 h-3.5"/> Special Request</button>
                    {reqMenuOpen && (
                      <div className="absolute bottom-full left-0 mb-2 w-60 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-10">
                        {['Extension','Project Hold Request','Project Termination Request','Project Completion Request'].filter(t=>t!=='Project Hold Request' || iAmSuperAdmin).map(t=>(
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

