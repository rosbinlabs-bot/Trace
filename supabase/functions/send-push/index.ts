// send-push — delivers a Trace PMT notification as a Web Push message to every device of every
// person it is addressed to.
//
// Called by the app right after it inserts a row into `notifications`:
//   supabase.functions.invoke('send-push', { body: { notificationId } })
//
// Security: the caller's JWT is verified (verify_jwt is on by default), the notification is looked up
// only inside the CALLER'S tenant, and recipients are resolved server-side from the notification's own
// tags — the browser never chooses who gets pushed.
//
// Secrets (supabase secrets set --env-file supabase/.env.push):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') || 'mailto:hello@rosbinlabs.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const norm = (s: unknown) => String(s || '').trim().toLowerCase();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // 1. Who is calling, and which tenant are they in?
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !u?.user?.email) return json({ error: 'unauthorized' }, 401);
    const senderEmail = norm(u.user.email);
    const { data: pu } = await admin.from('platform_users').select('tenant_id').eq('email', senderEmail).maybeSingle();
    if (!pu?.tenant_id) return json({ error: 'no tenant' }, 403);
    const tenantId = pu.tenant_id;

    // 2. The notification (must belong to the caller's tenant).
    const { notificationId } = await req.json();
    const { data: row } = await admin.from('notifications').select('id, payload').eq('tenant_id', tenantId).eq('id', notificationId).maybeSingle();
    if (!row) return json({ error: 'notification not found' }, 404);
    const n: any = row.payload || {};

    // 3. Recipients: people named in tags (the project roster), else the project's team; Admin/Super
    //    Admin people for admin-audience notices (and billing notices). Client contacts named in tags
    //    are resolved from the project's clients list.
    const { data: adminRows } = await admin.from('admin_data').select('key, value').eq('tenant_id', tenantId).in('key', ['users', 'designationLevel']);
    const users: any[] = (adminRows || []).find((r: any) => r.key === 'users')?.value || [];
    const levels: Record<string, string> = (adminRows || []).find((r: any) => r.key === 'designationLevel')?.value || {};
    const isAdminPerson = (usr: any) => /admin/i.test(String(usr?.permissionOverride || levels[usr?.designation] || ''));

    const tagged = new Set<string>((n.tags || []).map((t: string) => norm(t)));
    let proj: any = null;
    if (n.projectId) {
      const r = await admin.from('projects').select('team, clients').eq('tenant_id', tenantId).eq('id', n.projectId).maybeSingle();
      proj = r.data;
    }
    if (!tagged.size && n.audience !== 'admins' && proj) for (const t of proj.team || []) tagged.add(norm(t?.name));

    const emails = new Set<string>();
    for (const usr of users) {
      if (usr?.status && usr.status !== 'Active') continue;
      const wantAdmins = n.audience === 'admins' || n.type === 'Billing Due Soon';
      if ((wantAdmins && isAdminPerson(usr)) || (n.audience !== 'admins' && tagged.has(norm(usr?.name)))) emails.add(norm(usr?.email));
    }
    if (proj && n.audience !== 'admins') {
      for (const c of (proj.clients as any[]) || []) if (c?.email && tagged.has(norm(c.name))) emails.add(norm(c.email));
    }
    emails.delete(senderEmail);           // don't buzz the person who just did the thing
    emails.delete('');
    if (!emails.size) return json({ sent: 0, reason: 'no recipients' });

    // 4. Their devices.
    const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth, user_email').eq('tenant_id', tenantId).in('user_email', [...emails]);
    if (!subs?.length) return json({ sent: 0, reason: 'no subscribed devices' });

    const title = [n.type, n.project].filter(Boolean).join(' · ') || 'Trace PMT';
    const body = String(n.message || n.text || n.title || n.desc || n.body || n.type || 'You have a new notification').slice(0, 180);
    const payload = JSON.stringify({ title, body, url: '/', tag: String(n.id || row.id) });

    // 5. Send; prune devices that have unsubscribed (404/410 from the push service).
    let sent = 0; const dead: string[] = [];
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.endpoint);
        else console.error('push failed', e?.statusCode, e?.body);
      }
    }));
    if (dead.length) await admin.from('push_subscriptions').delete().in('endpoint', dead);
    return json({ sent, pruned: dead.length });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
