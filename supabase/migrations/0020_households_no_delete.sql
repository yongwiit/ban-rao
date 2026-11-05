-- F-01: กันลบบ้านทั้งหลังผ่าน API (ข้อมูล 17+ ตารางผูก ON DELETE CASCADE)
-- แอปไม่มีปุ่มลบบ้าน และไม่มีจุดไหนลบ members ตรง ๆ จึงไม่กระทบการใช้งาน
-- service role (Edge Functions) ไม่ถูก RLS จำกัดเหมือนเดิม
create policy "hh never delete via api" on public.households
  as restrictive for delete using (false);
revoke delete, truncate on public.households from anon, authenticated;
revoke delete, truncate on public.members from anon, authenticated;
