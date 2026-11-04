-- ยืนยันอีเมลอัตโนมัติ (แอปนี้ใช้กันแค่ในบ้าน) จะได้ไม่ต้องไปปิด Confirm email เอง
create or replace function public.auto_confirm_user()
returns trigger language plpgsql security definer set search_path = auth as $$
begin
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end $$;

drop trigger if exists auto_confirm_user on auth.users;
create trigger auto_confirm_user before insert on auth.users
  for each row execute function public.auto_confirm_user();
