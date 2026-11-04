#!/usr/bin/env bash
# เทียบ checksums สองไฟล์ ถ้าต่างกันให้บอกเฉพาะชื่อตาราง (ไม่พิมพ์ข้อมูล)
set -euo pipefail
A="$1"; B="$2"; QUIET_COUNTS="${3:-}"
ok=1
while IFS='|' read -r t n h; do
  other=$(grep -F "$t|" "$B" | head -1 || true)
  if [ "$other" != "$t|$n|$h" ]; then echo "ไม่ตรง: $t"; ok=0
  elif [ -n "$QUIET_COUNTS" ]; then echo "ตรง: $t"
  else echo "ตรง: $t ($n แถว)"; fi
done < "$A"
[ "$(grep -c '' "$A")" = "$(grep -c '' "$B")" ] || { echo "จำนวนตารางไม่เท่ากัน"; ok=0; }
[ $ok = 1 ] && echo "ผล: ตรงกันทุกตาราง" || { echo "ผล: ไม่ผ่าน"; exit 1; }
