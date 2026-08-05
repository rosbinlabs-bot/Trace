import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

export default function Issues(){
  const { issues, setIssues } = React.useContext(S.GovernanceDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const mut = (id, patch) => setIssues(is => is.map(i => i.id===id ? {...i, ...patch} : i));
  const addIssue = () => setIssues(is => [...is, { id:S.uid('IS'), project:projects[0]?.name||'', raisedBy:'', assignee:'', severity:'Medium', root:'New issue', due:'', status:'Open' }]);
  const removeIssue = (id) => setIssues(is => is.filter(i=>i.id!==id));
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <S.SectionTitle sub="Track, assign and resolve project issues">Issue Management</S.SectionTitle>
        <button onClick={addIssue} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-2 rounded-lg whitespace-nowrap">+ Add Issue</button>
      </div>
      <S.Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200"><tr><S.Th>No.</S.Th><S.Th>Project</S.Th><S.Th>Raised By</S.Th><S.Th>Assigned</S.Th><S.Th>Severity</S.Th><S.Th>Root Cause</S.Th><S.Th>Due</S.Th><S.Th>Status</S.Th><S.Th></S.Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {issues.map(i=>(
              <tr key={i.id} className="hover:bg-slate-50">
                <S.Td className="font-mono text-xs">{i.id}</S.Td>
                <S.Td><select className={S.gInp} value={i.project} onChange={e=>mut(i.id,{project:e.target.value})}>{projects.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select></S.Td>
                <S.Td><input className={S.gInp} value={i.raisedBy} onChange={e=>mut(i.id,{raisedBy:e.target.value})}/></S.Td>
                <S.Td><input className={S.gInp} value={i.assignee} onChange={e=>mut(i.id,{assignee:e.target.value})}/></S.Td>
                <S.Td><select className={S.gInp+' '+S.priorityColor(i.severity)} value={i.severity} onChange={e=>mut(i.id,{severity:e.target.value})}>{S.RAG.map(o=><option key={o}>{o}</option>)}</select></S.Td>
                <S.Td className="min-w-[180px]"><input className={S.gInp} value={i.root} onChange={e=>mut(i.id,{root:e.target.value})}/></S.Td>
                <S.Td><input type="date" className={S.gInp} value={i.due} onChange={e=>mut(i.id,{due:e.target.value})}/></S.Td>
                <S.Td><select className={`${S.gInp} inline-block w-auto`} value={i.status} onChange={e=>mut(i.id,{status:e.target.value})}>{['Open','In Progress','Resolved','Closed'].map(o=><option key={o}>{o}</option>)}</select></S.Td>
                <S.Td><button onClick={()=>removeIssue(i.id)} className="text-red-400 hover:text-red-600">✕</button></S.Td>
              </tr>
            ))}
            {issues.length===0 && <tr><td colSpan={9} className="text-center text-sm text-slate-400 py-8">No issues logged. Click “+ Add Issue”.</td></tr>}
          </tbody>
        </table>
      </S.Card>
    </div>
  );
}

