-- F-08: ผู้สร้างรายการปลอมไม่ได้ + บันทึกว่าใครทำอะไรเมื่อไร
-- audit_log ไม่ใช่ที่กู้ข้อมูล: ไม่เก็บค่าเก่า/ใหม่ ไม่มีจำนวนเงินหรือข้อความ เก็บแค่ชื่อคอลัมน์ที่เปลี่ยน
-- ไม่เปลี่ยนข้อมูลเดิม ไม่แก้โค้ดแอป

-- 1) created_by เชื่อถือได้
--    คำขอจากแอปโดยตรง (role authenticated): insert = คนที่ล็อกอิน, update = คงค่าเดิม
--    ระบบ (service role, cron, ฟังก์ชัน security definer เช่น respond_card_bill) ตั้งค่าเองได้เหมือนเดิม
create or replace function public.guard_created_by() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    else
      new.created_by := old.created_by;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_created_by() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['bills','card_bill_paid','card_charges','credit_cards','event_comments','events','expenses',
                           'incomes','savings_deposits','savings_goals','shopping_items','star_log'] loop
    execute format('create or replace trigger a_guard_created_by before insert or update on public.%I
                    for each row execute function public.guard_created_by()', t);
  end loop;
end $$;

-- 2) audit_log
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  household_id uuid,
  table_name text not null,
  row_id text,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor uuid,
  actor_role text,
  changed_cols text[],
  owner_only uuid, -- รายการส่วนตัว/เห็นคนเดียว: เห็นเฉพาะเจ้าของ
  at timestamptz not null default now()
);
create index if not exists audit_log_household_at on public.audit_log (household_id, at desc);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
create policy audit_parents_read on public.audit_log for select
  using (household_id = public.my_household() and public.is_parent() and (owner_only is null or owner_only = auth.uid()));

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  o jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  n jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  cols text[];
  hid uuid := coalesce((r->>'household_id')::uuid, case when tg_table_name = 'households' then (r->>'id')::uuid end);
  uid uuid := auth.uid();
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into cols from jsonb_object_keys(n) k
    where n->k is distinct from o->k and k not in ('updated_at', 'updated_by', 'last_seen_at', 'tour_done', 'ui_prefs');
    if cols is null then return null; end if; -- ไม่มีอะไรเปลี่ยนจริง (เช่น ping ออนไลน์, sync ปฏิทินซ้ำ)
  end if;
  insert into audit_log (household_id, table_name, row_id, action, actor, actor_role, changed_cols, owner_only)
  values (hid, tg_table_name,
    coalesce(r->>'id', r->>'user_id', r->>'key', r->>'card_id'),
    lower(tg_op), uid,
    coalesce((select role from members where user_id = uid), case when uid is null then 'system' end),
    cols,
    case when coalesce((r->>'private')::boolean, false) or r->>'paid_from' = 'personal' then (r->>'created_by')::uuid end);
  return null;
end $$;
revoke execute on function public.audit_row() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['expenses','bills','settlements','savings_goals','savings_deposits','events','star_log',
                           'members','household_people','households','credit_cards','card_charges','incomes','card_bill_paid'] loop
    execute format('create or replace trigger z_audit after insert or update or delete on public.%I
                    for each row execute function public.audit_row()', t);
  end loop;
end $$;
