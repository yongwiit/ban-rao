-- 0032: ค่าตั้งหน้าจอของแต่ละคน (ลำดับกล่อง/กล่องที่ซ่อน) เก็บบน server ให้ตามบัญชีไปทุกเครื่อง
alter table public.members add column if not exists ui_prefs jsonb not null default '{}'::jsonb;

-- แก้ได้เฉพาะของตัวเอง ทีละคีย์ (ไม่ให้ update ตาราง members ตรงๆ)
create or replace function public.set_ui_pref(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_key !~ '^[a-z0-9:_-]{1,64}$' then raise exception 'bad key'; end if;
  if length(p_value::text) > 4000 then raise exception 'too large'; end if;
  update public.members set ui_prefs = jsonb_set(coalesce(ui_prefs, '{}'::jsonb), array[p_key], p_value, true)
  where user_id = auth.uid();
end $$;
revoke all on function public.set_ui_pref(text, jsonb) from public, anon;
grant execute on function public.set_ui_pref(text, jsonb) to authenticated;

-- ย้อนกลับ: drop function public.set_ui_pref(text, jsonb); alter table public.members drop column ui_prefs;
