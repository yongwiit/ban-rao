-- บ้านเรา: ฐานข้อมูลเริ่มต้น
-- วิธีใช้: เปิด Supabase > SQL Editor > วางไฟล์นี้ทั้งไฟล์ > Run

create extension if not exists pgcrypto;

-- บ้าน 1 หลัง = 1 household
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'บ้านเรา',
  join_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  monthly_budget numeric(12,2) not null default 25000,
  budget_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- สมาชิกที่ล็อกอินได้ (พ่อ/แม่)
create table public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  role text not null check (role in ('dad', 'mom')),
  created_at timestamptz not null default now(),
  unique (household_id, role)
);

create or replace function public.my_household()
returns uuid language sql stable security definer set search_path = public as $$
  select household_id from public.members where user_id = auth.uid()
$$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.members where user_id = auth.uid()
$$;

-- นัดหมาย / ปฏิทิน
create table public.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  all_day boolean not null default false,
  who text not null default 'all' check (who in ('dad', 'mom', 'pearl', 'all')),
  note text,
  private boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  body text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

-- ลิสต์ซื้อของ
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  name text not null,
  sort int not null default 0
);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  name text not null,
  done boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

-- รายจ่าย
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  spent_at timestamptz not null default now(),
  merchant text not null default '',
  category text not null default 'home' check (category in ('home', 'food', 'pearl', 'bill', 'car', 'gift', 'other')),
  paid_from text not null default 'pot' check (paid_from in ('pot', 'dad', 'mom')),
  private boolean not null default false,
  status text not null default 'confirmed' check (status in ('pending', 'confirmed')),
  slip_ref text,
  bank text,
  note text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (household_id, slip_ref)
);

-- บิลประจำ (คำนวณเงินเก็บต่อเดือนในแอป)
create table public.bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  period text not null default 'monthly' check (period in ('monthly', 'yearly', 'term')),
  due_day int check (due_day between 1 and 31),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- การเคลียร์ยอดระหว่างพ่อกับแม่
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  from_role text not null check (from_role in ('dad', 'mom')),
  to_role text not null check (to_role in ('dad', 'mom')),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

-- สิทธิ์: เห็นเฉพาะบ้านตัวเอง และรายการ "เห็นคนเดียว" เห็นเฉพาะคนสร้าง
alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.events enable row level security;
alter table public.event_comments enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;
alter table public.expenses enable row level security;
alter table public.bills enable row level security;
alter table public.settlements enable row level security;

create policy households_rw on public.households for all
  using (id = public.my_household()) with check (id = public.my_household());
create policy members_read on public.members for select
  using (household_id = public.my_household());

create policy events_rw on public.events for all
  using (household_id = public.my_household() and (not private or created_by = auth.uid()))
  with check (household_id = public.my_household() and (not private or created_by = auth.uid()));
create policy event_comments_rw on public.event_comments for all
  using (household_id = public.my_household()) with check (household_id = public.my_household());
create policy shopping_lists_rw on public.shopping_lists for all
  using (household_id = public.my_household()) with check (household_id = public.my_household());
create policy shopping_items_rw on public.shopping_items for all
  using (household_id = public.my_household()) with check (household_id = public.my_household());
create policy expenses_rw on public.expenses for all
  using (household_id = public.my_household() and (not private or created_by = auth.uid()))
  with check (household_id = public.my_household() and (not private or created_by = auth.uid()));
create policy bills_rw on public.bills for all
  using (household_id = public.my_household()) with check (household_id = public.my_household());
create policy settlements_rw on public.settlements for all
  using (household_id = public.my_household()) with check (household_id = public.my_household());

-- สร้างบ้านใหม่ (คนแรก)
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
    (hid, 'ซูเปอร์', 0), (hid, 'ร้านยา', 1), (hid, 'ของน้องเพิร์ล', 2);
  return hid;
end $$;

-- เข้าร่วมบ้านด้วยรหัส (คนที่สอง)
create or replace function public.join_household(p_code text, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into hid from households where join_code = upper(trim(p_code));
  if hid is null then raise exception 'รหัสบ้านไม่ถูกต้อง'; end if;
  insert into members (user_id, household_id, role) values (auth.uid(), hid, p_role)
    on conflict (user_id) do nothing;
  return hid;
end $$;

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;

-- ซิงค์ทันทีเมื่ออีกฝั่งแก้ไข
alter publication supabase_realtime add table
  public.events, public.event_comments, public.shopping_items, public.expenses, public.bills, public.settlements;
