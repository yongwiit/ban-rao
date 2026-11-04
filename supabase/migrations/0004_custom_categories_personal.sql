-- หมวดรายจ่ายที่สร้างเองได้ และ "จ่ายส่วนตัว"
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 30),
  created_at timestamptz not null default now(),
  unique (household_id, name)
);
alter table public.expense_categories enable row level security;
create policy expense_categories_rw on public.expense_categories for all
  using (household_id = public.my_household()) with check (household_id = public.my_household());
alter publication supabase_realtime add table public.expense_categories;

alter table public.expenses drop constraint if exists expenses_category_check;
alter table public.expenses add constraint expenses_category_check check (length(trim(category)) between 1 and 30);
alter table public.expenses drop constraint if exists expenses_paid_from_check;
alter table public.expenses add constraint expenses_paid_from_check check (paid_from in ('pot', 'dad', 'mom', 'personal'));
