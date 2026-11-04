-- ข้อมูลปลอมสำหรับโปรเจกต์ ban-rao-dev เท่านั้น (ห้ามรันบน Production)
-- ไม่มีข้อมูลครอบครัวจริง ทุกชื่อ อีเมล และตัวเลขเป็นของสมมติ
-- รหัสผ่านบัญชีทดสอบส่งเข้ามาเป็นตัวแปร: psql -v test_pw=... -f seed.sql
do $$ begin
  if current_database() <> 'postgres' or exists (select 1 from public.members m join auth.users u on u.id = m.user_id where u.email not like '%@example.com') then
    raise exception 'seed นี้ใช้กับฐาน Dev ที่มีแต่บัญชีทดสอบเท่านั้น';
  end if;
end $$;

-- ล้างข้อมูลทดสอบเดิม (เฉพาะบัญชี @example.com)
delete from public.households where id in ('aaaaaaaa-0000-4000-8000-00000000000a','bbbbbbbb-0000-4000-8000-00000000000b')
  or id in (select household_id from public.members m join auth.users u on u.id = m.user_id where u.email like 'sac.%@example.com');
delete from auth.users where email like '%@example.com';

-- บัญชีทดสอบ
with u(id, email) as (values
  ('a0000000-0000-4000-8000-0000000000d1'::uuid, 'a.dad@example.com'),
  ('a0000000-0000-4000-8000-0000000000f1'::uuid, 'a.mom@example.com'),
  ('a0000000-0000-4000-8000-0000000000c1'::uuid, 'a.kid1@example.com'),
  ('a0000000-0000-4000-8000-0000000000c2'::uuid, 'a.kid2@example.com'),
  ('b0000000-0000-4000-8000-0000000000d1'::uuid, 'b.dad@example.com'),
  ('b0000000-0000-4000-8000-0000000000f1'::uuid, 'b.mom@example.com'),
  ('c0000000-0000-4000-8000-00000000000a'::uuid, 'outsider@example.com'),
  ('d0000000-0000-4000-8000-0000000000d1'::uuid, 'sac.dad@example.com'),
  ('d0000000-0000-4000-8000-0000000000c1'::uuid, 'sac.kid@example.com')
)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  crypt(:'test_pw', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', '', '', '', '', ''
from u;
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email', jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
from auth.users where email like '%@example.com';

-- บ้าน A (4 คน) และบ้าน B (2 คน)
insert into public.households (id, name, join_code, monthly_budget) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'บ้านทดสอบ A', 'TESTAA', 20000),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'บ้านทดสอบ B', 'TESTBB', 15000);
insert into public.household_people (household_id, key, name, mascot, color, sort, promptpay) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'kid2', 'ลูกแมวน้อย', 'cat', '#7A9E5B', 3, null)
on conflict do nothing;
update public.household_people set promptpay = '0800000000' where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and key = 'dad';
insert into public.members (user_id, household_id, role, tour_done) values
  ('a0000000-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-00000000000a', 'dad', true),
  ('a0000000-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-00000000000a', 'mom', true),
  ('a0000000-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-00000000000a', 'pearl', true),
  ('a0000000-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-00000000000a', 'kid2', true),
  ('b0000000-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-00000000000b', 'dad', true),
  ('b0000000-0000-4000-8000-0000000000f1', 'bbbbbbbb-0000-4000-8000-00000000000b', 'mom', true);

-- ข้อมูลตัวอย่าง (รหัสคงที่ ใช้อ้างอิงในชุดทดสอบ)
insert into public.events (id, household_id, title, starts_at, who, private, created_by, note) values
  ('e0000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-00000000000a', 'ไปหาหมอฟัน (ทดสอบ)', now() + interval '2 days', 'pearl', false, 'a0000000-0000-4000-8000-0000000000f1', null),
  ('e0000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-00000000000a', 'ของขวัญลับ (ทดสอบ)', now() + interval '5 days', 'mom', true, 'a0000000-0000-4000-8000-0000000000f1', 'เห็นคนเดียว'),
  ('e0000000-0000-4000-8000-0000000000a3', 'aaaaaaaa-0000-4000-8000-00000000000a', 'ประชุมผู้ปกครอง (ทดสอบ)', now() + interval '7 days', 'dad', false, 'a0000000-0000-4000-8000-0000000000d1', null),
  ('e0000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-00000000000b', 'นัดบ้าน B (ทดสอบ)', now() + interval '1 day', 'all', false, 'b0000000-0000-4000-8000-0000000000d1', null);
insert into public.event_comments (event_id, household_id, body, created_by) values
  ('e0000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-00000000000a', 'พ่อไปส่งเอง', 'a0000000-0000-4000-8000-0000000000d1');
insert into public.shopping_lists (id, household_id, name, sort) values
  ('51000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-00000000000a', 'ซูเปอร์ (ทดสอบ)', 0),
  ('51000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-00000000000b', 'ซูเปอร์ B (ทดสอบ)', 0);
insert into public.shopping_items (id, list_id, household_id, name, created_by) values
  ('52000000-0000-4000-8000-0000000000a1', '51000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-00000000000a', 'นม 2 ขวด', 'a0000000-0000-4000-8000-0000000000f1'),
  ('52000000-0000-4000-8000-0000000000a2', '51000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-00000000000a', 'ขนมปัง', 'a0000000-0000-4000-8000-0000000000d1');
insert into public.expenses (id, household_id, amount, merchant, category, paid_from, private, created_by) values
  ('ee000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-00000000000a', 350, 'ร้านทดสอบ', 'food', 'pot', false, 'a0000000-0000-4000-8000-0000000000d1'),
  ('ee000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-00000000000a', 1200, 'ร้านลับ (ทดสอบ)', 'gift', 'personal', true, 'a0000000-0000-4000-8000-0000000000f1'),
  ('ee000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-00000000000b', 99, 'ร้าน B', 'home', 'pot', false, 'b0000000-0000-4000-8000-0000000000d1');
insert into public.expense_categories (household_id, name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'สัตว์เลี้ยง');
insert into public.bills (household_id, name, amount, due_day) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'ค่าเน็ต (ทดสอบ)', 599, 5);
insert into public.settlements (household_id, from_role, to_role, amount) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'mom', 'dad', 100);
insert into public.savings_goals (id, household_id, title, target, created_by) values
  ('5a000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-00000000000a', 'เที่ยวทะเล (ทดสอบ)', 10000, 'a0000000-0000-4000-8000-0000000000d1');
insert into public.savings_deposits (household_id, goal_id, amount, who, created_by) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '5a000000-0000-4000-8000-0000000000a1', 500, 'dad', 'a0000000-0000-4000-8000-0000000000d1');
insert into public.star_tasks (household_id, title, stars) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'เก็บของเล่น', 2);
insert into public.star_rewards (household_id, title, cost) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'ไอติม 1 แท่ง', 5);
insert into public.star_log (household_id, kid, kind, stars, title, status, created_by) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'pearl', 'earn', 10, 'ช่วยล้างจาน', 'approved', 'a0000000-0000-4000-8000-0000000000d1');
insert into public.love_notes (household_id, from_user, to_user, body) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-0000000000d1', 'โน้ตทดสอบถึงพ่อ'),
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-0000000000d1', null, 'โน้ตทดสอบถึงทุกคน');
insert into public.hearts (household_id, from_user, to_user) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-0000000000d1');
insert into public.calendar_tokens (user_id, token) values ('a0000000-0000-4000-8000-0000000000d1', repeat('ab', 18));
insert into public.app_secrets (key, value) values ('dev_dummy', 'not-a-real-secret') on conflict do nothing;
