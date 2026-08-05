import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import * as S from './shared';
import * as db from './db';
import { supabase } from './supabaseClient';
import Login from './Login';
import SuperAdminPanel from './screens/SuperAdminPanel';

import Dashboard from './screens/Dashboard';
import ProjectMaster from './screens/ProjectMaster';
import ProjectStructure from './screens/ProjectStructure';
import Phases from './screens/Phases';
import Deliverables from './screens/Deliverables';
import Implementation from './screens/Implementation';
import Gantt from './screens/Gantt';
import CalendarScreen from './screens/Calendar';
import Approvals from './screens/Approvals';
import Documents from './screens/Documents';
import DocumentLibrary from './screens/DocumentLibrary';
import Risks from './screens/Risks';
import Issues from './screens/Issues';
import Changes from './screens/Changes';
import Team from './screens/Team';
import Portal from './screens/Portal';
import Reports from './screens/Reports';
import Administration from './screens/Administration';

const THEME_STORAGE_KEY = 'rosbinTrace.theme.v1';
const loadTheme = (): 'light' | 'dark' => {
  try {
    const t = typeof localStorage !== 'undefined' && localStorage.getItem(THEME_STORAGE_KEY);
    return t === 'dark' ? 'dark' : 'light';
  } catch (e) {
    return 'light';
  }
};

