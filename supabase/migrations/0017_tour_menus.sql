-- เมนูที่บ้านเลือกซ่อน + ทัวร์ครั้งแรก
alter table public.households add column if not exists hidden_tabs text[] not null default '{}';
alter table public.members add column if not exists tour_done boolean not null default false;
-- คนที่ใช้อยู่แล้วไม่ต้องเห็นทัวร์
update public.members set tour_done = true where tour_done = false;

create or replace function public.mark_tour_done() returns void
language sql security definer set search_path = public as $$
  update public.members set tour_done = true where user_id = auth.uid();
$$;
grant execute on function public.mark_tour_done() to authenticated;
