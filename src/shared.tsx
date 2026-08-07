import React, { useState, useMemo, useEffect, useContext, useRef } from 'react';


/* ============================ MOCK DATA ============================ */
export const fmt = (n) => Number(n||0).toLocaleString('en-IN');
export const inLakh = (n) => '₹' + (Number(n||0)/100000).toFixed(1) + 'L';

// Real project data lives in Supabase (see db.ts / App.tsx) — nothing is seeded here. This stays as
// an empty array purely as the pre-load default for ProjectsDataContext below.
export const PROJECTS: any = [];

// ---- Revenue model: total revenue = total project months × monthly fee ----
// Live "today", computed once when the app loads (not a frozen prototype date).
export const TODAY_ISO = new Date().toISOString().slice(0, 10);
// End-of-month boundary used by the Deliverables report: "everything due by month end" reads off
// this the same way every time, regardless of what day of the month TODAY_ISO happens to be.
// Built from plain integers, not Date/toISOString — that round-trip crosses local↔UTC and can
// silently roll the date back a day in +offset timezones (confirmed while fixing the same bug in
// Calendar's month navigation below).
export const CURRENT_MONTH_END = (() => {
  const [y,m] = TODAY_ISO.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
})();
export const CURRENT_MONTH_LABEL = new Date(TODAY_ISO+'T00:00:00').toLocaleString('en-US',{month:'long',year:'numeric'});
export const monthsBetween = (a, b) => (!a || !b) ? 0 : Math.max(0, (+new Date(b) - +new Date(a)) / (30.44 * 864e5));
export const projTotalMonths = (p) => monthsBetween(p.start, p.end);
export const projTargetRevenue = (p) => Math.round(projTotalMonths(p) * (Number(p.monthlyFee)||0));
export const projElapsedMonths = (p) => monthsBetween(p.start, (new Date(TODAY_ISO) < new Date(p.end) ? TODAY_ISO : p.end));
export const projAchievedRevenue = (p) => Math.min(projTargetRevenue(p), Math.round(projElapsedMonths(p) * (Number(p.monthlyFee)||0)));
// Actual billed-to-date revenue — billing here is monthly-once (a single invoice raised per billing
// cycle, not spread/prorated across the days of a month), so "achieved" should be the sum of the
// invoice amounts actually CONFIRMED RECEIVED in Project Master (Billing Tracker rows are created by
// ticking a Payment Receipt as received — see confirmReceipt in ProjectMaster.tsx), not a
// months-elapsed × fee estimate and not amounts still Pending/Delayed/On Hold. Falls back to 0 when a
// project simply has no confirmed receipts yet, since that's the true billed-to-date figure.
export const projInvoicedRevenue = (p, invoices) => (invoices||[]).filter(i=>i.project===p.id && i.status==='Received').reduce((sum,i)=>sum+(Number(i.amount)||0), 0);

// Category tiers are org-configurable (Project Master's Category field, master list at
// settings.categories — code + label, e.g. { code:'A', label:'Premium' }), so "is this project
// Premium" has to look the label up rather than assume code 'A' is always Premium. Falls back to
// code==='A' only if the tier list has been edited away from including a Premium label at all, so
// this still does something sane on a freshly customized tier list.
export const isPremiumProject = (p, categories) => {
  const tiers = (categories && categories.length) ? categories : DEFAULT_PROJECT_SETTINGS.categories;
  const tier = tiers.find((t:any)=>t.code===p.category);
  if (tier) return (tier.label||'').trim().toLowerCase()==='premium';
  return p.category==='A';
};
// Team Productivity (Administration -> Team Productivity, Team Management's benchmark-vs-actual
// table): a Premium project counts as TWO projects toward a teammate's "No. of Projects" actual —
// everything else (team size, billing, onsite visits) still reads off the project as one project.
export const projectWeight = (p, categories) => isPremiumProject(p, categories) ? 2 : 1;

// Live projects list, lifted to App level (same reasoning as PhaseDataContext etc. below) so that
// edits/adds made in Project Master are immediately visible everywhere else that reads project
// data (Dashboard, Gantt, Portal, Deliverables, Calendar, Risks, Issues, Changes, Reports, Phases,
// Implementation, ProjectStructure, Documents) instead of those screens reading the frozen PROJECTS
// seed array directly.
export const ProjectsDataContext = React.createContext<any>({ projects: PROJECTS, setProjects: ()=>{} });

// Team roster, loaded from and synced to Supabase the same way as every other data type — added
// from Team Management, and consumed elsewhere (Project Master's Strategic Lead/Project Head/PM/
// Associate pickers, Dashboard/Reports utilization insights) via this same live context.
export const TeamDataContext = React.createContext<any>({ team: [], setTeam: ()=>{} });

// The signed-in person's identity — email plus their Administration -> Users profile (name,
// designation, status). Screens that need to know "is this me" (Billing Tracker roster checks,
// who-recorded-this stamps) read this instead of threading email/profile down as props.
export const CurrentUserContext = React.createContext<any>({ email:'', profile:null });

// Simple role context so the Project Master can enforce admin-only edits after confirmation.
// Value is derived from the signed-in user's Administration -> Users record (see deriveRole below
// and its use in App.tsx) rather than picked manually — there used to be a demo "acting as" switcher
// here before real login existed.
export const RoleContext = React.createContext<any>({ role:'consultant', setRole:()=>{} });
export const ROLE_LABELS = { admin:'Admin', projectHead:'Project Head', strategicLead:'Strategic Lead', consultant:'Consultant', client:'Client' };
// Maps a signed-in email to one of the RoleContext values above, using the same admin_data.users /
// designationLevel records Administration -> Users and -> Roles & Permissions edit. A Client-type
// account (added via Administration -> Users -> "Add Client", see Administration.tsx) is checked
// FIRST and always resolves to 'client' regardless of its `designation` field (fixed to 'Client',
// which deliberately isn't one of DESIGNATIONS/designationLevel) -- this is a hard-restricted role,
// not a point on the staff permission ladder. For everyone else, permission level is checked first:
// anyone whose designation carries Super Admin level (Strategic Lead by default — this is the tenant
// owner) gets full 'admin' rights, including editing confirmed projects in Project Master, regardless
// of designation label. Only once that's ruled out do Strategic Lead / Project Head get matched by
// designation name (so their badge stays meaningful even at a lower permission level); Admin-level
// anyone else also gets 'admin'; everyone else is a base 'consultant'.
// A user's effective permission level: their own per-account override (Administration -> Users ->
// custom edit, Super Admin only) if one has been set, otherwise the standard designation -> level
// mapping everyone else follows. This is the one place that decision is made, so deriveRole/
// isSuperAdmin/capabilityFor below all agree on the same answer for a given user.
export const effectivePermissionLevel = (u: any, admin: any) => u?.permissionOverride || admin?.designationLevel?.[u?.designation];

export const deriveRole = (email: string, admin: any) => {
  const u = (admin?.users||[]).find((x:any)=>(x.email||'').toLowerCase()===(email||'').toLowerCase());
  if (!u || u.status!=='Active') return 'consultant';
  if (u.type==='Client') return 'client';
  const level = effectivePermissionLevel(u, admin);
  if (level==='Super Admin') return 'admin';
  if (u.designation==='Strategic Lead') return 'strategicLead';
  if (u.designation==='Project Head') return 'projectHead';
  if (level==='Admin') return 'admin';
  return 'consultant';
};

// Project-level visibility for staff (App.tsx -> ProjectsDataContext, mirrors the Client-role
// filtering right below it). role==='admin' is Admin/Super Admin permission level (see deriveRole
// above -- it already collapses both onto 'admin', which is exactly the "sees everything" tier) and
// keeps full org-wide visibility; everyone else only sees projects where they're on the project's
// Team (p.team, full level-based participant) OR its Guest Teammates (p.guests, an existing teammate
// given read-only Phase-Management-only access to a project they aren't otherwise on — see
// ProjectMaster.tsx's "Guest Teammates" card and Phases.tsx's per-project readOnly check). A
// brand-new project with nobody assigned yet is invisible to a restricted account until someone tags
// them on it -- expected, not a bug: there's nothing project-specific to show them yet.
export const staffVisibleProjects = (projects: any[], role: string, profile: any) => {
  if (role==='admin') return projects;
  if (!profile) return [];
  return projects.filter((p:any) => (p.team||[]).some((t:any)=>t.name===profile.name) || (p.guests||[]).includes(profile.name));
};
// Is `name` a full participant (level-based, editable) on this project, vs. only a read-only Guest
// Teammate (or not on it at all)? Phases.tsx uses this to decide per-project whether the signed-in
// account gets edit controls or a view-only board -- the same person can be a full team member on one
// project and only a guest on another, so this has to be checked per project, not per account/role.
export const isOnProjectTeam = (project: any, name: string): boolean => (project?.team||[]).some((t:any)=>t.name===name);

// Every Guest teammate/assignee roster entry a project's screens need: name + hierarchy level, plus a
// display label combining the two (e.g. "L2 · Project Head") via designationForLevel. Replaces three
// near-identical inline roster builders that used to read the 4 fixed strategicLead/projectHead/pm/
// associate fields (Phases.tsx, Deliverables.tsx, Portal.tsx) — all three now call this instead, so a
// project's team list has exactly one place that turns project.team into a roster.
// The project's most senior (L1) team member's name — used anywhere a compact "who's in charge"
// display is needed (Dashboard billing widget, Reports portfolio table, Implementation Tracker
// summary) in place of the old fixed "Project Manager" field.
export const projectLeadName = (project: any): string => (project?.team||[]).find((t:any)=>t.level==='L1')?.name || '';
// The Project Manager is the operational lead and primary responsible person for a project — every
// "who's in charge here" display (Dashboard, Implementation Tracker, Reports) reads this rather than
// projectLeadName/L1 (Strategic Lead), which stays purely an approval-chain concept (Milestones/
// Phases still need L1 sign-off — that's unchanged). Looked up the same way as the Project Health
// Matrix's "Project Manager" column: whoever on this project's team sits at the level Administration
// -> Roles & Permissions currently maps to the "Project Manager" designation.
export const projectManagerName = (project: any, admin?: any): string => (project?.team||[]).find((t:any)=>designationForLevel(t.level, admin)==='Project Manager')?.name || '';

