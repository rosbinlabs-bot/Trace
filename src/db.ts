// Supabase read/write layer for Trace PMT.
//
// The app's screens and shared.tsx mutate helpers all operate on the original in-memory mock
// shapes (camelCase fields, e.g. `noOfSbu`, `billingDueDate`). Rather than rewrite every screen to
// speak snake_case/DB shapes directly, this file is the single translation boundary: `loadAll()`
// fetches every table and maps DB rows back into the exact shapes shared.tsx used to seed locally,
// and the `sync*` helpers take a (previous, next) pair of in-memory state — as already produced by
// the app's existing setState updaters — and persist only what actually changed.
//
// Change detection is by object *reference*, not deep equality: every mutate helper in the app
// (mutatePhase/mutateMs/mutateSt, the `rs.map(r => r.id===id ? {...r,...patch} : r)` pattern used
// throughout Risks/Issues/Changes/etc.) already creates a new object/array only for what actually
// changed and reuses the old reference for everything else. That means `prev[i] !== next[i]` is a
// correct, cheap way to find changed/added rows without a full JSON diff.
import { supabase } from './supabaseClient';
import { DEFAULT_PROJECT_SETTINGS, DEFAULT_ADMIN_DATA } from './shared';

/* ============================ tenant context ============================ */
// Set once per session (App.tsx, right after resolving the signed-in user's platform_users row) and
// read by every toDb mapper below so new rows always carry the caller's own tenant_id -- Postgres
// RLS's `with check` clause on every table requires tenant_id = current_tenant_id(), so a write with
// the wrong tenant_id (or none) is rejected server-side regardless of what the client sends.
let TENANT_ID: string | null = null;
export const setTenantId = (id: string | null) => { TENANT_ID = id; };

/* ============================ mappers: DB row -> app shape ============================ */
const projectFromDb = (r: any) => ({
  id: r.id, name: r.name, client: r.client, category: r.category, industry: r.industry,
  noOfSbu: r.no_of_sbu, consultingCategory: r.consulting_category, engagement: r.engagement,
  start: r.start_date, end: r.end_date, monthlyFee: r.monthly_fee,
  strategicLead: r.strategic_lead, projectHead: r.project_head, pm: r.pm, associate: r.associate,
  clients: r.clients || [], clientLocation: r.client_location, clientWebsite: r.client_website,
  clientSoftware: r.client_software || [], status: r.status, priority: r.priority, billing: r.billing,
  billingDueDate: r.billing_due_date, completion: r.completion, risk: r.risk, sla: r.sla,
  margin: r.margin, paymentStatus: r.payment_status, visitsMonth: r.visits_month,
  visitsTotal: r.visits_total, confirmed: r.confirmed, extension: r.extension,
  specialRequest: r.special_request, paymentReceipts: r.payment_receipts || [],
  _key: r.id,
});
const riskFromDb = (r: any) => ({ id: r.id, project: r.project, desc: r.description, owner: r.owner, prob: r.prob, impact: r.impact, mitigation: r.mitigation, target: r.target, status: r.status });
const issueFromDb = (r: any) => ({ id: r.id, project: r.project, raisedBy: r.raised_by, assignee: r.assignee, severity: r.severity, priority: r.priority, root: r.root, due: r.due, status: r.status });
const changeFromDb = (r: any) => ({ id: r.id, desc: r.description, reason: r.reason, impact: r.impact, budget: r.budget, timeline: r.timeline, status: r.status, date: r.request_date });
const eventFromDb = (r: any) => ({ id: r.id, date: r.event_date, type: r.type, title: r.title, project: r.project, tags: r.tags || [], status: r.status });
const docFromDb = (r: any) => ({ id: r.id, name: r.name, industry: r.industry, usedIn: r.used_in, function: r.function, addedOn: r.added_on });
const deliverableFromDb = (r: any) => ({ id: r.id, name: r.name, project: r.project, dept: r.dept, owner: r.owner, reviewer: r.reviewer, approver: r.approver, priority: r.priority, hours: r.hours, budget: r.budget, start: r.start_date, due: r.due_date, status: r.status, revision: r.revision, clientApproval: r.client_approval, internalApproval: r.internal_approval });
const deliverableToDb = (d: any) => ({ tenant_id: TENANT_ID, id: d.id, name: d.name, project: d.project, dept: d.dept, owner: d.owner, reviewer: d.reviewer, approver: d.approver, priority: d.priority, hours: d.hours || 0, budget: d.budget || 0, start_date: d.start || null, due_date: d.due || null, status: d.status, revision: d.revision, client_approval: d.clientApproval, internal_approval: d.internalApproval });
const teamFromDb = (r: any) => ({ name: r.name, role: r.role, dept: r.dept, util: r.util, avail: r.avail, capacity: r.capacity });
const teamToDb = (t: any) => ({ tenant_id: TENANT_ID, name: t.name, role: t.role, dept: t.dept, util: t.util || 0, avail: t.avail, capacity: t.capacity });
const invoiceFromDb = (r: any) => ({ id: r.id, project: r.project_id, invoiceDate: r.invoice_date, dueDate: r.due_date, receivedDate: r.received_date, amount: r.amount, status: r.status, recordedBy: r.recorded_by, locked: r.locked, lockedAt: r.locked_at, lockedBy: r.locked_by, autoGenerated: r.auto_generated });
const invoiceToDb = (i: any) => ({ tenant_id: TENANT_ID, id: i.id, project_id: i.project, invoice_date: i.invoiceDate || null, due_date: i.dueDate || null, received_date: i.receivedDate || null, amount: i.amount || 0, status: i.status, recorded_by: i.recordedBy || null, locked: !!i.locked, locked_at: i.lockedAt || null, locked_by: i.lockedBy || null, auto_generated: !!i.autoGenerated });
const notificationFromDb = (r: any) => ({ ...(r.payload || {}), id: r.id });

