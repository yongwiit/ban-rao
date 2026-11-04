-- ลิงก์ปฏิทิน (iCal) ส่วนตัวของแต่ละคน สำหรับ Google / Samsung / Apple Calendar
create table public.calendar_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  created_at timestamptz not null default now()
);
alter table public.calendar_tokens enable row level security;
create policy calendar_tokens_own on public.calendar_tokens for select using (user_id = auth.uid());

create or replace function public.my_calendar_token(p_reset boolean default false)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_reset then delete from calendar_tokens where user_id = auth.uid(); end if;
  insert into calendar_tokens (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select token into t from calendar_tokens where user_id = auth.uid();
  return t;
end $$;

create or replace function public.calendar_feed(p_token text)
returns table (id uuid, title text, starts_at timestamptz, ends_at timestamptz, all_day boolean, who text, note text, private boolean, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.starts_at, e.ends_at, e.all_day, e.who, e.note, e.private, e.created_at
  from calendar_tokens t
  join members m on m.user_id = t.user_id
  join events e on e.household_id = m.household_id
  where t.token = p_token and length(p_token) >= 32
    and (not e.private or e.created_by = t.user_id)
    and e.starts_at > now() - interval '180 days'
  order by e.starts_at
$$;

revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
grant execute on function public.my_calendar_token(boolean) to authenticated;