export const buildRoster = (project: any, admin?: any) => (project?.team||[]).map((t:any) => {
  const designation = admin ? designationForLevel(t.level, admin) : '';
  return { name: t.name, level: t.level, label: designation ? `${t.level} · ${designation}` : t.level };
});
// Same as buildRoster, but also offers this project's client contacts (Project Master's
// project.clients[]) as selectable people -- Issue Management needs client names pickable in its
// Raised By dropdown (clients can raise issues too, via Client Portal), which plain buildRoster
// (staff team only) doesn't cover.
export const buildRosterWithClients = (project: any, admin?: any) => [
  ...buildRoster(project, admin),
  ...((project?.clients||[]).map((c:any) => ({ name: c.name, level: 'Client', label: c.owner ? 'Client · Owner' : 'Client' }))),
];
// Sequential display IDs (e.g. 'IS-004') are now reserved server-side -- see db.nextSeqId(), which
// calls the next_seq_id() Postgres function. A client-side "scan the loaded list, pick max+1"
// version used to live here, but two people creating a record at the same moment could get handed
// the same next number that way, and since writes are upsert-by-id the second write would silently
// overwrite the first person's brand new record. db.nextSeqId() reserves the number atomically in
// the database instead.

// Company-wide master lists that power several New Project form dropdowns (Category, Industry,
// Consulting Category, Engagement Type). Editable from Administration -> Project Settings and
// persisted to Supabase (app_settings table) — these are starting defaults, not demo records; if
// no settings row exists yet, db.ts falls back to this shape so the dropdowns aren't empty.
export const DEFAULT_PROJECT_SETTINGS: any = {
  categories: [
    { code:'A', label:'Premium' },
    { code:'B', label:'Medium Class' },
    { code:'C', label:'Normal Class' },
  ],
  industries: ['BFSI','Retail','Pharma','FMCG','Logistics','Manufacturing','IT & Technology','Healthcare','Real Estate','Education'],
  consultingCategories: ['Business Plan','HR Consulting','Complete PMS','Business Transformation','Process Improvement','Audit','Benchmarking Study'],
  engagementTypes: ['Fixed Scope','Retainer'],
  // Shared status vocabulary used by Phases, Milestones and Sub Tasks in Phase Management. The
  // derivation rules differ per level (see Phases()), but the label set itself is one shared list.
  itemStatuses: ['Not Started','In Progress','Completed','On Hold','Implemented'],
  // Priority Master (Administration -> Masters -> Priority Master) — shared priority vocabulary.
  priorityLevels: ['High','Medium','Normal','Low'],
  // Function Master (Administration -> Masters -> Function Master) — used by the Document Library's
  // "Function" dropdown to tag which business function a document belongs to.
  functions: ['Sales','Marketing','Production','Operations','Finance & Accounts','Human Resource','IT','Audit'],
  // Department Master (Administration -> Masters -> Department Master) — used by Team Management's
  // Department dropdown, so every consultant's department comes from one shared, editable list
  // instead of free text (which used to let the same department end up spelled two different ways).
  departments: ['Delivery','Consulting','Sales & BD','HR','Finance & Accounts','IT','Operations','Marketing','Audit'],
};
export const SettingsContext = React.createContext<any>({ settings: DEFAULT_PROJECT_SETTINGS, setSettings: ()=>{} });
// Case-insensitive de-dup append, used whenever a user adds a new master-list value inline.
export const addUnique = (list, value) => {
  const v = (value||'').trim();
  if(!v) return list;
  return list.some(x => x.toLowerCase()===v.toLowerCase()) ? list : [...list, v];
};
// Project-level lifecycle status. Only a Project Head or Strategic Lead (or admin) may change it.
export const PROJECT_STATUSES = ['Yet to Start','In Progress','On Hold','Dropped','Terminated','Completed'];

// Shared Phase Management data (phase/milestone/sub task tree + activity notifications) lifted to
// App level so both Phase Management and the Client Portal read/write the exact same records —
// e.g. approving an item in Phase Management is what makes it appear for client sign-off in Portal.
export const PhaseDataContext = React.createContext<any>({ tree:{}, setTree:()=>{}, notifications:[], addNotification:()=>{} });

// Same reasoning as PhaseDataContext: Risk/Issue/Change Request edits need to survive navigating
// away and back (the screen component remounts fresh each time `active` changes), so this state
// lives at App level rather than as local useState inside each page.
export const GovernanceDataContext = React.createContext<any>({
  risks:[], setRisks:()=>{}, issues:[], setIssues:()=>{}, changes:[], setChanges:()=>{},
});

// Calendar events — user-created (Meeting/Task/Visit), separate from the read-only phase/milestone/
// sub task deadline markers Calendar already shows. Lifted to App level so adding/editing an event
// survives navigating away and back, same reasoning as PhaseDataContext/GovernanceDataContext.
export const CalendarDataContext = React.createContext<any>({ events:[], setEvents:()=>{} });
export const EVENT_TYPES = ['Meeting','Task','Visit'];
export const EVENT_TYPE_COLOR: any = {
  Meeting: { dot:'bg-blue-500', chip:'bg-blue-50 text-blue-700', ring:'ring-blue-300' },
  Task:    { dot:'bg-amber-500', chip:'bg-amber-50 text-amber-700', ring:'ring-amber-300' },
  Visit:   { dot:'bg-purple-500', chip:'bg-purple-50 text-purple-700', ring:'ring-purple-300' },
};
export const EVENT_STATUSES = ['Pending','Completed','Cancelled'];

// Per-client color coding for the Calendar — every client gets a stable, distinct color (hashed from
// their name, so the same client always lands on the same color across reloads/sessions without
// needing an admin-maintained color assignment). Used both for the calendar's deadline/event chips
// and the client legend list next to it, so a client's name and their events always match.
export const CLIENT_COLOR_PALETTE = [
  { text:'text-rose-600',    dot:'bg-rose-500',    chip:'bg-rose-50 text-rose-700' },
  { text:'text-blue-600',    dot:'bg-blue-500',    chip:'bg-blue-50 text-blue-700' },
  { text:'text-emerald-600', dot:'bg-emerald-500', chip:'bg-emerald-50 text-emerald-700' },
  { text:'text-amber-600',   dot:'bg-amber-500',   chip:'bg-amber-50 text-amber-700' },
  { text:'text-violet-600',  dot:'bg-violet-500',  chip:'bg-violet-50 text-violet-700' },
  { text:'text-cyan-600',    dot:'bg-cyan-500',    chip:'bg-cyan-50 text-cyan-700' },
  { text:'text-pink-600',    dot:'bg-pink-500',    chip:'bg-pink-50 text-pink-700' },
  { text:'text-lime-700',    dot:'bg-lime-600',    chip:'bg-lime-50 text-lime-700' },
  { text:'text-orange-600',  dot:'bg-orange-500',  chip:'bg-orange-50 text-orange-700' },
  { text:'text-indigo-600',  dot:'bg-indigo-500',  chip:'bg-indigo-50 text-indigo-700' },
];
const NEUTRAL_CLIENT_COLOR = { text:'text-slate-500', dot:'bg-slate-400', chip:'bg-slate-100 text-slate-600' };
export const colorForClient = (name: string) => {
  const key = (name||'').trim().toLowerCase();
  if(!key) return NEUTRAL_CLIENT_COLOR;
  let h = 0;
  for(let i=0;i<key.length;i++) h = (h*31 + key.charCodeAt(i)) >>> 0;
  return CLIENT_COLOR_PALETTE[h % CLIENT_COLOR_PALETTE.length];
};

// Document Library — a standalone repository of reusable documents (templates, playbooks, past
// deliverables kept for reference), separate from the per-project files attached in Phase Management.
// Lifted to App level (same reasoning as CalendarDataContext) so it survives navigating away and back.
export const LibraryDataContext = React.createContext<any>({ docs:[], setDocs:()=>{} });

// Reports > "Deliverable Budget & Hours" reads from the live `deliverables` Supabase table via this
// context (same pattern as every other data type) — see DeliverablesDataContext usage in App.tsx/Reports.tsx.
export const DeliverablesDataContext = React.createContext<any>({ deliverables:[], setDeliverables:()=>{} });

// Per-project billing/invoice tracking (Project Master -> Billing Tracker), backed by the
// `invoices` Supabase table. A cron job also inserts rows here automatically (see
// generate_monthly_invoices in the database) — those show up the same as manually-added ones.
export const InvoicesDataContext = React.createContext<any>({ invoices:[], setInvoices:()=>{} });

// Monthly Plan (Delivery -> Monthly Plan, below Phase Management): the current month's day-by-day
// delivery agenda per project -- what's planned, whether it's an Onsite or Offsite activity, and its
// delivery status. Backed by the `monthly_plans` Supabase table, one row per (project, month), keyed
// here the same way: plan[projectId][month] = rows[]. Auto-seeded from Phase Management's own
// milestones/sub tasks due that month (see MonthlyPlan.tsx's syncFromPhases) but freely editable
// after that -- syncing again only adds rows for items not already pulled in (tracked via each row's
// sourceId), it never overwrites an edit already made here.
export const MonthlyPlanDataContext = React.createContext<any>({ plan:{}, setPlan:()=>{} });
export const ONSITE_STATUS_OPTS = ['Onsite','Offsite'];
export const DELIVERY_STATUS_OPTS = ['Done','Pending','Cancelled','C/F'];
export const deliveryStatusColor = (s: string) => ({
  'Done':'bg-emerald-100 text-emerald-700', 'Pending':'bg-amber-100 text-amber-700',
  'Cancelled':'bg-red-100 text-red-700', 'C/F':'bg-slate-100 text-slate-600',
}[s] || 'bg-slate-100 text-slate-600');
export const onsiteStatusColor = (s: string) => s==='Onsite' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700';
// 'YYYY-MM' for any date, defaulting to the current/running month -- used to pick which month's
// items from Phase Management belong on this month's plan, and to key plan[projectId][month].
export const monthKeyOf = (iso?: string) => (iso || TODAY_ISO).slice(0, 7);
export const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month:'long', year:'numeric' });
};
export const INVOICE_STATUSES = ['Pending','Received','Delayed','On Hold'];
// True once a Super Admin permission-level exists for this email — the only role allowed to edit
// a locked invoice row (see lockInvoiceIfNeeded below).
export const isSuperAdmin = (email: string, admin: any) => {
  const u = (admin?.users||[]).find((x:any)=>(x.email||'').toLowerCase()===(email||'').toLowerCase());
  if (!u || u.status!=='Active') return false;
  return effectivePermissionLevel(u, admin) === 'Super Admin';
};

