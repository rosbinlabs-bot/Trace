import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as S from '../shared';
import * as db from '../db';
import { supabase } from '../supabaseClient';

// ============================================================================================
// Communication — one Slack-like channel per project (side nav "Ping"), auto-populated
// with that project's team (no separate membership list to keep in sync -- same S.buildRoster the
// rest of the app already uses for Phase Management assignees etc.). A message can carry free text,
// file attachments, and/or a recorded voice note; replying opens a thread under that message rather
// than cluttering the main feed; tagging someone with @Name raises a real notification for them
// (posting itself does not, to avoid flooding the bell on routine chatter). Typing #SubTaskName links
// a specific sub task into the message -- the way to say "here's the change needed" and point right
// at the item, clickable straight through to it in Phase Management. Messages are permanent -- no
// edit/delete, same as Remarks and the Activity Log elsewhere in this app.
// ============================================================================================

const initials = (name: string) => (name || '').trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase() || '?';
const fmtTime = (iso: string) => { try { return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } };
const fmtClock = (totalSec: number) => { const s = Math.max(0, Math.round(totalSec || 0)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
const fmtSize = (bytes: number) => (bytes ? `${(bytes / 1024).toFixed(0)} KB` : '');

// Renders a message body with its @mentions and #subtask references highlighted. Only names/tasks
// the composer's own @ and # pickers actually recorded (message.mentions[] / message.taskRefs[]) are
// ever highlighted -- never a regex guess over free text -- so a word that happens to match for some
// other reason is never mistaken for a tag. A #reference is clickable straight through to that sub
// task in Phase Management (onOpenTask); a @mention is plain highlight, no click target.
function MessageBody({ text, mentions, taskRefs, onOpenTask }: { text: string; mentions?: string[]; taskRefs?: any[]; onOpenTask?: (ref: any) => void }) {
  if (!text) return null;
  const mentionList = (mentions || []).filter(Boolean);
  const taskList = (taskRefs || []).filter((t: any) => t && t.name);
  if (!mentionList.length && !taskList.length) return <>{text}</>;
  const esc = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  type Tok = { key: string; kind: 'mention' | 'task'; ref?: any };
  const tokens: Tok[] = [
    ...mentionList.map((n) => ({ key: `@${n}`, kind: 'mention' as const })),
    ...taskList.map((t) => ({ key: `#${t.name}`, kind: 'task' as const, ref: t })),
  ];
  // Longest token first so e.g. "#Design Review" isn't cut short by a shorter "#Design" also present.
  const ordered = [...tokens].sort((a, b) => b.key.length - a.key.length);
  const re = new RegExp(`(${ordered.map((t) => esc(t.key)).join('|')})`, 'g');
  const byKey = new Map(tokens.map((t) => [t.key, t]));
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) => {
        const tok = byKey.get(p);
        if (!tok) return <React.Fragment key={i}>{p}</React.Fragment>;
        if (tok.kind === 'mention') return <span key={i} className="text-brand-700 bg-brand-50 rounded px-1 font-medium">{p}</span>;
        return (
          <button key={i} type="button" onClick={() => onOpenTask?.(tok.ref)}
            className="text-violet-700 bg-violet-50 hover:bg-violet-100 rounded px-1 font-medium underline decoration-dotted">
            {p}
          </button>
        );
      })}
    </>
  );
}

