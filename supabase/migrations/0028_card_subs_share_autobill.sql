-- บัตร: ใครของมัน, subscription รายเดือน/รายปี, เรียกเก็บแล้วอีกฝ่ายกดยืนยันก่อนบันทึก
-- ค่าใช้จ่ายประจำ: ของบ้าน/ส่วนตัว, หักบัญชีอัตโนมัติ, ยอดไม่คงที่
-- หมวด: ไอคอน, ของบ้าน/ส่วนตัว, ซ่อนหมวดตั้งต้นได้
-- เพิ่มคอลัมน์/ตาราง/ฟังก์ชัน ไม่ลบข้อมูลเดิม · ย้อนกลับ: ดูท้ายไฟล์

-- บัตรของใครของมัน: เห็นเฉพาะคนที่เพิ่มบัตร หรือเจ้าของบัตร
alter policy cards_rw on public.credit_cards
  using (household_id = public.my_household() and (created_by = auth.uid() or owner = public.my_role()))
  with check (household_id = public.my_household() and (created_by = auth.uid() or owner = public.my_role()));

-- subscription
alter table public.card_charges add column if not exists repeat text not null default 'none' check (repeat in ('none', 'monthly', 'yearly'));
alter table public.card_charges add column if not exists ended_on date;
alter table public.card_charges add constraint card_charges_repeat_full check (repeat = 'none' or months = 1);

-- เรียกเก็บ: bill_mode home = เข้าเงินบ้าน (เจ้าของบัตรออกก่อน หารในยอดเคลียร์), person = เก็บจากคนนั้น (เต็ม/บางส่วน)
-- bill_status: none = แจ้งเตือนอย่างเดียว (เช่น ลูก), pending = รอยืนยัน, accepted, rejected
alter table public.card_charges add column if not exists bill_mode text not null default 'person' check (bill_mode in ('home', 'person'));
alter table public.card_charges add column if not exists bill_status text not null default 'none' check (bill_status in ('none', 'pending', 'accepted', 'rejected'));

-- สถานะเรียกเก็บตั้งโดยระบบเท่านั้น: ส่งให้พ่อ/แม่ = รอยืนยัน, ลูก = แจ้งเตือนอย่างเดียว
-- แก้ยอด/คน/แบบ/รอบ หลังยืนยันแล้ว → กลับไปรอยืนยันใหม่ · "ยืนยันแล้ว" ตั้งได้จาก respond_card_bill เท่านั้น
create or replace function public.card_charge_bill_status() returns trigger
language plpgsql set search_path = public as $$
declare owner_role text;
begin
  if current_setting('app.bill_reply', true) = '1' then return new; end if;
  select owner into owner_role from credit_cards where id = new.card_id;
  if tg_op = 'UPDATE' and new.bill_to is not distinct from old.bill_to and new.bill_mode = old.bill_mode
     and new.amount = old.amount and new.bill_amount is not distinct from old.bill_amount
     and new.repeat = old.repeat and new.months = old.months and new.charged_on = old.charged_on then
    new.bill_status := old.bill_status;
  else
    new.bill_status := case when new.bill_to in ('dad', 'mom') and new.bill_to <> owner_role then 'pending' else 'none' end;
  end if;
  return new;
end $$;
create or replace trigger card_charges_bill_status before insert or update on public.card_charges
  for each row execute function public.card_charge_bill_status();

-- ค่าใช้จ่ายประจำ
alter table public.bills add column if not exists paid_from text not null default 'pot' check (paid_from in ('pot', 'dad', 'mom', 'personal'));
alter table public.bills add column if not exists category text check (category is null or length(category) between 1 and 30);
alter table public.bills add column if not exists created_by uuid default auth.uid();
alter table public.bills add column if not exists auto_record boolean not null default false;
alter table public.bills add column if not exists auto_from date;
alter table public.bills add column if not exists variable boolean not null default false;
create policy bills_personal_owner_only on public.bills as restrictive for all
  using (paid_from <> 'personal' or created_by = auth.uid())
  with check (paid_from <> 'personal' or created_by = auth.uid());

-- รายจ่ายที่มาจากบิลประจำ / จากรายการบัตร
alter table public.expenses add column if not exists bill_id uuid references public.bills(id) on delete set null;
alter table public.expenses add column if not exists card_charge_id uuid references public.card_charges(id) on delete set null;
create index if not exists expenses_bill_idx on public.expenses (bill_id, spent_at) where bill_id is not null;

