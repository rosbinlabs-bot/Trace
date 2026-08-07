import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import * as S from './shared';
import * as db from './db';
import { supabase } from './supabaseClient';
import Login from './Login';
import SuperAdminPanel from './screens/SuperAdminPanel';

import Dashboard from './screens/Dashboard';
import ProjectMaster from './screens/ProjectMaster';
import ProjectStructure from './screens/ProjectStructure';
import Phases from './screens/Phases';
import MonthlyPlan from './screens/MonthlyPlan';
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

// A module capability of 'None' hides the sidebar item AND hard-blocks the route -- the same
// approach the pre-existing client route table already used, just generalized to every module via
// S.NAV_MODULE + S.capabilityFor instead of a role==='client' special case. Redirects to /dashboard,
// which is always reachable (NAV_MODULE.dashboard is null), so there's always somewhere safe to land.
function Gate({ module, admin, email, children }: { module: string | null; admin: any; email: string; children: React.ReactNode }) {
  if (!module) return <>{children}</>;
  if (!S.capAtLeast(S.capabilityFor(module, email, admin), 'View')) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// Same capability check as Gate, but for a Client-type account there's no other route to bounce to
// (their whole route table is just these two screens) -- so instead of redirecting, it swaps in a
// plain lockout message when an admin has set the Client column's Client Portal capability to None.
function ClientGate({ admin, email, children }: { admin: any; email: string; children: React.ReactNode }) {
  if (!S.capAtLeast(S.capabilityFor('Client Portal', email, admin), 'View')) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md bg-white border border-slate-200 rounded-xl p-5 text-sm text-center">
          <div className="font-semibold text-slate-800 mb-1">Portal access is currently disabled</div>
          <div className="text-slate-500">Your project team has turned off Client Portal access for this account. Contact them if you believe this is a mistake.</div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function Shell({ email, myProfile, onSignOut }: { email: string; myProfile: any; onSignOut: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const { role } = React.useContext(S.RoleContext);
  const { admin } = React.useContext(S.AdminDataContext);
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
  // RoleContext's `role` is a collapsed 5-value bucket used for routing/gating (both Admin and Super
  // Admin permission levels resolve to role==='admin' -- see S.deriveRole), so it isn't precise enough
  // to show someone their actual standing. For display, show their real designation (Strategic Lead,
  // Project Head, Project Manager, Associate) plus their real permission level (Officer/Manager/Admin/
  // Super Admin, via S.effectivePermissionLevel) instead -- that's what actually drives their access.
  const myDesignation = role==='client' ? 'Client' : (myProfile?.designation || S.ROLE_LABELS[role] || role);
  const myPermLevel = role==='client' ? 'Client' : (S.effectivePermissionLevel(myProfile, admin) || S.ROLE_LABELS[role] || role);
  React.useEffect(() => {
    try {
      typeof localStorage !== 'undefined' && localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (e) {}
  }, [theme]);

  const location = useLocation();
  const active = location.pathname.split('/')[1] || 'dashboard';
  // Clients get a hard-restricted sidebar (just Client Portal + Project Structure) and, below, a
  // matching restricted route table -- the nav swap alone wouldn't stop someone from typing another
  // URL directly, so both have to agree. Everyone else's sidebar is the full S.NAV list filtered down
  // to whatever S.NAV_MODULE says their capabilityFor() that module allows -- an item whose module
  // resolves to 'None' (e.g. Administration for an Officer-level Associate) simply isn't shown, and
  // the matching <Gate> below blocks the route itself so it can't be reached by typing the URL either.
  const navGroups = role === 'client' ? S.CLIENT_NAV : S.NAV
    .map((g: any) => ({ ...g, items: g.items.filter((i: any) => { const mod = S.NAV_MODULE[i.id]; return !mod || S.capAtLeast(S.capabilityFor(mod, email, admin), 'View'); }) }))
    .filter((g: any) => g.items.length > 0);
  const activeLabel = navGroups.flatMap((g: any) => g.items).find((i: any) => i.id === active)?.label;

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
            {navGroups.map((group: any) => (
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
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <S.Icon name={theme === 'dark' ? 'sun' : 'moon'} className="w-[18px] h-[18px]" />
              </button>
              <S.NotificationBell />
              <div className="relative" ref={menuRef}>
                <button onClick={()=>setMenuOpen(o=>!o)} className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold shrink-0">{initials}</div>
                  <span className="hidden sm:block text-left leading-tight">
                    <span className="block text-xs font-medium text-slate-700 truncate max-w-[140px]">{displayName}</span>
                    <span className="block text-[10px] text-slate-400">{myDesignation}</span>
                  </span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-2">
                    <div className="px-2 py-1.5 mb-1 border-b border-slate-100">
                      <div className="text-sm font-medium text-slate-800 truncate">{displayName}</div>
                      <div className="text-xs text-slate-400 truncate">{email}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{myDesignation}{role!=='client' ? ` · ${myPermLevel}` : ''}</div>
                    </div>
                    <button onClick={onSignOut} className="w-full text-left text-sm text-red-600 hover:bg-red-50 rounded-lg px-2 py-1.5">Sign Out</button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-5 bg-slate-100">
            <Routes>
              {role === 'client' ? (
                // Hard restriction: a client account can reach exactly these two paths, no matter
                // what URL they type -- everything else (including "/") bounces to /portal. This is
                // the actual security boundary for navigation; the sidebar swap above is just the UI
                // reflection of it. Within that, ClientGate further checks the account's actual Client
                // Portal capability (configurable in Roles & Permissions -> Capability Matrix -> Client
                // column) -- if an admin has set it to None, there's nowhere else in this route table to
                // send them, so it shows a lockout message in place of the screen rather than redirecting.
                <>
                  <Route path="/" element={<Navigate to="/portal" replace />} />
                  <Route path="/portal" element={<ClientGate admin={admin} email={email}><Portal /></ClientGate>} />
                  <Route path="/structure" element={<ClientGate admin={admin} email={email}><ProjectStructure /></ClientGate>} />
                  <Route path="*" element={<Navigate to="/portal" replace />} />
                </>
              ) : (
                <>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/projects" element={<Gate module={S.NAV_MODULE.projects} admin={admin} email={email}><ProjectMaster /></Gate>} />
                  <Route path="/structure" element={<Gate module={S.NAV_MODULE.structure} admin={admin} email={email}><ProjectStructure /></Gate>} />
                  <Route path="/phases" element={<Gate module={S.NAV_MODULE.phases} admin={admin} email={email}><Phases /></Gate>} />
                  <Route path="/monthlyplan" element={<Gate module={S.NAV_MODULE.monthlyplan} admin={admin} email={email}><MonthlyPlan /></Gate>} />
                  <Route path="/deliverables" element={<Gate module={S.NAV_MODULE.deliverables} admin={admin} email={email}><Deliverables /></Gate>} />
                  <Route path="/implementation" element={<Gate module={S.NAV_MODULE.implementation} admin={admin} email={email}><Implementation /></Gate>} />
                  <Route path="/gantt" element={<Gate module={S.NAV_MODULE.gantt} admin={admin} email={email}><Gantt /></Gate>} />
                  <Route path="/calendar" element={<CalendarScreen />} />
                  <Route path="/approvals" element={<Gate module={S.NAV_MODULE.approvals} admin={admin} email={email}><Approvals /></Gate>} />
                  <Route path="/documents" element={<Gate module={S.NAV_MODULE.documents} admin={admin} email={email}><Documents /></Gate>} />
                  <Route path="/doclibrary" element={<Gate module={S.NAV_MODULE.doclibrary} admin={admin} email={email}><DocumentLibrary /></Gate>} />
                  <Route path="/risks" element={<Gate module={S.NAV_MODULE.risks} admin={admin} email={email}><Risks /></Gate>} />
                  <Route path="/issues" element={<Gate module={S.NAV_MODULE.issues} admin={admin} email={email}><Issues /></Gate>} />
                  <Route path="/changes" element={<Gate module={S.NAV_MODULE.changes} admin={admin} email={email}><Changes /></Gate>} />
                  <Route path="/team" element={<Gate module={S.NAV_MODULE.team} admin={admin} email={email}><Team /></Gate>} />
                  <Route path="/portal" element={<Gate module={S.NAV_MODULE.portal} admin={admin} email={email}><Portal /></Gate>} />
                  <Route path="/reports" element={<Gate module={S.NAV_MODULE.reports} admin={admin} email={email}><Reports /></Gate>} />
                  <Route path="/admin" element={<Gate module={S.NAV_MODULE.admin} admin={admin} email={email}><Administration /></Gate>} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </>
              )}
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
// of this prototype). Every synced setter used to be wrapped this way; they've all since moved to
// useDebouncedSync/useDebouncedArraySync below (a per-keystroke text field wired to an immediate
// sync + an unguarded Realtime echo could roll back characters mid-type -- see those functions'
// comments), but this is kept as the simple building block in case a future data type is genuinely
// fine syncing immediately (e.g. something only ever changed by a single discrete button click).
function wrapSetter<T>(setState: React.Dispatch<React.SetStateAction<T>>, sync: (prev: T, next: T) => Promise<void>) {
  return (updater: React.SetStateAction<T>) => {
    setState((prev) => {
      const next = typeof updater === 'function' ? (updater as any)(prev) : updater;
      sync(prev, next).catch((e) => console.error('Supabase sync failed:', e));
      return next;
    });
  };
}

// Same idea as wrapSetter, but for the two data types stored as one big JSON blob per key (Phase
// Management's tree per project, Monthly Plan's rows per project+month) instead of one row per
// record. Every keystroke in a subtask/milestone/objective/activity text field calls this, and an
// immediate wrapSetter-style sync turns each one into a full-blob upload to Supabase -- on a live
// project with a real amount of content that's a network round trip PER CHARACTER, which is exactly
// what felt like typing lag. Local state still updates instantly here (typing is never blocked on
// the network); only the outbound Supabase write is debounced, batched to fire `delay` ms after the
// last edit in a burst, diffed against the state from BEFORE the burst started (not the
// second-to-last keystroke) so nothing in between is lost. `markEdited` runs on every call,
// undebounced, to stamp recentLocalEditRef (see below) immediately.
function useDebouncedSync<T>(setState: React.Dispatch<React.SetStateAction<T>>, sync: (prev: T, next: T) => Promise<void>, markEdited: (prev: T, next: T) => void, delay = 700) {
  const pendingRef = React.useRef<{ base: T; timer: any } | null>(null);
  return (updater: React.SetStateAction<T>) => {
    setState((prev) => {
      const next = typeof updater === 'function' ? (updater as any)(prev) : updater;
      markEdited(prev, next);
      if (!pendingRef.current) pendingRef.current = { base: prev, timer: null };
      if (pendingRef.current.timer) clearTimeout(pendingRef.current.timer);
      const base = pendingRef.current.base;
      pendingRef.current.timer = setTimeout(() => {
        pendingRef.current = null;
        sync(base, next).catch((e) => console.error('Supabase sync failed:', e));
      }, delay);
      return next;
    });
  };
}

// Which top-level keys differ between two { key: value } snapshots -- used both to stamp
// recentLocalEditRef (below) and mirrors the same diff db.syncTree/db.syncMonthlyPlan do server-side,
// just cheaply on the client so we know which keys were just touched without waiting for the network.
function changedKeys(prev: any, next: any): string[] {
  const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
  const out: string[] = [];
  keys.forEach((k) => { if (prev?.[k] !== next?.[k]) out.push(k); });
  return out;
}

// Same debounce-then-diff idea as useDebouncedSync, generalized to the one-row-per-record tables
// (risks, issues, projects, etc.) that go through db.ts's syncArray + App.tsx's Realtime mergeById,
// rather than the one-blob-per-key tables above. A handful of screens (Risks.tsx/Issues.tsx/
// Changes.tsx detail fields, ProjectMaster's Payment Receipts) write straight to these setters on
// every keystroke, same underlying pattern that caused the Phase Management typing-lag/reversal bug
// -- this closes it for every table at once instead of one screen at a time. `echoBucket` is a plain
// object (a slot inside recentLocalEditRef, passed by reference so mutating it here is visible to the
// Realtime handler below without needing a re-render) that gets stamped per changed row id,
// undebounced, on every call.
function useDebouncedArraySync<T extends { [k: string]: any }>(setState: React.Dispatch<React.SetStateAction<T[]>>, sync: (prev: T[], next: T[]) => Promise<void>, idKey: string, echoBucket: Record<string, number>, delay = 700) {
  const pendingRef = React.useRef<{ base: T[]; timer: any } | null>(null);
  return (updater: React.SetStateAction<T[]>) => {
    setState((prev) => {
      const next = typeof updater === 'function' ? (updater as any)(prev) : updater;
      const prevMap = new Map(prev.map((x) => [x[idKey], x]));
      const nextMap = new Map(next.map((x: T) => [x[idKey], x]));
      const ids = new Set([...prevMap.keys(), ...nextMap.keys()]);
      ids.forEach((id) => { if (prevMap.get(id) !== nextMap.get(id)) echoBucket[id] = Date.now(); });
      if (!pendingRef.current) pendingRef.current = { base: prev, timer: null };
      if (pendingRef.current.timer) clearTimeout(pendingRef.current.timer);
      const base = pendingRef.current.base;
      pendingRef.current.timer = setTimeout(() => {
        pendingRef.current = null;
        sync(base, next).catch((e) => console.error('Supabase sync failed:', e));
      }, delay);
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

// Forced password change -- blocks entry for any account the manage-user Edge Function just handed
// an admin-chosen password (brand-new user, or an existing login Super Admin/Admin just reset via
// Administration -> Users), flagged via Auth user_metadata.mustChangePassword (see manage-user/
// index.ts). Self sign-ups (Login.tsx "Create Account", where the person already chose their own
// password) are never stamped, so they skip this screen entirely. supabase.auth.updateUser both sets
// the new password AND clears the flag in one call -- session/onAuthStateChange picks up the cleared
// metadata automatically, so nothing else has to be told this happened.
function ForceChangePasswordScreen({ email, metadata, onSignOut }: { email: string; metadata: any; onSignOut: () => void }) {
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: any) => {
    e.preventDefault();
    setErr('');
    if (pw1.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (pw1 !== pw2) { setErr('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const { mustChangePassword, ...restMeta } = metadata || {};
      const { error } = await supabase.auth.updateUser({ password: pw1, data: { ...restMeta, mustChangePassword: false } });
      if (error) throw error;
    } catch (e: any) {
      setErr(e.message || 'Could not update your password.');
      setBusy(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-slate-100 p-6">
      <div className="max-w-sm w-full bg-white border border-brand-200 rounded-xl p-5 text-sm">
        <div className="font-semibold text-slate-800 mb-1">Set a new password</div>
        <div className="text-slate-500 mb-4">For security, you need to set your own password before continuing — this replaces the one an admin gave you ({email}).</div>
        {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</div>}
        <form onSubmit={submit} className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-slate-500 tracking-wide">New Password</label>
            <input required type="password" autoFocus value={pw1} onChange={e=>setPw1(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-slate-500 tracking-wide">Confirm New Password</label>
            <input required type="password" value={pw2} onChange={e=>setPw2(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <button type="submit" disabled={busy} className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg px-3 py-2 text-sm font-medium">{busy?'Updating…':'Set Password & Continue'}</button>
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
  const [monthlyPlan, setMonthlyPlanState] = useState<any>({});

  // Timestamps of our own most recent local edit, one bucket per synced data type (keyed by
  // whatever identifies a "row" for that type: project id for the phase tree, project+month for
  // Monthly Plan, admin_data key for Company/Billing/etc., a fixed slot for the single app_settings
  // row, and record id -- or name, for team -- for every other table). The Realtime handlers below
  // use this to tell "this update is just Supabase echoing back the write we just made" apart from
  // "someone else changed this" and skip the former -- see useDebouncedSync/useDebouncedArraySync/
  // changedKeys above for why this exists. Applied uniformly to every synced setter, not just the
  // two (Phase Management / Monthly Plan) where the "text reverses while typing" symptom was first
  // reported -- any text field wired straight to a synced setter had the same underlying race.
  const recentLocalEditRef = React.useRef<{
    tree: Record<string, number>;
    monthlyPlan: Record<string, number>;
    admin: Record<string, number>;
    settings: number;
    rows: Record<string, Record<string, number>>;
  }>({
    tree: {}, monthlyPlan: {}, admin: {}, settings: 0,
    rows: { projects: {}, risks: {}, issues: {}, changes: {}, calendarEvents: {}, libraryDocs: {}, deliverables: {}, invoices: {}, team: {} },
  });
  const SELF_ECHO_WINDOW_MS = 2500;

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
        setMonthlyPlanState(data.monthlyPlan);
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

  // ---- Live sync: without this, teammates only see what was on the server when their tab first
  // loaded (db.loadAll() runs once per tenant switch, above) — someone else's edit to a date/status/
  // anything just sits invisible until a manual refresh. This subscribes to Supabase Realtime for
  // every synced table and merges incoming inserts/updates/deletes straight into local state (via the
  // raw setXState setters, not the wrapped ones — merging shouldn't re-trigger a write back to the
  // database). Runs independently of the initial load effect so a fresh page load's realtime
  // subscription and its one-time fetch don't have to wait on each other.
  useEffect(() => {
    if (!tenantId) return;
    // echoBucket (optional): a slot in recentLocalEditRef.current.rows -- if we ourselves edited
    // this row within SELF_ECHO_WINDOW_MS, skip applying the incoming payload (see
    // useDebouncedArraySync above). notifications is intentionally NOT passed one -- nothing ever
    // edits an existing notification's text after the fact, only appends new ones, so there's no
    // keystroke race to guard against there.
    const mergeById = (setState: any, fromDb: (r: any) => any, idKey = 'id', echoBucket?: Record<string, number>) => (payload: any) => {
      setState((prev: any[]) => {
        if (payload.eventType === 'DELETE') {
          const oldId = payload.old?.[idKey];
          return prev.filter((x) => x[idKey] !== oldId);
        }
        const row = fromDb(payload.new);
        if (echoBucket && Date.now() - (echoBucket[row[idKey]] || 0) < SELF_ECHO_WINDOW_MS) return prev;
        const idx = prev.findIndex((x) => x[idKey] === row[idKey]);
        if (idx === -1) return [...prev, row];
        const next = prev.slice();
        next[idx] = row;
        return next;
      });
    };
    const echo = recentLocalEditRef.current.rows;
    const unsubscribe = db.subscribeRealtime(tenantId, {
      projects: mergeById(setProjectsState, db.projectFromDb, 'id', echo.projects),
      risks: mergeById(setRisksState, db.riskFromDb, 'id', echo.risks),
      issues: mergeById(setIssuesState, db.issueFromDb, 'id', echo.issues),
      change_requests: mergeById(setChangesState, db.changeFromDb, 'id', echo.changes),
      calendar_events: mergeById(setCalendarEventsState, db.eventFromDb, 'id', echo.calendarEvents),
      library_docs: mergeById(setLibraryDocsState, db.docFromDb, 'id', echo.libraryDocs),
      deliverables: mergeById(setDeliverablesState, db.deliverableFromDb, 'id', echo.deliverables),
      invoices: mergeById(setInvoicesState, db.invoiceFromDb, 'id', echo.invoices),
      team: mergeById(setTeamState, db.teamFromDb, 'name', echo.team),
      notifications: mergeById(setNotifications, db.notificationFromDb),
      phase_trees: (payload: any) => {
        setPhaseTreeState((prev: any) => {
          if (payload.eventType === 'DELETE') {
            const pid = payload.old?.project_id;
            if (!pid) return prev;
            const next = { ...prev };
            delete next[pid];
            return next;
          }
          const row = payload.new;
          // Self-echo guard: if we ourselves edited this project's tree within the last
          // SELF_ECHO_WINDOW_MS, this incoming row is almost certainly Supabase confirming that same
          // write arriving back over Realtime -- applying it anyway can roll back whatever's been
          // typed since the write was queued (the "reverses while typing" symptom). Skip it; the next
          // genuine Realtime event (or the debounced write that's about to fire) will catch up.
          if (Date.now() - (recentLocalEditRef.current.tree[row.project_id] || 0) < SELF_ECHO_WINDOW_MS) return prev;
          return { ...prev, [row.project_id]: row.tree || [] };
        });
      },
      admin_data: (payload: any) => {
        setAdminState((prev: any) => {
          if (payload.eventType === 'DELETE') {
            const key = payload.old?.key;
            if (!key) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          }
          const row = payload.new;
          // Same self-echo guard as phase_trees/monthly_plans -- Company/Billing/Project Settings
          // etc. are each one JSON blob per admin_data key, same architecture, same race.
          if (Date.now() - (recentLocalEditRef.current.admin[row.key] || 0) < SELF_ECHO_WINDOW_MS) return prev;
          return { ...prev, [row.key]: row.value };
        });
      },
      app_settings: (payload: any) => {
        if (payload.eventType === 'DELETE') return;
        if (Date.now() - recentLocalEditRef.current.settings < SELF_ECHO_WINDOW_MS) return;
        setSettingsState({ ...S.DEFAULT_PROJECT_SETTINGS, ...(payload.new?.data || {}) });
      },
      monthly_plans: (payload: any) => {
        setMonthlyPlanState((prev: any) => {
          if (payload.eventType === 'DELETE') {
            const pid = payload.old?.project_id, month = payload.old?.month;
            if (!pid || !prev[pid]) return prev;
            const nextForProj = { ...prev[pid] };
            delete nextForProj[month];
            return { ...prev, [pid]: nextForProj };
          }
          const row = payload.new;
          // Same self-echo guard as phase_trees above, keyed by project+month.
          const key = `${row.project_id}::${row.month}`;
          if (Date.now() - (recentLocalEditRef.current.monthlyPlan[key] || 0) < SELF_ECHO_WINDOW_MS) return prev;
          return { ...prev, [row.project_id]: { ...(prev[row.project_id] || {}), [row.month]: row.rows || [] } };
        });
      },
    });
    return unsubscribe;
  }, [tenantId]);

  // All debounced (not immediate, unlike the old wrapSetter) -- see useDebouncedArraySync/
  // useDebouncedSync above. Local state still updates every keystroke; only the outbound Supabase
  // write and its Realtime echo are delayed/guarded. Applied to every synced setter uniformly, not
  // just the screens that had a confirmed report, since any of them could be wired to a live-typing
  // field today or in the future (Risks.tsx/Issues.tsx/Changes.tsx detail fields and ProjectMaster's
  // Payment Receipts already were).
  const echo = recentLocalEditRef.current.rows;
  const setProjects = useDebouncedArraySync(setProjectsState, db.syncProjects, 'id', echo.projects);
  const setPhaseTree = useDebouncedSync(setPhaseTreeState, db.syncTree, (prev, next) => {
    changedKeys(prev, next).forEach((k) => { recentLocalEditRef.current.tree[k] = Date.now(); });
  });
  const setRisks = useDebouncedArraySync(setRisksState, db.syncRisks, 'id', echo.risks);
  const setIssues = useDebouncedArraySync(setIssuesState, db.syncIssues, 'id', echo.issues);
  const setChanges = useDebouncedArraySync(setChangesState, db.syncChanges, 'id', echo.changes);
  const setCalendarEvents = useDebouncedArraySync(setCalendarEventsState, db.syncEvents, 'id', echo.calendarEvents);
  const setLibraryDocs = useDebouncedArraySync(setLibraryDocsState, db.syncDocs, 'id', echo.libraryDocs);
  const setDeliverables = useDebouncedArraySync(setDeliverablesState, db.syncDeliverables, 'id', echo.deliverables);
  const setInvoices = useDebouncedArraySync(setInvoicesState, db.syncInvoices, 'id', echo.invoices);
  const setTeam = useDebouncedArraySync(setTeamState, db.syncTeam, 'name', echo.team);
  // Same debouncing + self-echo stamping as setPhaseTree above, keyed by project+month.
  const setMonthlyPlan = useDebouncedSync(setMonthlyPlanState, db.syncMonthlyPlan, (prev, next) => {
    const keys = new Set<string>();
    Object.keys(prev || {}).forEach((pid) => Object.keys(prev[pid] || {}).forEach((m) => keys.add(`${pid}::${m}`)));
    Object.keys(next || {}).forEach((pid) => Object.keys(next[pid] || {}).forEach((m) => keys.add(`${pid}::${m}`)));
    keys.forEach((k) => {
      const [pid, month] = k.split('::');
      if (prev?.[pid]?.[month] !== next?.[pid]?.[month]) recentLocalEditRef.current.monthlyPlan[k] = Date.now();
    });
  });

  // Single app_settings row -- debounced the same way, stamping a plain counter (no per-key map
  // needed, there's only ever one row) rather than reusing useDebouncedSync's diff-by-key logic.
  const settingsPendingRef = React.useRef<{ timer: any } | null>(null);
  const setSettings = (updater: any) => {
    setSettingsState((prev: any) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      recentLocalEditRef.current.settings = Date.now();
      if (settingsPendingRef.current?.timer) clearTimeout(settingsPendingRef.current.timer);
      settingsPendingRef.current = { timer: setTimeout(() => {
        settingsPendingRef.current = null;
        db.saveSettings(next).catch((e) => console.error('Supabase sync failed:', e));
      }, 700) };
      return next;
    });
  };

  // Administration: roles/permissions, users, company, billing, notifications — one row per key,
  // patched by key, mirroring the original localStorage-backed "one object, patched by key" shape.
  // Debounced per-key (Company/Billing/Project Settings text fields can be edited on every keystroke;
  // Roles & Permissions dropdowns and one-off admin actions are unaffected since a single click still
  // flushes after `delay` ms with nothing to batch it against) -- a separate pending-write timer per
  // key so editing e.g. Company and Billing in quick succession doesn't make either wait on the other.
  const adminPendingRef = React.useRef<Record<string, { base: any; timer: any } | undefined>>({});
  const patchAdmin = (key: string, updater: any) => {
    setAdminState((a: any) => {
      const nextVal = typeof updater === 'function' ? updater(a[key]) : updater;
      recentLocalEditRef.current.admin[key] = Date.now();
      const pending = adminPendingRef.current[key];
      if (pending?.timer) clearTimeout(pending.timer);
      adminPendingRef.current[key] = { base: pending?.base ?? a[key], timer: setTimeout(() => {
        adminPendingRef.current[key] = undefined;
        db.saveAdminKey(key, nextVal).catch((e) => console.error('Supabase sync failed:', e));
      }, 700) };
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
  // occurrence of S.nextBillingDueDate (the recurring monthly due date, not the raw one-time
  // billingDueDate field — see shared.tsx), deduped against notifications already on record
  // (including ones loaded from a previous session) so it doesn't spam a fresh one on every
  // reload/re-render. Keying the dedup on the computed due date means a NEW notification correctly
  // fires each month once the due date rolls forward, instead of only ever firing once for the
  // project's original signup date.
  useEffect(() => {
    if (loading || !tenantId) return;
    projects.filter(S.billingDueSoon).forEach((p: any) => {
      const due = S.nextBillingDueDate(p);
      if (!due) return;
      const already = notifications.some((n: any) => n.type === 'Billing Due Soon' && n.projectId === p.id && n.dueDate === due);
      if (already) return;
      const d = S.daysLeft(due);
      addNotification({
        type: 'Billing Due Soon', projectId: p.id, project: p.name, dueDate: due,
        priority: d < 0 ? 'high' : 'normal',
        message: `${p.name}'s billing is ${d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'due today' : `due in ${d}d`} (due ${due}).`,
      });
    });
  }, [loading, tenantId, projects, notifications]);

  const myEmail = session?.user?.email || '';
  const myProfile = (admin.users || []).find((u: any) => (u.email || '').toLowerCase() === myEmail.toLowerCase());
  const role = S.deriveRole(myEmail, admin);
  // A Client-type account only ever sees the one project it was tagged to (Administration -> Users ->
  // "Add Client"). Filtering the shared ProjectsDataContext down to that single project here means
  // Portal/ProjectStructure -- the only two screens a client's routes can even reach (see Shell above)
  // -- don't need any client-specific logic of their own; they just render whatever's in `projects`.
  // Staff who aren't Admin/Super Admin (S.staffVisibleProjects) get the same treatment: only the
  // projects where they're personally named as Strategic Lead/Project Head/PM/Associate, so an
  // Associate or PM who isn't on a project no longer sees it (or anything scoped to it) at all --
  // every project-scoped screen (Project Master, Phase Management, Deliverables, Gantt,
  // Implementation, Risks/Issues, Calendar, Client Approval, Reports) reads projects from this same
  // context, so fixing it here is what makes all of them correct at once.
  const visibleProjects = role === 'client'
    ? projects.filter((p: any) => p.id === myProfile?.project)
    : S.staffVisibleProjects(projects, role, myProfile);
  // Same reasoning, for the header's notification bell (S.NotificationBell reads PhaseDataContext
  // regardless of role, and it's rendered in Shell for every account) -- without this, a client would
  // see activity/approval notifications from every OTHER project in the tenant too.
  const visibleNotifications = role === 'client' ? notifications.filter((n: any) => n.projectId === myProfile?.project) : notifications;
  // Risks, Issues, Deliverables and Calendar events aren't looked up through ProjectsDataContext --
  // Risks.tsx/Issues.tsx/the Reports "Risk Dashboard"/"Deliverable Budget" reports and Calendar all
  // render their own full list straight from GovernanceDataContext/DeliverablesDataContext/
  // CalendarDataContext, filtered only by an on-screen dropdown (which itself only offers visible
  // projects) -- so without this, picking "All" (or just not filtering) would still show every OTHER
  // project's risks/issues/deliverables/events to someone who can no longer even see that project.
  // These three all key their `project` field by project NAME, not id (see Risks.tsx/Issues.tsx's own
  // dropdowns), so this matches on name too. Change Requests have no project field at all (an org-wide
  // register) so there's nothing to scope there. role==='admin' (Admin/Super Admin) stays unscoped;
  // 'client' is included defensively even though its routes can't reach these screens today.
  const isProjectScoped = role !== 'admin';
  const visibleProjectNames = new Set(visibleProjects.map((p: any) => p.name));
  const visibleRisks = isProjectScoped ? risks.filter((r: any) => visibleProjectNames.has(r.project)) : risks;
  const visibleIssues = isProjectScoped ? issues.filter((i: any) => visibleProjectNames.has(i.project)) : issues;
  const visibleDeliverables = isProjectScoped ? deliverables.filter((d: any) => visibleProjectNames.has(d.project)) : deliverables;
  const visibleCalendarEvents = isProjectScoped ? calendarEvents.filter((e: any) => !e.project || visibleProjectNames.has(e.project)) : calendarEvents;

  if (session === undefined) return <LoadingScreen />;
  if (!session) return <Login />;
  if (session.user?.user_metadata?.mustChangePassword) return <ForceChangePasswordScreen email={myEmail} metadata={session.user.user_metadata} onSignOut={signOut} />;
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
          <S.ProjectsDataContext.Provider value={{ projects: visibleProjects, setProjects }}>
            <S.TeamDataContext.Provider value={{ team, setTeam }}>
              <S.PhaseDataContext.Provider value={{ tree: phaseTree, setTree: setPhaseTree, notifications: visibleNotifications, addNotification }}>
                <S.GovernanceDataContext.Provider value={{ risks: visibleRisks, setRisks, issues: visibleIssues, setIssues, changes, setChanges }}>
                  <S.CalendarDataContext.Provider value={{ events: visibleCalendarEvents, setEvents: setCalendarEvents }}>
                    <S.LibraryDataContext.Provider value={{ docs: libraryDocs, setDocs: setLibraryDocs }}>
                      <S.DeliverablesDataContext.Provider value={{ deliverables: visibleDeliverables, setDeliverables }}>
                        <S.InvoicesDataContext.Provider value={{ invoices, setInvoices }}>
                          <S.MonthlyPlanDataContext.Provider value={{ plan: monthlyPlan, setPlan: setMonthlyPlan }}>
                            <S.RoleContext.Provider value={{ role, setRole:()=>{} }}>
                              <S.CurrentUserContext.Provider value={{ email: myEmail, profile: myProfile }}>
                                <Shell email={myEmail} myProfile={myProfile} onSignOut={signOut} />
                              </S.CurrentUserContext.Provider>
                            </S.RoleContext.Provider>
                          </S.MonthlyPlanDataContext.Provider>
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
      <Analytics />
    </BrowserRouter>
  );
}
