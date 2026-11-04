-- บัตรเครดิต (รายการต่อบัตร จ่ายเต็ม/ผ่อน เรียกเก็บจากคนในบ้าน แจ้งเตือน), เงินเดือน, ค่าใช้จ่ายประจำรายวัน
-- เพิ่มตารางใหม่อย่างเดียว ไม่แก้หรือลบข้อมูลเดิม (แก้แค่ให้บิลเลือก "ทุกวัน" ได้)
-- ทุกตารางเห็นเฉพาะพ่อแม่ ลูกไม่เห็น · "เห็นคนเดียว" เห็นเฉพาะคนสร้าง
-- ย้อนกลับ: ดูท้ายไฟล์

-- ค่าใช้จ่ายประจำเลือก "ทุกวัน" ได้
alter table public.bills drop constraint if exists bills_period_check;
alter table public.bills add constraint bills_period_check check (period in ('daily', 'monthly', 'yearly', 'term'));

-- บัตรเครดิต
create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  bank text check (bank is null or length(bank) <= 40),
  last4 text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  owner text not null default 'dad' check (owner ~ '^(dad|mom|pearl|kid[0-9]{1,2})$'),
  statement_day int not null check (statement_day between 1 and 31),
  due_day int not null check (due_day between 1 and 31),
  credit_limit numeric(12, 2) check (credit_limit is null or (credit_limit > 0 and credit_limit < 100000000)),
  color text not null default '#5E8FC9' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  private boolean not null default false,
  active boolean not null default true,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

-- รายการที่รูดบัตร: months = 1 จ่ายเต็ม, มากกว่า 1 = ผ่อน (งวดที่จ่ายแล้วคำนวณจากวันรูด + รอบตัดบัตร)
create table if not exists public.card_charges (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  card_id uuid not null references public.credit_cards(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 80),
  amount numeric(12, 2) not null check (amount > 0 and amount < 100000000),
  charged_on date not null default (now() at time zone 'Asia/Bangkok')::date,
  months int not null default 1 check (months between 1 and 60),
  category text check (category is null or length(category) <= 30),
  -- เรียกเก็บจากคนในบ้าน (เต็มหรือบางส่วน)
  bill_to text check (bill_to is null or bill_to ~ '^(dad|mom|pearl|kid[0-9]{1,2})$'),
  bill_amount numeric(12, 2) check (bill_amount is null or bill_amount > 0),
  bill_paid boolean not null default false,
  note text check (note is null or length(note) <= 200),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  check (bill_amount is null or bill_amount <= amount)
);
create index if not exists card_charges_card_idx on public.card_charges (card_id, charged_on desc);

-- กดแจ้งเตือนคนในบ้านเรื่องรายการบัตร (ส่ง push)
create table if not exists public.card_nudges (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  charge_id uuid not null references public.card_charges(id) on delete cascade,
  to_who text not null check (to_who ~ '^(dad|mom|pearl|kid[0-9]{1,2})$'),
  from_user uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

-- รายได้ต่อเดือน (เงินเดือน ฯลฯ) ใช้ดูว่าใช้จ่ายกี่ % ของรายได้
create table if not exists public.incomes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  who text not null default 'dad' check (who ~ '^(dad|mom|pearl|kid[0-9]{1,2})$'),
  label text not null default 'เงินเดือน' check (length(trim(label)) between 1 and 40),
  amount numeric(12, 2) not null check (amount > 0 and amount < 100000000),
  private boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.credit_cards enable row level security;
alter table public.card_charges enable row level security;
alter table public.card_nudges enable row level security;
alter table public.incomes enable row level security;

-- กันกดรัว: รายการละ 1 ครั้งต่อ 30 วินาที (ฟังก์ชัน เพื่อไม่ให้ policy อ้างตารางตัวเองวนซ้ำ)
create or replace function public.card_nudge_recent(p_charge uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from card_nudges where charge_id = p_charge and created_at > now() - interval '30 seconds');
$$;
revoke all on function public.card_nudge_recent(uuid) from public;
grant execute on function public.card_nudge_recent(uuid) to authenticated;

create policy cards_rw on public.credit_cards for all
  using (household_id = public.my_household() and (not private or created_by = auth.uid()))
  with check (household_id = public.my_household() and (not private or created_by = auth.uid()));
-- รายการเห็นได้เมื่อเห็นบัตร (RLS ของ credit_cards ใช้ใน subquery ด้วย)
create policy charges_rw on public.card_charges for all
  using (household_id = public.my_household() and exists (select 1 from public.credit_cards c where c.id = card_id))
  with check (household_id = public.my_household() and exists (select 1 from public.credit_cards c where c.id = card_id and c.household_id = public.my_household()));
create policy nudges_read on public.card_nudges for select
  using (household_id = public.my_household() and exists (select 1 from public.card_charges x where x.id = charge_id));
create policy nudges_send on public.card_nudges for insert
  with check (
    from_user = auth.uid()
    and household_id = public.my_household()
    and exists (select 1 from public.card_charges x where x.id = charge_id and x.household_id = public.my_household())
    and not public.card_nudge_recent(charge_id)
  );
create policy incomes_rw on public.incomes for all
  using (household_id = public.my_household() and (not private or created_by = auth.uid()))
  with check (household_id = public.my_household() and (not private or created_by = auth.uid()));

-- ลูกไม่เห็นเรื่องเงิน
create policy "cards parents only" on public.credit_cards as restrictive for all using (public.is_parent()) with check (public.is_parent());
create policy "charges parents only" on public.card_charges as restrictive for all using (public.is_parent()) with check (public.is_parent());
create policy "nudges parents only" on public.card_nudges as restrictive for all using (public.is_parent()) with check (public.is_parent());
create policy "incomes parents only" on public.incomes as restrictive for all using (public.is_parent()) with check (public.is_parent());

-- กดแจ้งเตือน → push-notify (เก็บประวัติ 30 วัน)
create or replace function public.card_nudges_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from card_nudges where created_at < now() - interval '30 days';
  perform net.http_post(
    url := 'https://kzxiifuapumtnjpwcrxt.supabase.co/functions/v1/push-notify',
    body := jsonb_build_object('type', 'card_nudge', 'nudge_id', new.id),
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  return new;
end $$;
create or replace trigger card_nudges_notify after insert on public.card_nudges
  for each row execute function public.card_nudges_after_insert();

do $$ begin
  alter publication supabase_realtime add table public.credit_cards, public.card_charges, public.incomes;
exception when duplicate_object then null; end $$;

-- ย้อนกลับ:
-- drop table if exists public.card_nudges, public.card_charges, public.credit_cards, public.incomes;
-- drop function if exists public.card_nudges_after_insert(), public.card_nudge_recent(uuid);
-- update public.bills set period = 'monthly' where period = 'daily';  -- (ถ้ามี) แล้วคืน check เดิม
-- alter table public.bills drop constraint bills_period_check;
-- alter table public.bills add constraint bills_period_check check (period in ('monthly', 'yearly', 'term'));
