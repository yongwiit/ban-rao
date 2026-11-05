-- F-10: จำกัดสิทธิ์เรียกฟังก์ชันทีละตัว (ไม่ revoke ทั้งระบบ ไม่ลบฟังก์ชัน)
-- ไม่เปลี่ยน: calendar_feed_v2, calendar_people (/api/cal ใช้ anon key)
--             my_household, is_parent, my_role (ใช้ใน RLS policy)
--             set_ui_pref, my_card_bill_requests, respond_card_bill (ไม่มี anon อยู่แล้ว)
--             seed_people, record_card_share, record_due_bills (เฉพาะระบบอยู่แล้ว)
--             last_occurrence (คำนวณวันที่ล้วน ไม่อ่านข้อมูล)

-- 1) หน้าเว็บเรียกตอนล็อกอินแล้ว: ปิด anon คง authenticated
revoke execute on function public.touch_presence() from public, anon;
revoke execute on function public.my_calendar_token(boolean) from public, anon;
revoke execute on function public.mark_tour_done() from public, anon;
revoke execute on function public.create_household(text) from public, anon;
revoke execute on function public.join_household(text, text) from public, anon;
revoke execute on function public.household_kids(text) from public, anon;
revoke execute on function public.my_line_link_code() from public, anon;
revoke execute on function public.card_nudge_recent(uuid) from public, anon;
grant execute on function public.touch_presence(), public.my_calendar_token(boolean), public.mark_tour_done(),
  public.create_household(text), public.join_household(text, text), public.household_kids(text),
  public.my_line_link_code(), public.card_nudge_recent(uuid) to authenticated;

-- 2) ฟังก์ชัน trigger และฟังก์ชันที่ไม่มีใครเรียกตรง: ปิดทั้ง anon และ authenticated
--    (Postgres ไม่ตรวจสิทธิ์ EXECUTE ตอน trigger ทำงาน และ star_balance ถูกเรียกในฟังก์ชัน security definer)
revoke execute on function public.events_touch(), public.notify_event_change(), public.expenses_notify(),
  public.hearts_after_insert(), public.love_notes_notify(), public.star_log_check(), public.star_log_notify(),
  public.households_seed_people(), public.card_charge_bill_status(), public.card_nudges_after_insert(),
  public.star_balance(uuid, text), public.calendar_feed(text), public.unlink_my_line()
  from public, anon, authenticated;
