-- Security hardening (review 2026-11-27). NOT yet applied -- review, then run in the Supabase SQL editor.

-- 1. Scrub plain-text passwords that earlier versions of the app stored inside admin_data 'users'.
--    Run AFTER the new frontend is deployed (it no longer writes this field). Then force a password
--    reset for every account: everything stored here must be treated as compromised.
update public.admin_data
set value = (select coalesce(jsonb_agg(u - 'password'), '[]'::jsonb) from jsonb_array_elements(value) u)
where key = 'users' and jsonb_typeof(value) = 'array';

-- 2. Inspect current policies. Look for SELECT policies that are tenant-only on invoices, projects
--    (direct_cost / margin), admin_data, login_logs, activity_logs and channel_messages:
--      select tablename, policyname, cmd, qual from pg_policies where schemaname in ('public','storage') order by 1,2;
--    Tenant-only read access lets a Client or Associate read other projects' data via the REST API,
--    because project/role filtering currently happens only in the React app (App.tsx visibleProjects).
--    Add project-membership and Admin-only read policies, then drop the broad ones. Needs per-table
--    review against your live policies, so it is deliberately not auto-generated here.
