-- Keep activity_logs and login_logs for 10 days at most. Review, then run in the Supabase SQL editor.
-- The most recent login_logs row per user is kept even if older, because the app's "welcome back"
-- notice compares against each user's previous login.
create or replace function public.purge_old_logs()
returns void language sql security definer set search_path = public as $$
  delete from public.activity_logs where at < now() - interval '10 days';
  delete from public.login_logs l
   where l.at < now() - interval '10 days'
     and l.at < (select max(x.at) from public.login_logs x
                 where x.tenant_id = l.tenant_id and lower(x.user_email) = lower(l.user_email));
$$;
revoke execute on function public.purge_old_logs() from public, anon, authenticated;

-- Daily at 02:00 UTC. Needs the pg_cron extension (Database > Extensions in Supabase).
select cron.schedule('purge-old-logs', '0 2 * * *', $$select public.purge_old_logs()$$);
