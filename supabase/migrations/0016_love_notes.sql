-- โน้ตรักถึงกันบนหน้าวันนี้ 💌 (ถึงคนเดียว หรือถึงทั้งบ้าน)
create table if not exists public.love_notes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  from_user uuid not null default auth.uid(),
  to_user uuid, -- null = ถึงทุกคนในบ้าน
  body text not null check (length(trim(body)) between 1 and 120),
  emoji text not null default '💌',
  created_at timestamptz not null default now()
);
create index if not exists love_notes_hh_idx on public.love_notes (household_id, created_at desc);
alter table public.love_notes enable row level security;
create policy "notes read" on public.love_notes for select using (
  household_id = public.my_household() and (to_user is null or to_user = auth.uid() or from_user = auth.uid()));
create policy "notes write" on public.love_notes for insert with check (
  household_id = public.my_household() and from_user = auth.uid()
  and (to_user is null or exists (select 1 from public.members m where m.user_id = to_user and m.household_id = public.my_household())));
create policy "notes delete own" on public.love_notes for delete using (from_user = auth.uid());

create or replace function public.love_notes_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://kzxiifuapumtnjpwcrxt.supabase.co/functions/v1/push-notify',
    body := jsonb_build_object('type', 'note', 'note_id', new.id),
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  return new;
end $$;
create or replace trigger love_notes_notify after insert on public.love_notes
  for each row execute function public.love_notes_notify();

alter publication supabase_realtime add table public.love_notes;
