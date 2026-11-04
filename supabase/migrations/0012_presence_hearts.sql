-- สถานะออนไลน์ (เห็นล่าสุด) และส่งหัวใจ 💗
alter table public.members add column if not exists last_seen_at timestamptz;

-- อัปเดตเวลาเห็นล่าสุดของตัวเอง
create or replace function public.touch_presence() returns void
language sql security definer set search_path = public as $$
  update members set last_seen_at = now() where user_id = auth.uid();
$$;
revoke all on function public.touch_presence() from public;
grant execute on function public.touch_presence() to authenticated;

create table if not exists public.hearts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists hearts_to_idx on public.hearts (to_user, created_at desc);
alter table public.hearts enable row level security;

drop policy if exists "hearts read" on public.hearts;
create policy "hearts read" on public.hearts for select
  using (household_id = public.my_household());
drop policy if exists "hearts send" on public.hearts;
create policy "hearts send" on public.hearts for insert
  with check (
    from_user = auth.uid()
    and household_id = public.my_household()
    and to_user <> auth.uid()
    and exists (select 1 from public.members m where m.user_id = to_user and m.household_id = hearts.household_id)
    -- กันกดรัว: คนละ 1 ดวงต่อ 20 วินาทีต่อคน
    and not exists (select 1 from public.hearts h where h.from_user = auth.uid() and h.to_user = hearts.to_user and h.created_at > now() - interval '20 seconds')
  );

-- เก็บแค่ 30 วันพอ
create or replace function public.hearts_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from hearts where created_at < now() - interval '30 days';
  perform net.http_post(
    url := 'https://kzxiifuapumtnjpwcrxt.supabase.co/functions/v1/push-notify',
    body := jsonb_build_object('type', 'heart', 'heart_id', new.id),
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  return new;
end $$;
create or replace trigger hearts_notify after insert on public.hearts
  for each row execute function public.hearts_after_insert();

do $$ begin
  alter publication supabase_realtime add table public.hearts;
exception when duplicate_object then null; end $$;
