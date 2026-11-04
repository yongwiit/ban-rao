-- สมาชิกในบ้านแบบแก้ได้: ชื่อ ตัวการ์ตูน สี และเพิ่มลูกได้หลายคน
-- key: dad, mom (ผูกกับบัญชีพ่อแม่), pearl = ลูกคนแรก, kid2..kid99 = ลูกคนต่อไป
create table if not exists public.household_people (
  household_id uuid not null references public.households(id) on delete cascade,
  key text not null check (key ~ '^(dad|mom|pearl|kid[0-9]{1,2})$'),
  name text not null check (length(trim(name)) between 1 and 20),
  mascot text not null default 'bear' check (mascot in ('bear', 'bunny', 'chick', 'cat', 'puppy', 'panda', 'piggy', 'frog')),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort int not null default 0,
  primary key (household_id, key)
);
alter table public.household_people enable row level security;
create policy "people read" on public.household_people for select using (household_id = public.my_household());
create policy "people add kid" on public.household_people for insert with check (household_id = public.my_household() and key not in ('dad', 'mom'));
create policy "people edit" on public.household_people for update using (household_id = public.my_household()) with check (household_id = public.my_household());
create policy "people remove kid" on public.household_people for delete using (household_id = public.my_household() and key not in ('dad', 'mom'));
alter publication supabase_realtime add table public.household_people;

-- ค่าเริ่มต้นของบ้านใหม่
create or replace function public.seed_people(hid uuid) returns void
language sql security definer set search_path = public as $$
  insert into household_people (household_id, key, name, mascot, color, sort) values
    (hid, 'dad', 'พ่อหมี', 'bear', '#5E8FC9', 0),
    (hid, 'mom', 'แม่กระต่าย', 'bunny', '#D9738F', 1),
    (hid, 'pearl', 'ลูกเจี๊ยบ', 'chick', '#D9941F', 2)
  on conflict do nothing;
$$;
revoke all on function public.seed_people(uuid) from public, anon, authenticated;

create or replace function public.households_seed_people() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform seed_people(new.id);
  return new;
end $$;
create or replace trigger households_seed_people after insert on public.households
  for each row execute function public.households_seed_people();

-- บ้านที่มีอยู่แล้ว: ใช้ชื่อเดิมของบ้านนั้น
insert into public.household_people (household_id, key, name, mascot, color, sort)
select h.id, v.key, v.name, v.mascot, v.color, v.sort
from public.households h
cross join (values
  ('dad', 'พ่ออั้ม', 'bear', '#5E8FC9', 0),
  ('mom', 'แม่แพ็ค', 'bunny', '#D9738F', 1),
  ('pearl', 'น้องเพิร์ล', 'chick', '#D9941F', 2)
) as v(key, name, mascot, color, sort)
on conflict do nothing;

-- นัดเป็นของลูกคนไหนก็ได้
alter table public.events drop constraint if exists events_who_check;
alter table public.events add constraint events_who_check check (who ~ '^(dad|mom|all|pearl|kid[0-9]{1,2})$');
alter table public.calendar_imports drop constraint if exists calendar_imports_who_check;
alter table public.calendar_imports add constraint calendar_imports_who_check check (who ~ '^(dad|mom|all|pearl|kid[0-9]{1,2})$');

-- ลิสต์ซื้อของเริ่มต้นของบ้านใหม่
create or replace function public.create_household(p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then
    return (select household_id from members where user_id = auth.uid());
  end if;
  insert into households default values returning id into hid;
  insert into members (user_id, household_id, role) values (auth.uid(), hid, p_role);
  insert into shopping_lists (household_id, name, sort) values
    (hid, 'ซูเปอร์', 0), (hid, 'ร้านยา', 1), (hid, 'ของลูก', 2);
  return hid;
end $$;

-- ชื่อคนในบ้านสำหรับฟีดปฏิทิน
create or replace function public.calendar_people(p_token text)
returns table (key text, name text)
language sql stable security definer set search_path = public as $$
  select p.key, p.name
  from calendar_tokens t
  join members m on m.user_id = t.user_id
  join household_people p on p.household_id = m.household_id
  where t.token = p_token and length(p_token) >= 32
$$;
revoke all on function public.calendar_people(text) from public;
grant execute on function public.calendar_people(text) to anon, authenticated;
