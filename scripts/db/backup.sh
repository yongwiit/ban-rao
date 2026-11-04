#!/usr/bin/env bash
# สำรองฐานข้อมูลแบบเข้ารหัส: ./backup.sh <db-url> <out-dir>
# ต้องมี env BACKUP_PASSPHRASE ไฟล์ที่ไม่เข้ารหัสอยู่ใน tmp ของเครื่องรันเท่านั้น
set -euo pipefail
DB_URL="$1"; OUT="$2"
: "${BACKUP_PASSPHRASE:?ต้องตั้ง BACKUP_PASSPHRASE}"
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
supabase db dump --db-url "$DB_URL" --role-only -f "$WORK/roles.sql"
supabase db dump --db-url "$DB_URL" -f "$WORK/schema.sql"
supabase db dump --db-url "$DB_URL" --data-only --use-copy -f "$WORK/data.sql"
psql "$DB_URL" -v ON_ERROR_STOP=1 -At -c "\copy (select jobname, schedule, command, active from cron.job order by jobname) to '$WORK/cron_jobs.csv' csv header"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$(dirname "$0")/checksums.sql" > "$WORK/checksums.txt"
echo "$STAMP" > "$WORK/created_at.txt"
(cd "$WORK" && sha256sum roles.sql schema.sql data.sql cron_jobs.csv checksums.txt created_at.txt > manifest.sha256)
mkdir -p "$OUT"
tar -C "$WORK" -czf - roles.sql schema.sql data.sql cron_jobs.csv checksums.txt created_at.txt manifest.sha256 \
  | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 \
        -o "$OUT/ban-rao-backup-$STAMP.tar.gz.gpg" 3<<<"$BACKUP_PASSPHRASE"
cp "$WORK/checksums.txt" "$OUT/checksums-source.txt"
echo "backup: $OUT/ban-rao-backup-$STAMP.tar.gz.gpg ($(du -h "$OUT"/ban-rao-backup-*.gpg | cut -f1))"
grep -c "" "$WORK/checksums.txt" | xargs echo "ตารางที่ตรวจ:"
