-- ย้อน 0025: ถอด trigger ทั้งหมด เก็บตาราง audit_log ไว้ (ไม่ลบประวัติ)
do $$
declare t text;
begin
  foreach t in array array['bills','card_bill_paid','card_charges','credit_cards','event_comments','events','expenses',
                           'incomes','savings_deposits','savings_goals','shopping_items','star_log'] loop
    execute format('drop trigger if exists a_guard_created_by on public.%I', t);
  end loop;
  foreach t in array array['expenses','bills','settlements','savings_goals','savings_deposits','events','star_log',
                           'members','household_people','households','credit_cards','card_charges','incomes','card_bill_paid'] loop
    execute format('drop trigger if exists z_audit on public.%I', t);
  end loop;
end $$;
