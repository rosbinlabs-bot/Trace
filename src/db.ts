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
export const projectFromDb = (r: any) => ({
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
export const riskFromDb = (r: any) => ({ id: r.id, project: r.project, desc: r.description, owner: r.owner, prob: r.prob, impact: r.impact, mitigation: r.mitigation, target: r.target, status: r.status });
export const issueFromDb = (r: any) => ({ id: r.id, project: r.project, raisedBy: r.raised_by, assignee: r.assignee, severity: r.severity, priority: r.priority, root: r.root, due: r.due, status: r.status });
export const changeFromDb = (r: any) => ({ id: r.id, desc: r.description, reason: r.reason, impact: r.impact, budget: r.budget, timeline: r.timeline, status: r.status, date: r.request_date });
export const eventFromDb = (r: any) => ({ id: r.id, date: r.event_date, type: r.type, title: r.title, project: r.project, tags: r.tags || [], status: r.status });
export const docFromDb = (r: any) => ({ id: r.id, name: r.name, industry: r.industry, usedIn: r.used_in, function: r.function, addedOn: r.added_on, filePath: r.file_path, fileName: r.file_name, fileSize: r.file_size, uploadedAt: r.uploaded_at, status: r.status, uploadedBy: r.uploaded_by });
export const deliverableFromDb = (r: any) => ({ id: r.id, name: r.name, project: r.project, dept: r.dept, owner: r.owner, reviewer: r.reviewer, approver: r.approver, priority: r.priority, hours: r.hours, budget: r.budget, start: r.start_date, due: r.due_date, status: r.status, revision: r.revision, clientApproval: r.client_approval, internalApproval: r.internal_approval });
const deliverableToDb = (d: any) => ({ tenant_id: TENANT_ID, id: d.id, name: d.name, project: d.project, dept: d.dept, owner: d.owner, reviewer: d.reviewer, approver: d.approver, priority: d.priority, hours: d.hours || 0, budget: d.budget || 0, start_date: d.start || null, due_date: d.due || null, status: d.status, revision: d.revision, client_approval: d.clientApproval, internal_approval: d.internalApproval });
export const teamFromDb = (r: any) => ({ name: r.name, role: r.role, dept: r.dept, util: r.util, avail: r.avail, capacity: r.capacity });
const teamToDb = (t: any) => ({ tenant_id: TENANT_ID, name: t.name, role: t.role, dept: t.dept, util: t.util || 0, avail: t.avail, capacity: t.capacity });
export const invoiceFromDb = (r: any) => ({ id: r.id, project: r.project_id, invoiceDate: r.invoice_date, dueDate: r.due_date, receivedDate: r.received_date, amount: r.amount, status: r.status, recordedBy: r.recorded_by, locked: r.locked, lockedAt: r.locked_at, lockedBy: r.locked_by, autoGenerated: r.auto_generated });
const invoiceToDb = (i: any) => ({ tenant_id: TENANT_ID, id: i.id, project_id: i.project, invoice_date: i.invoiceDate || null, due_date: i.dueDate || null, received_date: i.receivedDate || null, amount: i.amount || 0, status: i.status, recorded_by: i.recordedBy || null, locked: !!i.locked, locked_at: i.lockedAt || null, locked_by: i.lockedBy || null, auto_generated: !!i.autoGenerated });
export const notificationFromDb = (r: any) => ({ ...(r.payload || {}), id: r.id });

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
const docToDb = (d: any) => ({ tenant_id: TENANT_ID, id: d.id, name: d.name, industry: d.industry, used_in: d.usedIn, function: d.function, added_on: d.addedOn || null, file_path: d.filePath || null, file_name: d.fileName || null, file_size: d.fileSize || null, uploaded_at: d.uploadedAt || null, status: d.status || 'Pending Approval', uploaded_by: d.uploadedBy || null });

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

/* ============================ file storage (Document Library + Phase Management) ============================ */
// Every file-attaching feature in the app shares this same shape: a private Supabase Storage bucket,
// one object per <tenant_id>/... path, RLS policies that only let a signed-in user read/write/delete
// objects under their own tenant's folder (mirrors every other table's tenant_id RLS), and downloads
// through a short-lived signed URL rather than a public link -- so a file is never reachable by
// anyone outside the tenant even if the link leaked. 'library-docs' backs Document Library;
// 'phase-docs' backs milestone/sub task attachments in Phase Management.
async function uploadToBucket(bucket: string, id: string, file: File) {
  if (!TENANT_ID) throw new Error('No tenant context to upload into.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${TENANT_ID}/${id}-${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw error;
  return { path, name: file.name, size: file.size };
}
async function getBucketDownloadUrl(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl as string;
}
async function deleteFromBucket(bucket: string, path: string) {
  if (!path) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

export async function uploadLibraryDoc(docId: string, file: File) {
  const r = await uploadToBucket('library-docs', docId, file);
  return { filePath: r.path, fileName: r.name, fileSize: r.size };
}
export const getLibraryDocDownloadUrl = (filePath: string) => getBucketDownloadUrl('library-docs', filePath);
export const deleteLibraryDocFile = (filePath: string) => deleteFromBucket('library-docs', filePath);

// Phase Management: milestone/sub task attachments. `id` is a fresh per-file id (S.uid('DOC')) so
// several files attached to the same item never collide on path even if uploaded back to back.
export async function uploadPhaseDoc(id: string, file: File) {
  const r = await uploadToBucket('phase-docs', id, file);
  return { id, path: r.path, name: r.name, size: r.size };
}
export const getPhaseDocDownloadUrl = (path: string) => getBucketDownloadUrl('phase-docs', path);
export const deletePhaseDocFile = (path: string) => deleteFromBucket('phase-docs', path);
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
/* ============================ realtime: live sync across signed-in users ============================ */
// Without this, every screen only ever reflects what was on the server the moment *this* browser
// tab loaded (db.loadAll() runs once per session/tenant switch) — so if teammate A edits a
// milestone date, teammate B tagged to the same project won't see it until B manually reloads the
// page. Supabase Realtime's postgres_changes feed pushes every insert/update/delete on these tables
// to every other subscribed client in the same tenant as it happens, live, no polling or refresh
// needed. RLS still applies to what a client is allowed to *receive* (same policies as the initial
// select), and the tenant_id filter below narrows the feed to just this tenant for efficiency.
export type RealtimeTable =
  | 'projects' | 'phase_trees' | 'risks' | 'issues' | 'change_requests' | 'calendar_events'
  | 'library_docs' | 'deliverables' | 'team' | 'admin_data' | 'app_settings' | 'notifications' | 'invoices';

export function subscribeRealtime(tenantId: string, handlers: Partial<Record<RealtimeTable, (payload: any) => void>>) {
  const channel = supabase.channel(`tenant-live-${tenantId}`);
  (Object.keys(handlers) as RealtimeTable[]).forEach((table) => {
    channel.on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table, filter: `tenant_id=eq.${tenantId}` },
      handlers[table] as any
    );
  });
  channel.subscribe();
  return () => { supabase.removeChannel(channel); };
}

export const createUserAccount = (email: string, password: string, name: string) => callManageUser({ action: 'create', email, password, name });
export const resetUserPassword = (email: string, password: string) => callManageUser({ action: 'resetPassword', email, password });
export const setUserBanned = (email: string, banned: boolean) => callManageUser({ action: 'setBan', email, banned });
export const deleteUserAccount = (email: string) => callManageUser({ action: 'delete', email });
// currentEmail identifies which login to update; newEmail/newName are optional -- omit whichever didn't change.
export const updateUserProfile = (currentEmail: string, updates: { name?: string; email?: string }) =>
  callManageUser({ action: 'updateProfile', email: currentEmail, newName: updates.name, newEmail: updates.email });
