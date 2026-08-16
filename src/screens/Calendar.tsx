import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import * as S from '../shared';

export default function Calendar(){
  const location = useLocation();
  const { tree, addNotification } = React.useContext(S.PhaseDataContext);
  const { events: calEvents, setEvents: setCalEvents } = React.useContext(S.CalendarDataContext);
  const { projects } = React.useContext(S.ProjectsDataContext);
  const { team } = React.useContext(S.TeamDataContext);
  const { profile: myProfile } = React.useContext(S.CurrentUserContext);
  const { role } = React.useContext(S.RoleContext);
  // Risks and Issues carry their own target/due dates and are just as much "items applicable to this
  // user" as a milestone deadline -- pulled in here alongside phase/milestone/sub task deadlines so
  // the calendar is a complete picture of everything on this person's plate, not just Phase Management
  // deadlines.
  const { risks, issues } = React.useContext(S.GovernanceDataContext);
  // This is a personal schedule, not a portfolio view -- even for Admin/Super Admin (who otherwise see
  // every project everywhere else in the app), the Calendar only shows projects the signed-in person
  // is actually tagged to (Project Master -> Project Team or Guest Teammates). A project they're not
  // on isn't part of "their" schedule, so it's left out here entirely.
  const myTaggedProjects = projects.filter((p:any) => (p.team||[]).some((t:any)=>t.name===myProfile?.name) || (p.guests||[]).includes(myProfile?.name));
  const myTaggedProjectNames = new Set(myTaggedProjects.map((p:any)=>p.name));
  const [projFilter, setProjFilter] = useState('All');
  // Every one of MY tagged projects' names, each assigned a distinct, non-repeating color by stable
  // sorted position in the palette (was a hash of the name, which could put two different projects on
  // the same color) -- as long as there are no more tagged projects than palette colors, every color
  // here is unique.
  const distinctProjectNames: string[] = Array.from(new Set(myTaggedProjects.map((p:any)=>p.name).filter(Boolean))).sort() as string[];
  const projectColor: Record<string, any> = {};
  distinctProjectNames.forEach((name, i) => { projectColor[name] = S.CLIENT_COLOR_PALETTE[i % S.CLIENT_COLOR_PALETTE.length]; });
  const colorForProject = (name: string) => projectColor[name] || { text:'text-slate-500', dot:'bg-slate-400', chip:'bg-slate-100 text-slate-600' };
  // Plain year/month integers — never round-tripped through toISOString(), which converts to UTC
  // and can silently roll the date back a day (and a whole month, at the 1st) in +offset timezones.
  const [year, setYear] = useState(Number(S.TODAY_ISO.slice(0,4)));
  const [month, setMonth] = useState(Number(S.TODAY_ISO.slice(5,7))-1); // 0-indexed
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null); // draft object while the Add/Edit modal is open

  // Deep link from a notification click (shared.tsx's notificationTarget) — jumps to the right month
  // and opens that event's edit modal directly; falls back to just landing on the date if the event
  // itself was since removed (e.g. a "Cancelled" notification for an event that's been deleted).
  React.useEffect(() => {
    const deep: any = location.state;
    if (!deep) return;
    const ev = deep.openId ? calEvents.find((e:any) => e.id === deep.openId) : null;
    const date = ev ? ev.date : deep.date;
    if (!date) return;
    setYear(Number(date.slice(0,4)));
    setMonth(Number(date.slice(5,7))-1);
    setSelectedDate(date);
    if (ev) setEditingEvent({...ev});
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthLabel = new Date(year, month, 1).toLocaleString('en-US',{month:'long',year:'numeric'});
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const startWeekday = (new Date(year, month, 1).getDay()+6)%7; // Monday-first
  const shiftMonth = (delta) => {
    let m = month+delta, y = year;
    while(m<0){ m+=12; y-=1; }
    while(m>11){ m-=12; y+=1; }
    setMonth(m); setYear(y);
  };

  const projFilterName = projFilter==='All' ? null : (myTaggedProjects.find((p:any)=>p.id===projFilter)||{}).name;

  // Read-only deadline/activity markers, pulled live from Phase Management, plus Risks and Issues
  // (target/due dates) so "activities, tasks etc" applicable to this user show up here too, not just
  // phase/milestone/sub task deadlines. Colored per-project below (project name is already carried
  // on every entry). Scoped to myTaggedProjects only -- see above.
  const deadlineMap: any = {};
  const addDeadline = (dateStr, label, project, kind) => { if(dateStr) (deadlineMap[dateStr] = deadlineMap[dateStr]||[]).push({label, project, kind}); };
  myTaggedProjects.forEach((p:any)=>{
    if(projFilter!=='All' && p.id!==projFilter) return;
    (tree[p.id]||[]).forEach(ph=>{
      addDeadline(ph.end, ph.name, p.name, 'phase');
      ph.milestones.forEach(ms=>{
        addDeadline(ms.deadline, ms.name, p.name, 'milestone');
        (ms.subtasks||[]).forEach(s=> addDeadline(s.deadline, s.name, p.name, 'subtask'));
      });
    });
  });
  (risks||[]).forEach(r=>{
    if(!myTaggedProjectNames.has(r.project)) return;
    if(projFilter!=='All' && r.project!==projFilterName) return;
    addDeadline(r.target, `Risk: ${r.desc||r.id}`, r.project, 'risk');
  });
  (issues||[]).forEach(i=>{
    if(!myTaggedProjectNames.has(i.project)) return;
    if(projFilter!=='All' && i.project!==projFilterName) return;
    // Same restriction Issues.tsx enforces -- only whoever raised/is assigned/is tagged (plus
    // Admin/L1) sees an issue's content, so being on the project team alone isn't enough here either.
    const proj = myTaggedProjects.find((p:any)=>p.name===i.project);
    if(!S.issueVisibleTo(i, proj, role, myProfile?.name)) return;
    addDeadline(i.due, `Issue: ${i.desc||i.id}`, i.project, 'issue');
  });

  // User-created calendar events, filtered by the project dropdown (events with no project always
  // show; events tied to a project the signed-in person isn't tagged to are left out entirely, same
  // reasoning as the deadlines above).
  const eventsByDate: any = {};
  calEvents
    .filter(ev => !ev.project || myTaggedProjectNames.has(ev.project))
    .filter(ev => !projFilterName || !ev.project || ev.project===projFilterName)
    .forEach(ev => { (eventsByDate[ev.date] = eventsByDate[ev.date]||[]).push(ev); });

  const totalCells = Math.ceil((startWeekday+daysInMonth)/7)*7;

  const openAdd = (dateStr) => { setSelectedDate(dateStr); setEditingEvent({ id:null, date:dateStr||S.TODAY_ISO, type:'Meeting', title:'', project:projFilterName||'', tags:[], status:'Pending' }); };
  const openEdit = (ev) => setEditingEvent({...ev});
  const closeModal = () => setEditingEvent(null);
  const addTag = (name) => setEditingEvent(ev => ({...ev, tags:[...(ev.tags||[]), name]}));
  const removeTag = (name) => setEditingEvent(ev => ({...ev, tags:(ev.tags||[]).filter(x=>x!==name)}));

  const saveEvent = () => {
    if(!editingEvent || !editingEvent.title.trim()) return;
    const isNew = !editingEvent.id;
    const prev = isNew ? null : calEvents.find(e=>e.id===editingEvent.id);
    const finalEv = isNew ? {...editingEvent, id:S.uid('EVT')} : editingEvent;
    setCalEvents(evs => isNew ? [...evs, finalEv] : evs.map(e=>e.id===finalEv.id?finalEv:e));
    if((finalEv.tags||[]).length>0){
      if(isNew){
        addNotification({ project:finalEv.project||'General', tags:finalEv.tags, priority:'normal', type:'Calendar Reminder',
          eventId:finalEv.id, date:finalEv.date,
          message:`${finalEv.type} "${finalEv.title}" scheduled on ${finalEv.date}. You've been tagged — reminder set.` });
      } else if(prev && prev.status!=='Cancelled' && finalEv.status==='Cancelled'){
        addNotification({ project:finalEv.project||'General', tags:finalEv.tags, priority:'high', type:'Calendar Cancelled',
          eventId:finalEv.id, date:finalEv.date,
          message:`${finalEv.type} "${finalEv.title}" on ${finalEv.date} has been cancelled.` });
      }
    }
    setEditingEvent(null);
  };
  const deleteEvent = () => { if(editingEvent && editingEvent.id) setCalEvents(evs => evs.filter(e=>e.id!==editingEvent.id)); setEditingEvent(null); };

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <S.SectionTitle sub="Deadlines from Phase Management, plus your own meetings, tasks & visits">Calendar</S.SectionTitle>
        <div className="flex items-center gap-2">
          <select value={projFilter} onChange={e=>setProjFilter(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none">
            <option value="All">All Projects</option>
            {myTaggedProjects.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button onClick={()=>shiftMonth(-1)} className="px-2 py-1 text-sm rounded-md text-slate-500 hover:bg-white">‹</button>
            <span className="px-2 text-sm font-medium text-slate-700 whitespace-nowrap">{monthLabel}</span>
            <button onClick={()=>shiftMonth(1)} className="px-2 py-1 text-sm rounded-md text-slate-500 hover:bg-white">›</button>
          </div>
          <button onClick={()=>openAdd(S.TODAY_ISO)} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-3 py-1.5 rounded-lg whitespace-nowrap">+ Add Event</button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3 text-[11px] text-slate-500">
        {S.EVENT_TYPES.map(t=>(<span key={t} className="flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-full ${S.EVENT_TYPE_COLOR[t].dot}`}></span>{t}</span>))}
        <span className="flex items-center gap-1 text-slate-400">· click a date to add an event, or click an event to edit it</span>
      </div>

      <div className="flex gap-4 items-start">
      <S.Card className="p-5 flex-1 min-w-0">
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400 mb-1">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><div key={d}>{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({length: totalCells}).map((_,i)=>{
            const dayNum = i - startWeekday + 1;
            const inMonth = dayNum>=1 && dayNum<=daysInMonth;
            const dateStr = inMonth ? `${year}-${String(month+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}` : null;
            const dayDeadlines = dateStr ? (deadlineMap[dateStr]||[]) : [];
            const dayCalEvents = dateStr ? (eventsByDate[dateStr]||[]) : [];
            const isToday = dateStr===S.TODAY_ISO;
            const isSelected = dateStr && dateStr===selectedDate;
            return (
              <div key={i} onClick={()=>inMonth && openAdd(dateStr)}
                className={`min-h-[80px] rounded-lg border p-1 text-xs align-top ${inMonth?'bg-white border-slate-200 cursor-pointer hover:border-brand-300':'bg-slate-50 border-transparent text-slate-300'} ${isToday?'ring-2 ring-brand-400':''} ${isSelected?'ring-2 ring-brand-500':''}`}>
                {inMonth && <>
                  <div className={isToday?'text-brand-600 font-semibold':'text-slate-400'}>{dayNum}</div>
                  <div className="space-y-0.5 mt-1">
                    {dayCalEvents.map(ev=>{
                      // Chip background/text is colored per-PROJECT when one is set, so the same
                      // project's events read as the same color everywhere on the calendar and in the
                      // legend on the right; the small dot stays type-colored (Meeting/Task/Visit)
                      // since that's still useful at a glance. A project-less "General" event falls
                      // back to the plain type color, since there's no project to color it by.
                      const typeColor = S.EVENT_TYPE_COLOR[ev.type]||S.EVENT_TYPE_COLOR.Meeting;
                      const projColor = ev.project ? colorForProject(ev.project) : null;
                      const chipCls = projColor ? projColor.chip : typeColor.chip;
                      const cancelled=ev.status==='Cancelled'; const done=ev.status==='Completed'; return (
                      <div key={ev.id} onClick={e=>{e.stopPropagation(); openEdit(ev);}}
                        title={`${ev.type}: ${ev.title}${ev.project?` · ${ev.project}`:''} · ${ev.status}`}
                        className={`rounded px-1 py-0.5 text-[10px] truncate flex items-center gap-1 ${chipCls} ${cancelled?'opacity-50 line-through':''}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${typeColor.dot}`}></span>
                        {done && '✓ '}{ev.title}
                      </div>
                    );})}
                    {dayDeadlines.slice(0,2).map((e,j)=>{
                      const projColor = e.project ? colorForProject(e.project) : null;
                      return (
                      <div key={j} className={`rounded px-1 py-0.5 text-[10px] truncate flex items-center gap-1 ${projColor ? projColor.chip : 'bg-slate-50 text-slate-500'}`} title={`${e.label} · ${e.project}`}>
                        <S.Icon name={e.kind==='phase'?'pin':e.kind==='milestone'?'phases':e.kind==='risk'?'risks':e.kind==='issue'?'issues':'subtasks'} className="w-2.5 h-2.5 shrink-0"/>
                        <span className="truncate">{e.label}</span>
                      </div>
                    );})}
                    {dayDeadlines.length>2 && <div className="text-[10px] text-slate-400">+{dayDeadlines.length-2} more</div>}
                  </div>
                </>}
              </div>
            );
          })}
        </div>
      </S.Card>

      {/* Project legend — every project I'm tagged to, each with its own distinct color (colorForProject
          above), matching its events/deadlines on the calendar to the left. */}
      <S.Card className="p-4 w-44 shrink-0">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Project</div>
        {distinctProjectNames.length===0 ? (
          <div className="text-xs text-slate-400">You're not tagged to any projects yet.</div>
        ) : (
          <div className="space-y-1.5">
            {distinctProjectNames.map(n=>{ const pc = colorForProject(n); return (
              <div key={n} className="flex items-center gap-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full shrink-0 ${pc.dot}`}></span>
                <span className={`truncate font-medium ${pc.text}`} title={n}>{n}</span>
              </div>
            );})}
          </div>
        )}
      </S.Card>
      </div>

      {editingEvent && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={e=>e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold">{editingEvent.id ? 'Edit Event' : 'New Event'}</h3>
              <button className="text-slate-400 hover:text-slate-600" onClick={closeModal}>✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Type</label>
                <div className="flex gap-1.5">
                  {S.EVENT_TYPES.map(t=>(
                    <button key={t} onClick={()=>setEditingEvent(ev=>({...ev,type:t}))}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded-lg border ${editingEvent.type===t?`${S.EVENT_TYPE_COLOR[t].chip} border-transparent font-medium`:'border-slate-200 text-slate-500'}`}>
                      <span className={`w-2 h-2 rounded-full ${S.EVENT_TYPE_COLOR[t].dot}`}></span>{t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Title</label>
                <input className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={editingEvent.title} onChange={e=>setEditingEvent(ev=>({...ev,title:e.target.value}))} placeholder="What's this event about?"/>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">Date</label>
                  <input type="date" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" value={editingEvent.date} onChange={e=>setEditingEvent(ev=>({...ev,date:e.target.value}))}/>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-slate-400 block mb-1">Status</label>
                  <select className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none" value={editingEvent.status} onChange={e=>setEditingEvent(ev=>({...ev,status:e.target.value}))}>
                    {S.EVENT_STATUSES.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Project (optional)</label>
                <select className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none" value={editingEvent.project||''} onChange={e=>setEditingEvent(ev=>({...ev,project:e.target.value}))}>
                  <option value="">General — not project specific</option>
                  {myTaggedProjects.map((p:any)=><option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Tag teammates <span className="text-slate-300">— they'll get a reminder notification</span></label>
                <S.AssigneeChips assignees={editingEvent.tags} roster={team.map(m=>({name:m.name, label:m.role}))} onAdd={addTag} onRemove={removeTag}/>
              </div>
            </div>
            <div className="flex justify-between items-center mt-5">
              {editingEvent.id ? <button onClick={deleteEvent} className="text-sm text-red-500 hover:text-red-700">✕ Delete event</button> : <span></span>}
              <div className="flex gap-2">
                <button onClick={closeModal} className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={saveEvent} className="text-sm px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white">Save event</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Company-wide, live pending-approvals summary — real counts and items straight from the
// Phase Management tree's review workflow (Sub Task/Milestone approval by level -> Implemented
// escalation chain -> Client Sign-off -> Implemented). The actual approve/reject actions live in
// Phase Management (by level) and Client Portal (Client Owner), since those already carry the
// permission logic; this page is the cross-project view of what's sitting where, not a duplicate
// action surface.