// Canonical project roles used for member selection & phase tagging
export const PROJECT_ROLES = ['Strategic Lead','Project Head','Project Manager','Associate'];

export const APPROVAL_STAGES = ['Internal Review','Partner Review','Client Review','Revision','Approved','Implementation','Closed'];

/* ============================ ADMINISTRATION: ROLES, PERMISSIONS, COMPANY, BILLING ============================
   Note: this is a distinct system from RoleContext/ROLE_LABELS above. RoleContext is the "acting as"
   switcher used to demo approval-flow gating (admin / projectHead / strategicLead / consultant).
   What follows is the organizational designation -> permission level model that backs the
   Administration -> Roles & Permissions / Users screens: every person holds one designation
   (Associate, Project Manager, Project Head, Strategic Lead, BD) and each designation maps to one
   permission level (Officer, Manager, Admin, Super Admin), which in turn drives a module-by-module
   capability matrix. All of it is editable and persisted to localStorage. */
export const DESIGNATIONS = ['Associate','Project Manager','Project Head','Strategic Lead','BD'];
export const PERMISSION_LEVELS = ['Officer','Manager','Admin','Super Admin'];
export const DEFAULT_DESIGNATION_LEVEL: any = {
  'Associate':'Officer',
  'Project Manager':'Manager',
  'BD':'Manager',
  'Project Head':'Admin',
  'Strategic Lead':'Super Admin',
};

// Hierarchy Level (Administration -> Users): a separate axis from the permission-level system above.
// PERMISSION_LEVELS/designationLevel decide what a person can DO in the app (capability matrix);
// HIERARCHY_LEVELS decides where they sit in the reporting/seniority chain (L1 = most senior). Each
// user record carries its own `level` field, entered explicitly when they're added — it isn't derived
// from designation, since two people with the same designation can still sit at different seniority
// (e.g. a newly-promoted vs. a long-tenured Project Head). DEFAULT_HIERARCHY_LEVEL only seeds a
// sensible starting value in the Add Teammate form; it's never silently re-applied after that.
export const HIERARCHY_LEVELS = ['L1','L2','L3','L4','L5','L6','L7','L8','L9'];
export const DEFAULT_HIERARCHY_LEVEL: any = {
  'Strategic Lead':'L1',
  'Project Head':'L2',
  'Project Manager':'L3',
  'BD':'L3',
  'Associate':'L4',
};
// Designation -> Hierarchy Level mapping, admin-editable (Administration -> Roles & Permissions ->
// "Designation → Hierarchy Level", same pattern as designationLevel/permission levels below). Falls
// back to DEFAULT_HIERARCHY_LEVEL for any designation the admin hasn't remapped yet, so the table
// always shows a sane starting value instead of blank. This is the single source of truth for "what
// level does this designation sit at by default" — used to seed a new user's Level field, to default
// a Project Master team member's level when a name is picked, and to show a designation label next to
// an L-number anywhere levels are displayed (approval chips, project team rosters, etc).
export const designationHierarchyLevel = (designation: string, admin: any): string =>
  (admin?.designationHierarchyLevel && admin.designationHierarchyLevel[designation]) || DEFAULT_HIERARCHY_LEVEL[designation] || '';
// Inverse lookup for display: "which designation is L2 by default" — used to label approval chips
// and project team rows with e.g. "L2 · Project Head" instead of a bare number. Not guaranteed
// unique (an admin could map two designations to the same level); just returns the first match.
export const designationForLevel = (level: string, admin: any): string => {
  const map = { ...DEFAULT_HIERARCHY_LEVEL, ...(admin?.designationHierarchyLevel || {}) };
  const hit = Object.keys(map).find(d => map[d] === level);
  return hit || '';
};
// Numeric seniority (L1 = 1 = most senior). Unparseable/missing levels sort last (99), so an item
// with no level assigned never accidentally outranks a properly-leveled one.
export const levelNum = (lv: string): number => { const n = parseInt(String(lv || '').replace('L', ''), 10); return isNaN(n) ? 99 : n; };
// Distinct levels actually present on a project's team (S.HIERARCHY_LEVELS numbers only), ascending
// by seniority (L1 first) -- this is what scopes Phase Management's "Acting as" tabs to only the
// tiers that actually exist on THIS project, instead of a fixed global list.
export const projectLevelNumsPresent = (project: any): number[] =>
  (Array.from(new Set((project?.team || []).map((t: any) => levelNum(t.level)))) as number[]).filter((n: number) => n < 99).sort((a: number, b: number) => a - b);
// The level that must sign off to finalize a Completed `kind` item on this project -- Sub Tasks
// need up to L2, Milestones & Phases need L1 specifically. If the target level itself isn't on this
// project's team, escalate to the next more senior level that IS present (e.g. no L2 -> L1); if
// nobody senior enough is on the team at all, fall back to whoever's most senior present so there's
// always a real approver rather than a dead end.
// Whether an Issue Management record is visible to a given signed-in account -- only whoever raised
// it, is assigned to it, is tagged on it, is Admin/Super Admin, or holds this project's L1 sign-off
// role can see it (nobody else, not even other teammates on the same project). Shared by Issues.tsx
// and anywhere else in the app that surfaces issue content (Calendar deadline markers, Reports'
// portfolio mini-table) so a locked-down issue's description can't leak out through a different
// screen than the one that actually enforces the restriction.
export const issueVisibleTo = (issue: any, project: any, role: string, myName: string): boolean => {
  if (role === 'admin') return true;
  if (!myName) return false;
  if (issue.raisedBy === myName || issue.assignee === myName) return true;
  if ((issue.tags || []).includes(myName)) return true;
  const entry = (project?.team || []).find((t: any) => t.name === myName);
  const lvl = entry?.level;
  return !!lvl && lvl === approverLevelFor('phase', project);
};
export const approverLevelFor = (kind: 'subtask' | 'milestone' | 'phase', project: any): string => {
  const targetNum = kind === 'subtask' ? 2 : 1;
  const present = projectLevelNumsPresent(project);
  if (!present.length) return `L${targetNum}`;
  const eligible = present.filter(n => n <= targetNum);
  const num = eligible.length ? Math.max(...eligible) : present[0];
  return `L${num}`;
};
// Does this actor's level already qualify to finalize a `kind` item directly, no queueing? Sub Tasks:
// L1 or L2. Milestones & Phases: L1 only.
export const actorQualifies = (kind: 'subtask' | 'milestone' | 'phase', actorLevel: string): boolean =>
  levelNum(actorLevel) <= (kind === 'subtask' ? 2 : 1);
// The "Implemented" escalation chain for an item being pushed to Implemented by `actorLevel` --
// every level present on this project's team that's more senior than the actor, walked from the
// level closest to the actor up to L1 last (e.g. actor L4, team has L1/L2/L3 -> ['L3','L2','L1']; if
// L2 isn't on the team, that step is skipped -> ['L3','L1']). An actor who's already the most senior
// level present returns an empty chain -- nothing left to escalate, ready for Client sign-off.
export const implementChainFor = (project: any, actorLevel: string): string[] => {
  const actorNum = levelNum(actorLevel);
  return projectLevelNumsPresent(project).filter(n => n < actorNum).sort((a, b) => b - a).map(n => `L${n}`);
};
export const PERMISSION_MODULES = ['Project Master','Phase Management','Deliverables','Financials & Billing','Risk / Issue / Change','Team Management','Reports','Documents','Client Portal','Administration'];
export const CAPABILITY_LEVELS = ['None','View','Edit','Approve','Full'];
export const CAPABILITY_COLOR: any = { 'None':'bg-slate-100 text-slate-400','View':'bg-blue-100 text-blue-700','Edit':'bg-amber-100 text-amber-700','Approve':'bg-violet-100 text-violet-700','Full':'bg-emerald-100 text-emerald-700' };
// Client is NOT one of the four staff PERMISSION_LEVELS (it isn't reachable via any DESIGNATIONS ->
// designationLevel assignment — see deriveRole, which checks u.type==='Client' before ever looking at
// designation). It's still a real column in the capability MATRIX though, so an admin can configure
// exactly what a Client-type login can do — by default just Edit on Client Portal (their own sign-off/
// remark actions in Portal.tsx) and None everywhere else. MATRIX_COLUMNS is what the Capability Matrix
// table in Roles & Permissions iterates; PERMISSION_LEVELS stays the 4 staff levels only, so the
// Designation -> Permission Level table above it is unaffected.
export const MATRIX_COLUMNS = [...PERMISSION_LEVELS, 'Client'];
export const DEFAULT_PERMISSION_MATRIX: any = {
  'Project Master':          { Officer:'View', Manager:'Edit', Admin:'Approve', 'Super Admin':'Full', Client:'None' },
  'Phase Management':        { Officer:'Edit', Manager:'Edit', Admin:'Approve', 'Super Admin':'Full', Client:'None' },
  'Deliverables':            { Officer:'Edit', Manager:'Approve', Admin:'Approve', 'Super Admin':'Full', Client:'None' },
  'Financials & Billing':    { Officer:'None', Manager:'View', Admin:'Edit', 'Super Admin':'Full', Client:'None' },
  'Risk / Issue / Change':   { Officer:'View', Manager:'Edit', Admin:'Approve', 'Super Admin':'Full', Client:'None' },
  'Team Management':         { Officer:'View', Manager:'View', Admin:'Edit', 'Super Admin':'Full', Client:'None' },
  'Reports':                 { Officer:'View', Manager:'View', Admin:'View', 'Super Admin':'Full', Client:'None' },
  'Documents':               { Officer:'Edit', Manager:'Edit', Admin:'Edit', 'Super Admin':'Full', Client:'None' },
  'Client Portal':           { Officer:'None', Manager:'View', Admin:'Edit', 'Super Admin':'Full', Client:'Edit' },
  'Administration':          { Officer:'None', Manager:'None', Admin:'View', 'Super Admin':'Full', Client:'None' },
};
// Every module a per-account capability lookup needs, resolved from the SAME records Administration
// -> Users / -> Roles & Permissions edit: a Client-type login (see deriveRole) is looked up by the
// fixed 'Client' matrix column; everyone else by their designation's permission level. Missing/
// inactive accounts and unmapped designations resolve to 'None', never a guess.
export const capabilityFor = (module: string, email: string, admin: any): string => {
  const u = (admin?.users||[]).find((x:any)=>(x.email||'').toLowerCase()===(email||'').toLowerCase());
  if (!u || u.status!=='Active') return 'None';
  const col = u.type==='Client' ? 'Client' : (effectivePermissionLevel(u, admin) || null);
  if (!col) return 'None';
  return (admin?.matrix?.[module]||{})[col] || 'None';
};
export const CAP_RANK: any = { 'None':0, 'View':1, 'Edit':2, 'Approve':3, 'Full':4 };
export const capAtLeast = (cap: string, min: string) => (CAP_RANK[cap] ?? 0) >= (CAP_RANK[min] ?? 0);

