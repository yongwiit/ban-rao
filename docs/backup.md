# Backup และการกู้คืน (บ้านเรา)

## สำรองอะไรบ้าง
- ทุกตารางใน schema `public` (26 ตาราง) ทั้งโครงสร้างและข้อมูล
- `auth.users` และ `auth.identities` (บัญชีผู้ใช้ เพื่อให้ `members` ผูกกับคนเดิม)
- roles, extensions, policies, functions, triggers (`supabase db dump`)
- งาน cron (`cron.job`) แยกเป็น `cron_jobs.csv`
- Storage: ไม่มีไฟล์ (แอปไม่เก็บรูปสลิป)

## ไม่อยู่ในฐานข้อมูล ต้องเก็บเอง
เก็บค่าจริงไว้ในที่จัดการรหัสผ่านของเจ้าของบ้าน ห้ามใส่ในไฟล์นี้
- Edge Function secrets: `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `ANTHROPIC_API_KEY` (ถ้ามี)
- Vercel env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_LINE_OA_ID`
- GitHub secrets: `PROD_DB_PASSWORD`, `BACKUP_PASSPHRASE`, `DEV_DB_PASSWORD`, `DEV_TEST_PASSWORD`

## ทำงานอย่างไร
- `.github/workflows/db-backup.yml` รันทุกคืน 02:00 (เวลาไทย)
  1. dump Production → รวมเป็น tar → เข้ารหัส AES-256 ด้วย `BACKUP_PASSPHRASE` (ไฟล์ไม่เข้ารหัสไม่ออกจากเครื่องรัน)
  2. กู้ลงฐาน Supabase ชั่วคราวในเครื่อง CI แล้วเทียบจำนวนแถวและ md5 ทุกตาราง ฐานชั่วคราวถูกทิ้งเมื่องานจบ ข้อมูลจริงไม่ไปอยู่บน Dev
  3. เก็บไฟล์ `.gpg` เป็น artifact 30 วัน
- งาน `drill-dev` ใน workflow เดียวกัน (รันเมื่อกดเองหรือทดสอบบน branch) ซ้อมกู้บน ban-rao-dev ด้วยข้อมูลปลอมให้ผ่านก่อนสำรอง Production: สำรอง → ล้าง → กู้ → เทียบ checksum → รันชุดทดสอบ RLS

## กู้คืนจริง (เมื่อเกิดเหตุ)
1. ดาวน์โหลดไฟล์ `ban-rao-backup-*.tar.gz.gpg` จาก Actions → DB backup → รอบที่ต้องการ
2. กู้ลงโปรเจกต์ใหม่ก่อนเสมอ (ไม่กู้ทับของเดิมทันที): `BACKUP_PASSPHRASE=... scripts/db/restore.sh <file> <db-url-ใหม่> full`
3. ตั้งงาน cron คืนจาก `cron_jobs.csv` (แก้ URL ให้ตรงโปรเจกต์) และตั้ง Edge Function secrets
4. เทียบ `checksums.txt` ในชุด backup กับ `scripts/db/checksums.sql` บนโปรเจกต์ใหม่ (`scripts/db/compare.sh`)
5. ชี้แอปไปโปรเจกต์ใหม่หลังตรวจครบ
สคริปต์ปฏิเสธการกู้ทับ Production โดยตรง

## บันทึกการทดสอบ
ดูรายงาน Phase 0 ใน Library ของโปรเจกต์