// A voice note's signed URL isn't fetched until someone actually presses play (Supabase signed URLs
// are short-lived and a message can sit rendered in the feed a long time before anyone clicks it) --
// same lazy-fetch-on-click pattern Phase Management's downloadDoc already uses for file attachments.
function ChatAudioPlayer({ a }: { a: any }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);
  const load = async () => {
    if (url || loading) return;
    setLoading(true); setErr('');
    try { setUrl(await db.getChatFileDownloadUrl(a.path)); }
    catch (e: any) { setErr(e.message || 'Could not load this voice note.'); }
    setLoading(false);
  };
  // Try to start playback the moment the URL is ready, but don't depend on it -- some browsers
  // (Safari especially) refuse autoplay once the tap-to-load fetch has put even a short async gap
  // between the click and playback starting. Native `controls` stay visible either way, so a blocked
  // attempt just means pressing the player's own play button instead of it starting by itself.
  useEffect(() => { if (url) audioRef.current?.play().catch(() => {}); }, [url]);
  return (
    <div className="flex items-center gap-2 bg-violet-50 rounded-lg px-2.5 py-2 max-w-xs">
      <S.Icon name={loading ? 'refresh' : 'mic'} className={`w-3.5 h-3.5 shrink-0 ${loading ? 'text-brand-500' : 'text-violet-500'}`} />
      {url
        ? <audio ref={audioRef} controls src={url} onError={() => setErr('This voice note could not be played back in this browser.')} className="h-8 flex-1 min-w-0" />
        : <button onClick={load} className="text-xs text-violet-700 hover:text-violet-800 flex-1 text-left truncate">
            {loading ? 'Loading…' : `Voice note${a.duration ? ` · ${fmtClock(a.duration)}` : ''} — tap to play`}
          </button>}
      {err && <span className="text-[10px] text-red-500 shrink-0">{err}</span>}
    </div>
  );
}

function AttachmentView({ a, onDownload, downloading }: any) {
  if (a.kind === 'audio') return <ChatAudioPlayer a={a} />;
  return (
    <button onClick={() => onDownload(a)} title="Download" className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 rounded-lg px-2.5 py-1.5 text-xs text-left max-w-xs">
      <S.Icon name={downloading ? 'refresh' : S.docIcon(a.n)} className={`w-3.5 h-3.5 shrink-0 ${downloading ? 'text-brand-500' : S.docIconTone(a.n)}`} />
      <span className="truncate flex-1">{a.n}</span>
      {a.size ? <span className="text-[10px] text-slate-400 whitespace-nowrap">{fmtSize(a.size)}</span> : null}
    </button>
  );
}

