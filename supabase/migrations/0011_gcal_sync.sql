-- ดึงนัดจาก Google Calendar อัตโนมัติทุกชั่วโมง (หนึ่งลิงก์ต่อคน)
create table if not exists public.calendar_imports (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  url text not null,
  who text not null default 'all' check (who in ('dad', 'mom', 'pearl', 'all')),
  private boolean not null default false,
  last_synced_at timestamptz,
  last_count int,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.calendar_imports enable row level security;
create policy cal_imports_select on public.calendar_imports for select using (user_id = auth.uid());
create policy cal_imports_insert on public.calendar_imports for insert with check (user_id = auth.uid() and household_id = public.my_household());
create policy cal_imports_update on public.calendar_imports for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cal_imports_delete on public.calendar_imports for delete using (user_id = auth.uid());

alter table public.events add column if not exists source text;

select cron.schedule('gcal-sync', '7 * * * *', $$
  select net.http_post(
    url := 'https://kzxiifuapumtnjpwcrxt.supabase.co/functions/v1/gcal-sync',
    body := '{"type":"cron"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 60000
  )
$$);