// Real staff accounts are added from Administration -> Users; nothing is pre-populated.
export const USERS_SEED: any = [];

// Blank company profile shape — filled in from Administration -> Company Settings. Locale-ish
// defaults (timezone/currency/fiscal year) are kept as sensible starting values, not fake facts.
export const DEFAULT_COMPANY_INFO: any = {
  legalName:'', displayName:'', gstin:'', cin:'', address:'', website:'', industry:'',
  founded:'', employeeCount:'', primaryContact:'', supportEmail:'', phone:'',
  timezone:'Asia/Kolkata (GMT+5:30)', currency:'INR (₹)', fiscalYearStart:'April',
};

export const DEFAULT_BILLING_INFO: any = {
  plan:'', tier:'', seats:0, seatsUsed:0, pricePerSeatMonthly:0,
  renewalDate:'', perpetualPurchaseDate:'', autoRenew:false,
  paymentMethod:'', billingContact:'', invoices:[],
};

export const DEFAULT_NOTIFICATION_SETTINGS: any = {
  categories: [
    { key:'deliverableDue',       label:'Deliverable due / overdue reminders',      email:true,  inApp:true  },
    { key:'approvalRequests',     label:'Approval requests (PM / Head / Client)',   email:true,  inApp:true  },
    { key:'riskAlerts',           label:'High-impact risk & issue alerts',          email:true,  inApp:true  },
    { key:'billingReminders',     label:'Billing due date reminders',              email:true,  inApp:false },
    { key:'calendarReminders',    label:'Calendar meeting / visit reminders',       email:false, inApp:true  },
    { key:'weeklyDigest',         label:'Weekly portfolio digest',                 email:true,  inApp:false },
    { key:'clientPortalActivity', label:'Client Portal sign-off activity',          email:true,  inApp:true  },
  ],
};

export const DEFAULT_ADMIN_EXTRAS: any = {
  branches: [],
  holidays: [],
  workingDays: { Mon:true, Tue:true, Wed:true, Thu:true, Fri:true, Sat:false, Sun:false, start:'09:30', end:'18:30' },
  templates: {
    'Project Templates': [],
    'Phase Templates': [],
    'Deliverable Templates': [],
    'Email Templates': [],
  },
  integrations: [],
  lastBackup: '',
  auditLogs: [],
};

// Team Productivity Settings (Administration -> Team Productivity): per-teammate benchmarks, keyed
// by their Administration -> Users record id (stable even if the person's name is later edited).
// Missing keys/fields all default to 0 via PRODUCTIVITY_METRICS below, not undefined, so a teammate
// with no benchmark set yet just shows "— of 0" instead of breaking the Team Management table.
export const PRODUCTIVITY_METRICS = [
  { key:'projects',    label:'No. of Projects',            unit:'' },
  { key:'teamSize',     label:'Team Size',                  unit:'' },
  { key:'billingTarget', label:'Billing Target',            unit:'₹' },
  { key:'onsiteVisits', label:'On Site Visits Per Project', unit:'' },
];
export const DEFAULT_PRODUCTIVITY_BENCHMARK: any = { projects:0, teamSize:0, billingTarget:0, onsiteVisits:0 };
export const DEFAULT_ADMIN_DATA: any = {
  designationLevel: DEFAULT_DESIGNATION_LEVEL,
  designationHierarchyLevel: DEFAULT_HIERARCHY_LEVEL,
  matrix: DEFAULT_PERMISSION_MATRIX,
  users: USERS_SEED,
  company: DEFAULT_COMPANY_INFO,
  billing: DEFAULT_BILLING_INFO,
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
  extras: DEFAULT_ADMIN_EXTRAS,
  productivity: {},
};
// Single context for the whole Administration area — the live object is loaded from Supabase
// (db.loadAll -> App.tsx), with DEFAULT_ADMIN_DATA used only to fill in any key that has no row yet.
export const AdminDataContext = React.createContext<any>({ admin: DEFAULT_ADMIN_DATA, patchAdmin: ()=>{} });

/* ============================ HELPERS ============================ */
// Was a simple in-process counter starting at 1000 every page load — fine when all state was
// per-tab in-memory mock data, but now that new rows persist to a shared Supabase database, two
// browser sessions creating a record at the same time would generate the same id and collide on
// insert. Mixes in time + a random suffix to keep ids short and readable while avoiding that.
let _uid = 0;
export const uid = (p) => (p||'ID') + '-' + Date.now().toString(36) + (++_uid).toString(36) + Math.random().toString(36).slice(2, 5);
export const statusColor = (s) => ({
  'Completed':'bg-emerald-100 text-emerald-700','In Progress':'bg-blue-100 text-blue-700',
  'In Review':'bg-amber-100 text-amber-700','Planned':'bg-slate-100 text-slate-600',
  'At Risk':'bg-red-100 text-red-700','Not Started':'bg-slate-100 text-slate-500',
  'Open':'bg-red-100 text-red-700','Pending':'bg-amber-100 text-amber-700',
  'Approved':'bg-emerald-100 text-emerald-700','Mitigated':'bg-emerald-100 text-emerald-700',
  'On Hold':'bg-orange-100 text-orange-700','Waiting Review':'bg-amber-100 text-amber-700',
  'Client Review':'bg-purple-100 text-purple-700','NA':'bg-slate-100 text-slate-400',
  'PM Verification':'bg-amber-100 text-amber-700','Head Review':'bg-indigo-100 text-indigo-700',
  'Under Review':'bg-amber-100 text-amber-700','Rework':'bg-orange-100 text-orange-700',
  'Rejected':'bg-red-100 text-red-700','In Progress ':'bg-blue-100 text-blue-700',
  'Delayed':'bg-orange-100 text-orange-700','Terminated':'bg-red-100 text-red-700',
  'Yet to Start':'bg-slate-100 text-slate-500','Dropped':'bg-rose-100 text-rose-700',
  'Implemented':'bg-violet-600 text-white',
  'Resolved':'bg-emerald-100 text-emerald-700','Closed':'bg-slate-200 text-slate-600',
  'Pending Sign-off':'bg-amber-100 text-amber-700',
}[s] || 'bg-slate-100 text-slate-600');

export const priorityColor = (p) => ({ 'High':'text-red-600','Medium':'text-amber-600','Low':'text-emerald-600','Normal':'text-emerald-600' }[p] || 'text-slate-600');

