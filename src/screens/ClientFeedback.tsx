import React, { useState, useMemo } from 'react';
import * as S from '../shared';
import * as db from '../db';

// Governance -> Clients' Feedback. Feedback is collected from every client FEEDBACK_LEAD_DAYS (10) days
// before their next fee due date. One record per project per fee due date, saved in its own admin_data
// row ('cf:<projectId>:<feeDue>') so a new cycle starts by itself and past cycles become history.
// What each person can do is set in Administration -> Roles & Permissions -> Clients' Feedback access:
//   view    - read ratings, comments, history
//   comment - per-question comments, remarks, action items, amendments, "shared back" tick
//   edit    - ratings, save and lock, create issues, escalate to the Risk Register

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};
const cycleLabel = (iso: string) => {
  const [y, m] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const avgColor = (v: number) => v < 3 ? 'text-red-600' : v < 4 ? 'text-amber-600' : 'text-emerald-600';
const barColor = (v: number) => v < 3 ? 'bg-red-500' : v < 4 ? 'bg-amber-500' : 'bg-emerald-500';
const ratingBtn = (on: boolean, v: number) => on
  ? (v <= 2 ? 'bg-red-600 border-red-600 text-white' : v === 3 ? 'bg-amber-600 border-amber-600 text-white' : 'bg-emerald-600 border-emerald-600 text-white')
  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50';

function statusBadge(e: any) {
  const st = e.rec.status;
  if (st === 'Escalated') return <S.Badge cls="bg-red-100 text-red-700">Escalated</S.Badge>;
  if (st === 'Recorded') return <S.Badge cls="bg-indigo-100 text-indigo-700">Recorded</S.Badge>;
  if (e.left < 0) return <S.Badge cls="bg-red-50 text-red-700">Overdue by {-e.left}d</S.Badge>;
  if (e.left === 0) return <S.Badge cls="bg-orange-100 text-orange-700">Due today</S.Badge>;
  if (e.left <= 7) return <S.Badge cls="bg-amber-100 text-amber-700">Due in {e.left}d</S.Badge>;
  return <S.Badge cls="bg-slate-100 text-slate-600">In {e.left} days</S.Badge>;
}

export default function ClientFeedback() {
  const { admin, patchAdmin } = React.useContext(S.AdminDataContext);
  const { email, profile } = React.useContext(S.CurrentUserContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { team } = React.useContext(S.TeamDataContext);
  const { setRisks, setIssues } = React.useContext(S.GovernanceDataContext);
  const { logActivity } = React.useContext(S.ActivityLogContext);
  const caps = S.feedbackCapsFor(email, admin);
  const me = profile?.name || email;

  const [filter, setFilter] = useState<'all' | 'overdue' | 'week' | 'upcoming' | 'done'>('all');
  const [selKey, setSelKey] = useState<string | null>(null);
  const [tab, setTab] = useState<'feedback' | 'history'>('feedback');
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<any>({ t: '', o: '', d: '' });
  const [amendText, setAmendText] = useState('');

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };
  const entries = useMemo(() => S.feedbackEntries(projects, admin), [projects, admin]);
  const noDate = useMemo(() => S.liveProjects(projects).filter((p: any) => !S.isProjectInactive(p) && !S.nextBillingDueDate(p)), [projects]);
  const count = (k: string) => k === 'all' ? entries.length : entries.filter((e: any) => e.cat === k).length;
  const shown = entries.filter((e: any) => filter === 'all' || e.cat === filter);
  const sel = entries.find((e: any) => e.rec.id === selKey) || shown[0] || entries[0];

  // Weakest areas across clients: per question, the average of each client's latest stored cycle.
  const weakest = useMemo(() => {
    const sums = S.FEEDBACK_QUESTIONS.map(() => [0, 0]);
    const seen = new Set<string>();
    entries.forEach((e: any) => {
      if (seen.has(e.project.id)) return; seen.add(e.project.id);
      const hist = S.feedbackHistory(e.project.id, admin).filter((r: any) => (r.scores || []).some((x: number) => x > 0));
      const last = hist[hist.length - 1];
      if (last) last.scores.forEach((v: number, i: number) => { if (v > 0) { sums[i][0] += v; sums[i][1]++; } });
    });
    return sums.map((s, i) => ({ label: S.FEEDBACK_QUESTIONS[i].short, v: s[1] ? s[0] / s[1] : 0 }))
      .filter(x => x.v > 0).sort((a, b) => a.v - b.v).slice(0, 3);
  }, [entries, admin]);

  const avgAll = (() => {
    const v = entries.map((e: any) => S.feedbackAvg(e.rec.scores)).filter((x: number) => x > 0);
    return v.length ? v.reduce((a: number, b: number) => a + b, 0) / v.length : 0;
  })();

  if (!caps.view) return <S.Card className="p-6 text-sm text-slate-500">You don't have access to Clients' Feedback. Ask a Super Admin to enable it in Administration → Roles & Permissions.</S.Card>;

  const owners: string[] = (team || []).filter((t: any) => t.status !== 'Suspended' && t.status !== 'Deactivated').map((t: any) => t.name).filter(Boolean);

  // Write a patch to the selected record. Merged against the stored row so two people editing different
  // fields at nearly the same moment don't wipe each other out.
  const update = (e: any, patch: any) => patchAdmin(e.rec.id, (cur: any) => ({ ...S.blankFeedback(e.project, e.feeDue), ...(cur || {}), ...patch }));

  const rec = sel?.rec;
  const locked = !!rec && (rec.status === 'Recorded' || rec.status === 'Escalated');
  const answered = rec ? rec.scores.filter((x: number) => x > 0).length : 0;
  const missing = rec ? rec.scores.filter((v: number, i: number) => v > 0 && v <= 2 && !String(rec.comments[i] || '').trim()).length : 0;
  const avg = rec ? S.feedbackAvg(rec.scores) : 0;
  const canRate = caps.edit && !locked;
  const canWrite = caps.comment && !locked;       // per-question comments, remarks, plan
  const cantSave = answered < S.FEEDBACK_Q_COUNT || missing > 0;
  const autoRule = !!rec && S.feedbackNeedsEscalation(rec.scores);

  const escalate = async (e: any, automatic: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = e.rec; const a = S.feedbackAvg(r.scores);
      const id = await db.nextSeqId('R');
      const lead = e.project.strategicLead || (e.project.team || []).find((t: any) => t.level === 'L1')?.name || '';
      setRisks((rs: any[]) => [...rs, {
        id, project: e.project.name, desc: `Client dissatisfaction: ${e.project.name} (feedback ${S.feedbackAvgLabel(a)}/5)`,
        supportBy: lead, addedBy: me, addedAt: new Date().toISOString(),
        prob: a < 2.5 ? 'High' : 'Medium', impact: 'High', mitigation: r.plan || '', target: '', status: 'Open', remarks: [], docs: [],
      }]);
      update(e, { status: 'Escalated', riskId: id, recordedBy: r.recordedBy || me, recordedAt: r.recordedAt || new Date().toISOString() });
      logActivity({ module: "Clients' Feedback", action: `${automatic ? 'Auto-escalated' : 'Escalated'} ${e.project.name} feedback to Risk Register (${id})`, project: e.project.name });
      setConfirming(false);
      flash(`${automatic ? 'Saved and auto-escalated' : 'Escalated'} to Risk Register as ${id}`);
    } catch (err: any) { flash('Could not create the risk: ' + (err?.message || 'try again')); }
    finally { setBusy(false); }
  };

  const save = async (e: any) => {
    if (cantSave || !caps.edit) return;
    if (S.feedbackNeedsEscalation(e.rec.scores)) { await escalate(e, true); return; }
    update(e, { status: 'Recorded', recordedBy: me, recordedAt: new Date().toISOString(), takenOn: e.rec.takenOn || S.TODAY_ISO });
    logActivity({ module: "Clients' Feedback", action: `Recorded feedback for ${e.project.name} (${S.feedbackAvgLabel(S.feedbackAvg(e.rec.scores))}/5)`, project: e.project.name });
    flash(`Feedback saved and locked for ${e.project.name}`);
  };

  const createIssue = async (e: any, qi: number) => {
    if (busy || !caps.edit) return;
    setBusy(true);
    try {
      const id = await db.nextSeqId('IS');
      const score = e.rec.scores[qi];
      const text = String(e.rec.comments[qi] || '').trim();
      setIssues((is: any[]) => [...is, {
        id, project: e.project.name, desc: `Client feedback Q${qi + 1} (${S.FEEDBACK_QUESTIONS[qi].short}): ${text}`.slice(0, 300),
        raisedBy: e.project.clients?.[0]?.name || me, assignee: '', tags: [],
        severity: score > 0 && score <= 2 ? 'High' : score === 3 ? 'Medium' : 'Low', due: '', status: 'Open', pendingStatus: null,
        addedBy: me, addedAt: new Date().toISOString(), remarks: [],
      }]);
      update(e, { issues: { ...(e.rec.issues || {}), [qi]: id } });
      logActivity({ module: "Clients' Feedback", action: `Created issue ${id} from feedback question ${qi + 1}`, project: e.project.name });
      flash(`Created ${id} in Issue Management`);
    } catch (err: any) { flash('Could not create the issue: ' + (err?.message || 'try again')); }
    finally { setBusy(false); }
  };

  const addAction = (e: any) => {
    if (!caps.comment || !draft.t.trim()) return;
    update(e, { actions: [...(e.rec.actions || []), { id: S.uid('ACT'), t: draft.t.trim(), o: draft.o || owners[0] || '', d: draft.d, done: false }] });
    setDraft({ ...draft, t: '' });
  };
  const toggleAction = (e: any, id: string) => caps.comment && update(e, { actions: (e.rec.actions || []).map((a: any) => a.id === id ? { ...a, done: !a.done } : a) });
  const addAmendment = (e: any) => {
    if (!caps.comment || !amendText.trim()) return;
    update(e, { amendments: [...(e.rec.amendments || []), { on: S.TODAY_ISO, by: me, text: amendText.trim() }] });
    setAmendText('');
  };

  const history = sel ? S.feedbackHistory(sel.project.id, admin).filter((r: any) => (r.scores || []).some((x: number) => x > 0)) : [];
  const trend = (() => {
    if (history.length < 2) return 'Only one cycle recorded so far. The trend will appear after the next cycle.';
    const first = S.feedbackAvg(history[0].scores), last = S.feedbackAvg(history[history.length - 1].scores);
    return last < first - 0.5 ? `Declining: down ${(first - last).toFixed(1)} points since ${cycleLabel(history[0].feeDue)}. Worth a conversation before the fee is due.`
      : last > first + 0.3 ? `Improving: up ${(last - first).toFixed(1)} points since ${cycleLabel(history[0].feeDue)}.` : `Broadly steady since ${cycleLabel(history[0].feeDue)}.`;
  })();

  const inp = 'border border-slate-300 rounded-lg px-3 text-sm bg-white h-11 w-full focus:outline-none focus:border-brand-400';
  const ta = (readonly: boolean, bad = false) => `w-full border rounded-lg px-3 py-2 text-sm leading-relaxed resize-y focus:outline-none focus:border-brand-400 ${readonly ? 'bg-slate-50' : 'bg-white'} ${bad ? 'border-red-500' : 'border-slate-300'}`;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Clients' Feedback</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">Feedback is collected from every client <b>{S.FEEDBACK_LEAD_DAYS} days before their fee due date</b>, so concerns surface before the invoice does. Ordered by feedback due date.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <S.Card className="p-3"><div className="text-xs text-slate-500">Clients reviewed</div><div className="text-2xl font-bold">{count('done')} <span className="text-sm font-medium text-slate-400">of {entries.length}</span></div></S.Card>
        <S.Card className="p-3"><div className="text-xs text-slate-500">Average rating</div><div className="text-2xl font-bold">{S.feedbackAvgLabel(avgAll)} <span className="text-sm font-medium text-slate-400">/ 5</span></div></S.Card>
        <S.Card className="p-3"><div className="text-xs text-slate-500">Overdue</div><div className="text-2xl font-bold text-red-600">{count('overdue')}</div></S.Card>
        <S.Card className="p-3"><div className="text-xs text-slate-500">Escalated</div><div className="text-2xl font-bold">{entries.filter((e: any) => e.rec.status === 'Escalated').length}</div></S.Card>
      </div>

      {weakest.length > 0 && (
        <S.Card className="p-4 mb-4">
          <div className="flex justify-between flex-wrap gap-1 mb-2"><div className="text-sm font-semibold text-slate-800">Weakest areas across clients</div><div className="text-xs text-slate-400">Each client's latest recorded cycle</div></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {weakest.map(w => (
              <div key={w.label}>
                <div className="flex justify-between text-sm mb-1"><span>{w.label}</span><b>{S.feedbackAvgLabel(w.v)}</b></div>
                <div className="h-1.5 rounded bg-slate-200"><div className={`h-1.5 rounded ${barColor(w.v)}`} style={{ width: `${w.v * 20}%` }} /></div>
              </div>
            ))}
          </div>
        </S.Card>
      )}

      <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Filter clients">
        {([['all', 'All'], ['overdue', 'Overdue'], ['week', 'Due this week'], ['upcoming', 'Upcoming'], ['done', 'Done']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
            className={`min-h-[44px] px-4 rounded-lg text-sm font-semibold border ${filter === k ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>
            {label} <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${filter === k ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}>{count(k)}</span>
          </button>
        ))}
      </div>

      {entries.length === 0 && <S.Card className="p-6 text-sm text-slate-500">No clients have a billing due date yet. Set a Billing Day on a project in Project Master and it will appear here.</S.Card>}

      {entries.length > 0 && (
        <div className="flex flex-wrap gap-5 items-start">
          {/* QUEUE */}
          <S.Card className="flex-[1_1_420px] min-w-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[540px]">
                <thead><tr className="bg-slate-50"><S.Th>Client</S.Th><S.Th>Fee due</S.Th><S.Th>Feedback due</S.Th><S.Th>Status</S.Th><S.Th>Rating</S.Th></tr></thead>
                <tbody>
                  {shown.map((e: any) => {
                    const a = S.feedbackAvg(e.rec.scores);
                    return (
                      <tr key={e.rec.id} className={`border-t border-slate-100 ${sel && sel.rec.id === e.rec.id ? 'bg-indigo-50' : 'bg-white'}`}>
                        <td className="p-0"><button onClick={() => { setSelKey(e.rec.id); setConfirming(false); }} className="block w-full min-h-[52px] text-left px-3 font-semibold text-slate-900">{e.project.name}</button></td>
                        <td className="px-3 text-slate-500 whitespace-nowrap">{fmtDate(e.feeDue)}</td>
                        <td className="px-3 font-medium whitespace-nowrap">{fmtDate(e.dueISO)}</td>
                        <td className="px-3">{statusBadge(e)}</td>
                        <td className={`px-3 font-bold ${a ? avgColor(a) : 'text-slate-400'}`}>{S.feedbackAvgLabel(a)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {shown.length === 0 && <div className="p-6 text-sm text-slate-500">No clients in this view.</div>}
            {noDate.length > 0 && <div className="px-4 py-3 border-t border-slate-100 text-xs text-slate-400">{noDate.length} project{noDate.length === 1 ? ' has' : 's have'} no billing due date set and {noDate.length === 1 ? 'is' : 'are'} not listed: {noDate.map((p: any) => p.name).join(', ')}.</div>}
          </S.Card>

          {/* PANEL */}
          {sel && rec && (
            <S.Card className="flex-[1_1_500px] min-w-0 max-w-[680px] p-5 space-y-5">
              <div className="flex justify-between flex-wrap gap-3">
                <div>
                  <div className="text-xs text-slate-500">Client</div>
                  <div className="text-xl font-bold">{sel.project.name}</div>
                  <div className="text-sm text-slate-500 mt-1">Fee due <b>{fmtDate(sel.feeDue)}</b> · Feedback due <b>{fmtDate(sel.dueISO)}</b></div>
                </div>
                <div className="text-right">{statusBadge(sel)}<div className="mt-2 text-xs text-slate-500">Overall <span className="text-xl font-bold text-slate-900">{S.feedbackAvgLabel(avg)}</span> / 5</div></div>
              </div>

              {!caps.comment && <div className="text-xs text-slate-600 bg-slate-100 rounded-lg px-3 py-2">You have view-only access to Clients' Feedback.</div>}
              {caps.comment && !caps.edit && <div className="text-xs text-slate-600 bg-slate-100 rounded-lg px-3 py-2">You can comment but not change ratings, save or escalate. A person with Edit access does that.</div>}

              <div className="flex gap-2 border-b border-slate-200" role="tablist" aria-label="Panel view">
                {(['feedback', 'history'] as const).map(k => (
                  <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                    className={`min-h-[44px] px-4 text-sm font-semibold border-b-[3px] ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}>{k === 'feedback' ? 'Feedback' : 'History'}</button>
                ))}
              </div>

              {tab === 'history' && (
                <div className="space-y-3">
                  <div className="text-sm text-slate-500">Overall rating per feedback cycle for {sel.project.name}.</div>
                  {history.length === 0 && <div className="text-sm text-slate-400">No recorded cycles yet.</div>}
                  {history.map((h: any, i: number) => {
                    const a = S.feedbackAvg(h.scores); const prev = i > 0 ? S.feedbackAvg(history[i - 1].scores) : 0; const d = prev ? a - prev : null;
                    return (
                      <div key={h.id} className="grid grid-cols-[72px_1fr_40px_64px] gap-3 items-center text-sm">
                        <span className="text-slate-500">{cycleLabel(h.feeDue)}</span>
                        <div className="h-2.5 rounded bg-slate-200"><div className={`h-2.5 rounded ${barColor(a)}`} style={{ width: `${a * 20}%` }} /></div>
                        <b className="text-right">{S.feedbackAvgLabel(a)}</b>
                        <span className={`text-xs font-semibold ${d === null ? 'text-slate-400' : d > 0.05 ? 'text-emerald-600' : d < -0.05 ? 'text-red-600' : 'text-slate-400'}`}>{d === null ? '' : d > 0.05 ? `+${d.toFixed(1)}` : d < -0.05 ? d.toFixed(1) : 'steady'}</span>
                      </div>
                    );
                  })}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700">{trend}</div>
                </div>
              )}

              {tab === 'feedback' && (
                <div className="space-y-5">
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Answered</span><span>{answered} of {S.FEEDBACK_Q_COUNT}</span></div>
                    <div className="h-1.5 rounded bg-slate-200"><div className="h-1.5 rounded bg-brand-600" style={{ width: `${answered * 10}%` }} /></div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div><label className="text-xs text-slate-500" htmlFor="cf-by">Feedback given by</label>
                      <input id="cf-by" className={inp} disabled={!canRate} value={rec.givenBy} placeholder={sel.project.clients?.[0]?.name || 'Client contact'} onChange={e => update(sel, { givenBy: e.target.value })} /></div>
                    <div><label className="text-xs text-slate-500" htmlFor="cf-mode">Taken through</label>
                      <select id="cf-mode" className={inp} disabled={!canRate} value={rec.mode} onChange={e => update(sel, { mode: e.target.value })}>{S.FEEDBACK_MODES.map(m => <option key={m}>{m}</option>)}</select></div>
                    <div><label className="text-xs text-slate-500" htmlFor="cf-on">Taken on</label>
                      <input id="cf-on" type="date" className={inp} disabled={!canRate} value={rec.takenOn} onChange={e => update(sel, { takenOn: e.target.value })} /></div>
                  </div>

                  {rec.status === 'Escalated' && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800"><b>Escalated to Risk Register</b> as {rec.riskId}. Ratings are locked; follow it up from the risk.</div>}
                  {rec.status === 'Recorded' && <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-sm text-indigo-900"><b>Recorded and locked</b> by {rec.recordedBy || '—'}. Ratings and comments can't be edited. Add an amendment below if something changes.</div>}

                  {S.FEEDBACK_GROUPS.map((g, gi) => {
                    const offset = S.FEEDBACK_GROUPS.slice(0, gi).reduce((n, x) => n + x.questions.length, 0);
                    return (
                      <div key={g.title}>
                        <div className="flex justify-between items-baseline border-b-2 border-slate-200 pb-1 mb-1"><h2 className="text-sm font-bold text-indigo-800">{g.title}</h2><span className="text-[11px] text-slate-400">1 Poor · 3 Fair · 5 Excellent</span></div>
                        {g.questions.map((q, k) => {
                          const qi = offset + k; const score = rec.scores[qi]; const low = score > 0 && score <= 2;
                          const text = String(rec.comments[qi] || ''); const issueId = (rec.issues || {})[qi];
                          return (
                            <div key={qi} className="py-3 border-b border-slate-100">
                              <div className="text-sm font-medium mb-2"><span className="text-slate-400 mr-2">{qi + 1}.</span>{q.text}</div>
                              <div className="flex gap-1.5" role="group" aria-label={`Rating for question ${qi + 1}`}>
                                {[1, 2, 3, 4, 5].map(v => (
                                  <button key={v} disabled={!canRate} aria-pressed={score === v} aria-label={`${v} out of 5`}
                                    onClick={() => { const s = rec.scores.slice(); s[qi] = v; update(sel, { scores: s, status: rec.status === 'Pending' ? 'Draft' : rec.status }); }}
                                    className={`flex-1 max-w-[72px] h-11 rounded-lg border text-sm font-semibold disabled:cursor-not-allowed ${ratingBtn(score === v, v)} ${!canRate && score !== v ? 'opacity-60' : ''}`}>{v}</button>
                                ))}
                              </div>
                              <label className="block text-xs text-slate-500 mt-2 mb-1" htmlFor={`cf-c-${qi}`}>{low ? 'Reason for this rating (required for 1 or 2)' : 'Client feedback on this question'}</label>
                              <textarea id={`cf-c-${qi}`} rows={2} className={ta(!canWrite, low && !text.trim())} readOnly={!canWrite} value={text} placeholder="Client's own words, examples, names or dates"
                                onChange={e => { const c = rec.comments.slice(); c[qi] = e.target.value; update(sel, { comments: c }); }} />
                              {(issueId || (caps.edit && text.trim())) && (
                                <div className="mt-2">
                                  {issueId ? <S.Badge cls="bg-orange-100 text-orange-700">Issue {issueId} created</S.Badge>
                                    : <button onClick={() => createIssue(sel, qi)} disabled={busy} className="min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 disabled:opacity-50">Create issue from this comment</button>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  <div><label className="text-sm font-semibold" htmlFor="cf-rem">Overall remarks</label>
                    <textarea id="cf-rem" rows={3} className={ta(!canWrite) + ' mt-1'} readOnly={!canWrite} value={rec.remarks} placeholder="Overall impression and anything not covered by the questions." onChange={e => update(sel, { remarks: e.target.value })} /></div>
                  <div><label className="text-sm font-semibold" htmlFor="cf-plan">Recommended action plan (summary)</label>
                    <textarea id="cf-plan" rows={3} className={ta(!canWrite) + ' mt-1'} readOnly={!canWrite} value={rec.plan} placeholder="In a few lines, how do we respond?" onChange={e => update(sel, { plan: e.target.value })} /></div>

                  {/* Action items stay open after locking: follow-up work continues after the ratings are final */}
                  <div>
                    <div className="text-sm font-semibold mb-2">Action items</div>
                    <div className="space-y-1.5">
                      {(rec.actions || []).map((a: any) => (
                        <div key={a.id} className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                          <button onClick={() => toggleAction(sel, a.id)} disabled={!caps.comment} aria-pressed={a.done} aria-label={(a.done ? 'Mark not done: ' : 'Mark done: ') + a.t}
                            className={`w-11 h-11 rounded-lg border-2 text-white font-bold disabled:opacity-60 ${a.done ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-400'}`}>{a.done ? '✓' : ''}</button>
                          <div className="flex-1 min-w-[180px]"><div className={`text-sm font-medium ${a.done ? 'line-through text-slate-400' : ''}`}>{a.t}</div><div className="text-xs text-slate-500">{a.o || 'Unassigned'}{a.d ? ` · due ${fmtDate(a.d)}` : ''}</div></div>
                        </div>
                      ))}
                      {(rec.actions || []).length === 0 && <div className="text-sm text-slate-400">No action items yet.</div>}
                    </div>
                    {caps.comment && (
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_170px_150px_auto] gap-2 mt-3 items-end">
                        <div><label className="text-xs text-slate-500" htmlFor="cf-nt">New action</label><input id="cf-nt" className={inp} value={draft.t} placeholder="What needs to be done?" onChange={e => setDraft({ ...draft, t: e.target.value })} /></div>
                        <div><label className="text-xs text-slate-500" htmlFor="cf-no">Owner</label><select id="cf-no" className={inp} value={draft.o || owners[0] || ''} onChange={e => setDraft({ ...draft, o: e.target.value })}>{owners.map(o => <option key={o}>{o}</option>)}</select></div>
                        <div><label className="text-xs text-slate-500" htmlFor="cf-nd">Due date</label><input id="cf-nd" type="date" className={inp} value={draft.d} onChange={e => setDraft({ ...draft, d: e.target.value })} /></div>
                        <button onClick={() => addAction(sel)} disabled={!draft.t.trim()} className="h-11 px-4 rounded-lg border border-brand-600 text-brand-700 font-semibold text-sm disabled:opacity-50">+ Add action</button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <button onClick={() => update(sel, { sharedBack: !rec.sharedBack, sharedAt: !rec.sharedBack ? S.TODAY_ISO : '' })} disabled={!caps.comment} aria-pressed={rec.sharedBack} aria-label="Shared back with the client"
                      className={`w-11 h-11 rounded-lg border-2 text-white font-bold disabled:opacity-60 ${rec.sharedBack ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-400'}`}>{rec.sharedBack ? '✓' : ''}</button>
                    <div className="flex-1 min-w-[200px] text-sm"><b>Shared back with the client</b><div className="text-xs text-slate-500">{rec.sharedBack ? `Told the client on ${fmtDate(rec.sharedAt)} what we will do about their feedback.` : 'Tick once you have told the client what we will do about their feedback.'}</div></div>
                  </div>

                  {locked && (
                    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                      <div className="text-sm font-semibold">Amendments</div>
                      {(rec.amendments || []).map((m: any, i: number) => <div key={i} className="text-sm border-l-[3px] border-indigo-200 pl-3"><span className="text-slate-400">{fmtDate(m.on)} · {m.by}</span> &nbsp;{m.text}</div>)}
                      {(rec.amendments || []).length === 0 && <div className="text-sm text-slate-400">No amendments yet.</div>}
                      {caps.comment && (
                        <div className="flex flex-wrap gap-2">
                          <input aria-label="New amendment" className={inp + ' flex-1 min-w-[220px]'} value={amendText} placeholder="Add a dated note, e.g. client revised rating by phone" onChange={e => setAmendText(e.target.value)} />
                          <button onClick={() => addAmendment(sel)} disabled={!amendText.trim()} className="h-11 px-4 rounded-lg border border-brand-600 text-brand-700 font-semibold text-sm disabled:opacity-50">Add amendment</button>
                        </div>
                      )}
                    </div>
                  )}

                  {confirming && caps.edit && !locked && (
                    <div className="border border-red-300 bg-red-50/50 rounded-xl p-4 space-y-3">
                      <div className="font-semibold text-red-800">Escalate to Risk Register?</div>
                      <div className="bg-white border border-red-100 rounded-lg p-3 text-sm space-y-1">
                        <div className="font-semibold">Client dissatisfaction: {sel.project.name} (feedback {S.feedbackAvgLabel(avg)}/5)</div>
                        <div className="text-slate-500">Probability / Impact: {avg < 2.5 ? 'High' : 'Medium'} / High · Support by: {sel.project.strategicLead || 'project Strategic Lead'}</div>
                        <div className="text-slate-500">Mitigation: {rec.plan || '—'}</div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => escalate(sel, false)} disabled={busy} className="h-11 px-4 rounded-lg bg-red-700 text-white font-semibold text-sm disabled:opacity-50">Confirm escalation</button>
                        <button onClick={() => setConfirming(false)} className="h-11 px-4 rounded-lg border border-slate-300 bg-white font-semibold text-sm">Cancel</button>
                      </div>
                    </div>
                  )}

                  {caps.edit && !locked && (
                    <div className="border-t border-slate-200 pt-4 space-y-3">
                      <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">Auto-escalation rule: an average below 2.5, or any single rating of 1, is escalated to the Risk Register when the feedback is saved.</div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-slate-600 flex-1 min-w-[200px]">{answered < S.FEEDBACK_Q_COUNT ? `Answer all ${S.FEEDBACK_Q_COUNT} questions to save or escalate.` : missing > 0 ? `${missing} low rating${missing === 1 ? '' : 's'} still need a reason.` : autoRule ? 'This feedback meets the auto-escalation rule and will be escalated when saved.' : 'Saving locks the ratings. Escalate only if it needs management attention.'}</div>
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => setConfirming(true)} disabled={cantSave || busy} className="h-11 px-4 rounded-lg border border-red-700 text-red-700 bg-white font-semibold text-sm disabled:opacity-50">Escalate</button>
                          <button onClick={() => save(sel)} disabled={cantSave || busy} className="h-11 px-5 rounded-lg bg-brand-600 text-white font-semibold text-sm disabled:opacity-50">Save and lock</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </S.Card>
          )}
        </div>
      )}

      {toast && <div role="status" className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white rounded-lg px-4 py-3 text-sm shadow-lg max-w-sm">{toast}</div>}
    </div>
  );
}
