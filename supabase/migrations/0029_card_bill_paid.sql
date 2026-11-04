-- 0029: ติ๊ก "จ่ายบิลบัตรแล้ว" ต่อรอบ (บัตร + เดือนที่ครบจ่าย)
-- เห็น/แก้ได้เมื่อเห็นบัตรนั้น (RLS ของ credit_cards ใช้ใน subquery) และเป็นพ่อแม่เท่านั้น
create table if not exists public.card_bill_paid (
  card_id uuid not null references public.credit_cards(id) on delete cascade,
  ym text not null check (ym ~ '^\d{4}-\d{2}$'),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  amount numeric,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (card_id, ym)
);
alter table public.card_bill_paid enable row level security;
create policy card_bill_paid_rw on public.card_bill_paid for all
  using (household_id = public.my_household() and exists (select 1 from public.credit_cards c where c.id = card_id))
  with check (household_id = public.my_household() and exists (select 1 from public.credit_cards c where c.id = card_id and c.household_id = public.my_household()));
create policy "card_bill_paid parents only" on public.card_bill_paid as restrictive for all using (public.is_parent()) with check (public.is_parent());
grant select, insert, delete on public.card_bill_paid to authenticated;
alter publication supabase_realtime add table public.card_bill_paid;

-- ย้อนกลับ: drop table if exists public.card_bill_paid;
