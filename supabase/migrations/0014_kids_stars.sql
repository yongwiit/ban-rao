-- บัญชีลูก + สมุดสะสมดาว ⭐
-- ลูกเข้าบ้านด้วยรหัสบ้าน แล้วเลือกว่าเป็นลูกคนไหน (role = key ใน household_people)
alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check check (role ~ '^(dad|mom|pearl|kid[0-9]{1,2})$');

create or replace function public.is_parent() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where user_id = auth.uid() and role in ('dad', 'mom'));
$$;
grant execute on function public.is_parent() to authenticated;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from members where user_id = auth.uid();
$$;
grant execute on function public.my_role() to authenticated;

-- ลูกไม่เห็นเรื่องเงิน (policy แบบ restrictive จะ AND กับของเดิม)
create policy "money parents only" on public.expenses as restrictive for all using (public.is_parent()) with check (public.is_parent());
create policy "bills parents only" on public.bills as restrictive for all using (public.is_parent()) with check (public.is_parent());
create policy "settle parents only" on public.settlements as restrictive for all using (public.is_parent()) with check (public.is_parent());
create policy "cats parents only" on public.expense_categories as restrictive for all using (public.is_parent()) with check (public.is_parent());
-- ลูกแก้ข้อมูลบ้าน/สมาชิกไม่ได้
create policy "hh edit parents only" on public.households as restrictive for update using (public.is_parent()) with check (public.is_parent());
create policy "people add parents only" on public.household_people as restrictive for insert with check (public.is_parent());
create policy "people edit parents only" on public.household_people as restrictive for update using (public.is_parent()) with check (public.is_parent());
create policy "people del parents only" on public.household_people as restrictive for delete using (public.is_parent());

create or replace function public.join_household(p_code text, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into hid from households where join_code = upper(trim(p_code));
  if hid is null then raise exception 'รหัสบ้านไม่ถูกต้อง'; end if;
  if p_role not in ('dad', 'mom') and not exists (select 1 from household_people where household_id = hid and key = p_role) then
    raise exception 'ไม่พบชื่อลูกคนนี้ในบ้าน';
  end if;
  insert into members (user_id, household_id, role) values (auth.uid(), hid, p_role)
    on conflict (user_id) do nothing;
  return hid;
end $$;

-- รายชื่อลูกของบ้าน (ใช้ตอนลูกสมัคร ก่อนเป็นสมาชิก)
create or replace function public.household_kids(p_code text)
returns table (key text, name text, mascot text, taken boolean)
language sql stable security definer set search_path = public as $$
  select p.key, p.name, p.mascot, exists (select 1 from members m where m.household_id = p.household_id and m.role = p.key)
  from households h join household_people p on p.household_id = h.id
  where h.join_code = upper(trim(p_code)) and p.key not in ('dad', 'mom') and length(trim(p_code)) >= 6
  order by p.sort, p.key
$$;
grant execute on function public.household_kids(text) to authenticated;

-- งานที่ทำแล้วได้ดาว
create table if not exists public.star_tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 60),
  stars int not null check (stars between 1 and 100),
  emoji text not null default '⭐',
  kid text, -- null = ลูกทุกคน
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- ของรางวัล
create table if not exists public.star_rewards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 60),
  cost int not null check (cost between 1 and 1000),
  emoji text not null default '🎁',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- ประวัติดาว: earn = ได้ดาว (+), redeem = แลกรางวัล (-)
create table if not exists public.star_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kid text not null,
  kind text not null check (kind in ('earn', 'redeem')),
  stars int not null check (stars <> 0),
  title text not null,
  emoji text not null default '⭐',
  status text not null check (status in ('pending', 'approved', 'rejected')),
  created_by uuid not null default auth.uid(),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind = 'earn' and stars > 0) or (kind = 'redeem' and stars < 0))
);
create index if not exists star_log_kid_idx on public.star_log (household_id, kid, created_at desc);

alter table public.star_tasks enable row level security;
alter table public.star_rewards enable row level security;
alter table public.star_log enable row level security;

create policy "tasks read" on public.star_tasks for select using (household_id = public.my_household());
create policy "tasks write" on public.star_tasks for all using (household_id = public.my_household() and public.is_parent()) with check (household_id = public.my_household() and public.is_parent());
create policy "rewards read" on public.star_rewards for select using (household_id = public.my_household());
create policy "rewards write" on public.star_rewards for all using (household_id = public.my_household() and public.is_parent()) with check (household_id = public.my_household() and public.is_parent());

create policy "log read" on public.star_log for select using (household_id = public.my_household());
-- พ่อแม่ให้ดาว/แลกได้เลย ลูกส่งคำขอได้ (ต้องรอพ่อแม่อนุมัติ)
create policy "log add" on public.star_log for insert with check (
  household_id = public.my_household() and created_by = auth.uid()
  and exists (select 1 from public.household_people p where p.household_id = star_log.household_id and p.key = star_log.kid and p.key not in ('dad', 'mom'))
  and (
    (public.is_parent() and status = 'approved')
    or (public.my_role() = kid and status = 'pending')
  )
);
create policy "log decide" on public.star_log for update using (household_id = public.my_household() and public.is_parent()) with check (household_id = public.my_household() and public.is_parent());
create policy "log undo" on public.star_log for delete using (household_id = public.my_household() and public.is_parent());

-- ยอดดาว: ได้ดาวนับเมื่ออนุมัติแล้ว / แลกรางวัลหักทันทีแม้ยังรออนุมัติ (ถ้าไม่อนุมัติ คืนดาว)
create or replace function public.star_balance(p_household uuid, p_kid text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(stars), 0)::int from star_log
  where household_id = p_household and kid = p_kid
    and (status = 'approved' or (kind = 'redeem' and status = 'pending'));
$$;
grant execute on function public.star_balance(uuid, text) to authenticated;

-- ดาวไม่พอ แลกไม่ได้
create or replace function public.star_log_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'redeem' and new.status <> 'rejected' and (tg_op = 'INSERT' or old.status = 'rejected') then
    perform pg_advisory_xact_lock(hashtext(new.household_id::text || new.kid));
    if star_balance(new.household_id, new.kid) + new.stars < 0 then
      raise exception 'ดาวไม่พอ';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.status <> old.status then
    new.decided_by := auth.uid();
    new.decided_at := now();
  end if;
  return new;
end $$;
create or replace trigger star_log_check before insert or update on public.star_log
  for each row execute function public.star_log_check();

-- แจ้งเตือน: ลูกขอดาว/ขอแลก → พ่อแม่ / พ่อแม่ให้ดาวหรืออนุมัติ → ลูก
create or replace function public.star_log_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform net.http_post(
      url := 'https://kzxiifuapumtnjpwcrxt.supabase.co/functions/v1/push-notify',
      body := jsonb_build_object('type', 'star', 'log_id', new.id),
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  end if;
  return new;
end $$;
create or replace trigger star_log_notify after insert or update on public.star_log
  for each row execute function public.star_log_notify();

alter publication supabase_realtime add table public.star_tasks, public.star_rewards, public.star_log;