export const Badge = ({children, cls}: any) => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls||'bg-slate-100 text-slate-600'}`}>{children}</span>;
export const Card = ({children, className, ...rest}: any) => <div className={`bg-white rounded-xl border border-slate-200 ${className||''}`} {...rest}>{children}</div>;
export const SectionTitle = ({children, sub}: any) => <div className="mb-4"><h2 className="text-xl font-semibold text-slate-800">{children}</h2>{sub && <p className="text-sm text-slate-500 mt-0.5">{sub}</p>}</div>;
export const Th = ({children}: any) => <th className="text-left px-3 py-2 font-medium text-slate-500 text-xs uppercase tracking-wide">{children}</th>;
export const Td = ({children, className}: any) => <td className={`px-3 py-2.5 text-slate-700 ${className||''}`}>{children}</td>;

/* ============================ MONOCHROME LINE ICONS ============================ */
export const ICON_PATHS = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  projects: '<path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  structure: '<rect x="9" y="3" width="6" height="4" rx="1"/><rect x="3" y="17" width="6" height="4" rx="1"/><rect x="15" y="17" width="6" height="4" rx="1"/><path d="M12 7v7"/><path d="M6 14h12"/><path d="M6 14v3"/><path d="M18 14v3"/>',
  phases: '<path d="M12 3 21 8l-9 5-9-5 9-5Z"/><path d="M3 12l9 5 9-5"/><path d="M3 16l9 5 9-5"/>',
  deliverables: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  tasks: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 12l3 3 5-5"/>',
  subtasks: '<path d="M6 4v8a3 3 0 0 0 3 3h9"/><path d="M15 12l3 3-3 3"/>',
  implementation: '<circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4V8Z"/>',
  kanban: '<rect x="3" y="4" width="4.5" height="16" rx="1"/><rect x="9.75" y="4" width="4.5" height="11" rx="1"/><rect x="16.5" y="4" width="4.5" height="14" rx="1"/>',
  gantt: '<path d="M3 6h8"/><path d="M8 12h10"/><path d="M5 18h9"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
  approvals: '<path d="M14 4l6 6L9 21H3v-6L14 4Z"/><path d="M12.5 5.5l4 4"/>',
  documents: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6M8 14h8M8 17h6"/>',
  collaboration: '<path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-5.3A8 8 0 1 1 21 12Z"/>',
  risks: '<path d="M12 4 2 20h20L12 4Z"/><path d="M12 10v4M12 17v.4"/>',
  issues: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M12 8v4M12 15v.4"/>',
  changes: '<path d="M20 11a8 8 0 0 0-14-4M4 6v4h4"/><path d="M4 13a8 8 0 0 0 14 4M20 18v-4h-4"/>',
  financials: '<circle cx="12" cy="12" r="9"/><path d="M15 9.2a3 3 0 0 0-3-1.4c-1.6 0-3 .9-3 2.1 0 2.7 6 1.3 6 4 0 1.2-1.3 2.1-3 2.1a3 3 0 0 1-3-1.4M12 6.4v11"/>',
  team: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4.5-5.8"/>',
  portal: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z"/>',
  notifications: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8Z"/><path d="M10.5 20a2 2 0 0 0 3 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.4-4.4"/>',
  reports: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M8 16v-3M12 16V9M16 16v-5"/>',
  admin: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  logo: '<path d="M12 3l8.5 4.9v8.2L12 21l-8.5-4.9V7.9L12 3Z"/><circle cx="12" cy="12" r="3.2"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  edit: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M13.5 8l3 3"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/><path d="M6 7l1 13a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8l1-13"/><path d="M10 11v6M14 11v6"/>',
  alert: '<path d="M12 4 2 20h20L12 4Z"/><path d="M12 10v4M12 17v.4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4M4 6v4h4"/><path d="M4 13a8 8 0 0 0 14 4M20 18v-4h-4"/>',
  download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  rocket: '<path d="M12 2c3 1.5 5 4.8 5 9 0 2-.5 3.7-1.3 5L12 20l-3.7-4c-.8-1.3-1.3-3-1.3-5 0-4.2 2-7.5 5-9Z"/><circle cx="12" cy="10" r="1.8"/><path d="M8 17l-2.5 2.5M16 17l2.5 2.5"/>',
  checkcircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  note: '<path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M8 12h8M8 16h5M8 8h3"/>',
  puzzle: '<path d="M9 4.5a1.8 1.8 0 0 1 3.6 0V6h2.4a1.5 1.5 0 0 1 1.5 1.5v2.4a1.8 1.8 0 1 1 0 3.6v2.4a1.5 1.5 0 0 1-1.5 1.5h-2.4a1.8 1.8 0 1 0-3.6 0H6.5A1.5 1.5 0 0 1 5 15.9v-2.4a1.8 1.8 0 0 0 0-3.6V7.5A1.5 1.5 0 0 1 6.5 6H9V4.5Z"/>',
  flame: '<path d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-3-2-4.8-3.2-7.3-.6 1.6-1.4 2.4-2.3 2.4-1.5 0-1.8-2.3-1.3-4.6-2.8 1.7-5.7 5-5.7 9.5A6.5 6.5 0 0 0 12 21Z"/>',
  sparkle: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><path d="M12 8a4 4 0 0 0 4 4 4 4 0 0 0-4 4 4 4 0 0 0-4-4 4 4 0 0 0 4-4Z"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>',
  pin: '<path d="M12 21s6-5.7 6-11a6 6 0 0 0-12 0c0 5.3 6 11 6 11Z"/><circle cx="12" cy="10" r="2.2"/>',
  filepdf: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6"/><path d="M7.5 18v-4h1.2a1.2 1.2 0 1 1 0 2.4H7.5M11.3 18v-4h1a1.4 1.4 0 0 1 0 4h-1ZM15.5 18v-4h2M15.5 16.2h1.6"/>',
  fileword: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6"/><path d="M7 14l1.2 4L9.7 14l1.5 4 1.2-4"/>',
  fileexcel: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6"/><path d="M8 14l4 4m0-4l-4 4"/>',
  fileimage: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6"/><circle cx="9.5" cy="13.5" r="1.2"/><path d="M7 18l2.8-3 2 2 2.2-2.5L17 18"/>',
  attachment: '<path d="M8 12.5l6-6a3 3 0 0 1 4.2 4.2l-8 8a5 5 0 0 1-7-7l7.5-7.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  building: '<rect x="4" y="3" width="12" height="18" rx="1"/><path d="M8 7h4M8 11h4M8 15h4"/><path d="M16 10h4v11h-4"/>',
  creditcard: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9.5h18"/><path d="M6.5 15h4"/>',
  shield: '<path d="M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6l7-3Z"/><path d="M9 12l2 2 4-4"/>',
  userplus: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M18 8v6M15 11h6"/>',
  userminus: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M15 11h6"/>',
  briefcase: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="0.6"/>',
  trend: '<path d="M4 16l5-5 4 4 7-8"/><path d="M15 6h5v5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>',
  library: '<path d="M4 4h4v16H4z"/><path d="M10 4h4v16h-4z"/><path d="M16.5 4.6 20.2 5.7 16 20l-3.7-1.1Z"/>',
  doclibrary: '<path d="M4 4h4v16H4z"/><path d="M10 4h4v16h-4z"/><path d="M16.5 4.6 20.2 5.7 16 20l-3.7-1.1Z"/>',
  monthlyplan: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/><path d="M8 15l2 2 4-4"/>',
  eye: '<path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.29 20.29 0 0 1 5.06-5.94"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.29 20.29 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/>',
};
export const Icon = ({name, className}: any) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    className={className||'w-[18px] h-[18px]'} dangerouslySetInnerHTML={{__html: ICON_PATHS[name]||''}} />
);

/* ============================ NAV STRUCTURE ============================ */
export const NAV = [
  { group:'Overview', items:[
    { id:'dashboard', label:'Dashboard' },
  ]},
  { group:'Delivery', items:[
    { id:'projects', label:'Project Master' },
    { id:'structure', label:'Project Structure' },
    { id:'phases', label:'Phase Management' },
    { id:'monthlyplan', label:'Monthly Plan' },
    { id:'deliverables', label:'Deliverables' },
    { id:'implementation', label:'Implementation Tracker' },
  ]},
  { group:'Views', items:[
    { id:'gantt', label:'Gantt Chart' },
    { id:'calendar', label:'Calendar' },
  ]},
  { group:'Workflow', items:[
    { id:'approvals', label:'Client Approval' },
    { id:'documents', label:'Document Mgmt' },
    { id:'doclibrary', label:'Document Library' },
  ]},
  { group:'Governance', items:[
    { id:'risks', label:'Risk Management' },
    { id:'issues', label:'Issue Management' },
    { id:'changes', label:'Change Requests' },
  ]},
  { group:'People & Client', items:[
    { id:'team', label:'Team Management' },
    { id:'portal', label:'Client Portal' },
  ]},
  { group:'System', items:[
    { id:'reports', label:'Reports' },
    { id:'admin', label:'Administration' },
  ]},
];

// Sidebar/route nav for a Client-type account (see deriveRole above) — deliberately just these two
// items. App.tsx (Shell) swaps to this list instead of NAV, and its route table restricts a client
// to exactly these paths, so there's no way to reach anything else by URL either.
export const CLIENT_NAV = [
  { group:'Client', items:[
    { id:'portal', label:'Client Portal' },
    { id:'structure', label:'Project Structure' },
  ]},
];


// Which capability-matrix MODULE governs each staff nav item/route — App.tsx (Shell) uses this to
// hide sidebar items and hard-gate the matching route when the signed-in account's capabilityFor()
// that module is 'None', exactly the same way the Client route table already hard-gates client
// accounts. `null` means "always visible to any active staff account" (Dashboard as the universal
// landing page, Calendar as a general scheduling view not tied to one module's data).
export const NAV_MODULE: any = {
  dashboard: null,
  projects: 'Project Master',
  structure: 'Phase Management',
  phases: 'Phase Management',
  monthlyplan: 'Phase Management',
  deliverables: 'Deliverables',
  implementation: 'Deliverables',
  gantt: 'Phase Management',
  calendar: null,
  approvals: 'Deliverables',
  documents: 'Documents',
  doclibrary: 'Documents',
  risks: 'Risk / Issue / Change',
  issues: 'Risk / Issue / Change',
  changes: 'Risk / Issue / Change',
  team: 'Team Management',
  portal: 'Client Portal',
  reports: 'Reports',
  admin: 'Administration',
};

/* ============================ MODULE SCREENS ============================ */


// Live "today" — was frozen at a fixed prototype date, now the actual current date so overdue
// flags, days-left counters and billing alerts are accurate.
export const TODAY = new Date();
export const daysLeft = (end) => Math.round((+new Date(end) - +TODAY) / 864e5);
export const remainingLabel = (end) => {
  const d = daysLeft(end);
  if (d < 0) return { txt:`${Math.abs(d)}d overdue`, cls:'text-red-600' };
  const months = Math.floor(d/30);
  return { txt:`${d}d${months>0?` (~${months}mo)`:''} left`, cls: d<=30?'text-amber-600':'text-slate-700' };
};
export const payColor = (s) => ({ 'Received':'bg-emerald-100 text-emerald-700','Pending':'bg-amber-100 text-amber-700','Delayed':'bg-red-100 text-red-700','On Hold':'bg-orange-100 text-orange-700' }[s] || 'bg-slate-100 text-slate-600');

// A project's end date has passed but it's still marked In Progress and no extension has been recorded yet.
export const isProjectOverdue = (p) => daysLeft(p.end) < 0;
export const needsExtension = (p) => isProjectOverdue(p) && p.status==='In Progress' && !p.extension;
// Billing due within the next 7 days (or already overdue) — needs a highlight/alert.
export const billingDueSoon = (p) => p.billingDueDate && daysLeft(p.billingDueDate) <= 7;

// Deterministic, rule-based "AI Insights" generator — reads the same live tree/governance/team
// data used across the Dashboard and Reports, and turns it into a short prioritized list of
// observations. No external AI call is made here (this prototype has no backend); it's presented
// as "AI Insights" but is really a computed rules engine over live data, kept intentionally
// transparent in comments for future maintainers.
export const computeInsights = ({ tree, risks, issues, changes, projects, team }: any) => {
  const insights = [];
  const allEntries = [];
  (projects||[]).forEach(p=>{
    (tree[p.id]||[]).forEach(ph=>{
      ph.milestones.forEach(ms=>{
        allEntries.push({ item:ms, project:p.name });
        (ms.subtasks||[]).forEach(s=> allEntries.push({ item:s, project:p.name }));
      });
    });
  });

  const overdue = allEntries.filter(e=>isOverdue(e.item));
  if (overdue.length) {
    const byProj: any = {};
    overdue.forEach(e=>{ byProj[e.project]=(byProj[e.project]||0)+1; });
    const worst = Object.entries(byProj).sort((a:any,b:any)=>b[1]-a[1])[0];
    insights.push({ icon:'alert', tone:'rose', text:`${overdue.length} deliverable${overdue.length===1?'':'s'} overdue across ${Object.keys(byProj).length} project(s) — ${worst[0]} has the most (${worst[1]}). Prioritize follow-up there first.` });
  }
  const clientPending = allEntries.filter(e=>e.item.review==='Implemented Review' && e.item.headApprovedImpl && !e.item.clientApprovedImpl);
  if (clientPending.length) {
    insights.push({ icon:'approvals', tone:'violet', text:`${clientPending.length} item(s) are sitting in Client Portal awaiting client sign-off. Consider a nudge to client owners on the older ones.` });
  }
  const overloadedMembers = (team||[]).filter(m=>m.util>90);
  if (overloadedMembers.length) {
    insights.push({ icon:'flame', tone:'amber', text:`${overloadedMembers.length} consultant(s) are above 90% utilization (${overloadedMembers.map(m=>m.name).join(', ')}). Consider rebalancing upcoming assignments.` });
  }
  const highRisks = risks.filter(r=>(r.status==='Open'||r.status==='In Progress') && r.impact==='High');
  if (highRisks.length) {
    insights.push({ icon:'alert', tone:'red', text:`${highRisks.length} open risk(s) flagged High impact. Recommend reviewing these in the next steering call.` });
  }
  const openIssues = issues.filter(i=>i.status==='Open'||i.status==='In Progress');
  if (openIssues.length > 1) {
    insights.push({ icon:'puzzle', tone:'orange', text:`${openIssues.length} issues remain open across all projects. Worth a dedicated triage session to prevent pile-up.` });
  }
  const pendingChanges = changes.filter(c=>c.status==='Pending');
  if (pendingChanges.length) {
    insights.push({ icon:'note', tone:'blue', text:`${pendingChanges.length} change request(s) awaiting a decision. Unresolved change requests tend to stall billing and scope conversations.` });
  }
  const extNeeded = (projects||[]).filter(needsExtension);
  if (extNeeded.length) {
    insights.push({ icon:'calendar', tone:'orange', text:`${extNeeded.length} project(s) have passed their end date, still marked In Progress, with no extension on file: ${extNeeded.map(p=>p.name).join(', ')}.` });
  }
  const dueSoon = (projects||[]).filter(billingDueSoon);
  if (dueSoon.length) {
    insights.push({ icon:'financials', tone:'emerald', text:`${dueSoon.length} project(s) have a billing due date within 7 days — confirm invoices are prepared.` });
  }
  if (!insights.length) {
    insights.push({ icon:'checkcircle', tone:'emerald', text:'No urgent flags right now — all tracked deliverables, risks and billings are within healthy thresholds.' });
  }
  return insights;
};

// Pastel icon badge per notification type, shown in the Dashboard's Project Activity feed.
export const NOTIF_TONE = {
  'Milestone Completed':        { icon:'phases',       bg:'bg-emerald-50', text:'text-emerald-500' },
  'Sub Task Completed':         { icon:'checkcircle',  bg:'bg-emerald-50', text:'text-emerald-500' },
  'Pending Review':             { icon:'clock',         bg:'bg-amber-50',   text:'text-amber-500'   },
  'Risk Support Assigned':      { icon:'userplus',      bg:'bg-amber-50',   text:'text-amber-500'   },
  'Issue Raised':                { icon:'issues',        bg:'bg-red-50',     text:'text-red-500'     },
  'Issue Assigned':              { icon:'userplus',      bg:'bg-blue-50',    text:'text-blue-500'    },
  'Issue Tagged':                { icon:'userplus',      bg:'bg-blue-50',    text:'text-blue-500'    },
  'Issue Pending Sign-off':      { icon:'clock',         bg:'bg-amber-50',   text:'text-amber-500'   },
  'Issue Resolved':              { icon:'checkcircle',   bg:'bg-emerald-50', text:'text-emerald-500' },
  'Issue Closed':                { icon:'checkcircle',   bg:'bg-emerald-50', text:'text-emerald-500' },
  'Phase Completed':            { icon:'checkcircle',  bg:'bg-emerald-50', text:'text-emerald-500' },
  'Calendar Reminder':          { icon:'calendar',     bg:'bg-blue-50',    text:'text-blue-500'    },
  'Calendar Cancelled':         { icon:'ban',           bg:'bg-red-50',     text:'text-red-500'     },
  'Implemented':                { icon:'rocket',        bg:'bg-violet-50',  text:'text-violet-500'  },
  'Client Requested Changes':   { icon:'refresh',       bg:'bg-amber-50',   text:'text-amber-500'   },
  'Client Remark':              { icon:'note',          bg:'bg-blue-50',    text:'text-blue-500'    },
  'User Signup Pending Approval': { icon:'userplus',    bg:'bg-amber-50',   text:'text-amber-500'   },
  'Billing Due Soon':           { icon:'financials',    bg:'bg-amber-50',   text:'text-amber-500'   },
  default:                      { icon:'notifications', bg:'bg-slate-100',  text:'text-slate-400'   },
};

// Shared notification row list — used by both the Dashboard's "Project Activity" panel and the
// header bell dropdown, so the two never drift out of sync.
export const NotificationFeedList = ({ notifications, emptyText }: any) => {
  if (!notifications || notifications.length===0) {
    return <div className="text-sm text-slate-400">{emptyText || 'No activity yet.'}</div>;
  }
  return (
    <div className="space-y-1.5">
      {notifications.map(n=>{ const nt = NOTIF_TONE[n.type] || NOTIF_TONE.default; return (
        <div key={n.id} className="flex items-start justify-between gap-2 text-sm bg-white border border-slate-100 rounded-lg px-3 py-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${nt.bg}`}><Icon name={nt.icon} className={`w-3.5 h-3.5 ${nt.text}`}/></span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-700 truncate">{n.type||'Update'}</span>
                {n.project && <span className="text-xs text-slate-400 truncate">· {n.project}</span>}
                {n.priority==='high' && <Badge cls="bg-red-100 text-red-700">high</Badge>}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{n.message}</div>
            </div>
          </div>
          <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">{n.when}</span>
        </div>
      );})}
    </div>
  );
};

