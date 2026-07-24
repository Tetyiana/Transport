-- Migration 011: режим експедитора
alter table trips add column if not exists cargo text;              -- вантаж
alter table trips add column if not exists cargo_weight text;       -- вага
alter table trips add column if not exists vehicle_type text;       -- вид авто (тент/реф/...)
alter table trips add column if not exists carrier_paid_date date;  -- дата оплати перевізнику
alter table counterparties add column if not exists rating int check (rating between 1 and 5);

create table if not exists doc_templates (
  id text primary key,
  title text,
  content text,
  updated_at timestamptz not null default now()
);
grant all on doc_templates to authenticated;
grant all on doc_templates to service_role;
alter table doc_templates enable row level security;
drop policy if exists doc_templates_auth on doc_templates;
create policy doc_templates_auth on doc_templates for all to authenticated using (true) with check (true);
