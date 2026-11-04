-- นับแถวและ md5 ของทุกตารางที่ต้องสำรอง (ใช้เทียบก่อน/หลัง Restore)
-- ผลลัพธ์: schema.table|จำนวนแถว|md5  (ไม่พิมพ์ข้อมูลจริงออกมา)
\set QUIET on
\pset tuples_only on
\pset format unaligned
set timezone = 'UTC';
set extra_float_digits = 3;
select format(
  'select %L || ''|'' || count(*) || ''|'' || md5(coalesce(string_agg(t::text, ''|'' order by t::text), '''')) from %I.%I t',
  n.nspname || '.' || c.relname, n.nspname, c.relname)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname in ('users', 'identities')))
order by n.nspname, c.relname
\gexec