function Shell({ email, myProfile, onSignOut }: { email: string; myProfile: any; onSignOut: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const { role } = React.useContext(S.RoleContext);
  const [theme, setTheme] = useState<'light' | 'dark'>(loadTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as any)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);
  const displayName = myProfile?.name || email;
  const initials = displayName.split(/\s+/).map((x:string)=>x[0]).filter(Boolean).slice(0,2).join('').toUpperCase() || 'U';
  React.useEffect(() => {
    try {
      typeof localStorage !== 'undefined' && localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (e) {}
  }, [theme]);

  const location = useLocation();
  const active = location.pathname.split('/')[1] || 'dashboard';
  const activeLabel = S.NAV.flatMap((g: any) => g.items).find((i: any) => i.id === active)?.label;

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="flex h-screen overflow-hidden bg-slate-100">
        {/* Sidebar */}
        <aside className={`bg-white border-r border-slate-200 flex flex-col transition-all ${collapsed ? 'w-16' : 'w-60'}`}>
          <div className="h-14 flex items-center px-4 border-b border-slate-100 gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center">
              <S.Icon name="logo" className="w-5 h-5" />
            </div>
            {!collapsed && (
              <div>
                <div className="font-semibold text-slate-800 text-sm leading-tight">Trace PMT</div>
                <div className="text-[10px] text-slate-400 leading-tight">Powered By Rosbin Labs</div>
              </div>
            )}
          </div>
          <nav className="flex-1 overflow-y-auto nav-scroll py-2">
            {S.NAV.map((group: any) => (
              <div key={group.group} className="mb-1">
                {!collapsed && (
                  <div className="px-4 pt-2 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    {group.group}
                  </div>
                )}
                {group.items.map((item: any) => (
                  <NavLink
                    key={item.id}
                    to={`/${item.id}`}
                    title={item.label}
                    className={({ isActive }) =>
                      `w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                        isActive
                          ? 'bg-brand-50 text-brand-700 border-r-2 border-brand-500 font-medium'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`
                    }
                  >
                    <S.Icon name={item.id} className="w-[18px] h-[18px] shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        {/* Main */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-5">
            <div className="flex items-center gap-3">
              <button onClick={() => setCollapsed(!collapsed)} className="text-slate-400 hover:text-slate-600">
                <S.Icon name="menu" className="w-5 h-5" />
              </button>
              <div className="text-sm text-slate-400">
                Trace PMT <span className="mx-1">/</span> <span className="text-slate-700 font-medium">{activeLabel}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                className="text-slate-400 hover:text-slate-600"
              >
                <S.Icon name={theme === 'dark' ? 'sun' : 'moon'} className="w-[18px] h-[18px]" />
              </button>
              <S.NotificationBell />
              <div className="relative" ref={menuRef}>
                <button onClick={()=>setMenuOpen(o=>!o)} className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold shrink-0">{initials}</div>
                  <span className="hidden sm:block text-left leading-tight">
                    <span className="block text-xs font-medium text-slate-700 truncate max-w-[140px]">{displayName}</span>
                    <span className="block text-[10px] text-slate-400">{S.ROLE_LABELS[role]||role}</span>
                  </span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-2">
                    <div className="px-2 py-1.5 mb-1 border-b border-slate-100">
                      <div className="text-sm font-medium text-slate-800 truncate">{displayName}</div>
                      <div className="text-xs text-slate-400 truncate">{email}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{myProfile?.designation||'—'} · {S.ROLE_LABELS[role]||role}</div>
                    </div>
                    <button onClick={onSignOut} className="w-full text-left text-sm text-red-600 hover:bg-red-50 rounded-lg px-2 py-1.5">Sign Out</button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-5 bg-slate-100">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/projects" element={<ProjectMaster />} />
              <Route path="/structure" element={<ProjectStructure />} />
              <Route path="/phases" element={<Phases />} />
              <Route path="/deliverables" element={<Deliverables />} />
              <Route path="/implementation" element={<Implementation />} />
              <Route path="/gantt" element={<Gantt />} />
              <Route path="/calendar" element={<CalendarScreen />} />
              <Route path="/approvals" element={<Approvals />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/doclibrary" element={<DocumentLibrary />} />
              <Route path="/risks" element={<Risks />} />
              <Route path="/issues" element={<Issues />} />
              <Route path="/changes" element={<Changes />} />
              <Route path="/team" element={<Team />} />
              <Route path="/portal" element={<Portal />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/admin" element={<Administration />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
}

// Wraps a useState setter so every screen's existing `setX(updater)` / `setX(value)` calls keep
// working unchanged, but the computed next value is also persisted to Supabase — applied to local
// state immediately (optimistic), synced in the background. A sync failure is logged, not thrown,
// so a flaky network doesn't crash the screen; the local UI state is still correct, it just didn't
// make it to the database that round (matches the "best effort, not a transactional system" nature
// of this prototype).
function wrapSetter<T>(setState: React.Dispatch<React.SetStateAction<T>>, sync: (prev: T, next: T) => Promise<void>) {
  return (updater: React.SetStateAction<T>) => {
    setState((prev) => {
      const next = typeof updater === 'function' ? (updater as any)(prev) : updater;
      sync(prev, next).catch((e) => console.error('Supabase sync failed:', e));
      return next;
    });
  };
}

function LoadingScreen() {
  return (
    <div className="h-screen flex items-center justify-center bg-slate-100 text-slate-400 text-sm">
      Loading Trace PMT…
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="h-screen flex items-center justify-center bg-slate-100 p-6">
      <div className="max-w-md bg-white border border-red-200 rounded-xl p-5 text-sm">
        <div className="font-semibold text-red-700 mb-1">Couldn't load Trace PMT</div>
        <div className="text-slate-500">{message}</div>
      </div>
    </div>
  );
}

function DeactivatedScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="h-screen flex items-center justify-center bg-slate-100 p-6">
      <div className="max-w-md bg-white border border-amber-200 rounded-xl p-5 text-sm text-center">
        <div className="font-semibold text-amber-700 mb-1">Your account has been deactivated</div>
        <div className="text-slate-500 mb-4">Ask an admin to reactivate you from Administration → Users.</div>
        <button onClick={onSignOut} className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg px-3 py-2">Sign Out</button>
      </div>
    </div>
  );
}

// Shown for a signed-in Supabase Auth account that has no platform_users row yet -- i.e. a brand
// new self sign-up. Login.tsx already collected name/phone/designation/company code as auth
// metadata; this screen auto-submits that once on mount, and falls back to letting the person
// retype the company code if it was missing or wrong (e.g. a typo, or the tenant doesn't exist yet).
function CompanyCodeScreen({ meta, onSubmit, onSignOut }: { meta: any; onSubmit: (code: string) => Promise<void>; onSignOut: () => void }) {
  const [code, setCode] = useState(meta?.companyCode || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [autoTried, setAutoTried] = useState(false);

  const submit = async (e?: any) => {
    e?.preventDefault();
    if (!code.trim()) { setErr('Enter the company code your admin gave you.'); return; }
    setErr(''); setBusy(true);
    try { await onSubmit(code.trim()); }
    catch (e: any) { setErr(e.message || 'Could not verify that company code.'); }
    setBusy(false);
  };

  useEffect(() => {
    if (!autoTried && meta?.companyCode) { setAutoTried(true); submit(); }
    else setAutoTried(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-screen flex items-center justify-center bg-slate-100 p-6">
      <div className="max-w-sm w-full bg-white border border-brand-200 rounded-xl p-5 text-sm">
        <div className="font-semibold text-slate-800 mb-1">One more step</div>
        <div className="text-slate-500 mb-4">Enter the company code your organization's admin gave you, so we know which workspace to add you to.</div>
        {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</div>}
        <form onSubmit={submit} className="space-y-3">
          <input value={code} onChange={e=>setCode(e.target.value)} placeholder="Company code" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          <button type="submit" disabled={busy} className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg px-3 py-2 text-sm font-medium">{busy?'Checking…':'Continue'}</button>
        </form>
        <button onClick={onSignOut} className="text-xs text-slate-400 hover:text-slate-600 mt-4">Sign out</button>
      </div>
    </div>
  );
}

function PendingApprovalScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="h-screen flex items-center justify-center bg-slate-100 p-6">
      <div className="max-w-md bg-white border border-brand-200 rounded-xl p-5 text-sm text-center">
        <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center mx-auto mb-3"><S.Icon name="clock" className="w-5 h-5"/></div>
        <div className="font-semibold text-slate-800 mb-1">Your account is awaiting approval</div>
        <div className="text-slate-500 mb-4">An Admin or Super Admin needs to approve your sign-up from Administration → Users before you can get in. You'll be able to sign in normally once that happens.</div>
        <button onClick={onSignOut} className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg px-3 py-2">Sign Out</button>
      </div>
    </div>
  );
}

export default function App() {
  // ---- Auth: gates everything below. getSession() resolves once on load; onAuthStateChange keeps
  // it live across sign-in/out in this tab (and across tabs, since Supabase persists the session).
  const [session, setSession] = useState<any>(undefined); // undefined = not checked yet, null = signed out
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => { if (mounted) setSession(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);
  const signOut = () => supabase.auth.signOut();

  // ---- Tenant resolution: every signed-in account maps to exactly one platform_users row, which
  // says whether this is the platform superadmin (hello@rosbinlabs.com -- routed to the Super Admin
  // Panel, no tenant data loaded at all) or a member of a specific tenant (tenant_id, used to scope
  // every query/write from here on via db.setTenantId). undefined = not checked yet, null = checked
  // and no row exists (brand-new sign-up, needs CompanyCodeScreen).
  const [platformUser, setPlatformUser] = useState<any>(undefined);
  const [platformUserError, setPlatformUserError] = useState<string | null>(null);
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) { setPlatformUser(undefined); return; }
    let cancelled = false;
    setPlatformUser(undefined);
    setPlatformUserError(null);
    db.loadPlatformUser(session.user.email)
      .then((pu) => { if (!cancelled) setPlatformUser(pu); })
      .catch((e) => { if (!cancelled) { setPlatformUserError(e?.message || String(e)); setPlatformUser(null); } });
    return () => { cancelled = true; };
  }, [userId]);

  const provisionCompanyCode = async (code: string) => {
    const meta = session.user.user_metadata || {};
    const tenantId = await db.selfProvisionSignup(code, meta.name, meta.phone, meta.requestedDesignation);
    setPlatformUser({ email: session.user.email, tenant_id: tenantId, is_platform_superadmin: false, is_tenant_owner: false });
  };

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [settings, setSettingsState] = useState<any>(S.DEFAULT_PROJECT_SETTINGS);
  const [admin, setAdminState] = useState<any>(S.DEFAULT_ADMIN_DATA);
  const [projects, setProjectsState] = useState<any[]>([]);
  const [team, setTeamState] = useState<any[]>([]);
  const [phaseTree, setPhaseTreeState] = useState<any>({});
  const [notifications, setNotifications] = useState<any[]>([]);
  const [risks, setRisksState] = useState<any[]>([]);
  const [issues, setIssuesState] = useState<any[]>([]);
  const [changes, setChangesState] = useState<any[]>([]);
  const [calendarEvents, setCalendarEventsState] = useState<any[]>([]);
  const [libraryDocs, setLibraryDocsState] = useState<any[]>([]);
  const [deliverables, setDeliverablesState] = useState<any[]>([]);
  const [invoices, setInvoicesState] = useState<any[]>([]);

  // Fetch every table once a session exists AND the tenant is resolved. All data below this point
  // comes from Supabase — nothing is seeded from the in-memory mock constants in shared.tsx anymore
  // (those still exist and are used to *generate* the seed data that was inserted into the database,
  // but the running app reads live). Keyed on tenant_id so switching accounts (or tenants) re-fetches
  // instead of showing the previous session's cached state. The platform superadmin has no tenant_id
  // and never reaches this — it's routed to the Super Admin Panel instead.
  const tenantId = platformUser?.tenant_id;
  useEffect(() => {
    if (!tenantId) return;
    db.setTenantId(tenantId);
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    db.loadAll()
      .then((data) => {
        if (cancelled) return;
        setSettingsState(data.settings);
        setAdminState(data.admin);
        setProjectsState(data.projects);
        setTeamState(data.team);
        setPhaseTreeState(data.tree);
        setNotifications(data.notifications);
        setRisksState(data.risks);
        setIssuesState(data.issues);
        setChangesState(data.changes);
        setCalendarEventsState(data.events);
        setLibraryDocsState(data.docs);
        setDeliverablesState(data.deliverables);
        setInvoicesState(data.invoices);
        setLoading(false);
      })
      .catch((e) => {
        console.error('Failed to load Trace PMT data from Supabase:', e);
        if (!cancelled) {
          setLoadError(e?.message || String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const setProjects = wrapSetter(setProjectsState, db.syncProjects);
  const setPhaseTree = wrapSetter(setPhaseTreeState, db.syncTree);
  const setRisks = wrapSetter(setRisksState, db.syncRisks);
  const setIssues = wrapSetter(setIssuesState, db.syncIssues);
  const setChanges = wrapSetter(setChangesState, db.syncChanges);
  const setCalendarEvents = wrapSetter(setCalendarEventsState, db.syncEvents);
  const setLibraryDocs = wrapSetter(setLibraryDocsState, db.syncDocs);
  const setDeliverables = wrapSetter(setDeliverablesState, db.syncDeliverables);
  const setInvoices = wrapSetter(setInvoicesState, db.syncInvoices);
  const setTeam = wrapSetter(setTeamState, db.syncTeam);

  const setSettings = (updater: any) => {
    setSettingsState((prev: any) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      db.saveSettings(next).catch((e) => console.error('Supabase sync failed:', e));
      return next;
    });
  };

  // Administration: roles/permissions, users, company, billing, notifications — one row per key,
  // patched by key, mirroring the original localStorage-backed "one object, patched by key" shape.
  const patchAdmin = (key: string, updater: any) => {
    setAdminState((a: any) => {
      const nextVal = typeof updater === 'function' ? updater(a[key]) : updater;
      db.saveAdminKey(key, nextVal).catch((e) => console.error('Supabase sync failed:', e));
      return { ...a, [key]: nextVal };
    });
  };

  const addNotification = (n: any) => {
    const full = { id: S.uid('NOTIF'), when: S.TODAY_ISO, priority: 'normal', ...n };
    setNotifications((ns) => [full, ...ns]);
    db.insertNotification(full).catch((e) => console.error('Supabase sync failed:', e));
  };

  // Self sign-up on a tenant that already has this person's email is a rare race (e.g. an admin just
  // added them) — still raise the pending-approval notification the first time we see a genuinely
  // new Pending Approval row show up for someone other than ourselves is out of scope here; the
  // self_provision_signup() database function already raises the row itself, so nothing further to
  // do on the client for that case.

  // Billing due soon (within 7 days, or already overdue) — was previously only a Dashboard banner
  // with nothing in the notification feed/bell. Raises one real notification per project per
  // billing_due_date, deduped against notifications already on record (including ones loaded from a
  // previous session) so it doesn't spam a fresh one on every reload/re-render.
  useEffect(() => {
    if (loading || !tenantId) return;
    projects.filter(S.billingDueSoon).forEach((p: any) => {
      const already = notifications.some((n: any) => n.type === 'Billing Due Soon' && n.projectId === p.id && n.dueDate === p.billingDueDate);
      if (already) return;
      const d = S.daysLeft(p.billingDueDate);
      addNotification({
        type: 'Billing Due Soon', projectId: p.id, project: p.name, dueDate: p.billingDueDate,
        priority: d < 0 ? 'high' : 'normal',
        message: `${p.name}'s billing is ${d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'due today' : `due in ${d}d`} (due ${p.billingDueDate}).`,
      });
    });
  }, [loading, tenantId, projects, notifications]);

  const myEmail = session?.user?.email || '';
  const myProfile = (admin.users || []).find((u: any) => (u.email || '').toLowerCase() === myEmail.toLowerCase());
  const role = S.deriveRole(myEmail, admin);

  if (session === undefined) return <LoadingScreen />;
  if (!session) return <Login />;
  if (platformUserError) return <ErrorScreen message={platformUserError} />;
  if (platformUser === undefined) return <LoadingScreen />;
  if (platformUser === null) return <CompanyCodeScreen meta={session.user.user_metadata} onSubmit={provisionCompanyCode} onSignOut={signOut} />;
  if (platformUser.is_platform_superadmin) return <SuperAdminPanel email={myEmail} onSignOut={signOut} />;
  if (loading) return <LoadingScreen />;
  if (loadError) return <ErrorScreen message={loadError} />;
  if (myProfile && myProfile.status === 'Pending Approval') return <PendingApprovalScreen onSignOut={signOut} />;
  if (myProfile && myProfile.status !== 'Active') return <DeactivatedScreen onSignOut={signOut} />;

  return (
    <BrowserRouter>
      <S.AdminDataContext.Provider value={{ admin, patchAdmin }}>
        <S.SettingsContext.Provider value={{ settings, setSettings }}>
          <S.ProjectsDataContext.Provider value={{ projects, setProjects }}>
            <S.TeamDataContext.Provider value={{ team, setTeam }}>
              <S.PhaseDataContext.Provider value={{ tree: phaseTree, setTree: setPhaseTree, notifications, addNotification }}>
                <S.GovernanceDataContext.Provider value={{ risks, setRisks, issues, setIssues, changes, setChanges }}>
                  <S.CalendarDataContext.Provider value={{ events: calendarEvents, setEvents: setCalendarEvents }}>
                    <S.LibraryDataContext.Provider value={{ docs: libraryDocs, setDocs: setLibraryDocs }}>
                      <S.DeliverablesDataContext.Provider value={{ deliverables, setDeliverables }}>
                        <S.InvoicesDataContext.Provider value={{ invoices, setInvoices }}>
                          <S.RoleContext.Provider value={{ role, setRole:()=>{} }}>
                            <S.CurrentUserContext.Provider value={{ email: myEmail, profile: myProfile }}>
                              <Shell email={myEmail} myProfile={myProfile} onSignOut={signOut} />
                            </S.CurrentUserContext.Provider>
                          </S.RoleContext.Provider>
                        </S.InvoicesDataContext.Provider>
                      </S.DeliverablesDataContext.Provider>
                    </S.LibraryDataContext.Provider>
                  </S.CalendarDataContext.Provider>
                </S.GovernanceDataContext.Provider>
              </S.PhaseDataContext.Provider>
            </S.TeamDataContext.Provider>
          </S.ProjectsDataContext.Provider>
        </S.SettingsContext.Provider>
      </S.AdminDataContext.Provider>
    </BrowserRouter>
  );
}
