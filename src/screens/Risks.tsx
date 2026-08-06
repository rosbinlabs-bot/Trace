import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

export default function Risks(){
  const { risks, setRisks } = React.useContext(S.GovernanceDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  // Only Admin/Super Admin can permanently delete a risk entry — same "only admin or super admin can
  // delete anything" rule already applied to Phase Management's phase/milestone/sub task deletes.
  const { role } = React.useContext(S.RoleContext);
  const canDelete = role==='admin';
  const mut = (id, patch) => setRisks(rs => rs.map(r => r.id===id ? {...r, ...patch} : r));
  const addRisk = () => setRisks(rs => [...rs, { id:S.uid('RK'), project:projects[0]?.name||'', desc:'New risk', owner:'', prob:'Medium', impact:'Medium', mitigation:'', target:'', status:'Open' }]);
  const removeRisk = (id) => { if(!canDelete) return; setRisks(rs => rs.filter(r=>r.id!==id)); };
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <S.SectionTitle sub="Risk register with probability, impact, mitigation and escalation">Project Risk Management</S.SectionTitle>
        <button onClick={addRisk} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-2 rounded-lg whitespace-nowrap">+ Add Risk</button>
      </div>
      <S.Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200"><tr><S.Th>ID</S.Th><S.Th>Project</S.Th><S.Th>Risk</S.Th><S.Th>Owner</S.Th><S.Th>Prob</S.Th><S.Th>Impact</S.Th><S.Th>Mitigation</S.Th><S.Th>Target</S.Th><S.Th>Status</S.Th><S.Th></S.Th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {risks.map(r=>(
              <tr key={r.id} className="hover:bg-slate-50">
                <S.Td className="font-mono text-xs">{r.id}</S.Td>
                <S.Td><select className={S.gInp} value={r.project} onChange={e=>mut(r.id,{project:e.target.value})}>{projects.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select></S.Td>
                <S.Td><input className={S.gInp+' font-medium'} value={r.desc} onChange={e=>mut(r.id,{desc:e.target.value})}/></S.Td>
                <S.Td><input className={S.gInp} value={r.owner} onChange={e=>mut(r.id,{owner:e.target.value})}/></S.Td>
                <S.Td><select className={S.gInp+' '+S.priorityColor(r.prob)} value={r.prob} onChange={e=>mut(r.id,{prob:e.target.value})}>{S.RAG.map(o=><option key={o}>{o}</option>)}</select></S.Td>
                <S.Td><select className={S.gInp+' '+S.priorityColor(r.impact)} value={r.impact} onChange={e=>mut(r.id,{impact:e.target.value})}>{S.RAG.map(o=><option key={o}>{o}</option>)}</select></S.Td>
                <S.Td className="min-w-[180px]"><input className={S.gInp} value={r.mitigation} onChange={e=>mut(r.id,{mitigation:e.target.value})}/></S.Td>
                <S.Td><input type="date" className={S.gInp} value={r.target} onChange={e=>mut(r.id,{target:e.target.value})}/></S.Td>
                <S.Td><select className={`${S.gInp} inline-block w-auto`} value={r.status} onChange={e=>mut(r.id,{status:e.target.value})}>{['Open','In Progress','Mitigated','Closed'].map(o=><option key={o}>{o}</option>)}</select></S.Td>
                <S.Td>{canDelete && <button onClick={()=>removeRisk(r.id)} className="text-red-400 hover:text-red-600">✕</button>}</S.Td>
              </tr>
            ))}
            {risks.length===0 && <tr><td colSpan={10} className="text-center text-sm text-slate-400 py-8">No risks logged. Click “+ Add Risk”.</td></tr>}
          </tbody>
        </table>
      </S.Card>
    </div>
  );
}

