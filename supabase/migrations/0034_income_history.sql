-- 0034: รายได้มีช่วงเวลา (เงินเดือนขึ้นแล้วเดือนเก่าไม่เปลี่ยน)
-- valid_from = เดือนแรกที่ใช้ยอดนี้ · valid_to = วันสุดท้ายที่ใช้ (null = ยังใช้อยู่)
alter table public.incomes add column if not exists valid_from date not null default '2000-01-01';
alter table public.incomes add column if not exists valid_to date;
alter table public.incomes add constraint incomes_valid_range check (valid_to is null or valid_to >= valid_from);