// Text box + attach/record/mention controls, shared by the main channel composer and the thread
// reply composer. Deliberately a top-level component (not defined inline inside Communication()) --
// an incoming realtime message re-renders Communication on every keystroke someone else makes
// elsewhere in the channel, and a component redefined inline on every render would remount (losing
// whatever the person was mid-typing) every single time that happens. Communication() forces an
// intentional remount instead by keying each usage on the active project/thread (see the two
// <Composer key=.../> render sites below) -- that's what clears a draft/tags left over from a
// channel or thread you've since switched away from, without touching this component on every
// unrelated re-render.
function Composer({ roster, subtasks, onSend, placeholder, disabled, focusKey }: {
  roster: { name: string; label: string }[];
  subtasks: { id: string; name: string; phaseId: string; msId: string; phaseName?: string; msName?: string }[];
  onSend: (payload: { text: string; files: File[]; audio: { blob: Blob; duration: number } | null; mentions: string[]; taskRefs: any[] }) => Promise<void> | void;
  placeholder?: string;
  disabled?: boolean;
  focusKey?: any;
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [mentions, setMentions] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [taskRefs, setTaskRefs] = useState<any[]>([]);
  const [taskQuery, setTaskQuery] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [pendingAudio, setPendingAudio] = useState<{ blob: Blob; duration: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const recordSecondsRef = useRef(0);

  useEffect(() => { if (focusKey !== undefined) taRef.current?.focus(); }, [focusKey]);
  useEffect(() => () => { clearInterval(timerRef.current); streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  const onTextChange = (v: string) => {
    setText(v);
    const pos = taRef.current?.selectionStart ?? v.length;
    const head = v.slice(0, pos);
    const m = head.match(/(?:^|\s)@([a-zA-Z0-9 ]{0,24})$/);
    setMentionQuery(m ? m[1] : null);
    const t = head.match(/(?:^|\s)#([a-zA-Z0-9 ]{0,40})$/);
    setTaskQuery(t ? t[1] : null);
  };
  const pickMention = (name: string) => {
    const pos = taRef.current?.selectionStart ?? text.length;
    const upTo = text.slice(0, pos), rest = text.slice(pos);
    const replaced = upTo.replace(/(?:^|\s)@([a-zA-Z0-9 ]{0,24})$/, (full) => (full[0] === ' ' ? ' ' : '') + `@${name} `);
    setText(replaced + rest);
    setMentions((ms) => (ms.includes(name) ? ms : [...ms, name]));
    setMentionQuery(null);
    setTimeout(() => taRef.current?.focus(), 0);
  };
  // # opens a picker over the current channel's sub tasks (S.projectSubtasks, passed down from
  // Communication()) -- selecting one inserts "#Sub Task Name" and records the {id,phaseId,msId}
  // needed later to jump straight to it (MessageBody's onOpenTask), the same deep-link shape
  // Phase Management's own pending-approval jumps already use.
  const pickTask = (t: { id: string; name: string; phaseId: string; msId: string }) => {
    const pos = taRef.current?.selectionStart ?? text.length;
    const upTo = text.slice(0, pos), rest = text.slice(pos);
    const replaced = upTo.replace(/(?:^|\s)#([a-zA-Z0-9 ]{0,40})$/, (full) => (full[0] === ' ' ? ' ' : '') + `#${t.name} `);
    setText(replaced + rest);
    setTaskRefs((ts) => (ts.some((x) => x.id === t.id) ? ts : [...ts, t]));
    setTaskQuery(null);
    setTimeout(() => taRef.current?.focus(), 0);
  };
  const mentionOptions = mentionQuery === null ? [] : roster.filter((r) => r.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6);
  // No cap here (unlike mentionOptions' 6) -- a bare "#" is meant to browse the whole project's sub
  // task list, and a project can easily have more than 6; the dropdown already scrolls (max-h-48
  // overflow-auto below) so a long list is still usable rather than silently truncated.
  const taskOptions = taskQuery === null ? [] : subtasks.filter((t) => t.name.toLowerCase().includes(taskQuery.toLowerCase()));
  // Lets someone un-tag a person or un-reference a sub task after picking it, without having to hunt
  // through the raw text for "@Name"/"#Task Name" and delete it by hand -- strips that one occurrence
  // out of the text alongside dropping it from the tracked list.
  const escRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const removeMention = (name: string) => {
    setMentions((ms) => ms.filter((m) => m !== name));
    setText((tx) => tx.replace(new RegExp(`@${escRe(name)}\\s?`), ''));
  };
  const removeTaskRef = (id: string) => {
    const t = taskRefs.find((x) => x.id === id);
    setTaskRefs((ts) => ts.filter((x) => x.id !== id));
    if (t) setText((tx) => tx.replace(new RegExp(`#${escRe(t.name)}\\s?`), ''));
  };

  const addFiles = (list: FileList | null) => { if (list) setFiles((fs) => [...fs, ...Array.from(list)]); };
  const removeFile = (i: number) => setFiles((fs) => fs.filter((_, j) => j !== i));

  const startRecording = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Don't pass a mimeType -- let each browser record in whatever it natively supports (Chrome:
      // audio/webm;opus, Safari: audio/mp4;aac) rather than forcing one that browser can't actually
      // encode. mr.mimeType afterwards reports whichever format was actually used.
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        // recordSecondsRef, not the recordSeconds state var -- this handler is created once, when
        // recording starts, so a captured state value would always read back as whatever it was at
        // that instant (0), not the count once stopped.
        setPendingAudio({ blob: new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' }), duration: recordSecondsRef.current });
        stream.getTracks().forEach((t) => t.stop());
      };
      recorderRef.current = mr;
      mr.start();
      recordSecondsRef.current = 0;
      setRecordSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => { recordSecondsRef.current += 1; setRecordSeconds(recordSecondsRef.current); }, 1000);
    } catch (e: any) {
      setErr('Microphone access was denied or is unavailable in this browser.');
    }
  };
  const stopRecording = () => { recorderRef.current?.stop(); clearInterval(timerRef.current); setRecording(false); };

  const canSubmit = !disabled && !sending && !recording && !!(text.trim() || files.length || pendingAudio);
  const submit = async () => {
    if (!canSubmit) return;
    setSending(true); setErr('');
    try {
      await onSend({ text: text.trim(), files, audio: pendingAudio, mentions, taskRefs });
      setText(''); setFiles([]); setPendingAudio(null); setMentions([]); setMentionQuery(null); setTaskRefs([]); setTaskQuery(null);
    } catch (e: any) {
      setErr(e.message || 'Could not send that — try again.');
    } finally {
      setSending(false);
    }
  };

  if (disabled) return <div className="text-xs text-slate-400 italic px-1 py-2">You have view-only access to this channel.</div>;

  return (
    <div className="border border-slate-200 rounded-xl p-2.5 bg-white">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 bg-slate-50 rounded-lg px-2 py-1 text-[11px] text-slate-600">
              <S.Icon name={S.docIcon(f.name)} className={`w-3 h-3 ${S.docIconTone(f.name)}`} />
              <span className="max-w-[140px] truncate">{f.name}</span>
              <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500">✕</button>
            </span>
          ))}
        </div>
      )}
      {pendingAudio && (
        <div className="flex items-center gap-2 mb-2 bg-violet-50 rounded-lg px-2.5 py-1.5 text-xs text-violet-700">
          <S.Icon name="mic" className="w-3.5 h-3.5" />
          <span>Voice note ready — {fmtClock(pendingAudio.duration)}</span>
          <button onClick={() => setPendingAudio(null)} className="ml-auto text-violet-400 hover:text-red-500">✕</button>
        </div>
      )}
      <div className="relative">
        <textarea ref={taRef} rows={2} value={text} onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={placeholder || 'Post an update… (@ to tag someone, # to reference a sub task)'}
          className="w-full border-0 focus:outline-none focus:ring-0 text-sm resize-none placeholder:text-slate-400" />
        {mentionOptions.length > 0 && (
          <div className="absolute bottom-full mb-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-56 max-h-48 overflow-auto z-10">
            {mentionOptions.map((r) => (
              <button key={r.name} onClick={() => pickMention(r.name)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center justify-between gap-2">
                <span className="font-medium text-slate-700 truncate">{r.name}</span>
                <span className="text-slate-400 shrink-0">{r.label}</span>
              </button>
            ))}
          </div>
        )}
        {taskQuery !== null && (
          <div className="absolute bottom-full mb-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-72 max-h-48 overflow-auto z-10">
            {taskOptions.length === 0 && <div className="px-3 py-1.5 text-xs text-slate-400">No matching sub tasks</div>}
            {taskOptions.map((t) => (
              <button key={t.id} onClick={() => pickTask(t)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50">
                <span className="font-medium text-slate-700 truncate block">{t.name}</span>
                <span className="text-slate-400 truncate block">{t.phaseName}{t.msName ? ` › ${t.msName}` : ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {(mentions.length > 0 || taskRefs.length > 0) && (
        <div className="flex flex-wrap gap-1 mb-1">
          {mentions.map((m) => (
            <span key={`@${m}`} className="inline-flex items-center gap-1 text-[10px] bg-brand-50 text-brand-700 rounded-full pl-2 pr-1 py-0.5">
              @{m}
              <button type="button" onClick={() => removeMention(m)} className="text-brand-400 hover:text-red-500 leading-none">✕</button>
            </span>
          ))}
          {taskRefs.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 text-[10px] bg-violet-50 text-violet-700 rounded-full pl-2 pr-1 py-0.5">
              #{t.name}
              <button type="button" onClick={() => removeTaskRef(t.id)} className="text-violet-400 hover:text-red-500 leading-none">✕</button>
            </span>
          ))}
        </div>
      )}
      {err && <div className="text-[11px] text-red-500 mb-1">{err}</div>}
      <div className="flex items-center gap-3 mt-1">
        <label className="cursor-pointer text-slate-400 hover:text-brand-600" title="Attach a file">
          <S.Icon name="attachment" className="w-4 h-4" />
          <input type="file" multiple accept={S.DOC_ACCEPT} className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </label>
        {!recording ? (
          <button onClick={startRecording} title="Record a voice note" className="text-slate-400 hover:text-violet-600"><S.Icon name="mic" className="w-4 h-4" /></button>
        ) : (
          <button onClick={stopRecording} className="inline-flex items-center gap-1.5 text-red-600 text-xs font-medium">
            <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-red-400 opacity-75 animate-ping"></span><span className="relative w-2 h-2 rounded-full bg-red-500"></span></span>
            Recording {fmtClock(recordSeconds)} — click to stop
          </button>
        )}
        <button onClick={submit} disabled={!canSubmit} className={`ml-auto inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 ${canSubmit ? 'bg-brand-500 hover:bg-brand-600 text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
          <S.Icon name="send" className="w-3.5 h-3.5" /> {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

// One message row, reused for both the main feed (with a Reply/thread-count affordance) and the
// thread panel (parent + its replies, no further nesting -- Slack-style threads are one level deep).
function MessageRow({ m, onDownload, downloadingId, replyCount, onOpenThread, onOpenTask, compact }: any) {
  return (
    <div className="flex gap-2.5">
      <div className={`${compact ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-[11px]'} rounded-full bg-brand-100 text-brand-700 font-semibold flex items-center justify-center shrink-0`}>{initials(m.authorName)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`font-medium text-slate-800 ${compact ? 'text-xs' : 'text-sm'}`}>{m.authorName}</span>
          <span className="text-[10px] text-slate-400">{fmtTime(m.createdAt)}</span>
        </div>
        {m.body && <div className={`text-slate-700 whitespace-pre-wrap break-words mt-0.5 ${compact ? 'text-xs' : 'text-sm'}`}><MessageBody text={m.body} mentions={m.mentions} taskRefs={m.taskRefs} onOpenTask={onOpenTask} /></div>}
        {(m.attachments || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {m.attachments.map((a: any) => <AttachmentView key={a.id} a={a} onDownload={onDownload} downloading={downloadingId === (a.id || a.path)} />)}
          </div>
        )}
        {onOpenThread && (
          <button onClick={() => onOpenThread(m.id)} className="text-[11px] text-slate-400 hover:text-brand-600 mt-1">
            {replyCount > 0 ? `${replyCount} repl${replyCount === 1 ? 'y' : 'ies'}` : 'Reply'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Communication() {
  const navigate = useNavigate();
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { role } = React.useContext(S.RoleContext);
  const { admin } = React.useContext(S.AdminDataContext);
  const { email: myEmail, profile: myProfile } = React.useContext(S.CurrentUserContext);
  const { addNotification, tree } = React.useContext(S.PhaseDataContext);
  const { messages, postMessage, markRead, readMap } = React.useContext(S.CommDataContext);
  const { logActivity } = React.useContext(S.ActivityLogContext);

  const [activeProj, setActiveProj] = useState(projects[0]?.id);
  // If the account's visible-project list changes (e.g. removed from a project's team) and the
  // currently selected channel disappears from it, fall back to the first one still available.
  React.useEffect(() => {
    if (!projects.some((p: any) => p.id === activeProj)) setActiveProj(projects[0]?.id);
  }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps

  const projMeta = projects.find((p: any) => p.id === activeProj) || {};
  const roster = S.buildRoster(projMeta, admin);
  // Same per-project team-membership gate Phase Management uses: a full team member can post, a
  // Guest Teammate (or anyone viewing a project they're not tagged to at all) gets read-only.
  // Admin/Super Admin are exempt everywhere else in this app and stay exempt here too.
  const readOnly = role !== 'admin' && !S.isOnProjectTeam(projMeta, myProfile?.name);
  const canPost = !readOnly && S.capAtLeast(S.capabilityFor('Communication', myEmail, admin), 'Edit');

  const notifyProject = (payload: any) => addNotification({ projectId: activeProj, project: projMeta.name, tags: roster.map((r: any) => r.name), priority: 'high', ...payload });

  const [onlineNames, setOnlineNames] = useState<Set<string>>(new Set());
  React.useEffect(() => {
    const tenantId = db.getTenantId();
    const myName = myProfile?.name;
    if (!activeProj || !tenantId || !myName) { setOnlineNames(new Set()); return; }
    const channel = supabase.channel(`ping-presence:${tenantId}:${activeProj}`, { config: { presence: { key: myName } } });
    channel.on('presence', { event: 'sync' }, () => setOnlineNames(new Set(Object.keys(channel.presenceState()))));
    channel.subscribe((status: string) => { if (status === 'SUBSCRIBED') channel.track({ name: myName, at: Date.now() }); });
    return () => { supabase.removeChannel(channel); };
  }, [activeProj, myProfile?.name]);

  // Flat sub task list for the # picker (S.projectSubtasks), and the click-through from a rendered
  // #reference -- same {projectId,phaseId,msId,stId} deep-link shape Phase Management's own
  // pending-approval jumps already use (see App.tsx's PendingApprovalsFlash).
  const subtasks = useMemo(() => S.projectSubtasks(tree, activeProj), [tree, activeProj]);
  const openTaskRef = (ref: any) => navigate('/phases', { state: { projectId: activeProj, phaseId: ref.phaseId, msId: ref.msId, stId: ref.id } });

  const channelMessages = useMemo(() => (messages || []).filter((m: any) => m.projectId === activeProj), [messages, activeProj]);
  // Viewing a channel marks it read (see S.pingUnreadCount/CommDataContext) -- both on first opening
  // it and again whenever its message count changes while it stays open, so a message that arrives
  // while you're already looking at the channel doesn't reappear as unread on the sidebar the moment
  // you leave it.
  React.useEffect(() => { if (activeProj) markRead(activeProj); }, [activeProj, channelMessages.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const topLevel = useMemo(() => channelMessages.filter((m: any) => !m.parentId).sort((a: any, b: any) => (a.createdAt < b.createdAt ? -1 : 1)), [channelMessages]);
  const repliesOf = (id: string) => channelMessages.filter((m: any) => m.parentId === id).sort((a: any, b: any) => (a.createdAt < b.createdAt ? -1 : 1));

  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const threadParent = openThreadId ? channelMessages.find((m: any) => m.id === openThreadId) : null;
  React.useEffect(() => { setOpenThreadId(null); }, [activeProj]);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const downloadAttachment = async (a: any) => {
    setDownloadingId(a.id || a.path);
    try { window.open(await db.getChatFileDownloadUrl(a.path), '_blank'); }
    catch (e: any) { console.error('Could not generate a download link:', e); }
    setDownloadingId(null);
  };

  const send = async (payload: { text: string; files: File[]; audio: { blob: Blob; duration: number } | null; mentions: string[]; taskRefs: any[] }, parentId: string | null) => {
    const attachments: any[] = [];
    for (const f of payload.files) {
      const u = await db.uploadChatFile(S.uid('CHF'), f);
      attachments.push({ id: u.id, n: u.name, path: u.path, size: u.size, kind: 'file' });
    }
    if (payload.audio) {
      const audioMime = payload.audio.blob.type || 'audio/webm';
      const audioExt = audioMime.includes('mp4') ? 'm4a' : audioMime.includes('ogg') ? 'ogg' : audioMime.includes('wav') ? 'wav' : 'webm';
      const f = new File([payload.audio.blob], `voice-note-${Date.now()}.${audioExt}`, { type: audioMime });
      const u = await db.uploadChatFile(S.uid('CHF'), f);
      attachments.push({ id: u.id, n: u.name, path: u.path, size: u.size, kind: 'audio', duration: payload.audio.duration });
    }
    postMessage({
      projectId: activeProj, project: projMeta.name, parentId: parentId || null,
      authorEmail: myEmail, authorName: myProfile?.name || myEmail,
      body: payload.text, attachments, mentions: payload.mentions, taskRefs: payload.taskRefs,
    });
    logActivity({ module: 'Communication', action: parentId ? `Replied in "${projMeta.name}" channel` : `Posted in "${projMeta.name}" channel`, project: projMeta.name });
    // Posting a routine update doesn't page anyone -- only an explicit @tag does, same reasoning as
    // the recent remark-alert feature: a busy channel shouldn't flood the whole team's notification
    // bell for every line of chat, only for a direct instruction aimed at someone specific.
    if (payload.mentions && payload.mentions.length) {
      notifyProject({
        level: 'message', itemName: projMeta.name, type: 'Mentioned', priority: 'high',
        message: `${myProfile?.name || myEmail} tagged ${payload.mentions.join(', ')} in "${projMeta.name}" Communication${parentId ? ' (thread reply)' : ''}${payload.text ? `: "${payload.text.slice(0, 140)}"` : ''}`,
      });
    }
  };

  if (projects.length === 0) {
    return (
      <div>
        <S.SectionTitle sub="One running channel per project for updates, direction, and file/audio sharing across the whole team">Ping</S.SectionTitle>
        <S.Card className="p-8 text-center text-sm text-slate-400">You're not tagged to any project yet — nothing to show here.</S.Card>
      </div>
    );
  }

  return (
    <div>
      <S.SectionTitle sub="One channel per project, auto-populated with that project's team — updates, direction, files, and voice notes in one running feed">Ping</S.SectionTitle>
      <div className="flex gap-3 overflow-x-auto pb-1" style={{ alignItems: 'flex-start' }}>
        {/* Channel rail — one entry per project, same name, mirrors Phase Management's project list */}
        <S.Card className="p-2.5 w-60 shrink-0 space-y-1">
          {projects.map((p: any) => {
            const unread = S.pingUnreadCount(messages, myEmail, readMap, p.id);
            return (
              <button key={p.id} onClick={() => setActiveProj(p.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border ${activeProj === p.id ? 'border-brand-300 bg-brand-50' : 'border-transparent hover:bg-slate-50'}`}>
                <div className={`flex items-center gap-1.5 text-sm truncate ${activeProj === p.id ? 'font-medium text-brand-700' : 'text-slate-700'}`}>
                  <S.Icon name="communication" className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span className="truncate flex-1">{p.name}</span>
                  {unread > 0 && <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-semibold flex items-center justify-center">{unread > 99 ? '99+' : unread}</span>}
                </div>
              </button>
            );
          })}
        </S.Card>

        {/* Channel feed */}
        <S.Card className="p-4 flex-1 min-w-[320px]">
          <div className="mb-3 pb-3 border-b border-slate-100">
            <div className="text-sm font-semibold text-slate-800">{projMeta.name}</div>
            <div className="text-[11px] text-slate-400 mb-2">{roster.length} team member{roster.length === 1 ? '' : 's'} · visible to everyone tagged to this project</div>
            <div className="flex flex-wrap gap-1.5">
              {roster.map((r: any) => (
                <span key={r.name} title={onlineNames.has(r.name) ? `${r.name} — online now` : r.name}
                  className="inline-flex items-center gap-1.5 text-[10px] bg-slate-50 text-slate-600 rounded-full pl-1.5 pr-2 py-1">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${onlineNames.has(r.name) ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  {r.name}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-4 mb-4 max-h-[55vh] overflow-auto pr-1">
            {topLevel.length === 0 && <div className="text-sm text-slate-300 text-center py-10">No updates yet — be the first to post.</div>}
            {topLevel.map((m: any) => (
              <MessageRow key={m.id} m={m} onDownload={downloadAttachment} downloadingId={downloadingId}
                replyCount={repliesOf(m.id).length} onOpenThread={setOpenThreadId} onOpenTask={openTaskRef} />
            ))}
          </div>

          <Composer key={`composer-${activeProj}`} roster={roster} subtasks={subtasks} disabled={!canPost} onSend={(p) => send(p, null)} placeholder={`Post an update in ${projMeta.name}…`} />
        </S.Card>

        {/* Thread panel — opens alongside the feed when a message's Reply is clicked */}
        {threadParent && (
          <S.Card className="p-4 w-80 shrink-0">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Thread</span>
              <button onClick={() => setOpenThreadId(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="space-y-3 mb-3 max-h-[45vh] overflow-auto pr-1">
              <div className="pb-3 border-b border-slate-100">
                <MessageRow m={threadParent} onDownload={downloadAttachment} downloadingId={downloadingId} onOpenTask={openTaskRef} />
              </div>
              {repliesOf(threadParent.id).map((m: any) => (
                <MessageRow key={m.id} m={m} onDownload={downloadAttachment} downloadingId={downloadingId} onOpenTask={openTaskRef} compact />
              ))}
            </div>
            <Composer key={`thread-composer-${activeProj}-${openThreadId}`} roster={roster} subtasks={subtasks} disabled={!canPost} onSend={(p) => send(p, threadParent.id)} placeholder="Reply in thread…" focusKey={openThreadId} />
          </S.Card>
        )}
      </div>
    </div>
  );
}
