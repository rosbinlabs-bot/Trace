import React, { useState } from 'react';
import * as S from '../shared';
import * as db from '../db';

const STATUS_OPTS = ['Open', 'In Progress', 'Mitigated', 'Closed'];

export default function Risks() {
  const { risks, setRisks } = React.useContext(S.GovernanceDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  // Same shared project-activity feed Phase Management posts to (S.PhaseDataContext wraps
  // GovernanceDataContext in App.tsx, so it's available here too) — used below to alert everyone
  // tagged to the project when someone is newly tagged Supporting By on a risk.
  const { addNotification } = React.useContext(S.PhaseDataContext);
  const { role } = React.useContext(S.RoleContext);
  const { admin } = React.useContext(S.AdminDataContext);
  const { email: myEmail, profile: myProfile } = React.useContext(S.CurrentUserContext);
  // Only Admin/Super Admin can permanently delete a risk entry — same rule used everywhere else.
  const canDelete = role === 'admin';

  // A risk is visible here at all only for projects this account is tagged to (App.tsx's
  // GovernanceDataContext already scopes `risks` that way, and clients can't reach this route). Within
  // that: "tagged to the project" for editing purposes means a real Project Team member
  // (S.isOnProjectTeam) — a Guest Teammate can see the risk register for a project they're only a
  // guest on, but can't add/edit anything on it, same as their read-only treatment everywhere else.
  const myTeamProjects = role === 'admin' ? projects : projects.filter((p: any) => S.isOnProjectTeam(p, myProfile?.name));
  const myTeamProjectNames = new Set(myTeamProjects.map((p: any) => p.name));
  const isTaggedOn = (projName: string) => role === 'admin' || myTeamProjectNames.has(projName);
  const canAddRisk = role === 'admin' || myTeamProjects.length > 0;
  // General fields (what/where/who's on point) — any team member tagged to that project can log or
  // edit these. Addressing the risk — status + mitigation + remarks — is reserved for whoever is
  // tagged "Supporting By" (or Admin), since they're the one actually doing the work of resolving it.
  const canEditGeneral = (r: any) => isTaggedOn(r.project);
  const canAddress = (r: any) => role === 'admin' || (!!r.supportBy && r.supportBy === myProfile?.name);

  const projectByName = (name: string) => projects.find((p: any) => p.name === name);
  const mut = (id: string, patch: any) => setRisks((rs: any[]) => rs.map(r => r.id === id ? { ...r, ...patch } : r));

  // Posts to the same shared notification feed the header bell / Dashboard activity panel read —
  // it's a project-wide feed everyone tagged to the project sees (not a per-user inbox), so naming
  // the newly-tagged person in the message is what both "notifies them" and "informs all other
  // stakeholders" in one shot, same pattern Phase Management's notifyProject already uses.
  const notifySupportTagged = (r: any, name: string) => {
    const proj = projectByName(r.project);
    const roster = S.buildRoster(proj, admin);
    addNotification({
      projectId: proj?.id, project: r.project, tags: roster.map((p: any) => p.name), priority: 'high',
      level: 'risk', itemName: r.desc, type: 'Risk Support Assigned',
      message: `${name} has been tagged as Supporting By on risk "${r.desc}" (${r.id}) in ${r.project} — please review and begin addressing it. All project stakeholders have been notified.`,
    });
  };

  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = risks.find((r: any) => r.id === detailId) || null;

  // Reserved atomically in the database (db.nextSeqId -> next_seq_id() RPC) rather than computed
  // from the currently-loaded list -- two people clicking "+ Add Risk" at the same moment used to
  // be able to land on the same R-NNN number, and since writes are upsert-by-id the second one
  // would silently overwrite the first person's brand new risk.
  const [addingRisk, setAddingRisk] = useState(false);
  const addRisk = async () => {
    if (!canAddRisk || addingRisk) return;
    setAddingRisk(true);
    try {
      const proj = myTeamProjects[0] || projects[0];
      const id = await db.nextSeqId('R');
      const fresh = {
        id, project: proj?.name || '', desc: 'New risk', supportBy: '',
        addedBy: myProfile?.name || myEmail, addedAt: new Date().toISOString(),
        prob: 'Medium', impact: 'Medium', mitigation: '', target: '', status: 'Open',
        remarks: [], docs: [],
      };
      setRisks((rs: any[]) => [...rs, fresh]);
      setDetailId(id);
    } finally { setAddingRisk(false); }
  };
  const removeRisk = (id: string) => {
    if (!canDelete) return;
    setRisks((rs: any[]) => rs.filter(r => r.id !== id));
    setDetailId(d => d === id ? null : d);
  };

  // ---- remarks: a running comment log, only whoever is Supporting By (or Admin) can add one ----
  const addRemark = (id: string, text: string) => {
    if (!text.trim()) return;
    setRisks((rs: any[]) => rs.map(r => r.id === id
      ? { ...r, remarks: [...(r.remarks || []), { id: S.uid('RMK'), text: text.trim(), by: myProfile?.name || myEmail, at: new Date().toISOString() }] }
      : r));
  };
  const [remarkDraft, setRemarkDraft] = useState('');
  React.useEffect(() => { setRemarkDraft(''); }, [detailId]);

  // ---- attachments: real Supabase Storage uploads, same private/tenant-scoped bucket pattern as
  // Phase Management / Document Library ----
  const [docUploading, setDocUploading] = useState(false);
  const [docErr, setDocErr] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const attachDocs = async (id: string, files: FileList) => {
    setDocErr(''); setDocUploading(true);
    try {
      const uploaded = [];
      for (const f of Array.from(files) as File[]) uploaded.push(await db.uploadRiskDoc(S.uid('DOC'), f));
      setRisks((rs: any[]) => rs.map(r => r.id === id
        ? { ...r, docs: [...(r.docs || []), ...uploaded.map(u => ({ id: u.id, n: u.name, path: u.path, size: u.size, uploadedAt: new Date().toISOString(), uploadedBy: myEmail }))] }
        : r));
    } catch (e: any) { setDocErr(e.message || 'Could not upload that file.'); }
    setDocUploading(false);
  };
  const removeDoc = (id: string, i: number) => {
    const r = risks.find((x: any) => x.id === id);
    const d = r && (r.docs || [])[i];
    setRisks((rs: any[]) => rs.map(x => x.id === id ? { ...x, docs: (x.docs || []).filter((_: any, j: number) => j !== i) } : x));
    if (d?.path) db.deleteRiskDocFile(d.path).catch((e: any) => console.error('Storage cleanup failed:', e));
  };
  const downloadDoc = async (d: any) => {
    if (!d.path) return;
    setDocErr(''); setDownloadingId(d.id || d.path);
    try { window.open(await db.getRiskDocDownloadUrl(d.path), '_blank'); }
    catch (e: any) { setDocErr(e.message || 'Could not generate a download link.'); }
    setDownloadingId(null);
  };

  // ---- mini dashboard ----
  const isOverdue = (r: any) => r.target && r.target < S.TODAY_ISO && r.status !== 'Closed' && r.status !== 'Mitigated';
  const stat = {
    total: risks.length,
    open: risks.filter((r: any) => r.status === 'Open').length,
    inProgress: risks.filter((r: any) => r.status === 'In Progress').length,
    mitigated: risks.filter((r: any) => r.status === 'Mitigated').length,
    closed: risks.filter((r: any) => r.status === 'Closed').length,
    highImpact: risks.filter((r: any) => r.impact === 'High' && r.status !== 'Closed' && r.status !== 'Mitigated').length,
    overdue: risks.filter(isOverdue).length,
  };
  const statCards = [
    { label: 'Total Risks', value: stat.total, cls: 'text-slate-700' },
    { label: 'Open', value: stat.open, cls: 'text-red-600' },
    { label: 'In Progress', value: stat.inProgress, cls: 'text-blue-600' },
    { label: 'Mitigated', value: stat.mitigated, cls: 'text-emerald-600' },
    { label: 'Closed', value: stat.closed, cls: 'text-slate-500' },
    { label: 'High Impact (open)', value: stat.highImpact, cls: 'text-amber-600' },
    { label: 'Overdue', value: stat.overdue, cls: 'text-rose-600' },
  ];

  return (
    <div>
      {docErr && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{docErr}</div>}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <S.SectionTitle sub="Risk register with probability, impact, mitigation and escalation. Visible to everyone tagged to a project's team — not to clients.">Project Risk Management</S.SectionTitle>
        <button onClick={addRisk} disabled={!canAddRisk || addingRisk} title={!canAddRisk ? "You need to be on a project's team to log a risk." : ''}
          className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded-lg whitespace-nowrap">{addingRisk ? 'Adding…' : '+ Add Risk'}</button>
      </div>

      {/* Mini dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
        {statCards.map(c => (
          <S.Card key={c.label} className="p-3 text-center">
            <div className={`text-xl font-bold ${c.cls}`}>{c.value}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{c.label}</div>
          </S.Card>
        ))}
      </div>

      <S.Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr><S.Th>ID</S.Th><S.Th>Project</S.Th><S.Th>Risk</S.Th><S.Th>Supporting By</S.Th><S.Th>Prob</S.Th><S.Th>Impact</S.Th><S.Th>Target</S.Th><S.Th>Status</S.Th><S.Th></S.Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {risks.map((r: any) => (
              <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setDetailId(r.id)}>
                <S.Td className="font-mono text-xs">{r.id}</S.Td>
                <S.Td>{r.project}</S.Td>
                <S.Td className="font-medium max-w-[220px] truncate">{r.desc}</S.Td>
                <S.Td>{r.supportBy || <span className="text-slate-300">— unassigned —</span>}</S.Td>
                <S.Td><span className={S.priorityColor(r.prob)}>{r.prob}</span></S.Td>
                <S.Td><span className={S.priorityColor(r.impact)}>{r.impact}</span></S.Td>
                <S.Td>{r.target || '—'}{isOverdue(r) && <span className="ml-1 text-[10px] text-red-500">overdue</span>}</S.Td>
                <S.Td><S.Badge cls={S.statusColor(r.status)}>{r.status}</S.Badge></S.Td>
                <S.Td>{canDelete && <button onClick={(e) => { e.stopPropagation(); removeRisk(r.id); }} className="text-red-400 hover:text-red-600">✕</button>}</S.Td>
              </tr>
            ))}
            {risks.length === 0 && <tr><td colSpan={9} className="text-center text-sm text-slate-400 py-8">No risks logged. Click "+ Add Risk".</td></tr>}
          </tbody>
        </table>
      </S.Card>

      {/* Risk detail modal — full view, tag Supporting By, address the risk (status/mitigation/remarks
          restricted to whoever's tagged Supporting By, or Admin), real attachment upload/download. */}
      {detail && (() => {
        const r = detail;
        const proj = projectByName(r.project);
        const roster = S.buildRoster(proj, admin);
        const editGeneral = canEditGeneral(r);
        const address = canAddress(r);
        return (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setDetailId(null)}>
            <div className="bg-white rounded-xl max-w-lg w-full max-h-[88vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-1">
                <div className="text-[11px] text-slate-400">{r.id} · {r.project}</div>
                <button className="text-slate-400 hover:text-slate-600" onClick={() => setDetailId(null)}>✕</button>
              </div>
              {editGeneral ? (
                <input className={S.gInp + ' font-medium text-sm w-full mb-1'} value={r.desc} onChange={e => mut(r.id, { desc: e.target.value })} placeholder="Risk description" />
              ) : (
                <div className="font-medium text-sm mb-1">{r.desc}</div>
              )}
              <div className="text-[11px] text-slate-400 mb-3">Added by {r.addedBy || '—'}{r.addedAt ? ` · ${new Date(r.addedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</div>

              <div className="flex flex-col gap-1 mb-3">
                <label className="text-[10px] text-slate-400">Project</label>
                {editGeneral ? (
                  <select className={S.gInp} value={r.project} onChange={e => {
                    const newProj = e.target.value;
                    const newRoster = S.buildRoster(projectByName(newProj), admin);
                    const keepSupport = newRoster.some((p: any) => p.name === r.supportBy);
                    mut(r.id, { project: newProj, supportBy: keepSupport ? r.supportBy : '' });
                  }}>
                    {(role === 'admin' ? projects : myTeamProjects).map((p: any) => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                ) : <div className="text-xs text-slate-600 py-1.5">{r.project}</div>}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400">Probability</label>
                  {editGeneral ? (
                    <select className={S.gInp + ' ' + S.priorityColor(r.prob)} value={r.prob} onChange={e => mut(r.id, { prob: e.target.value })}>{S.RAG.map(o => <option key={o}>{o}</option>)}</select>
                  ) : <span className={`text-xs py-1.5 inline-block ${S.priorityColor(r.prob)}`}>{r.prob}</span>}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400">Impact</label>
                  {editGeneral ? (
                    <select className={S.gInp + ' ' + S.priorityColor(r.impact)} value={r.impact} onChange={e => mut(r.id, { impact: e.target.value })}>{S.RAG.map(o => <option key={o}>{o}</option>)}</select>
                  ) : <span className={`text-xs py-1.5 inline-block ${S.priorityColor(r.impact)}`}>{r.impact}</span>}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400">Target date</label>
                  {editGeneral ? (
                    <input type="date" className={S.gInp} value={r.target || ''} onChange={e => mut(r.id, { target: e.target.value })} />
                  ) : <span className="text-xs text-slate-600 py-1.5 inline-block">{r.target || '—'}</span>}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400">Supporting By</label>
                  {editGeneral ? (
                    <select className={S.gInp} value={r.supportBy || ''} onChange={e => {
                      const name = e.target.value;
                      mut(r.id, { supportBy: name });
                      if (name && name !== r.supportBy) notifySupportTagged(r, name);
                    }}>
                      <option value="">— Select —</option>
                      {roster.map((p: any) => <option key={p.name} value={p.name}>{p.name}{p.label ? ` (${p.label})` : ''}</option>)}
                    </select>
                  ) : <span className="text-xs text-slate-600 py-1.5 inline-block">{r.supportBy || '— unassigned —'}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap mb-1">
                <label className="text-[10px] text-slate-400 mr-1">Status</label>
                {address ? (
                  <select className={S.gInp + ' inline-block w-auto'} value={r.status} onChange={e => mut(r.id, { status: e.target.value })}>{STATUS_OPTS.map(o => <option key={o}>{o}</option>)}</select>
                ) : <S.Badge cls={S.statusColor(r.status)}>{r.status}</S.Badge>}
              </div>
              <div className="mb-4 pb-4 border-b border-slate-100">
                <label className="text-[10px] text-slate-400 block mb-1">Mitigation</label>
                {address ? (
                  <textarea className={S.gInp + ' min-h-[60px]'} value={r.mitigation || ''} onChange={e => mut(r.id, { mitigation: e.target.value })} placeholder="How this risk is being mitigated…" />
                ) : <div className="text-xs text-slate-600">{r.mitigation || <span className="text-slate-300">No mitigation notes yet.</span>}</div>}
                {!address && <div className="text-[10px] text-slate-400 mt-1">Only {r.supportBy || 'the person tagged Supporting By'} or an Admin can update status/mitigation and add remarks.</div>}
              </div>

              <div className="mb-4">
                <label className="text-[10px] text-slate-400 block mb-1.5">Attachments {docUploading && <span className="text-brand-500">— uploading…</span>}</label>
                {(r.docs || []).length === 0 && <div className="text-xs text-slate-300 mb-1.5">No attachments yet.</div>}
                <div className="space-y-1">
                  {(r.docs || []).map((d: any, i: number) => (
                    <div key={d.id || i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5 text-xs">
                      <S.Icon name={downloadingId === (d.id || d.path) ? 'refresh' : S.docIcon(d.n)} className={`w-3.5 h-3.5 shrink-0 ${downloadingId === (d.id || d.path) ? 'text-brand-500' : S.docIconTone(d.n)}`} />
                      {d.path ? (
                        <button onClick={() => downloadDoc(d)} className="flex-1 min-w-0 truncate text-left hover:underline hover:text-brand-700" title="Download">{d.n}</button>
                      ) : <span className="flex-1 min-w-0 truncate text-slate-400" title="No file on record">{d.n}</span>}
                      {d.size && <span className="text-[10px] text-slate-400 whitespace-nowrap">{(d.size / 1024).toFixed(0)} KB</span>}
                      {editGeneral && <button onClick={() => removeDoc(r.id, i)} className="text-red-400 hover:text-red-600">✕</button>}
                    </div>
                  ))}
                </div>
                {editGeneral && (
                  <label className="mt-2 inline-block cursor-pointer text-xs text-brand-600 hover:text-brand-700 border border-dashed border-brand-300 rounded-lg px-2.5 py-1.5">+ Upload attachment
                    <input type="file" multiple accept={S.DOC_ACCEPT} className="hidden" onChange={e => { if (e.target.files) attachDocs(r.id, e.target.files); e.target.value = ''; }} />
                  </label>
                )}
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1.5">Remarks</label>
                <div className="space-y-2 mb-2 max-h-40 overflow-auto">
                  {(r.remarks || []).length === 0 && <div className="text-xs text-slate-300">No remarks yet.</div>}
                  {(r.remarks || []).map((rm: any) => (
                    <div key={rm.id} className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                      <div className="text-xs text-slate-700">{rm.text}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{rm.by} · {new Date(rm.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                    </div>
                  ))}
                </div>
                {address && (
                  <div className="flex gap-2">
                    <input className={S.gInp} value={remarkDraft} onChange={e => setRemarkDraft(e.target.value)} placeholder="Add a detailed remark…"
                      onKeyDown={e => { if (e.key === 'Enter' && remarkDraft.trim()) { addRemark(r.id, remarkDraft); setRemarkDraft(''); } }} />
                    <button onClick={() => { if (remarkDraft.trim()) { addRemark(r.id, remarkDraft); setRemarkDraft(''); } }} className="bg-brand-500 hover:bg-brand-600 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap">Add</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
