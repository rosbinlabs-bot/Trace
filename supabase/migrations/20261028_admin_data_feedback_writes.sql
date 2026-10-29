-- Clients' Feedback records live in admin_data under keys 'cf:<projectId>:<feeDueDate>'.
-- The admin_data write policy (Administration >= Edit only) blocks non-admins such as Devipriya from
-- saving them: the screen updates locally, the upsert is rejected, and nobody else ever sees it.
-- This ADDS a second permissive policy (policies are OR-ed) that allows writes to 'cf:%' keys only,
-- for active non-Client staff with Clients' Feedback comment or edit access. All other admin_data keys
-- (users, roles, company, billing...) stay governed by the existing Administration policy.
-- Mirrors feedbackCapsFor() in src/shared.tsx. Run in the Supabase SQL editor (project eqnfgixhzyvxfdpoijwt).

create or replace function public.can_write_feedback()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.admin_data a
    cross join lateral jsonb_array_elements(a.value) u
    where a.key = 'users'
      and a.tenant_id::text = public.current_tenant_id()::text
      and lower(u->>'email') = lower(auth.jwt() ->> 'email')
      and u->>'status' = 'Active'
      and coalesce(u->>'type', '') <> 'Client'
      and (
        coalesce(u->>'permissionOverride', (select d.value ->> (u->>'designation')
                 from public.admin_data d where d.key = 'designationLevel' and d.tenant_id::text = a.tenant_id::text limit 1), '') = 'Super Admin'
        or case
             when exists (select 1 from public.admin_data f where f.key = 'feedbackAccess'
                          and f.tenant_id::text = a.tenant_id::text
                          and f.value ? lower(auth.jwt() ->> 'email'))
             then (select coalesce((f.value -> lower(auth.jwt() ->> 'email') ->> 'edit')::boolean, false)
                          or coalesce((f.value -> lower(auth.jwt() ->> 'email') ->> 'comment')::boolean, false)
                   from public.admin_data f where f.key = 'feedbackAccess' and f.tenant_id::text = a.tenant_id::text limit 1)
             else coalesce(u->>'permissionOverride', (select d.value ->> (u->>'designation')
                          from public.admin_data d where d.key = 'designationLevel' and d.tenant_id::text = a.tenant_id::text limit 1), '')
                  in ('Admin', 'Manager')
           end
      )
  );
$$;
revoke execute on function public.can_write_feedback() from public, anon;
grant execute on function public.can_write_feedback() to authenticated;

drop policy if exists "feedback rows writable by feedback staff (insert)" on public.admin_data;
create policy "feedback rows writable by feedback staff (insert)" on public.admin_data
  for insert to authenticated
  with check (key like 'cf:%' and tenant_id::text = public.current_tenant_id()::text and public.can_write_feedback());

drop policy if exists "feedback rows writable by feedback staff (update)" on public.admin_data;
create policy "feedback rows writable by feedback staff (update)" on public.admin_data
  for update to authenticated
  using      (key like 'cf:%' and tenant_id::text = public.current_tenant_id()::text and public.can_write_feedback())
  with check (key like 'cf:%' and tenant_id::text = public.current_tenant_id()::text and public.can_write_feedback());
