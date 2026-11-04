-- 0030: สัดส่วนที่อีกฝ่ายช่วยจ่าย (เช่น ค่าบ้านพ่อจ่าย แม่ช่วย 50%) ใช้ตอนเคลียร์เงินกัน
-- null = ครึ่งหนึ่ง (แบบเดิม)
alter table public.bills add column if not exists other_share numeric check (other_share is null or (other_share >= 0 and other_share <= 1));
alter table public.expenses add column if not exists other_share numeric check (other_share is null or (other_share >= 0 and other_share <= 1));

-- จดอัตโนมัติ: คัดลอกสัดส่วนจากค่าใช้จ่ายประจำไปที่รายจ่าย
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
    insert into expenses (household_id, amount, spent_at, merchant, category, paid_from, private, status, created_by, bill_id, note, other_share)
    values (b.household_id, b.amount, (due::timestamp + time '09:00') at time zone 'Asia/Bangkok', b.name,
      coalesce(b.category, 'bill'), b.paid_from, false, 'confirmed', who, b.id, 'หักอัตโนมัติ', b.other_share);
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

-- ย้อนกลับ: alter table public.bills drop column other_share; alter table public.expenses drop column other_share; (แล้วรัน record_due_bills จาก 0028)
