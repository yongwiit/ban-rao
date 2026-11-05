-- 0033: เดือนที่จ่ายของค่าใช้จ่ายรายปี/ต่อเทอม (ไว้กันเงินทุกเดือนแบบ sinking fund)
alter table public.bills add column if not exists due_month smallint check (due_month between 1 and 12);
