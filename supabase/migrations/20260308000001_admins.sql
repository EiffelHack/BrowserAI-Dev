-- Admin users table
create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz default now()
);

alter table admins enable row level security;

-- Only service role can read/manage admins — no client access
drop policy if exists "Service role only" on admins;
create policy "Service role only"
  on admins for all
  using (true)
  with check (true);

-- Seed initial admin
insert into admins (email) values ('shreyassaw@gmail.com')
  on conflict (email) do nothing;