// Header bell — clicking it now opens a live dropdown of the same shared notifications feed,
// instead of just deep-linking to the Dashboard. Closes on outside click.
export function NotificationBell(){
  const { notifications } = React.useContext(PhaseDataContext);
  const { email } = React.useContext(CurrentUserContext);
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const ref = React.useRef(null);

  // Per-user (not per-tab) via localStorage, keyed by email -- so the red badge stays cleared across
  // reloads and sign-ins once you've opened the bell, not just for the current session.
  const storageKey = `rosbinTrace.notifRead.v1.${(email || '').toLowerCase()}`;
  React.useEffect(() => {
    try {
      const raw = typeof localStorage !== 'undefined' && localStorage.getItem(storageKey);
      setReadIds(raw ? new Set(JSON.parse(raw)) : new Set());
    } catch (e) { setReadIds(new Set()); }
  }, [storageKey]);

  const unreadCount = notifications.filter((n: any) => !readIds.has(n.id)).length;

  // Opening the bell means "I've seen everything currently in this list" -- mark every notification
  // loaded right now as read and persist it, so the badge disappears immediately and stays gone
  // (a notification that arrives AFTER this point still shows up as unread, as expected).
  const markAllRead = () => {
    if (notifications.length === 0) return;
    const next = new Set(readIds);
    notifications.forEach((n: any) => next.add(n.id));
    setReadIds(next);
    try { typeof localStorage !== 'undefined' && localStorage.setItem(storageKey, JSON.stringify([...next])); } catch (e) {}
  };

  const toggleOpen = () => {
    setOpen((o) => {
      const next = !o;
      if (next) markAllRead();
      return next;
    });
  };

  React.useEffect(() => {
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);
  return (
    <div className="relative w-8 h-8 flex items-center justify-center" ref={ref}>
      <button onClick={toggleOpen} title="Notifications" className="relative text-slate-400 hover:text-slate-600">
        <Icon name="notifications" className="w-[18px] h-[18px]"/>
        {unreadCount>0 && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center">{unreadCount}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-3">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="font-semibold text-slate-800 text-sm">Notifications</span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <NotificationFeedList notifications={notifications} emptyText="No notifications yet — approvals, completions and calendar reminders will show up here."/>
          </div>
        </div>
      )}
    </div>
  );
}