-- หมวด
alter table public.households add column if not exists hidden_categories text[] not null default '{}';
alter table public.expense_categories add column if not exists icon text not null default 'other' check (icon ~ '^[a-z]{2,12}$');
alter table public.expense_categories add column if not exists scope text not null default 'home' check (scope in ('home', 'personal'));

-- กันจดอัตโนมัติซ้ำ (เข้าถึงได้เฉพาะระบบ)
create table if not exists public.auto_runs (
  key text primary key,
  created_at timestamptz not null default now()
);
alter table public.auto_runs enable row level security;

-- จดรายจ่ายจาก subscription ที่เรียกเก็บแล้ว 1 รอบ
create or replace function public.record_card_share(x public.card_charges, occ date) returns uuid
language plpgsql security definer set search_path = public as $$
declare c record; owner_name text; eid uuid; who uuid; payer text;
begin
  select * into c from credit_cards where id = x.card_id;
  select name into owner_name from household_people where household_id = x.household_id and key = c.owner;
  if x.bill_mode = 'home' then
    who := x.created_by;
    payer := case when c.owner in ('dad', 'mom') then c.owner else 'pot' end;
  else
    select user_id into who from members where household_id = x.household_id and role = x.bill_to;
    payer := 'personal';
  end if;
  if who is null then return null; end if;
  insert into expenses (household_id, amount, spent_at, merchant, category, paid_from, private, status, created_by, card_charge_id, note)
  values (x.household_id,
    case when x.bill_mode = 'home' then x.amount else coalesce(x.bill_amount, x.amount) end,
    (occ::timestamp + time '12:00') at time zone 'Asia/Bangkok',
    x.title, coalesce(x.category, 'other'), payer, false, 'confirmed', who, x.id,
    'รูดบัตร' || c.name || ' ของ' || coalesce(owner_name, 'คนในบ้าน')
      || case when x.months > 1 then ' · ผ่อน ' || x.months || ' เดือน' else '' end
      || case when x.repeat <> 'none' then ' · subscription' else '' end)
  returning id into eid;
  return eid;
end $$;
revoke all on function public.record_card_share(public.card_charges, date) from public, anon, authenticated;

-- วันที่ของรอบล่าสุด (ไม่เกินวันนี้) ของ subscription
create or replace function public.last_occurrence(x public.card_charges, today date) returns date
language sql immutable as $$
  select case
    when x.repeat = 'none' then x.charged_on
    else (select max(d)::date from generate_series(x.charged_on, today, case when x.repeat = 'yearly' then interval '1 year' else interval '1 month' end) d)
  end;
$$;

-- ทุกชั่วโมง: บิลหักบัญชีอัตโนมัติ + subscription ที่เรียกเก็บแล้ว
create or replace function public.record_due_bills() returns int
language plpgsql security definer set search_path = public as $$
declare
  b record; x public.card_charges; today date := (now() at time zone 'Asia/Bangkok')::date; due date; occ date; who uuid; n int := 0;
begin
  for b in select * from bills where active and auto_record and not variable and period = 'monthly' and due_day is not null loop
    due := make_date(extract(year from today)::int, extract(month from today)::int,
      least(b.due_day, extract(day from (date_trunc('month', today) + interval '1 month - 1 day'))::int));
    continue when due > today or (b.auto_from is not null and due < b.auto_from);
    insert into auto_runs (key) values ('bill:' || b.id || ':' || to_char(due, 'YYYY-MM')) on conflict do nothing;
    continue when not found;
    who := coalesce(b.created_by, (select user_id from members where household_id = b.household_id and role in ('dad', 'mom') order by role limit 1));
    continue when who is null;
    insert into expenses (household_id, amount, spent_at, merchant, category, paid_from, private, status, created_by, bill_id, note)
    values (b.household_id, b.amount, (due::timestamp + time '09:00') at time zone 'Asia/Bangkok', b.name,
      coalesce(b.category, 'bill'), b.paid_from, false, 'confirmed', who, b.id, 'หักอัตโนมัติ');
    n := n + 1;
  end loop;
  for x in select * from card_charges where repeat <> 'none' and bill_status = 'accepted' and charged_on <= today loop
    occ := public.last_occurrence(x, today);
    continue when x.ended_on is not null and occ > x.ended_on;
    insert into auto_runs (key) values ('sub:' || x.id || ':' || occ) on conflict do nothing;
    continue when not found;
    if public.record_card_share(x, occ) is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.record_due_bills() from public, anon, authenticated;

