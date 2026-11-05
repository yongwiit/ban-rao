-- ย้อน 0023: คืนสิทธิ์ตาม ACL เดิมของ Production (5 พ.ย. 2026)
grant execute on function public.my_calendar_token(boolean), public.mark_tour_done(), public.create_household(text),
  public.join_household(text, text), public.household_kids(text), public.my_line_link_code() to public, anon;
grant execute on function public.touch_presence(), public.card_nudge_recent(uuid) to anon;
grant execute on function public.events_touch(), public.notify_event_change(), public.expenses_notify(),
  public.hearts_after_insert(), public.love_notes_notify(), public.star_log_check(), public.star_log_notify(),
  public.households_seed_people(), public.card_charge_bill_status(), public.card_nudges_after_insert(),
  public.star_balance(uuid, text), public.unlink_my_line() to public, anon, authenticated;
grant execute on function public.calendar_feed(text) to anon, authenticated;
