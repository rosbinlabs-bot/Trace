import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import * as S from '../shared';
import * as db from '../db';

export default function Documents(){
  const { tree } = React.useContext(S.PhaseDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const [activeProj, setActiveProj] = useState('ALL');
  const scopedProjects = activeProj==='ALL' ? projects : projects.filter(p=>p.id===activeProj);

  // Every teammate who can reach this page (any active staff account with at least View on the
  // Documents module — see NAV_MODULE/DEFAULT_PERMISSION_MATRIX) can open/download any file here,
  // same as Document Library — this is a cross-project aggregate view, not gated by project team
  // membership the way editing in Phase Management is.
  const [err, setErr] = useState('');
  const [downloadingId, setDownloadingId] = useState<string|null>(null);
  const openDoc = async (d:any) => {
    if(!d?.path) return;
    setErr(''); setDownloadingId(d.id||d.path);
    try { window.open(await db.getPhaseDocDownloadUrl(d.path), '_blank'); }
    catch(e:any) { setErr(e.message || 'Could not generate a download link.'); }
    setDownloadingId(null);
  };

  const allDocs = [];
  scopedProjects.forEach(p=>{
    (tree[p.id]||[]).forEach(ph=>{
      ph.milestones.forEach(ms=>{
        (ms.docs||[]).forEach(d=> allDocs.push({ doc:d, project:p.name, industry:p.industry, phase:ph.name, item:ms.name, level:'Milestone', status:ms.status }));
        (ms.subtasks||[]).forEach(s=>{
          (s.docs||[]).forEach(d=> allDocs.push({ doc:d, project:p.name, industry:p.industry, phase:ph.name, item:s.name, level:'Sub Task', status:s.status }));
        });
      });
    });
  });

  const totalDocsAllProjects = projects.reduce((count,p)=>{
    const ps = tree[p.id]||[];
    let n = 0;
    ps.forEach(ph=>ph.milestones.forEach(ms=>{ n += (ms.docs||[]).length; (ms.subtasks||[]).forEach(s=> n += (s.docs||[]).length); }));
    return count+n;
  }, 0);

  return (
    <div>
      <S.SectionTitle sub="Files attached to milestones & sub tasks in Phase Management — live across every project">Document Management</S.SectionTitle>

      <div className="flex gap-1 border-b border-slate-200 mb-3 overflow-x-auto">
        <button onClick={()=>setActiveProj('ALL')}
          className={`whitespace-nowrap px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${activeProj==='ALL'?'border-violet-500 text-violet-700 font-medium':'border-transparent text-slate-500 hover:text-slate-700'}`}>
          All Projects
        </button>
        {projects.map(p=>(
          <button key={p.id} onClick={()=>setActiveProj(p.id)}
            className={`whitespace-nowrap px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${activeProj===p.id?'border-violet-500 text-violet-700 font-medium':'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {p.name}
          </button>
        ))}
      </div>

      <div className="text-xs text-slate-400 mb-3">{totalDocsAllProjects} document(s) attached across all projects{activeProj!=='ALL' && ` · ${allDocs.length} shown for this project`}</div>

      {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</div>}

      <S.Card className="overflow-hidden">
        {allDocs.length===0 ? (
          <div className="p-6 text-center text-sm text-slate-400">No documents attached yet — attach a file to a milestone or sub task from Phase Management's "+ Attach" control to see it listed here.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200"><tr><S.Th>Document Name</S.Th><S.Th>Project</S.Th><S.Th>Industry</S.Th><S.Th>Phase</S.Th><S.Th>Attached To</S.Th><S.Th>Level</S.Th><S.Th>Status</S.Th><S.Th></S.Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {allDocs.map((d,i)=>{ const busy = downloadingId===(d.doc.id||d.doc.path); return (
                <tr key={i} className={`hover:bg-slate-50 ${d.doc.path?'cursor-pointer':''}`} onClick={()=>openDoc(d.doc)} title={d.doc.path?'Click to download':'No file on record'}>
                  <S.Td className="font-medium"><span className="inline-flex items-center gap-1.5"><S.Icon name={busy?'refresh':S.docIcon(d.doc.n)} className={`w-3.5 h-3.5 shrink-0 ${busy?'text-brand-500':S.docIconTone(d.doc.n)}`}/><span className={d.doc.path?'hover:underline hover:text-brand-700':''}>{d.doc.n}</span></span></S.Td>
                  <S.Td>{d.project}</S.Td>
                  <S.Td>{d.industry||'—'}</S.Td>
                  <S.Td>{d.phase}</S.Td>
                  <S.Td>{d.item}</S.Td>
                  <S.Td>{d.level}</S.Td>
                  <S.Td><S.Badge cls={S.statusColor(d.status)}>{d.status}</S.Badge></S.Td>
                  <S.Td>
                    {d.doc.path && (
                      <button onClick={(e)=>{ e.stopPropagation(); openDoc(d.doc); }} disabled={busy} title="Download" className="text-slate-400 hover:text-brand-600 disabled:opacity-50">
                        <S.Icon name={busy?'refresh':'download'} className="w-3.5 h-3.5"/>
                      </button>
                    )}
                  </S.Td>
                </tr>
              );})}
            </tbody>
          </table>
        )}
      </S.Card>
    </div>
  );
}

// Standalone document repository — Name / Industry / Used In / Function — independent of any
// single project's Phase Management attachments. Add, filter and remove entries here.
