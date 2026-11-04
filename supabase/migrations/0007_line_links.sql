-- เชื่อมบัญชี LINE กับสมาชิกบ้าน (ใช้โดย edge function line-webhook)
create table public.line_links (
  line_user_id text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.line_links enable row level security;
create policy line_links_own on public.line_links for select using (user_id = auth.uid());

create table public.line_link_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '30 minutes'
);
alter table public.line_link_codes enable row level security;

create or replace function public.my_line_link_code()
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update line_link_codes set expires_at = now() where user_id = auth.uid();
  loop
    c := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from line_link_codes where code = c and expires_at > now());
  end loop;
  insert into line_link_codes (code, user_id) values (c, auth.uid())
    on conflict (code) do update set user_id = excluded.user_id, expires_at = now() + interval '30 minutes';
  return c;
end $$;
grant execute on function public.my_line_link_code() to authenticated;
