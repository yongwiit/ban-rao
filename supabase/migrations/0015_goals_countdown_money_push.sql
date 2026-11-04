-- เป้าออมเงิน, นับถอยหลัง, พร้อมเพย์ (สร้าง QR เท่านั้น ไม่เชื่อมธนาคาร), แจ้งเตือนเรื่องเงิน

-- เบอร์พร้อมเพย์ (มือถือ 10 หลัก / เลขบัตร 13 หลัก / e-wallet 15 หลัก) ใช้สร้าง QR ให้อีกฝ่ายสแกนโอน
alter table public.household_people add column if not exists promptpay text
  check (promptpay is null or promptpay ~ '^([0-9]{10}|[0-9]{13}|[0-9]{15})$');

-- นัดที่อยากนับถอยหลังบนหน้าวันนี้
alter table public.events add column if not exists countdown boolean not null default false;

-- ตั้งค่าแจ้งเตือนเรื่องเงิน
alter table public.push_subscriptions add column if not exists notify_money boolean not null default true;
alter table public.push_subscriptions add column if not exists notify_daily boolean not null default true;

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 60),
  emoji text not null default '🐷',
  target numeric(12, 2) not null check (target > 0 and target < 100000000),
  deadline date,
  promptpay text check (promptpay is null or promptpay ~ '^([0-9]{10}|[0-9]{13}|[0-9]{15})$'),
  active boolean not null default true,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.savings_deposits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  amount numeric(12, 2) not null check (amount <> 0 and abs(amount) < 100000000),
  who text not null default 'pot',
  note text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists savings_deposits_goal_idx on public.savings_deposits (goal_id, created_at desc);

alter table public.savings_goals enable row level security;
alter table public.savings_deposits enable row level security;
create policy "goals parents" on public.savings_goals for all
  using (household_id = public.my_household() and public.is_parent())
  with check (household_id = public.my_household() and public.is_parent());
create policy "deposits parents" on public.savings_deposits for all
  using (household_id = public.my_household() and public.is_parent())
  with check (household_id = public.my_household() and public.is_parent()
    and exists (select 1 from public.savings_goals g where g.id = goal_id and g.household_id = public.my_household()));

-- กันแจ้งเตือนเรื่องเงินส่งซ้ำ (เข้าถึงได้เฉพาะ service role)
create table if not exists public.notify_log (
  key text primary key,
  sent_at timestamptz not null default now()
);
alter table public.notify_log enable row level security;

-- จดรายจ่ายใหม่ → แจ้งอีกฝ่าย + เช็กงบ
create or replace function public.expenses_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://kzxiifuapumtnjpwcrxt.supabase.co/functions/v1/push-notify',
    body := jsonb_build_object('type', 'expense', 'expense_id', new.id),
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  return new;
end $$;
create or replace trigger expenses_notify after insert on public.expenses
  for each row execute function public.expenses_notify();

alter publication supabase_realtime add table public.savings_goals, public.savings_deposits;
