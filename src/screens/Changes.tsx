import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

export default function Changes(){
  const { changes, setChanges } = React.useContext(S.GovernanceDataContext);
  const mut = (id, patch) => setChanges(cs => cs.map(c => c.id===id ? {...c, ...patch} : c));
  const addChange = () => setChanges(cs => [...cs, { id:S.uid('CR'), desc:'New change request', reason:'', impact:'Medium', budget:'', timeline:'', date:S.TODAY_ISO, status:'Pending' }]);
  const removeChange = (id) => setChanges(cs => cs.filter(c=>c.id!==id));
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <S.SectionTitle sub="Change requests with budget, timeline impact and approval workflow">Change Requests</S.SectionTitle>
        <button onClick={addChange} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-2 rounded-lg whitespace-nowrap">+ Add Change Request</button>
      </div>
      <S.Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200"><tr><S.Th>CR</S.Th><S.Th>Description</S.Th><S.Th>Reason</S.Th><S.Th>Impact</S.Th><S.Th>Budget</S.Th><S.Th>Timeline</S.Th><S.Th>Date</S.Th><S.Th>Status</S.Th><S.Th></S.Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {changes.map(c=>(
              <tr key={c.id} className="hover:bg-slate-50">
                <S.Td className="font-mono text-xs">{c.id}</S.Td>
                <S.Td className="min-w-[180px]"><input className={S.gInp+' font-medium'} value={c.desc} onChange={e=>mut(c.id,{desc:e.target.value})}/></S.Td>
                <S.Td><input className={S.gInp} value={c.reason} onChange={e=>mut(c.id,{reason:e.target.value})}/></S.Td>
                <S.Td><select className={S.gInp+' '+S.priorityColor(c.impact)} value={c.impact} onChange={e=>mut(c.id,{impact:e.target.value})}>{S.RAG.map(o=><option key={o}>{o}</option>)}</select></S.Td>
                <S.Td><input className={S.gInp} value={c.budget} onChange={e=>mut(c.id,{budget:e.target.value})} placeholder="+₹0"/></S.Td>
                <S.Td><input className={S.gInp} value={c.timeline} onChange={e=>mut(c.id,{timeline:e.target.value})} placeholder="+0 days"/></S.Td>
                <S.Td><input type="date" className={S.gInp} value={c.date} onChange={e=>mut(c.id,{date:e.target.value})}/></S.Td>
                <S.Td><select className={`${S.gInp} inline-block w-auto`} value={c.status} onChange={e=>mut(c.id,{status:e.target.value})}>{['Pending','Approved','Rejected','Implemented'].map(o=><option key={o}>{o}</option>)}</select></S.Td>
                <S.Td><button onClick={()=>removeChange(c.id)} className="text-red-400 hover:text-red-600">✕</button></S.Td>
              </tr>
            ))}
            {changes.length===0 && <tr><td colSpan={9} className="text-center text-sm text-slate-400 py-8">No change requests yet. Click “+ Add Change Request”.</td></tr>}
          </tbody>
        </table>
      </S.Card>
    </div>
  );
}

