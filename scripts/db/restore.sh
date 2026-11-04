#!/usr/bin/env bash
# กู้คืนจากไฟล์ backup ที่เข้ารหัส: ./restore.sh <backup.gpg> <target-db-url> <full|public-data>
#   full        = กู้ทั้ง roles + schema + ข้อมูล ลงฐานว่าง (ฐานชั่วคราวใน CI หรือโปรเจกต์ใหม่)
#   public-data = กู้เฉพาะข้อมูลตาราง public ลงฐานที่มี schema อยู่แล้ว (ใช้ซ้อมบน Dev)
# งาน cron ไม่ถูกตั้งอัตโนมัติ (กันยิงแจ้งเตือนจริง) ดูวิธีตั้งคืนใน docs/backup.md
set -euo pipefail
FILE="$1"; TARGET="$2"; MODE="$3"
: "${BACKUP_PASSPHRASE:?ต้องตั้ง BACKUP_PASSPHRASE}"
case "$TARGET" in *kzxiifuapumtnjpwcrxt*) echo "ห้ามกู้ทับ Production ด้วยสคริปต์นี้"; exit 1;; esac
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
gpg --batch --pinentry-mode loopback --passphrase-fd 3 -d "$FILE" 3<<<"$BACKUP_PASSPHRASE" | tar -C "$WORK" -xzf -
(cd "$WORK" && sha256sum -c --quiet manifest.sha256) && echo "ไฟล์ในชุด backup ครบและไม่เสียหาย"
case "$MODE" in
  full)
    psql "$TARGET" -v ON_ERROR_STOP=1 --single-transaction -q \
      -f "$WORK/roles.sql" -f "$WORK/schema.sql" \
      -c 'SET session_replication_role = replica' -f "$WORK/data.sql" ;;
  public-data)
    # ตัดเฉพาะบล็อก COPY ของ schema public จาก data.sql
    awk '/^COPY "public"\./{p=1} p{print} /^\\\.$/{p=0}' "$WORK/data.sql" > "$WORK/public_data.sql"
    grep -c '^COPY "public"\.' "$WORK/public_data.sql" | xargs echo "ตาราง public ที่จะกู้:"
    psql "$TARGET" -v ON_ERROR_STOP=1 --single-transaction -q \
      -c 'SET session_replication_role = replica' -f "$WORK/public_data.sql" ;;
  *) echo "MODE ต้องเป็น full หรือ public-data"; exit 1 ;;
esac
cp "$WORK/checksums.txt" ./checksums-backup.txt
echo "งาน cron ในชุด backup: $(($(grep -c '' "$WORK/cron_jobs.csv") - 1)) งาน"
echo "restore เสร็จ ($MODE)"
