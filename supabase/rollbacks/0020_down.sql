-- ย้อน 0020 (ไม่แนะนำ)
drop policy if exists "hh never delete via api" on public.households;
grant delete, truncate on public.households to anon, authenticated;
grant delete, truncate on public.members to anon, authenticated;
