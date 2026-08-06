import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

export default function DocumentLibrary(){
  const { docs, setDocs } = React.useContext(S.LibraryDataContext);
  const { settings } = React.useContext(S.SettingsContext);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name:'', industry: settings.industries[0]||'', usedIn:'', function: settings.functions[0]||'' });
  const [filterFn, setFilterFn] = useState('All');
  const [filterIndustry, setFilterIndustry] = useState('All');
  const [search, setSearch] = useState('');
  // Only Admin/Super Admin can permanently delete a library document.
  const { role } = React.useContext(S.RoleContext);
  const canDelete = role==='admin';

  const addDoc = () => {
    if(!draft.name.trim()) return;
    setDocs(ds => [...ds, { id:S.uid('LIB'), name:draft.name.trim(), industry:draft.industry, usedIn:draft.usedIn.trim(), function:draft.function, addedOn:S.TODAY_ISO }]);
    setDraft({ name:'', industry: settings.industries[0]||'', usedIn:'', function: settings.functions[0]||'' });
    setAdding(false);
  };
  const removeDoc = (id) => { if(!canDelete) return; setDocs(ds => ds.filter(d=>d.id!==id)); };

  const filtered = docs.filter(d=>
    (filterFn==='All' || d.function===filterFn) &&
    (filterIndustry==='All' || d.industry===filterIndustry) &&
    (!search.trim() || (d.name+' '+d.usedIn).toLowerCase().includes(search.trim().toLowerCase()))
  );

  return (
    <div>
      <S.SectionTitle sub="A standalone repository of reusable documents — templates, playbooks and reference material, independent of any single project's attachments">Document Library</S.SectionTitle>

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

      {adding && (
        <S.Card className="p-3 mb-4 border-2 border-dashed border-brand-300 bg-brand-50/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-end">
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
          </div>
          <div className="flex gap-1.5 mt-2.5 justify-end">
            <button onClick={()=>setAdding(false)} className="text-xs border border-slate-200 text-slate-500 rounded-lg px-3 py-1.5 hover:bg-slate-50">Cancel</button>
            <button onClick={addDoc} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-3 py-1.5">Add</button>
          </div>
        </S.Card>
      )}

      <S.Card className="overflow-hidden">
        {filtered.length===0 ? (
          <div className="p-6 text-center text-sm text-slate-400">{docs.length===0 ? 'No documents in the library yet — add one above.' : 'No documents match this filter.'}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200"><tr><S.Th>Name of the Document</S.Th><S.Th>Industry</S.Th><S.Th>Used In</S.Th><S.Th>Function</S.Th><S.Th>Added On</S.Th><S.Th></S.Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(d=>(
                <tr key={d.id} className="hover:bg-slate-50">
                  <S.Td className="font-medium"><span className="inline-flex items-center gap-1.5"><S.Icon name="library" className="w-3.5 h-3.5 shrink-0 text-brand-500"/>{d.name}</span></S.Td>
                  <S.Td>{d.industry||'—'}</S.Td>
                  <S.Td>{d.usedIn||'—'}</S.Td>
                  <S.Td><S.Badge cls="bg-brand-50 text-brand-700">{d.function}</S.Badge></S.Td>
                  <S.Td className="text-slate-400 whitespace-nowrap">{d.addedOn}</S.Td>
                  <S.Td>{canDelete && <button onClick={()=>removeDoc(d.id)} title="Remove" className="text-slate-300 hover:text-red-500"><S.Icon name="trash" className="w-3.5 h-3.5"/></button>}</S.Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </S.Card>
    </div>
  );
}


// Shared cell input styling for the editable governance tables below.
