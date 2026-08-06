import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';

export default function Approvals(){
  const { tree } = React.useContext(S.PhaseDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const allEntries = [];
  projects.forEach(p=>{
    (tree[p.id]||[]).forEach(ph=>{
      ph.milestones.forEach(ms=>{
        allEntries.push({ item:ms, project:p.name, level:'Milestone' });
        (ms.subtasks||[]).forEach(s=> allEntries.push({ item:s, project:p.name, level:'Sub Task' }));
      });
    });
  });
  // `review` is a generic 'Pending Review' sentinel now (level-based approval, see S.applyStatus) —
  // e.level ('Sub Task'/'Milestone') tells the two single-stage approvals apart. The Implemented
  // escalation is its own multi-step chain (S.implementChainFor): 'Implemented Review' + not yet
  // headApprovedImpl means it's still walking that internal chain; headApprovedImpl true means the
  // chain finished and it's sitting with the Client Owner.
  const pmPending = allEntries.filter(e=>e.item.review==='Pending Review' && e.level==='Sub Task');
  const headPending = allEntries.filter(e=>e.item.review==='Pending Review' && e.level==='Milestone');
  const chainPending = allEntries.filter(e=>e.item.review==='Implemented Review' && !e.item.headApprovedImpl);
  const clientPending = allEntries.filter(e=>e.item.review==='Implemented Review' && e.item.headApprovedImpl && !e.item.clientApprovedImpl);
  const approved = allEntries.filter(e=>S.isApproved(e.item));
  const implemented = allEntries.filter(e=>e.item.status==='Implemented');

  const stages = [
    { label:'Sub Task Approval', count: pmPending.length },
    { label:'Milestone Approval', count: headPending.length },
    { label:'Implemented Escalation', count: chainPending.length },
    { label:'Client Sign-off', count: clientPending.length },
    { label:'Implemented', count: implemented.length },
  ];
  const pending = [
    ...pmPending.map(e=>({...e, stage:'Sub Task Approval'})),
    ...headPending.map(e=>({...e, stage:'Milestone Approval'})),
    ...chainPending.map(e=>({...e, stage:`Implemented — pending ${(e.item.implChain||[])[0]||'—'}`})),
    ...clientPending.map(e=>({...e, stage:'Client Sign-off'})),
  ];

  return (
    <div>
      <S.SectionTitle sub="Live pending approvals across all projects — act on these from Phase Management (by level) or Client Portal (Client)">Client Approval Workflow</S.SectionTitle>
      <S.Card className="p-5 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {stages.map((s,i)=>(
            <React.Fragment key={s.label}>
              <div className={`px-3 py-2 rounded-lg text-sm border flex items-center gap-2 ${s.count>0?'bg-amber-50 border-amber-200 text-amber-700':'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                {s.label} <S.Badge cls={s.count>0?'bg-amber-100 text-amber-700':'bg-emerald-100 text-emerald-700'}>{s.count}</S.Badge>
              </div>
              {i<stages.length-1 && <span className="text-slate-300">→</span>}
            </React.Fragment>
          ))}
        </div>
      </S.Card>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <S.Card className="p-4 lg:col-span-2 overflow-x-auto">
          <div className="font-semibold text-slate-800 mb-3">Pending Approvals ({pending.length})</div>
          {pending.length===0 ? (
            <div className="text-sm text-slate-400">Nothing is pending approval right now.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200"><tr><S.Th>Project</S.Th><S.Th>Item</S.Th><S.Th>Level</S.Th><S.Th>Stage</S.Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {pending.map((e,i)=>(
                  <tr key={i}>
                    <S.Td>{e.project}</S.Td>
                    <S.Td className="font-medium">{e.item.name}</S.Td>
                    <S.Td>{e.level}</S.Td>
                    <S.Td><S.Badge cls={S.statusColor('Pending')}>{e.stage}</S.Badge></S.Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </S.Card>
        <S.Card className="p-4">
          <div className="font-semibold text-slate-800 mb-3">Approval Snapshot</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Total Approved</span><span className="font-medium text-slate-700">{approved.length}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Implemented</span><span className="font-medium text-slate-700">{implemented.length}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Awaiting Sub Task Approval</span><span className="font-medium text-amber-600">{pmPending.length}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Awaiting Milestone Approval</span><span className="font-medium text-amber-600">{headPending.length}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Mid Implemented Escalation</span><span className="font-medium text-indigo-600">{chainPending.length}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Awaiting Client Sign-off</span><span className="font-medium text-purple-600">{clientPending.length}</span></div>
          </div>
          <div className="text-xs text-slate-400 mt-4 pt-3 border-t border-slate-100">To approve or reject an item, open it in Phase Management (by level) or Client Portal (Client Owner) — decisions made there are reflected here immediately.</div>
        </S.Card>
      </div>
    </div>
  );
}

// Real document list — every file here was actually attached to a milestone or sub task from
// Phase Management's own "+ Attach" control (attachMsDocs/attachStDocs), so this page is just a
// live cross-project view of that same `docs` array, not a separate fake file store.