// Pastel badge palette shared by every "AI Insights" render site (Dashboard + Reports) — soft
// tinted circle behind an abstract line icon, instead of a colored emoji glyph.
export const INSIGHT_TONES = {
  rose:    { bg:'bg-rose-50',    ring:'ring-rose-100',    icon:'text-rose-500'    },
  violet:  { bg:'bg-violet-50',  ring:'ring-violet-100',  icon:'text-violet-500'  },
  amber:   { bg:'bg-amber-50',   ring:'ring-amber-100',   icon:'text-amber-500'   },
  red:     { bg:'bg-red-50',     ring:'ring-red-100',     icon:'text-red-500'     },
  orange:  { bg:'bg-orange-50',  ring:'ring-orange-100',  icon:'text-orange-500'  },
  blue:    { bg:'bg-blue-50',    ring:'ring-blue-100',    icon:'text-blue-500'    },
  emerald: { bg:'bg-emerald-50', ring:'ring-emerald-100', icon:'text-emerald-500' },
};
// Shared "AI Insights" card body — used by both Dashboard and Reports so the two stay visually identical.
export const AIInsightsList = ({insights}: any) => (
  <div className="space-y-2">
    {insights.map((ins,i)=>{
      const t = INSIGHT_TONES[ins.tone] || INSIGHT_TONES.blue;
      return (
        <div key={i} className="flex items-start gap-3 text-sm bg-white rounded-lg px-3 py-2.5 border border-slate-100">
          <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${t.bg} ring-1 ${t.ring}`}>
            <Icon name={ins.icon} className={`w-4 h-4 ${t.icon}`}/>
          </span>
          <span className="text-slate-600 pt-0.5">{ins.text}</span>
        </div>
      );
    })}
  </div>
);

// Field helpers for the Project Master form, defined ONCE at module scope (not inside ProjectMaster's
// render body). Defining them inline per-render used to hand each one a fresh function identity every
// keystroke, which made React unmount+remount the underlying <input> and drop focus after every
// character — most visible on Monthly Fee. Taking value/canEdit/onChange as props instead of closing
// over component state keeps their identity stable across renders, so focus is preserved while typing.
export const fieldCls = (canEdit) => `w-full border rounded-lg px-2 py-1.5 text-sm ${canEdit?'border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500':'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'}`;
export const TextF = ({label, value, canEdit, onChange, wide}: any) => (
  <div className={wide?'col-span-2':''}>
    <label className="text-xs text-slate-400 block mb-1">{label}</label>
    <input value={value??''} disabled={!canEdit} onChange={e=>onChange(e.target.value)} className={fieldCls(canEdit)} />
  </div>
);
// Free-text numeric entry (no spinner buttons) — lets the user backspace/select-all/retype freely.
export const NumF = ({label, value, canEdit, onChange}: any) => (
  <div>
    <label className="text-xs text-slate-400 block mb-1">{label}</label>
    <input type="text" inputMode="numeric" pattern="[0-9]*" value={value===''||value==null?'':String(value)} disabled={!canEdit}
      onChange={e=>{ const digits = e.target.value.replace(/[^0-9]/g,''); onChange(digits===''?'':Number(digits)); }}
      className={fieldCls(canEdit)} />
  </div>
);
export const DateF = ({label, value, canEdit, onChange}: any) => (
  <div>
    <label className="text-xs text-slate-400 block mb-1">{label}</label>
    <input type="date" value={value??''} disabled={!canEdit} onChange={e=>onChange(e.target.value)} className={fieldCls(canEdit)} />
  </div>
);
export const SelF = ({label, value, canEdit, onChange, opts}: any) => (
  <div>
    <label className="text-xs text-slate-400 block mb-1">{label}</label>
    <select value={value} disabled={!canEdit} onChange={e=>onChange(e.target.value)} className={fieldCls(canEdit)}>
      {opts.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);
export const PeopleF = ({label, value, canEdit, onChange, people}: any) => (
  <div>
    <label className="text-xs text-slate-400 block mb-1">{label}</label>
    <select value={value??''} disabled={!canEdit} onChange={e=>onChange(e.target.value)} className={fieldCls(canEdit)}>
      <option value="">— Select —</option>
      {people.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);
// Category tier select (code + label, e.g. A = Premium) — the tier list itself is org-wide master
// data managed from Administration -> Project Settings.
export const TierF = ({label, value, canEdit, onChange, tiers}: any) => (
  <div>
    <label className="text-xs text-slate-400 block mb-1">{label}</label>
    <select value={value??''} disabled={!canEdit} onChange={e=>onChange(e.target.value)} className={fieldCls(canEdit)}>
      <option value="">— Select —</option>
      {tiers.map(t=><option key={t.code} value={t.code}>{t.code} — {t.label}</option>)}
    </select>
  </div>
);
// Industry select with an inline "+ Add new industry…" affordance. A newly typed industry is pushed
// into the shared settings list (case-insensitive de-dup) so it's immediately available everywhere.
export const IndustryF = ({label, value, canEdit, onChange, industries, onAddIndustry}: any) => {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const commit = () => {
    const v = draft.trim();
    if(!v){ setAdding(false); return; }
    onAddIndustry(v);
    onChange(v);
    setDraft(''); setAdding(false);
  };
  if (adding) {
    return (
      <div>
        <label className="text-xs text-slate-400 block mb-1">{label}</label>
        <div className="flex items-center gap-1">
          <input autoFocus value={draft} onChange={e=>setDraft(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); commit(); } if(e.key==='Escape'){ setAdding(false); setDraft(''); } }}
            placeholder="New industry name" className="flex-1 border border-brand-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <button onClick={commit} className="text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-2 py-1.5 whitespace-nowrap">Add</button>
          <button onClick={()=>{setAdding(false);setDraft('');}} className="text-slate-400 hover:text-slate-600 px-1">✕</button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1">{label}</label>
      <select value={value??''} disabled={!canEdit}
        onChange={e=>{ if(e.target.value==='__add__'){ setAdding(true); } else { onChange(e.target.value); } }}
        className={fieldCls(canEdit)}>
        <option value="">— Select —</option>
        {industries.map(i=><option key={i} value={i}>{i}</option>)}
        {canEdit && <option value="__add__">+ Add new industry…</option>}
      </select>
    </div>
  );
};
// Read-only, system-generated field — no manual entry. Status/Payment/Completion/Visits live here.
export const ReadF = ({label, children}: any) => (
  <div>
    <label className="text-xs text-slate-400 block mb-1">{label}</label>
    <div className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-slate-100 text-slate-600">{children}</div>
  </div>
);


export const toRoman = (n) => { const map: any = [[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]; let r='',x=n; for(const [v,s] of map){ while(x>=v){ r+=s; x-=v; } } return r; };

export const addDays = (iso, n) => { const d=new Date(iso); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
export const daysBetween = (a, b) => (a && b) ? Math.max(0, Math.round((+new Date(b) - +new Date(a))/864e5)) : null;

export const HEAD_DECISIONS = ['Approved','Rework','Rejected'];             // reviewer's final call (PM for sub tasks, Head for milestones)
export const DOC_ACCEPT = '.xls,.xlsx,.pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png';
export const docIcon = (n) => {
  const e=(n.split('.').pop()||'').toLowerCase();
  if(['xls','xlsx','csv'].includes(e)) return 'fileexcel';
  if(e==='pdf') return 'filepdf';
  if(['doc','docx'].includes(e)) return 'fileword';
  if(['ppt','pptx'].includes(e)) return 'fileword';
  if(['jpg','jpeg','png','gif'].includes(e)) return 'fileimage';
  return 'attachment';
};
// Soft pastel tint per file type so the abstract line-icon still gives an at-a-glance category cue.
export const docIconTone = (n) => {
  const e=(n.split('.').pop()||'').toLowerCase();
  if(['xls','xlsx','csv'].includes(e)) return 'text-emerald-500';
  if(e==='pdf') return 'text-rose-500';
  if(['doc','docx'].includes(e)) return 'text-blue-500';
  if(['ppt','pptx'].includes(e)) return 'text-amber-500';
  if(['jpg','jpeg','png','gif'].includes(e)) return 'text-violet-500';
  return 'text-slate-400';
};

// A fresh item (milestone or sub task) always starts here.
export const newItem = (name) => ({
  id:uid('IT'), name, assignees:[], deadline:'', actualDate:'', status:'Not Started', review:'',
  approved:false, docs:[], headApprovedImpl:false, clientApprovedImpl:false, clientAcceptedDate:'',
  implChain:[], implApprovals:[], // {level} pending chain / {level,by,at} history for the Implemented escalation
  remarks:[], // {id, text, by, at} -- a running comment log, added from the sub task detail modal
});

// Anyone can mark an item Completed — but who does the marking decides whether it still needs a
// review step. Sub Tasks finalize immediately for anyone at L2 or more senior (L1); Milestones &
// Phases finalize immediately only for L1 (see actorQualifies above). Below that, it queues for
// review by whoever holds the project's actual approver level for that kind (approverLevelFor above
// — the target level if it's on this project's team, else the next more senior level that is).
//  - marker qualifies (actorQualifies)     -> finalizes immediately: approved:true, actualDate stamped
//  - marker doesn't qualify                -> queued for review ('Pending Review')
//  - reviewer approves                     -> approved:true, actualDate stamped (today)
//  - reviewer sends back                   -> reopens as "In Progress"
//  - any other status (Not Started / In Progress / On Hold) applies immediately, no approval needed
export const applyStatus = (item, val, kind: 'subtask'|'milestone'|'phase', actorLevel: string) => {
  if(val==='Completed'){
    if(actorLevel && actorQualifies(kind, actorLevel)) return {...item, status:'Completed', review:'', approved:true, actualDate:item.actualDate||TODAY_ISO};
    // reviewSince stamps the day it first queued for review, so the Dashboard's approval-bottleneck
    // panel can show a real "days pending" instead of guessing from the deadline.
    return {...item, status:'Completed', review:'Pending Review', reviewSince: item.reviewSince||TODAY_ISO};
  }
  return {...item, status:val, review:'', approved:false, actualDate:'', reviewSince:''};
};
export const isApproved = (item) => !!item.approved;
export const isOverdue = (item) => item.deadline && item.deadline < TODAY_ISO && !isApproved(item);
// The authoritative "done" date for an item — client acceptance (Implemented) supersedes the plain
// Completed-approval date, since phase duration is timestamped against client-accepted milestones.
export const itemDoneDate = (item) => item.clientAcceptedDate || item.actualDate || '';

// ---- phase-level derivation: status, actual completion date and duration are all computed, never
// picked from a dropdown — a phase shows "In Progress" the moment any milestone has started, and
// only becomes "Completed" once the Project Head explicitly confirms it (see confirmPhaseComplete). ----
export const subtasksReady = (ms) => !(ms.subtasks && ms.subtasks.length) || ms.subtasks.every(isApproved);
export const phaseMilestonesReady = (ph) => ph.milestones.length>0 && ph.milestones.every(isApproved);
export const phaseActualEnd = (ph) => {
  const dates = ph.milestones.map(itemDoneDate).filter(Boolean);
  return dates.length ? dates.slice().sort().slice(-1)[0] : '';
};
export const derivedPhaseStatus = (ph) => {
  if(ph.onHold) return 'On Hold';
  if(ph.headConfirmedComplete) return 'Completed';
  const anyStarted = ph.milestones.some(m => m.status!=='Not Started' || isApproved(m));
  return anyStarted ? 'In Progress' : 'Not Started';
};
// Same idea one level down: a milestone reads as "In Progress" the moment it has sub tasks and any
// one of them is actively In Progress, even if the milestone's own stored status is still "Not
// Started" (nobody remembered to flip it manually). This only affects the DISPLAYED badge — the
// stored ms.status is untouched, so the editable status dropdown (StatusControl in Phases.tsx)
// still reflects and edits the real value; only read-only badges show the derived one.
export const derivedMilestoneStatus = (ms) => {
  if (isApproved(ms)) return 'Completed';
  if ((ms.subtasks||[]).length>0 && ms.subtasks.some(s=>s.status==='In Progress')) return 'In Progress';
  return ms.status;
};
export const phaseDurationDays = (ph) => {
  const end = phaseActualEnd(ph);
  if(!ph.start || !end) return null;
  return Math.max(0, Math.round((+new Date(end)-+new Date(ph.start))/864e5));
};

// ---- shared, pure tree-mutation helpers (module scope so Phase Management AND the Client Portal
// mutate the exact same shape of data — approving something in one place is what the other reads) ----
export const mutatePhase = (tree, projId, phId, fn) => ({
  ...tree, [projId]: (tree[projId]||[]).map(ph => ph.id===phId ? fn({...ph}) : ph),
});
export const mutateMs = (tree, projId, phId, msId, fn) => mutatePhase(tree, projId, phId, ph => ({...ph, milestones: ph.milestones.map(m => m.id===msId ? fn({...m}) : m)}));
export const mutateSt = (tree, projId, phId, msId, stId, fn) => mutateMs(tree, projId, phId, msId, m => ({...m, subtasks:(m.subtasks||[]).map(s => s.id===stId ? fn({...s}) : s)}));

/* ---- small reusable pieces shared by Milestone rows & Sub Task rows ---- */
// Pastel accent per hierarchy level so Phases / Milestones / Sub Tasks are easy to tell apart at a glance.
export const LEVEL = {
  phase:     { border:'border-l-sky-300',    ring:'border-sky-200',   chip:'bg-sky-100 text-sky-700',     chipX:'text-sky-400 hover:text-sky-600',     text:'text-sky-600',   link:'text-sky-600 hover:text-sky-700',     solid:'bg-sky-400 hover:bg-sky-500',     badge:'bg-sky-100 text-sky-700',     focus:'focus:border-sky-400',   tint:'bg-sky-50/50',   head:'text-sky-400' },
  milestone: { border:'border-amber-200',    ring:'border-amber-200', chip:'bg-amber-100 text-amber-700', chipX:'text-amber-400 hover:text-amber-600', text:'text-amber-600', link:'text-amber-600 hover:text-amber-700', solid:'bg-amber-400 hover:bg-amber-500', badge:'bg-amber-100 text-amber-700', focus:'focus:border-amber-400', tint:'bg-amber-50/50', head:'text-amber-400' },
  subtask:   { border:'border-blue-200',     ring:'border-blue-200',  chip:'bg-blue-100 text-blue-700',   chipX:'text-blue-400 hover:text-blue-600',   text:'text-blue-600',  link:'text-blue-600 hover:text-blue-700',   solid:'bg-blue-400 hover:bg-blue-500',   badge:'bg-blue-100 text-blue-700',   focus:'focus:border-blue-400',  tint:'bg-blue-50/40',  head:'text-blue-400' },
};
export function AssigneeChips({assignees, roster, onAdd, onRemove, disabled, accent}: any){
  const a = accent || LEVEL.milestone;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {(assignees||[]).map(m=>(
        <span key={m} className={`inline-flex items-center gap-1 ${a.chip} rounded-full px-2 py-0.5 text-[11px]`}>
          {m}{!disabled && <button onClick={()=>onRemove(m)} className={a.chipX}>×</button>}
        </span>
      ))}
      {!disabled && (
        <select className={`border border-slate-200 rounded px-1 py-0.5 text-[11px] focus:outline-none ${a.focus}`} value="" onChange={e=>{ if(e.target.value) onAdd(e.target.value); }}>
          <option value="">+ Tag team mate…</option>
          {roster.filter(r=>!(assignees||[]).includes(r.name)).map(r=><option key={r.name} value={r.name}>{r.name} · {r.label}</option>)}
        </select>
      )}
      {(!assignees||assignees.length===0) && disabled && <span className="text-[11px] text-slate-300">Unassigned</span>}
    </div>
  );
}
// `docs` entries carry a real Supabase Storage path (see db.uploadPhaseDoc) once uploaded through
// this component -- d.path present means the filename is clickable and calls onDownload(d). Older
// entries from before real uploads existed only ever had {n: filename} with no path; those still
// render (so nothing already saved disappears) but aren't clickable, since there's no real file
// behind them to fetch.
export function DocsChips({docs, onAttach, onRemove, onDownload, disabled, downloadingId}: any){
  return (
    <div className="flex flex-wrap gap-1 max-w-[170px]">
      {(docs||[]).map((d,i)=>(
        <span key={d.id||i} className="inline-flex items-center gap-1 bg-slate-100 rounded px-1 py-0.5 text-[10px]">
          <Icon name={downloadingId===(d.id||i) ? 'refresh' : docIcon(d.n)} className={`w-3 h-3 shrink-0 ${downloadingId===(d.id||i) ? 'text-brand-500' : docIconTone(d.n)}`}/>
          {d.path && onDownload ? (
            <button type="button" onClick={()=>onDownload(d)} className="truncate max-w-[70px] hover:underline hover:text-brand-700 text-left" title="Download">{d.n}</button>
          ) : (
            <span className="truncate max-w-[70px]" title={d.path ? d.n : `${d.n} — no file on record`}>{d.n}</span>
          )}
          {!disabled && <button onClick={()=>onRemove(i)} className="text-red-400">×</button>}
        </span>
      ))}
      {!disabled && (
        <label className="cursor-pointer text-brand-600 hover:text-brand-700 text-[10px] border border-dashed border-brand-300 rounded px-1 py-0.5">+ Attach
          <input type="file" multiple accept={DOC_ACCEPT} className="hidden" onChange={e=>{onAttach(e.target.files); e.target.value='';}}/>
        </label>
      )}
    </div>
  );
}
// A single decision control shared by the two single-stage approvals (up to L2 finalizes Sub Tasks,
// L1 finalizes Milestones & Phases — see approverLevelFor/actorQualifies above) plus the multi-stage
// "Implemented" escalation (every project-team level more senior than whoever pushed it, walked one
// at a time up to L1, then the Client Owner signs off in the Client Portal). `actorLevel` is null for
// a read-only viewer (e.g. a Guest teammate) — every interactive branch below requires a real level
// match, so passing null just renders the status badge with no controls.
export function ApprovalFlow({item, actorLevel, kind, project, admin, onDecide, onMarkImplemented, onChainApprove, onCancelImpl}: any){
  const approverLevel = approverLevelFor(kind, project);
  const approverDesignation = admin ? designationForLevel(approverLevel, admin) : '';
  const approverLabel = approverDesignation ? `${approverLevel} · ${approverDesignation}` : approverLevel;
  const locked = isApproved(item);
  const pendingReview = item.review && item.review!=='Implemented Review';
  const chain = item.implChain || [];
  const nextChainLevel = chain[0];
  const nextChainDesignation = admin && nextChainLevel ? designationForLevel(nextChainLevel, admin) : '';
  const nextChainLabel = nextChainLevel ? (nextChainDesignation ? `${nextChainLevel} · ${nextChainDesignation}` : nextChainLevel) : '';
  return (
    <div className="flex flex-row flex-wrap items-center gap-1">
      {item.review==='Implemented Review'
        ? <Badge cls={statusColor(item.headApprovedImpl ? 'Client Review' : 'Head Review')}>{item.headApprovedImpl ? 'Awaiting Client' : `Pending ${nextChainLabel} approval`}</Badge>
        : pendingReview ? <Badge cls={statusColor('Head Review')}>{`Pending ${approverLabel} approval`}</Badge>
        : item.status==='Implemented' ? <Badge cls={statusColor('Implemented')}><span className="inline-flex items-center gap-1"><Icon name="rocket" className="w-3 h-3"/> Implemented</span></Badge>
        : locked ? <Badge cls={statusColor('Approved')}>✓ Approved</Badge>
        : <span className="text-[11px] text-slate-300">—</span>}

      {pendingReview && actorLevel===approverLevel && (
        <select className="border border-slate-200 rounded px-1 py-0.5 text-[11px] focus:outline-none" defaultValue="" onChange={e=>{ if(e.target.value){ onDecide(e.target.value); e.target.value=''; } }}>
          <option value="">Decision…</option>
          {HEAD_DECISIONS.map(o=><option key={o}>{o}</option>)}
        </select>
      )}

      {item.review==='Implemented Review' && !item.headApprovedImpl && nextChainLevel && actorLevel===nextChainLevel && (
        <div className="flex gap-1">
          <button onClick={onChainApprove} className="bg-indigo-500 text-white rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap">Approve{chain.length>1?` (${chain.length-1} more)`:' → Client'}</button>
          <button onClick={onCancelImpl} className="bg-orange-400 text-white rounded px-1.5 py-0.5 text-[10px]">Cancel</button>
        </div>
      )}
      {item.review==='Implemented Review' && item.headApprovedImpl && (
        <div className="text-[10px] text-violet-600 max-w-[130px] leading-tight">Awaiting Client Owner sign-off in the Client Portal.</div>
      )}

      {locked && !item.review && item.status!=='Implemented' && actorLevel && actorQualifies(kind, actorLevel) && (
        <button onClick={onMarkImplemented} className="bg-violet-500 hover:bg-violet-600 text-white rounded px-1.5 py-0.5 text-[10px] whitespace-nowrap inline-flex items-center gap-1"><Icon name="rocket" className="w-3 h-3"/> Mark Implemented</button>
      )}
    </div>
  );
}


export const gInp = "border border-slate-200 rounded px-1.5 py-1 text-xs w-full focus:outline-none focus:border-brand-400";
export const RAG = ['Low','Medium','High'];


export const REPORT_CATALOG: any = {
  'Executive Reports': [
    { key:'portfolio', label:'Project Portfolio Summary' },
    { key:'revenue', label:'Revenue vs Delivery' },
    { key:'riskdash', label:'Risk Dashboard' },
    { key:'margin', label:'Margin Analysis' },
    { key:'billingsummary', label:'Billing & Payment Status' },
  ],
  'Project Reports': [
    { key:'phasecompletion', label:'Phase Completion' },
    { key:'deliverablestatus', label:'Deliverable Status' },
    { key:'overdue', label:'Overdue Activities' },
    { key:'pendingapprovals', label:'Pending Approvals' },
    { key:'deliverablebudget', label:'Deliverable Budget & Hours' },
    { key:'timeline', label:'Project Timeline (Days Remaining)' },
  ],
  'Team Reports': [
    { key:'utilization', label:'Consultant Utilization' },
    { key:'deptperf', label:'Department Performance' },
    { key:'availability', label:'Resource Availability' },
    { key:'roleworkload', label:'Workload by Role' },
    { key:'capacityforecast', label:'Capacity Headroom Forecast' },
  ],
  'Client Reports': [
    { key:'clientpending', label:'Pending Deliverables' },
    { key:'approvaltracker', label:'Approval Tracker' },
    { key:'clientbilling', label:'Client Billing Summary' },
    { key:'clientrisk', label:'Client Risk & Health' },
    { key:'clientengagement', label:'Client Engagement Footprint' },
  ],
};

