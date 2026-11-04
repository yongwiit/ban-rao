-- บัตร: subscription รายเดือน/รายปี, เรียกเก็บแล้วอีกฝ่ายกดยืนยันก่อนบันทึก
-- ค่าใช้จ่ายประจำ: ของบ้าน/ส่วนตัว, หักบัญชีอัตโนมัติ (จดรายจ่ายให้เอง), ยอดไม่คงที่ (ปุ่มจดยอดเดือนนี้)
-- หมวด: ซ่อนหมวดตั้งต้นได้
-- เพิ่มคอลัมน์/ตารางอย่างเดียว ไม่ลบข้อมูลเดิม · ย้อนกลับ: ดูท้ายไฟล์

-- 1) subscription ในบัตร
alter table public.card_charges add column if not exists repeat text not null default 'none' check (repeat in ('none', 'monthly', 'yearly'));
alter table public.card_charges add column if not exists ended_on date;
alter table public.card_charges add constraint card_charges_repeat_full check (repeat = 'none' or months = 1);

-- 2) เรียกเก็บ: none = ไม่ได้ขอยืนยัน, pending = รออีกฝ่ายกดยืนยัน, accepted / rejected
alter table public.card_charges add column if not exists bill_status text not null default 'none' check (bill_status in ('none', 'pending', 'accepted', 'rejected'));

-- 3, 5) ค่าใช้จ่ายประจำ
alter table public.bills add column if not exists paid_from text not null default 'pot' check (paid_from in ('pot', 'dad', 'mom', 'personal'));
alter table public.bills add column if not exists category text check (category is null or length(category) between 1 and 30);
alter table public.bills add column if not exists created_by uuid default auth.uid();
alter table public.bills add column if not exists auto_record boolean not null default false;
alter table public.bills add column if not exists auto_from date;
alter table public.bills add column if not exists variable boolean not null default false;
-- ส่วนตัว เห็นเฉพาะคนสร้าง (เหมือนรายจ่ายส่วนตัว)
create policy bills_personal_owner_only on public.bills as restrictive for all
  using (paid_from <> 'personal' or created_by = auth.uid())
  with check (paid_from <> 'personal' or created_by = auth.uid());

-- รายจ่ายที่มาจากบิลประจำ / จากการแชร์รายการบัตร
alter table public.expenses add column if not exists bill_id uuid references public.bills(id) on delete set null;
alter table public.expenses add column if not exists card_charge_id uuid references public.card_charges(id) on delete set null;
create index if not exists expenses_bill_idx on public.expenses (bill_id, spent_at) where bill_id is not null;

-- 4) ซ่อนหมวดตั้งต้นที่ไม่ใช้
alter table public.households add column if not exists hidden_categories text[] not null default '{}';

-- 3) หักบัญชีอัตโนมัติ: ถึงวันที่กำหนดจดเป็นรายจ่ายให้ (เดือนละครั้ง ไม่ซ้ำ)
create table if not exists public.bill_runs (
  bill_id uuid not null references public.bills(id) on delete cascade,
  period text not null,
  created_at timestamptz not null default now(),
  primary key (bill_id, period)
);
alter table public.bill_runs enable row level security; -- ไม่มี policy = เข้าถึงได้เฉพาะระบบ

create or replace function public.record_due_bills() returns int
language plpgsql security definer set search_path = public as $$
declare
  b record; today date := (now() at time zone 'Asia/Bangkok')::date; due date; who uuid; n int := 0;
begin
  for b in select * from bills where active and auto_record and not variable and period = 'monthly' and due_day is not null loop
    due := make_date(extract(year from today)::int, extract(month from today)::int,
      least(b.due_day, extract(day from (date_trunc('month', today) + interval '1 month - 1 day'))::int));
    continue when due > today or (b.auto_from is not null and due < b.auto_from);
    insert into bill_runs (bill_id, period) values (b.id, to_char(due, 'YYYY-MM')) on conflict do nothing;
    continue when not found;
    who := coalesce(b.created_by, (select user_id from members where household_id = b.household_id and role in ('dad', 'mom') order by role limit 1));
    continue when who is null;
    insert into expenses (household_id, amount, spent_at, merchant, category, paid_from, private, status, created_by, bill_id, note)
    values (b.household_id, b.amount, (due::timestamp + time '09:00') at time zone 'Asia/Bangkok', b.name,
      coalesce(b.category, 'bill'), b.paid_from, false, 'confirmed', who, b.id, 'หักอัตโนมัติ');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.record_due_bills() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('record-due-bills');
