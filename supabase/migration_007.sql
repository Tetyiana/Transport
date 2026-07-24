-- Migration 007: реквізити компанії для рахунків/актів
create table if not exists company_profile (
  id int primary key default 1 check (id = 1),
  name text, edrpou text, address text, iban text, bank text,
  director text, phone text,
  vat_mode text not null default 'none' check (vat_mode in ('none','included'))
);
insert into company_profile (id) values (1) on conflict do nothing;
grant all on company_profile to service_role;
grant all on company_profile to authenticated;
alter table company_profile enable row level security;
create policy company_profile_auth on company_profile for all to authenticated using (true) with check (true);
