-- เตือนไปซื้อของ ต่อลิสต์
alter table public.shopping_lists
  add column if not exists remind_at timestamptz,
  add column if not exists remind_repeat text not null default 'none' check (remind_repeat in ('none', 'daily', 'weekly', 'monthly'));
