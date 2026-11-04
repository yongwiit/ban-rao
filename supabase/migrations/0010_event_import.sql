-- นำเข้านัดจาก Google Calendar (.ics): จำ UID เดิมไว้กันซ้ำ และไม่ส่งแจ้งเตือนรัวๆ ตอนนำเข้า
alter table public.events add column if not exists external_uid text;
alter table public.events add constraint events_household_external_uid unique (household_id, external_uid);

create or replace function public.notify_event_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.external_uid is not null then return new; end if;
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
