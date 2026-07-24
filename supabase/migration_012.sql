-- Migration 012: технічна підтримка (реєстр багів)
create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  page text,
  status text not null default 'new' check (status in ('new','in_progress','answered','fixed','closed')),
  created_at timestamptz not null default now()
);
create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  author text not null check (author in ('user','assistant','admin')),
  body text not null,
  created_at timestamptz not null default now()
);
grant all on support_tickets, support_messages to authenticated;
grant all on support_tickets, support_messages to service_role;
alter table support_tickets enable row level security;
alter table support_messages enable row level security;
drop policy if exists support_tickets_auth on support_tickets;
create policy support_tickets_auth on support_tickets for all to authenticated using (true) with check (true);
drop policy if exists support_messages_auth on support_messages;
create policy support_messages_auth on support_messages for all to authenticated using (true) with check (true);