/* ============================ mappers: app shape -> DB row ============================ */
const projectToDb = (p: any) => ({
  tenant_id: TENANT_ID,
  id: p.id, name: p.name, client: p.client, category: p.category, industry: p.industry,
  no_of_sbu: p.noOfSbu || null, consulting_category: p.consultingCategory, engagement: p.engagement,
  start_date: p.start || null, end_date: p.end || null, monthly_fee: p.monthlyFee || 0,
  strategic_lead: p.strategicLead, project_head: p.projectHead, pm: p.pm, associate: p.associate,
  clients: p.clients || [], client_location: p.clientLocation, client_website: p.clientWebsite,
  client_software: p.clientSoftware || [], status: p.status, priority: p.priority, billing: p.billing,
  billing_due_date: p.billingDueDate || null, completion: p.completion || 0, risk: p.risk, sla: p.sla,
  margin: p.margin, payment_status: p.paymentStatus, visits_month: p.visitsMonth || 0,
  visits_total: p.visitsTotal || 0, confirmed: !!p.confirmed, extension: p.extension || null,
  special_request: p.specialRequest || null, payment_receipts: p.paymentReceipts || [],
});
const riskToDb = (r: any) => ({ tenant_id: TENANT_ID, id: r.id, project: r.project, description: r.desc, owner: r.owner, prob: r.prob, impact: r.impact, mitigation: r.mitigation, target: r.target || null, status: r.status });
const issueToDb = (i: any) => ({ tenant_id: TENANT_ID, id: i.id, project: i.project, raised_by: i.raisedBy, assignee: i.assignee, severity: i.severity, priority: i.priority, root: i.root, due: i.due || null, status: i.status });
const changeToDb = (c: any) => ({ tenant_id: TENANT_ID, id: c.id, description: c.desc, reason: c.reason, impact: c.impact, budget: c.budget, timeline: c.timeline, status: c.status, request_date: c.date || null });
const eventToDb = (e: any) => ({ tenant_id: TENANT_ID, id: e.id, event_date: e.date || null, type: e.type, title: e.title, project: e.project, tags: e.tags || [], status: e.status });
const docToDb = (d: any) => ({ tenant_id: TENANT_ID, id: d.id, name: d.name, industry: d.industry, used_in: d.usedIn, function: d.function, added_on: d.addedOn || null });

