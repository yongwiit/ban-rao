create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.events
  add column if not exists repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  add column if not exists remind_before int check (remind_before is null or remind_before between 0 and 43200);

-- เครื่องที่เปิดรับแจ้งเตือน (หนึ่งแถวต่อเครื่อง)
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  notify_new boolean not null default true,
  notify_remind boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_own_select on public.push_subscriptions for select using (user_id = auth.uid());
create policy push_own_insert on public.push_subscriptions for insert with check (user_id = auth.uid() and household_id = public.my_household());
create policy push_own_update on public.push_subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_own_delete on public.push_subscriptions for delete using (user_id = auth.uid());

-- กันส่งซ้ำ: kind = 'new' หรือ 'remind', fire_at = เวลาที่ควรเตือน
create table if not exists public.push_log (
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null,
  fire_at timestamptz not null default 'epoch',
  sent_at timestamptz not null default now(),
  primary key (event_id, kind, fire_at)
);
alter table public.push_log enable row level security;

-- กุญแจฝั่งเซิร์ฟเวอร์ (อ่านได้เฉพาะ service role)
create table if not exists public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
revoke all on public.push_log from anon, authenticated;

-- ใครแก้ล่าสุด (ใช้ไม่ส่งแจ้งเตือนหาคนที่แก้เอง)
alter table public.events
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid;

create or replace function public.events_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.created_by);
  return new;
end $$;
create or replace trigger events_touch before insert or update on public.events
  for each row execute function public.events_touch();

-- แจ้งเตือนเมื่อมีนัดใหม่ หรือแก้วัน/เวลา/ชื่อนัด
create or replace function public.notify_event_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.title, new.starts_at, new.ends_at, new.all_day, new.who)
     is not distinct from (old.title, old.starts_at, old.ends_at, old.all_day, old.who) then
    return new;
  end if;
  perform net.http_post(
    url := 'https://kzxiifuapumtnjpwcrxt.supabase.co/functions/v1/push-notify',
    body := jsonb_build_object('type', case when tg_op = 'INSERT' then 'new' else 'change' end, 'event_id', new.id),
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  return new;
end $$;
create or replace trigger events_notify after insert or update on public.events
  for each row execute function public.notify_event_change();

-- เช็กเตือนทุก 5 นาที
select cron.schedule('push-reminders', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://kzxiifuapumtnjpwcrxt.supabase.co/functions/v1/push-notify',
    body := '{"type":"cron"}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb
  )
$$);

-- ฟีดปฏิทินรุ่นใหม่ ส่งข้อมูลนัดซ้ำด้วย
create or replace function public.calendar_feed_v2(p_token text)
returns table (id uuid, title text, starts_at timestamptz, ends_at timestamptz, all_day boolean, who text, note text, private boolean, updated_at timestamptz, repeat text, remind_before int)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.starts_at, e.ends_at, e.all_day, e.who, e.note, e.private, e.updated_at, e.repeat, e.remind_before
  from calendar_tokens t
  join members m on m.user_id = t.user_id
  join events e on e.household_id = m.household_id
  where t.token = p_token and length(p_token) >= 32
    and (not e.private or e.created_by = t.user_id)
    and (e.starts_at > now() - interval '180 days' or e.repeat <> 'none')
  order by e.starts_at
$$;
revoke all on function public.calendar_feed_v2(text) from public;
grant execute on function public.calendar_feed_v2(text) to anon, authenticated;