exception when others then null; end $$;
select cron.schedule('record-due-bills', '15 * * * *', 'select public.record_due_bills()');

-- 2) คำขอเรียกเก็บที่รอฉันยืนยัน (เห็นได้แม้บัตรเป็น "เห็นคนเดียว" ของอีกฝ่าย เฉพาะรายการที่ขอมาที่ฉัน)
create or replace function public.my_card_bill_requests()
returns table (id uuid, title text, amount numeric, bill_amount numeric, months int, repeat text, charged_on date, card_name text, from_role text, category text)
language sql stable security definer set search_path = public as $$
  select x.id, x.title, x.amount, x.bill_amount, x.months, x.repeat, x.charged_on, c.name, m.role, x.category
  from card_charges x
  join credit_cards c on c.id = x.card_id
  left join members m on m.user_id = x.created_by
  where x.household_id = public.my_household() and public.is_parent()
    and x.bill_status = 'pending' and x.bill_to = public.my_role() and x.created_by <> auth.uid()
  order by x.created_at;
$$;
revoke all on function public.my_card_bill_requests() from public, anon;
grant execute on function public.my_card_bill_requests() to authenticated;

-- ยืนยัน → บันทึกเป็นรายจ่ายส่วนตัวของคนที่ยืนยัน / ปฏิเสธ → แจ้งกลับ
create or replace function public.respond_card_bill(p_charge uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare x record; owner_name text; eid uuid;
begin
  select ch.*, c.name as card_name, c.owner as card_owner into x from card_charges ch join credit_cards c on c.id = ch.card_id
  where ch.id = p_charge and ch.household_id = public.my_household() and ch.bill_status = 'pending'
    and ch.bill_to = public.my_role() and ch.created_by <> auth.uid() for update of ch;
  if not found or not public.is_parent() then raise exception 'ไม่พบคำขอ'; end if;
  if p_accept then
    select name into owner_name from household_people where household_id = x.household_id and key = x.card_owner;
    insert into expenses (household_id, amount, spent_at, merchant, category, paid_from, private, status, created_by, card_charge_id, note)
    values (x.household_id, coalesce(x.bill_amount, x.amount), (x.charged_on::timestamp + time '12:00') at time zone 'Asia/Bangkok',
      x.title || ' (บัตร' || x.card_name || ')', coalesce(x.category, 'other'), 'personal', false, 'confirmed', auth.uid(), x.id,
      'แชร์จากบัตรของ' || coalesce(owner_name, 'คนในบ้าน') || case when x.months > 1 then ' · ผ่อน ' || x.months || ' เดือน' else '' end)
    returning id into eid;
  end if;
  update card_charges set bill_status = case when p_accept then 'accepted' else 'rejected' end where id = p_charge;
  perform net.http_post(
    url := 'https://kzxiifuapumtnjpwcrxt.supabase.co/functions/v1/push-notify',
    body := jsonb_build_object('type', 'card_bill_reply', 'charge_id', p_charge, 'by', auth.uid()),
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  return eid;
end $$;
revoke all on function public.respond_card_bill(uuid, boolean) from public, anon;
grant execute on function public.respond_card_bill(uuid, boolean) to authenticated;

-- ย้อนกลับ:
-- select cron.unschedule('record-due-bills');
-- drop function if exists public.record_due_bills(), public.my_card_bill_requests(), public.respond_card_bill(uuid, boolean);
-- drop table if exists public.bill_runs;
-- drop policy if exists bills_personal_owner_only on public.bills;
-- alter table public.card_charges drop constraint if exists card_charges_repeat_full;
-- alter table public.card_charges drop column if exists repeat, drop column if exists ended_on, drop column if exists bill_status;
-- alter table public.bills drop column if exists paid_from, drop column if exists category, drop column if exists created_by, drop column if exists auto_record, drop column if exists auto_from, drop column if exists variable;
-- alter table public.expenses drop column if exists bill_id, drop column if exists card_charge_id;
-- alter table public.households drop column if exists hidden_categories;