/* ============================ initial load ============================ */
export async function loadAll() {
  const [projects, phaseTrees, risks, issues, changes, events, docs, deliverables, team, admin, settings, notifications, invoices] = await Promise.all([
    supabase.from('projects').select('*').order('created_at'),
    supabase.from('phase_trees').select('*'),
    supabase.from('risks').select('*').order('created_at'),
    supabase.from('issues').select('*').order('created_at'),
    supabase.from('change_requests').select('*').order('created_at'),
    supabase.from('calendar_events').select('*').order('created_at'),
    supabase.from('library_docs').select('*').order('created_at'),
    supabase.from('deliverables').select('*').order('id'),
    supabase.from('team').select('*'),
    supabase.from('admin_data').select('*'),
    supabase.from('app_settings').select('*').maybeSingle(),
    supabase.from('notifications').select('*').order('created_at', { ascending: false }),
    supabase.from('invoices').select('*').order('created_at'),
  ]);

  for (const r of [projects, phaseTrees, risks, issues, changes, events, docs, deliverables, team, admin, settings, notifications, invoices]) {
    if (r.error) throw r.error;
  }

  const tree: any = {};
  (phaseTrees.data || []).forEach((row: any) => { tree[row.project_id] = row.tree || []; });

  // Merge over DEFAULT_ADMIN_DATA / DEFAULT_PROJECT_SETTINGS so a key with no row yet (e.g. right
  // after clearing the database) falls back to a safe empty/default shape instead of `undefined` —
  // the Administration and Project Master screens read these fields unguarded.
  const adminData: any = { ...DEFAULT_ADMIN_DATA };
  (admin.data || []).forEach((row: any) => { adminData[row.key] = row.value; });

  return {
    projects: (projects.data || []).map(projectFromDb),
    tree,
    risks: (risks.data || []).map(riskFromDb),
    issues: (issues.data || []).map(issueFromDb),
    changes: (changes.data || []).map(changeFromDb),
    events: (events.data || []).map(eventFromDb),
    docs: (docs.data || []).map(docFromDb),
    deliverables: (deliverables.data || []).map(deliverableFromDb),
    team: (team.data || []).map(teamFromDb),
    admin: adminData,
    settings: { ...DEFAULT_PROJECT_SETTINGS, ...(settings.data?.data || {}) },
    notifications: (notifications.data || []).map(notificationFromDb),
    invoices: (invoices.data || []).map(invoiceFromDb),
  };
}

/* ============================ write-through sync helpers ============================ */
function diffArray(prevArr: any[], nextArr: any[], idKey = 'id') {
  const prevIds = new Set((prevArr || []).map((x) => x[idKey]));
  const nextIds = new Set((nextArr || []).map((x) => x[idKey]));
  const toDelete = [...prevIds].filter((id) => !nextIds.has(id));
  const toUpsert = (nextArr || []).filter((x) => {
    const p = (prevArr || []).find((y) => y[idKey] === x[idKey]);
    return !p || p !== x;
  });
  return { toDelete, toUpsert };
}

async function syncArray(table: string, prevArr: any[], nextArr: any[], toDb: (x: any) => any, idKey = 'id') {
  const { toDelete, toUpsert } = diffArray(prevArr, nextArr, idKey);
  if (toDelete.length) {
    const { error } = await supabase.from(table).delete().in(idKey, toDelete);
    if (error) throw error;
  }
  if (toUpsert.length) {
    const { error } = await supabase.from(table).upsert(toUpsert.map(toDb));
    if (error) throw error;
  }
}

export const syncProjects = (prev: any[], next: any[]) => syncArray('projects', prev, next, projectToDb);
export const syncRisks = (prev: any[], next: any[]) => syncArray('risks', prev, next, riskToDb);
export const syncIssues = (prev: any[], next: any[]) => syncArray('issues', prev, next, issueToDb);
export const syncChanges = (prev: any[], next: any[]) => syncArray('change_requests', prev, next, changeToDb);
export const syncEvents = (prev: any[], next: any[]) => syncArray('calendar_events', prev, next, eventToDb);
export const syncDocs = (prev: any[], next: any[]) => syncArray('library_docs', prev, next, docToDb);
export const syncDeliverables = (prev: any[], next: any[]) => syncArray('deliverables', prev, next, deliverableToDb);
export const syncTeam = (prev: any[], next: any[]) => syncArray('team', prev, next, teamToDb, 'name');
export const syncInvoices = (prev: any[], next: any[]) => syncArray('invoices', prev, next, invoiceToDb);