do $$ begin perform cron.unschedule('record-due-bills'); exception when others then null; end $$;
select cron.schedule('record-due-bills', '15 * * * *', 'select public.record_due_bills()');

-- คำขอเรียกเก็บที่รอฉันยืนยัน (เห็นได้แม้เป็นบัตรของอีกฝ่าย เฉพาะรายการที่ขอมาที่ฉัน)
create or replace function public.my_card_bill_requests()
returns table (id uuid, title text, amount numeric, bill_amount numeric, months int, repeat text, bill_mode text, charged_on date, card_name text, from_role text, category text)
language sql stable security definer set search_path = public as $$
  select x.id, x.title, x.amount, x.bill_amount, x.months, x.repeat, x.bill_mode, x.charged_on, c.name, c.owner, x.category
  from card_charges x join credit_cards c on c.id = x.card_id
  where x.household_id = public.my_household() and public.is_parent()
    and x.bill_status = 'pending' and x.bill_to = public.my_role() and x.created_by <> auth.uid()
  order by x.created_at;
$$;
revoke all on function public.my_card_bill_requests() from public, anon;
grant execute on function public.my_card_bill_requests() to authenticated;

-- ยืนยัน → บันทึกรายจ่าย (เข้าเงินบ้าน หรือ ส่วนตัวของคนยืนยัน) / ปฏิเสธ → แจ้งกลับ
create or replace function public.respond_card_bill(p_charge uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare x public.card_charges; eid uuid; occ date; today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  select * into x from card_charges
  where id = p_charge and household_id = public.my_household() and bill_status = 'pending'
    and bill_to = public.my_role() and created_by <> auth.uid() for update;
  if not found or not public.is_parent() then raise exception 'ไม่พบคำขอ'; end if;
  perform set_config('app.bill_reply', '1', true);
  update card_charges set bill_status = case when p_accept then 'accepted' else 'rejected' end where id = p_charge;
  perform set_config('app.bill_reply', '0', true);
  if p_accept then
    occ := public.last_occurrence(x, greatest(today, x.charged_on));
    if x.repeat <> 'none' then insert into auto_runs (key) values ('sub:' || x.id || ':' || occ) on conflict do nothing; end if;
    eid := public.record_card_share(x, occ);
  end if;
  perform net.http_post(
    url := 'https://kzxiifuapumtnjpwcrxt.supabase.co/functions/v1/push-notify',
    body := jsonb_build_object('type', 'card_bill_reply', 'charge_id', p_charge, 'by', auth.uid(), 'accept', p_accept),
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  return eid;
end $$;
revoke all on function public.respond_card_bill(uuid, boolean) from public, anon;
grant execute on function public.respond_card_bill(uuid, boolean) to authenticated;

-- ย้อนกลับ:
-- select cron.unschedule('record-due-bills');
-- drop function if exists public.record_due_bills(), public.my_card_bill_requests(), public.respond_card_bill(uuid, boolean), public.record_card_share(public.card_charges, date), public.last_occurrence(public.card_charges, date);
-- drop trigger if exists card_charges_bill_status on public.card_charges; drop function if exists public.card_charge_bill_status();
-- drop table if exists public.auto_runs;
-- drop policy if exists bills_personal_owner_only on public.bills;
-- alter policy cards_rw on public.credit_cards using (household_id = public.my_household() and (not private or created_by = auth.uid())) with check (household_id = public.my_household() and (not private or created_by = auth.uid()));
-- alter table public.card_charges drop constraint if exists card_charges_repeat_full;
-- alter table public.card_charges drop column if exists repeat, drop column if exists ended_on, drop column if exists bill_mode, drop column if exists bill_status;
-- alter table public.bills drop column if exists paid_from, drop column if exists category, drop column if exists created_by, drop column if exists auto_record, drop column if exists auto_from, drop column if exists variable;
-- alter table public.expenses drop column if exists bill_id, drop column if exists card_charge_id;
-- alter table public.households drop column if exists hidden_categories;
-- alter table public.expense_categories drop column if exists icon, drop column if exists scope;
