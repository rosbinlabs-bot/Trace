-- Web Push subscriptions: one row per browser/device a person has enabled notifications on.
-- Run once in the Supabase SQL editor (project eqnfgixhzyvxfdpoijwt) or via `supabase db push`.
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  tenant_id   text not null,
  user_email  text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (tenant_id, lower(user_email));

alter table public.push_subscriptions enable row level security;

-- People manage only their own devices, inside their own tenant. The send-push edge function reads
-- everyone's rows with the service role (which bypasses RLS).
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using      (lower(user_email) = lower(auth.jwt() ->> 'email') and tenant_id = public.current_tenant_id()::text)
  with check (lower(user_email) = lower(auth.jwt() ->> 'email') and tenant_id = public.current_tenant_id()::text);