export async function syncTree(prevTree: any, nextTree: any) {
  const keys = new Set([...Object.keys(prevTree || {}), ...Object.keys(nextTree || {})]);
  const changed: any[] = [];
  keys.forEach((k) => {
    const p = prevTree?.[k];
    const n = nextTree?.[k];
    if (p !== n) changed.push({ tenant_id: TENANT_ID, project_id: k, tree: n ?? [] });
  });
  if (changed.length) {
    const { error } = await supabase.from('phase_trees').upsert(changed);
    if (error) throw error;
  }
}

export async function saveAdminKey(key: string, value: any) {
  const { error } = await supabase.from('admin_data').upsert({ tenant_id: TENANT_ID, key, value });
  if (error) throw error;
}

export async function saveSettings(data: any) {
  const { error } = await supabase.from('app_settings').upsert({ tenant_id: TENANT_ID, data });
  if (error) throw error;
}

export async function insertNotification(n: any) {
  const { error } = await supabase.from('notifications').insert({ tenant_id: TENANT_ID, id: n.id, payload: n });
  if (error) throw error;
}

/* ============================ multi-tenant: platform users, tenants, sign-up ============================ */
// Resolves the signed-in email's platform_users row -- tells App.tsx whether this is the platform
// superadmin (hello@rosbinlabs.com, routed to the Super Admin Panel instead of a tenant), a tenant
// owner, or a regular tenant member, and which tenant_id to scope every other query/write to.
export async function loadPlatformUser(email: string) {
  const { data, error } = await supabase.from('platform_users').select('*').eq('email', (email || '').toLowerCase()).maybeSingle();
  if (error) throw error;
  return data; // null if this email has no platform_users row yet (brand-new sign-up, not yet provisioned)
}

// Called right after a self sign-up, once the person is signed in but has no platform_users row yet.
// See self_provision_signup() in the database -- it validates the company code against a real tenant
// and creates both the platform_users row and a Pending Approval admin_data.users entry atomically.
export async function selfProvisionSignup(companyCode: string, name: string, phone: string, designation: string) {
  const { data, error } = await supabase.rpc('self_provision_signup', { p_company_code: companyCode, p_name: name, p_phone: phone, p_designation: designation });
  if (error) throw error;
  return data as string; // the tenant_id they were provisioned into
}

// Super Admin Panel: list every tenant (platform superadmin only -- RLS only returns all rows for
// that account; a regular tenant member's query would just return their own tenant's row).
export async function listTenants() {
  const { data, error } = await supabase.from('tenants').select('*').order('created_at');
  if (error) throw error;
  return data || [];
}

export async function createTenant(tenantName: string, tenantSlug: string, ownerName: string, ownerEmail: string, ownerPassword: string) {
  return callManageUser({ action: 'createTenant', tenantName, tenantSlug, ownerName, ownerEmail, ownerPassword });
}

/* ============================ user account management (manage-user edge function) ============================ */
// Everything here proxies to the manage-user Edge Function, which holds the service role key the
// browser can never have. The function itself re-checks that the caller is an Active Admin/Super
// Admin before doing anything — this client-side call is not the security boundary, just plumbing.
async function callManageUser(payload: any) {
  const { data, error } = await supabase.functions.invoke('manage-user', { body: payload });
  if (error) {
    // supabase-js surfaces non-2xx responses as a generic FunctionsHttpError; the function's own
    // { error: "..." } body (with the actual reason) is on error.context, not `error.message`.
    let msg = error.message;
    try { const body = await error.context?.json?.(); if (body?.error) msg = body.error; } catch (_e) {}
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
export const createUserAccount = (email: string, password: string, name: string) => callManageUser({ action: 'create', email, password, name });
export const resetUserPassword = (email: string, password: string) => callManageUser({ action: 'resetPassword', email, password });
export const setUserBanned = (email: string, banned: boolean) => callManageUser({ action: 'setBan', email, banned });
export const deleteUserAccount = (email: string) => callManageUser({ action: 'delete', email });
// currentEmail identifies which login to update; newEmail/newName are optional -- omit whichever didn't change.
export const updateUserProfile = (currentEmail: string, updates: { name?: string; email?: string }) =>
  callManageUser({ action: 'updateProfile', email: currentEmail, newName: updates.name, newEmail: updates.email });
