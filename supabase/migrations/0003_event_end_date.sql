-- นัดหลายวัน เช่น ไปเที่ยว
alter table public.events add column if not exists ends_at timestamptz;
alter table public.events add constraint events_end_after_start check (ends_at is null or ends_at >= starts_at);
