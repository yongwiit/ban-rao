-- "จ่ายส่วนตัว" เห็นได้เฉพาะคนที่จด (เหมือน "เห็นคนเดียว")
-- ไม่ลบหรือแก้ข้อมูลเดิม แค่ซ่อนจากคนอื่นในบ้าน
-- ย้อนกลับ: drop policy if exists personal_owner_only on public.expenses;
create policy personal_owner_only on public.expenses as restrictive for all
  using (paid_from <> 'personal' or created_by = auth.uid())
  with check (paid_from <> 'personal' or created_by = auth.uid());
