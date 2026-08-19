import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';
import * as db from '../db';

export default function DocumentLibrary(){
  const { docs, setDocs } = React.useContext(S.LibraryDataContext);
  const { settings } = React.useContext(S.SettingsContext);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<any>({ name:'', industry: settings.industries[0]||'', usedIn:'', function: settings.functions[0]||'', file:null });
  const [filterFn, setFilterFn] = useState('All');
  const [filterIndustry, setFilterIndustry] = useState('All');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false); // true while a file is uploading on Add
  const [downloadingId, setDownloadingId] = useState<string|null>(null);
  const [err, setErr] = useState('');
  // Only Admin/Super Admin can permanently delete a library document.
  const { role } = React.useContext(S.RoleContext);
  const canDelete = role==='admin';
  // Anyone can upload, but a Super Admin (not just Admin -- a stricter gate than canDelete above) has
  // to approve it before it counts as an approved library document. A Super Admin's own upload is
  // auto-approved -- making them approve their own upload would just be a pointless extra click, they
  // already hold the highest authority in the tenant.
  const { email } = React.useContext(S.CurrentUserContext);
  const { admin } = React.useContext(S.AdminDataContext);
  const iAmSuperAdmin = S.isSuperAdmin(email, admin);
  const { logActivity } = React.useContext(S.ActivityLogContext);

  const addDoc = async () => {
    if(!draft.name.trim() || !draft.file){ setErr(!draft.file ? 'Attach a file to upload.' : 'Name of the document is required.'); return; }
    setErr(''); setBusy(true);
    try {
      const id = S.uid('LIB');
      // Real file upload (Supabase Storage, tenant-scoped) -- everything else in this record is
      // metadata, but this is what makes the entry actually downloadable rather than just a label.
      const { filePath, fileName, fileSize } = await db.uploadLibraryDoc(id, draft.file);
      setDocs(ds => [...ds, {
        id, name:draft.name.trim(), industry:draft.industry, usedIn:draft.usedIn.trim(), function:draft.function,
        addedOn:S.TODAY_ISO, filePath, fileName, fileSize, uploadedAt:new Date().toISOString(),
        status: iAmSuperAdmin ? 'Approved' : 'Pending Approval', uploadedBy: email,
      }]);
      logActivity({ module: 'Document Library', action: `Uploaded document "${draft.name.trim()}"` });
      setDraft({ name:'', industry: settings.industries[0]||'', usedIn:'', function: settings.functions[0]||'', file:null });
      setAdding(false);
    } catch(e:any) { setErr(e.message || 'Could not upload that file.'); }
    setBusy(false);
  };
  const approveDoc = (id:string) => { if(!iAmSuperAdmin) return; const d=docs.find(x=>x.id===id); setDocs(ds => ds.map(x=>x.id===id?{...x,status:'Approved'}:x)); logActivity({ module: 'Document Library', action: `Approved document "${d?.name||id}"` }); };
  const removeDoc = (d:any) => {
    if(!canDelete) return;
    setDocs(ds => ds.filter(x=>x.id!==d.id));
    logActivity({ module: 'Document Library', action: `Removed document "${d.name}"` });
    // Best-effort storage cleanup -- the library_docs row is what the app actually reads, so a
    // failure here (e.g. flaky network) shouldn't block or roll back the row deletion above.
    if(d.filePath) db.deleteLibraryDocFile(d.filePath).catch((e)=>console.error('Storage cleanup failed:', e));
  };
  const downloadDoc = async (d:any) => {
    if(!d.filePath) return;
    setErr(''); setDownloadingId(d.id);
    try {
      const url = await db.getLibraryDocDownloadUrl(d.filePath);
      window.open(url, '_blank');
    } catch(e:any) { setErr(e.message || 'Could not generate a download link.'); }
    setDownloadingId(null);
  };
  // "Aug 6, 2026, 3:45 PM" -- the timestamp requested to show upload period, not just the date.
  const formatUploadedAt = (iso:string) => {
    if(!iso) return '—';
    try { return new Date(iso).toLocaleString('en-US', { dateStyle:'medium', timeStyle:'short' }); }
    catch(e){ return iso; }
  };

  const filtered = docs.filter(d=>
    (filterFn==='All' || d.function===filterFn) &&
    (filterIndustry==='All' || d.industry===filterIndustry) &&
    (!search.trim() || (d.name+' '+d.usedIn).toLowerCase().includes(search.trim().toLowerCase()))
  );
  const pendingCount = docs.filter(d=>d.status==='Pending Approval').length;

  return (
    <div>
      <S.SectionTitle sub="A standalone repository of reusable documents — templates, playbooks and reference material, independent of any single project's attachments. Anyone can upload; a Super Admin approves it before it's marked Approved.">Document Library</S.SectionTitle>

      {iAmSuperAdmin && pendingCount>0 && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          {pendingCount} document{pendingCount>1?'s':''} awaiting your approval — look for the amber-highlighted rows below.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or used in…"
          className="flex-1 min-w-[180px] border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/>
        <select value={filterFn} onChange={e=>setFilterFn(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="All">All Functions</option>
          {settings.functions.map(f=><option key={f}>{f}</option>)}
        </select>
        <select value={filterIndustry} onChange={e=>setFilterIndustry(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="All">All Industries</option>
          {settings.industries.map(i=><option key={i}>{i}</option>)}
        </select>
        <button onClick={()=>setAdding(a=>!a)} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-2 whitespace-nowrap inline-flex items-center gap-1.5">
          <S.Icon name="plus" className="w-3.5 h-3.5"/> Add Document
        </button>
      </div>

      {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</div>}

      {adding && (
        <S.Card className="p-3 mb-4 border-2 border-dashed border-brand-300 bg-brand-50/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
            <div className="flex flex-col gap-1 lg:col-span-2"><label className="text-[10px] text-slate-400">Name of the Document</label>
              <input value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))} placeholder="e.g. Client Onboarding Checklist" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Industry</label>
              <select value={draft.industry} onChange={e=>setDraft(d=>({...d,industry:e.target.value}))} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {settings.industries.map(i=><option key={i}>{i}</option>)}
              </select></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Used In</label>
              <input value={draft.usedIn} onChange={e=>setDraft(d=>({...d,usedIn:e.target.value}))} placeholder="Project or client name" className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"/></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] text-slate-400">Function</label>
              <select value={draft.function} onChange={e=>setDraft(d=>({...d,function:e.target.value}))} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {settings.functions.map(f=><option key={f}>{f}</option>)}
              </select></div>
            <div className="flex flex-col gap-1 min-w-0"><label className="text-[10px] text-slate-400 truncate" title="Required, this is what makes the entry downloadable">Attach File</label>
              <input type="file" onChange={e=>setDraft(d=>({...d,file:e.target.files?.[0]||null}))}
                className="text-xs text-slate-600 file:mr-1.5 file:text-xs file:border-0 file:rounded-lg file:px-2 file:py-1.5 file:bg-brand-100 file:text-brand-700 hover:file:bg-brand-200 file:cursor-pointer cursor-pointer w-full"/>
              {draft.file && <span className="text-[10px] text-slate-400 truncate" title={draft.file.name}>{draft.file.name} · {(draft.file.size/1024).toFixed(0)} KB</span>}
            </div>
          </div>
          <div className="flex gap-1.5 mt-2.5 justify-end">
            <button onClick={()=>{setAdding(false);setErr('');}} disabled={busy} className="text-xs border border-slate-200 text-slate-500 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
            <button onClick={addDoc} disabled={busy} className="text-xs bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg px-3 py-1.5">{busy?'Uploading…':'Add'}</button>
          </div>
        </S.Card>
      )}

      <S.Card className="overflow-hidden">
        {filtered.length===0 ? (
          <div className="p-6 text-center text-sm text-slate-400">{docs.length===0 ? 'No documents in the library yet — add one above.' : 'No documents match this filter.'}</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200"><tr><S.Th>Name of the Document</S.Th><S.Th>Industry</S.Th><S.Th>Used In</S.Th><S.Th>Function</S.Th><S.Th>Status</S.Th><S.Th>Uploaded</S.Th><S.Th></S.Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(d=>{ const pending = d.status==='Pending Approval'; return (
                <tr key={d.id} className={`hover:bg-slate-50 ${pending?'bg-amber-50/30':''} ${d.filePath?'cursor-pointer':''}`}
                  onClick={()=>d.filePath && downloadDoc(d)} title={d.filePath?'Click to download':'No file on record'}>
                  <S.Td className="font-medium"><span className="inline-flex items-center gap-1.5"><S.Icon name="library" className="w-3.5 h-3.5 shrink-0 text-brand-500"/><span className={d.filePath?'hover:underline hover:text-brand-700':''}>{d.name}</span></span></S.Td>
                  <S.Td>{d.industry||'—'}</S.Td>
                  <S.Td>{d.usedIn||'—'}</S.Td>
                  <S.Td><S.Badge cls="bg-brand-50 text-brand-700">{d.function}</S.Badge></S.Td>
                  <S.Td>
                    <span title={d.uploadedBy ? `Uploaded by ${d.uploadedBy}` : ''}>
                      <S.Badge cls={pending ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}>{d.status||'Approved'}</S.Badge>
                    </span>
                  </S.Td>
                  <S.Td className="text-slate-400 whitespace-nowrap">{formatUploadedAt(d.uploadedAt)}</S.Td>
                  <S.Td>
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      {pending && iAmSuperAdmin && (
                        <button onClick={(e)=>{e.stopPropagation();approveDoc(d.id);}} title="Approve" aria-label={`Approve ${d.name}`} className="text-emerald-500 hover:text-emerald-700">
                          <S.Icon name="checkcircle" className="w-3.5 h-3.5"/>
                        </button>
                      )}
                      {d.filePath && (
                        <button onClick={(e)=>{e.stopPropagation();downloadDoc(d);}} disabled={downloadingId===d.id} title="Download" aria-label={`Download ${d.name}`} className="text-slate-400 hover:text-brand-600 disabled:opacity-50">
                          <S.Icon name={downloadingId===d.id?'refresh':'download'} className="w-3.5 h-3.5"/>
                        </button>
                      )}
                      {canDelete && <button onClick={(e)=>{e.stopPropagation();removeDoc(d);}} title="Remove" aria-label={`Remove ${d.name}`} className="text-slate-300 hover:text-red-500"><S.Icon name="trash" className="w-3.5 h-3.5"/></button>}
                    </div>
                  </S.Td>
                </tr>
              );})}
            </tbody>
          </table>
          </div>
        )}
      </S.Card>
    </div>
  );
}


// Shared cell input styling for the editable governance tables below.
