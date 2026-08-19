import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import * as S from '../shared';
import * as db from '../db';

const STATUS_OPTS = ['Open', 'In Progress', 'Resolved', 'Closed'];

export default function Issues() {
  const location = useLocation();
  const { issues, setIssues } = React.useContext(S.GovernanceDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { role } = React.useContext(S.RoleContext);
  const { admin } = React.useContext(S.AdminDataContext);
  const { email: myEmail, profile: myProfile } = React.useContext(S.CurrentUserContext);
  // Same shared project-activity feed Risk Management / Phase Management post to.
  const { addNotification } = React.useContext(S.PhaseDataContext);
  const { logActivity } = React.useContext(S.ActivityLogContext);
  // Only Admin/Super Admin can permanently delete an issue entry — same rule used everywhere else.
  const canDelete = role === 'admin';

  const myName = myProfile?.name || myEmail;
  const projectByName = (name: string) => projects.find((p: any) => p.name === name);
  // Final sign-off on Resolved/Closed is fixed at L1 -- same convention Milestone/Phase review in
  // Phase Management uses (S.approverLevelFor), so it falls back sensibly if L1 isn't staffed on a
  // given project instead of just breaking.
  const issueApproverLevel = (proj: any) => S.approverLevelFor('phase', proj);
  const myLevelOn = (proj: any): string | null => {
    if (role === 'admin') return 'L1';
    const entry = (proj?.team || []).find((t: any) => t.name === myName);
    return entry?.level || null;
  };

  // A project this account is tagged to (for raising/being assignable at all) -- same "on the team"
  // gate used everywhere else in Governance.
  const myTeamProjects = role === 'admin' ? projects : projects.filter((p: any) => S.isOnProjectTeam(p, myName));
  const canAddIssue = role === 'admin' || myTeamProjects.length > 0;

  // ---- visibility: an issue is only visible to whoever raised it, is assigned to it, is tagged on
  // it, is Admin/Super Admin, or holds the L1 sign-off role on that project -- nobody else on the
  // project team sees it at all, not even in the list. This is stricter than Risk Management (visible
  // to the whole project team) because the request was specifically "only tagged and assigned members
  // can see the updates, no other users." ----
  const canSeeIssue = (i: any) => S.issueVisibleTo(i, projectByName(i.project), role, myName);
  const visibleIssues = issues.filter(canSeeIssue);

  // General fields (desc/severity/due/tags) -- raiser, assignee or Admin. Status changes are gated
  // separately below (canAddress), since resolving/closing is the assignee's job specifically.
  const canEditGeneral = (i: any) => role === 'admin' || i.raisedBy === myName || i.assignee === myName;
  const canAddress = (i: any) => {
    if (role === 'admin' || i.assignee === myName) return true;
    const proj = projectByName(i.project);
    const lvl = myLevelOn(proj);
    return !!lvl && lvl === issueApproverLevel(proj);
  };

  const mut = (id: string, patch: any) => setIssues((is: any[]) => is.map(i => i.id === id ? { ...i, ...patch } : i));

  // Posts to the shared project-activity feed -- broadcast the same way Risk/Phase notifications
  // are, but the message always names exactly who's expected to act, which is what actually reaches
  // the tagged/assigned person since the issue itself stays hidden from everyone else.
  const notifyIssue = (i: any, payload: any) => {
    const proj = projectByName(i.project);
    const roster = S.buildRosterWithClients(proj, admin);
    addNotification({
      projectId: proj?.id, project: i.project, tags: roster.map((p: any) => p.name), priority: 'high',
      level: 'issue', itemName: i.desc, itemId: i.id, ...payload,
    });
  };

  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = visibleIssues.find((i: any) => i.id === detailId) || null;

  // Deep link from a notification click (shared.tsx's notificationTarget) — opens the specific
  // issue's detail modal directly instead of leaving the list for the user to search.
  React.useEffect(() => {
    const openId = (location.state as any)?.openId;
    if (openId) setDetailId(openId);
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // ID reserved atomically in the database (db.nextSeqId) rather than computed from the currently-
  // loaded list -- two people clicking "+ Add Issue" at the same moment used to be able to land on
  // the same IS-NNN number, and since writes are upsert-by-id the second one would silently
  // overwrite the first person's brand new issue.
  const [addingIssue, setAddingIssue] = useState(false);
  const addIssue = async () => {
    if (!canAddIssue || addingIssue) return;
    setAddingIssue(true);
    try {
      const proj = myTeamProjects[0] || projects[0];
      const id = await db.nextSeqId('IS');
      const fresh = {
        id, project: proj?.name || '', desc: 'New issue', raisedBy: myName, assignee: '', tags: [],
        severity: 'Medium', due: '', status: 'Open', pendingStatus: null,
        addedBy: myName, addedAt: new Date().toISOString(), remarks: [],
      };
      setIssues((is: any[]) => [...is, fresh]);
      setDetailId(id);
      notifyIssue(fresh, { type: 'Issue Raised', message: `${myName} raised a new issue: "${fresh.desc}" (${id}) in ${fresh.project}. Assign an owner to get it moving.` });
      logActivity({ module: 'Issue Management', action: `Raised issue "${fresh.desc}" (${id})`, project: fresh.project });
    } finally { setAddingIssue(false); }
  };
  const removeIssue = (id: string) => {
    if (!canDelete) return;
    const i = issues.find((x: any) => x.id === id);
    setIssues((is: any[]) => is.filter(i => i.id !== id));
    logActivity({ module: 'Issue Management', action: `Removed issue "${i?.desc || id}"`, project: i?.project });
    setDetailId(d => d === id ? null : d);
  };

  // ---- remarks: anyone who can see the issue (raised/assigned/tagged/admin/L1) can comment ----
  const addRemark = (id: string, text: string) => {
    if (!text.trim()) return;
    const i = issues.find((x: any) => x.id === id);
    setIssues((is: any[]) => is.map(i => i.id === id
      ? { ...i, remarks: [...(i.remarks || []), { id: S.uid('RMK'), text: text.trim(), by: myName, at: new Date().toISOString() }] }
      : i));
    logActivity({ module: 'Issue Management', action: `Added a remark on issue "${i?.desc || id}"`, project: i?.project });
  };
  const [remarkDraft, setRemarkDraft] = useState('');
  React.useEffect(() => { setRemarkDraft(''); }, [detailId]);

  // ---- status: Open/In Progress apply immediately for anyone who canAddress. Resolved/Closed queue
  // for L1 sign-off unless the actor already holds L1 (or is Admin/Super Admin), matching the
  // Milestone/Phase review pattern in Phase Management. ----
  const setStatus = (i: any, val: string) => {
    if (!canAddress(i)) return;
    if (val !== 'Resolved' && val !== 'Closed') {
      mut(i.id, { status: val, pendingStatus: null, signOffRequestedBy: null, signOffRequestedAt: null });
      logActivity({ module: 'Issue Management', action: `Changed issue "${i.desc}" status to "${val}"`, project: i.project });
      return;
    }
    const proj = projectByName(i.project);
    const approverLvl = issueApproverLevel(proj);
    const myLvl = myLevelOn(proj);
    const qualifies = role === 'admin' || (myLvl && S.levelNum(myLvl) <= 1);
    if (qualifies) {
      mut(i.id, { status: val, pendingStatus: null, signOffRequestedBy: null, signOffRequestedAt: null, signedOffBy: myName, signedOffAt: S.TODAY_ISO });
      notifyIssue(i, { type: val === 'Closed' ? 'Issue Closed' : 'Issue Resolved', message: `Issue "${i.desc}" (${i.id}) has been marked ${val} by ${myName}.` });
      logActivity({ module: 'Issue Management', action: `Marked issue "${i.desc}" ${val}`, project: i.project });
    } else {
      mut(i.id, { pendingStatus: val, signOffRequestedBy: myName, signOffRequestedAt: S.TODAY_ISO });
      notifyIssue(i, { type: 'Issue Pending Sign-off', message: `Issue "${i.desc}" (${i.id}) was marked ${val} by ${myName} and is awaiting ${S.designationForLevel(approverLvl, admin) || approverLvl} sign-off before it's final.` });
      logActivity({ module: 'Issue Management', action: `Marked issue "${i.desc}" ${val} — pending sign-off`, project: i.project });
    }
  };
  const iAmSignOffApprover = (i: any) => {
    if (role === 'admin') return true;
    const proj = projectByName(i.project);
    const lvl = myLevelOn(proj);
    return !!lvl && lvl === issueApproverLevel(proj);
  };
  const approveSignOff = (i: any) => {
    if (!i.pendingStatus || !iAmSignOffApprover(i)) return;
    const val = i.pendingStatus;
    mut(i.id, { status: val, pendingStatus: null, signOffRequestedBy: null, signOffRequestedAt: null, signedOffBy: myName, signedOffAt: S.TODAY_ISO });
    notifyIssue(i, { type: val === 'Closed' ? 'Issue Closed' : 'Issue Resolved', message: `Issue "${i.desc}" (${i.id}) has been signed off and finalized as ${val} by ${myName}.` });
    logActivity({ module: 'Issue Management', action: `Signed off issue "${i.desc}" as ${val}`, project: i.project });
  };
  const sendBackSignOff = (i: any) => {
    if (!i.pendingStatus || !iAmSignOffApprover(i)) return;
    mut(i.id, { pendingStatus: null, signOffRequestedBy: null, signOffRequestedAt: null, status: 'In Progress' });
    notifyIssue(i, { type: 'Issue Pending Sign-off', message: `${myName} sent issue "${i.desc}" (${i.id}) back to In Progress instead of signing off on it.` });
    logActivity({ module: 'Issue Management', action: `Sent issue "${i.desc}" back to In Progress`, project: i.project });
  };

  // ---- assignee / tags ----
  const setAssignee = (i: any, name: string) => {
    if (!canEditGeneral(i)) return;
    mut(i.id, { assignee: name });
    logActivity({ module: 'Issue Management', action: `Assigned issue "${i.desc}" to "${name || '— unassigned —'}"`, project: i.project });
    if (name && name !== i.assignee) notifyIssue(i, { type: 'Issue Assigned', message: `${name} has been assigned issue "${i.desc}" (${i.id}) in ${i.project}.` });
  };
  const addTag = (i: any, name: string) => {
    if (!canEditGeneral(i) || !name || (i.tags || []).includes(name)) return;
    mut(i.id, { tags: [...(i.tags || []), name] });
    logActivity({ module: 'Issue Management', action: `Tagged "${name}" on issue "${i.desc}"`, project: i.project });
    notifyIssue(i, { type: 'Issue Tagged', message: `${name} has been tagged on issue "${i.desc}" (${i.id}) in ${i.project} and can now see its updates.` });
  };
  const removeTag = (i: any, name: string) => { if (canEditGeneral(i)) { mut(i.id, { tags: (i.tags || []).filter((t: string) => t !== name) }); logActivity({ module: 'Issue Management', action: `Removed tag "${name}" from issue "${i.desc}"`, project: i.project }); } };

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <S.SectionTitle sub="Track, assign and resolve project issues — only whoever raised, is assigned, or is tagged on an issue (plus Admin/L1) can see it.">Issue Management</S.SectionTitle>
        <button onClick={addIssue} disabled={!canAddIssue || addingIssue} title={!canAddIssue ? "You need to be on a project's team to raise an issue." : ''}
          className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded-lg whitespace-nowrap">{addingIssue ? 'Adding…' : '+ Add Issue'}</button>
      </div>

      <S.Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr><S.Th>ID</S.Th><S.Th>Project</S.Th><S.Th>Issue</S.Th><S.Th>Raised By</S.Th><S.Th>Assigned</S.Th><S.Th>Tags</S.Th><S.Th>Severity</S.Th><S.Th>Due</S.Th><S.Th>Status</S.Th><S.Th></S.Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleIssues.map((i: any) => (
              <tr key={i.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setDetailId(i.id)}>
                <S.Td className="font-mono text-xs">{i.id}</S.Td>
                <S.Td>{i.project}</S.Td>
                <S.Td className="font-medium max-w-[200px] truncate">{i.desc}</S.Td>
                <S.Td>{i.raisedBy || <span className="text-slate-300">—</span>}</S.Td>
                <S.Td>{i.assignee || <span className="text-slate-300">— unassigned —</span>}</S.Td>
                <S.Td>
                  {(i.tags || []).length ? (
                    <span className="flex flex-wrap gap-1">{i.tags.slice(0, 2).map((t: string) => <S.Badge key={t} cls="bg-slate-100 text-slate-600">{t}</S.Badge>)}{i.tags.length > 2 && <span className="text-[10px] text-slate-400">+{i.tags.length - 2}</span>}</span>
                  ) : <span className="text-slate-300">—</span>}
                </S.Td>
                <S.Td><span className={S.priorityColor(i.severity)}>{i.severity}</span></S.Td>
                <S.Td>{i.due || '—'}</S.Td>
                <S.Td>
                  <S.Badge cls={S.statusColor(i.pendingStatus ? 'Pending Sign-off' : i.status)}>{i.pendingStatus ? `Pending Sign-off (${i.pendingStatus})` : i.status}</S.Badge>
                </S.Td>
                <S.Td>{canDelete && <button onClick={(e) => { e.stopPropagation(); removeIssue(i.id); }} title="Remove issue" aria-label={`Remove issue ${i.id}`} className="text-red-400 hover:text-red-600">✕</button>}</S.Td>
              </tr>
            ))}
            {visibleIssues.length === 0 && <tr><td colSpan={10} className="text-center text-sm text-slate-400 py-8">{issues.length === 0 ? 'No issues logged. Click "+ Add Issue".' : 'No issues are visible to you — you need to be raised, assigned or tagged on one to see it.'}</td></tr>}
          </tbody>
        </table>
        </div>
      </S.Card>

      {/* Issue detail modal */}
      {detail && (() => {
        const i = detail;
        const proj = projectByName(i.project);
        const staffRoster = S.buildRoster(proj, admin);
        const fullRoster = S.buildRosterWithClients(proj, admin);
        const editGeneral = canEditGeneral(i);
        const address = canAddress(i);
        const approverLvl = issueApproverLevel(proj);
        const approverLabel = S.designationForLevel(approverLvl, admin) || approverLvl;
        return (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setDetailId(null)}>
            <div className="bg-white rounded-xl max-w-lg w-full max-h-[88vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-1">
                <div className="text-[11px] text-slate-400">{i.id} · {i.project}</div>
                <button className="text-slate-400 hover:text-slate-600" onClick={() => setDetailId(null)}>✕</button>
              </div>
              {editGeneral ? (
                <input className={S.gInp + ' font-medium text-sm w-full mb-1'} value={i.desc} onChange={e => mut(i.id, { desc: e.target.value })} placeholder="Issue description" />
              ) : (
                <div className="font-medium text-sm mb-1">{i.desc}</div>
              )}
              <div className="text-[11px] text-slate-400 mb-3">Added by {i.addedBy || '—'}{i.addedAt ? ` · ${new Date(i.addedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}</div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400">Raised By</label>
                  {editGeneral ? (
                    <select className={S.gInp} value={i.raisedBy || ''} onChange={e => mut(i.id, { raisedBy: e.target.value })}>
                      <option value="">— Select —</option>
                      {fullRoster.map((p: any) => <option key={p.name} value={p.name}>{p.name}{p.label ? ` (${p.label})` : ''}</option>)}
                    </select>
                  ) : <span className="text-xs text-slate-600 py-1.5 inline-block">{i.raisedBy || '—'}</span>}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400">Assigned To</label>
                  {editGeneral ? (
                    <select className={S.gInp} value={i.assignee || ''} onChange={e => setAssignee(i, e.target.value)}>
                      <option value="">— Unassigned —</option>
                      {staffRoster.map((p: any) => <option key={p.name} value={p.name}>{p.name}{p.label ? ` (${p.label})` : ''}</option>)}
                    </select>
                  ) : <span className="text-xs text-slate-600 py-1.5 inline-block">{i.assignee || '— unassigned —'}</span>}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400">Severity</label>
                  {editGeneral ? (
                    <select className={S.gInp + ' ' + S.priorityColor(i.severity)} value={i.severity} onChange={e => mut(i.id, { severity: e.target.value })}>{S.RAG.map((o: string) => <option key={o}>{o}</option>)}</select>
                  ) : <span className={`text-xs py-1.5 inline-block ${S.priorityColor(i.severity)}`}>{i.severity}</span>}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400">Due date</label>
                  {editGeneral ? (
                    <input type="date" className={S.gInp} value={i.due || ''} onChange={e => mut(i.id, { due: e.target.value })} />
                  ) : <span className="text-xs text-slate-600 py-1.5 inline-block">{i.due || '—'}</span>}
                </div>
              </div>

              <div className="mb-3">
                <label className="text-[10px] text-slate-400 block mb-1.5">Tagged (can see this issue and its updates)</label>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {(i.tags || []).length === 0 && <span className="text-xs text-slate-300">No one tagged yet.</span>}
                  {(i.tags || []).map((t: string) => (
                    <span key={t} className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs rounded-full pl-2.5 pr-1.5 py-1">
                      {t}
                      {editGeneral && <button onClick={() => removeTag(i, t)} className="text-slate-400 hover:text-red-500 leading-none">✕</button>}
                    </span>
                  ))}
                </div>
                {editGeneral && (
                  <select className={S.gInp + ' w-auto'} value="" onChange={e => { if (e.target.value) addTag(i, e.target.value); }}>
                    <option value="">+ Tag someone…</option>
                    {fullRoster.filter((p: any) => !(i.tags || []).includes(p.name)).map((p: any) => <option key={p.name} value={p.name}>{p.name}{p.label ? ` (${p.label})` : ''}</option>)}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap mb-1">
                <label className="text-[10px] text-slate-400 mr-1">Status</label>
                {address ? (
                  <select className={S.gInp + ' inline-block w-auto'} value={i.pendingStatus || i.status} onChange={e => setStatus(i, e.target.value)}>{STATUS_OPTS.map((o: string) => <option key={o}>{o}</option>)}</select>
                ) : <S.Badge cls={S.statusColor(i.status)}>{i.status}</S.Badge>}
                {i.pendingStatus && <S.Badge cls={S.statusColor('Pending Sign-off')}>Pending {approverLabel} sign-off</S.Badge>}
              </div>
              {i.pendingStatus && (
                <div className="text-[11px] text-slate-400 mb-2">
                  {i.signOffRequestedBy} marked this {i.pendingStatus} on {i.signOffRequestedAt ? new Date(i.signOffRequestedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : ''} — {approverLabel} needs to sign off before it's final.
                  {iAmSignOffApprover(i) && (
                    <div className="flex gap-2 mt-1.5">
                      <button onClick={() => approveSignOff(i)} className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg">Sign off & finalize</button>
                      <button onClick={() => sendBackSignOff(i)} className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs px-3 py-1.5 rounded-lg">Send back to In Progress</button>
                    </div>
                  )}
                </div>
              )}
              {!i.pendingStatus && i.signedOffBy && (i.status === 'Resolved' || i.status === 'Closed') && (
                <div className="text-[11px] text-slate-400 mb-2">Signed off by {i.signedOffBy}{i.signedOffAt ? ` on ${i.signedOffAt}` : ''}.</div>
              )}
              {!address && <div className="text-[10px] text-slate-400 mb-3">Only {i.assignee || 'the assigned person'}, {approverLabel} or an Admin can change status.</div>}

              <div className="mt-4">
                <label className="text-[10px] text-slate-400 block mb-1.5">Remarks</label>
                <div className="space-y-2 mb-2 max-h-40 overflow-auto">
                  {(i.remarks || []).length === 0 && <div className="text-xs text-slate-300">No remarks yet.</div>}
                  {(i.remarks || []).map((rm: any) => (
                    <div key={rm.id} className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                      <div className="text-xs text-slate-700">{rm.text}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{rm.by} · {new Date(rm.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input className={S.gInp} value={remarkDraft} onChange={e => setRemarkDraft(e.target.value)} placeholder="Add a remark…"
                    onKeyDown={e => { if (e.key === 'Enter' && remarkDraft.trim()) { addRemark(i.id, remarkDraft); setRemarkDraft(''); } }} />
                  <button onClick={() => { if (remarkDraft.trim()) { addRemark(i.id, remarkDraft); setRemarkDraft(''); } }} className="bg-brand-500 hover:bg-brand-600 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap">Add</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
