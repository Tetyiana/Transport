-- Migration 013: мультитенантність (продукт на продаж) + повна автентифікація
-- Кожен користувач при реєстрації отримує свою організацію; дані ізольовані через RLS.
-- Усі наявні дані і користувачі закріплюються за першою організацією (власниця = адмін).

-- 1. Організації та профілі
create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Моя компанія',
  created_at timestamptz not null default now()
);
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references orgs(id),
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
grant all on orgs to authenticated; grant all on orgs to service_role;
grant all on profiles to authenticated; grant all on profiles to service_role;
alter table orgs enable row level security;
alter table profiles enable row level security;

-- 2. Хелпери
create or replace function current_org_id() returns uuid
language sql stable security definer set search_path = public as
$$ select org_id from profiles where user_id = auth.uid() $$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select is_admin from profiles where user_id = auth.uid()), false) $$;

drop policy if exists orgs_own on orgs;
create policy orgs_own on orgs for all to authenticated
  using (id = current_org_id() or is_admin()) with check (id = current_org_id() or is_admin());
drop policy if exists profiles_own on profiles;
create policy profiles_own on profiles for select to authenticated
  using (user_id = auth.uid() or is_admin());

-- 3. Новий користувач → нова організація + профіль + базові категорії витрат
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare oid uuid;
begin
  insert into orgs (name) values (coalesce(nullif(new.raw_user_meta_data->>'company',''), 'Моя компанія')) returning id into oid;
  insert into profiles (user_id, org_id, email) values (new.id, oid, new.email);
  insert into expense_categories (name, scope, org_id) values
    ('Пальне','carrier',oid), ('ПММ','carrier',oid), ('Акумулятори','carrier',oid),
    ('Шини','carrier',oid), ('Страховки','carrier',oid), ('ЗП водія','carrier',oid),
    ('Податки на ЗП','carrier',oid), ('Податки ФОП','both',oid), ('Дороги','carrier',oid),
    ('Відрядження','carrier',oid), ('Сервіс','carrier',oid), ('ТО','carrier',oid),
    ('Запчастини','carrier',oid), ('Оренда','both',oid),
    ('Оплата перевізнику','expedition',oid), ('ЗП','expedition',oid);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- 4. org_id на всіх таблицях даних
do $$ declare t text;
begin
  foreach t in array array['counterparties','vehicles','drivers','trips','trip_events','documents',
    'expense_categories','expenses','incomes','driver_payroll','support_tickets','support_messages','doc_templates'] loop
    execute format('alter table %I add column if not exists org_id uuid', t);
    execute format('alter table %I alter column org_id set default current_org_id()', t);
  end loop;
end $$;

-- 5. Бекфіл: перша організація, всі наявні користувачі — її адміни, всі дані — їй
do $$ declare oid uuid; u record; t text;
begin
  select id into oid from orgs order by created_at limit 1;
  if oid is null then
    insert into orgs (name) values ('Основна') returning id into oid;
  end if;
  for u in select id, email from auth.users loop
    insert into profiles (user_id, org_id, email, is_admin) values (u.id, oid, u.email, true)
    on conflict (user_id) do nothing;
  end loop;
  foreach t in array array['counterparties','vehicles','drivers','trips','trip_events','documents',
    'expense_categories','expenses','incomes','driver_payroll','support_tickets','support_messages','doc_templates'] loop
    execute format('update %I set org_id = %L where org_id is null', t, oid);
  end loop;
  update company_profile set org_id = oid where org_id is null;
exception when undefined_column then
  -- company_profile ще без org_id — додається нижче
  null;
end $$;

-- 6. company_profile: із синглтона — на рядок для кожної організації
alter table company_profile add column if not exists org_id uuid default current_org_id();
update company_profile set org_id = (select id from orgs order by created_at limit 1) where org_id is null;
alter table company_profile drop constraint if exists company_profile_pkey;
alter table company_profile drop constraint if exists company_profile_id_check;
do $$ begin
  alter table company_profile add primary key (org_id);
exception when others then null; end $$;
alter table company_profile alter column id drop not null;

-- 7. doc_templates: ключ на організацію
alter table doc_templates drop constraint if exists doc_templates_pkey;
update doc_templates set org_id = (select id from orgs order by created_at limit 1) where org_id is null;
do $$ begin
  alter table doc_templates add primary key (org_id, id);
exception when others then null; end $$;

-- 8. RLS: замість «всім авторизованим» — тільки своя організація (адмін бачить усе)
do $$ declare t text;
begin
  foreach t in array array['counterparties','vehicles','drivers','trips','trip_events','documents',
    'expense_categories','expenses','incomes','driver_payroll','support_tickets','support_messages',
    'doc_templates','company_profile'] loop
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format('drop policy if exists org_all on %I', t);
    execute format('create policy org_all on %I for all to authenticated using (org_id = current_org_id() or is_admin()) with check (org_id = current_org_id() or is_admin())', t);
  end loop;
end $$;
drop policy if exists doc_templates_auth on doc_templates;
drop policy if exists company_profile_auth on company_profile;
drop policy if exists support_tickets_auth on support_tickets;
drop policy if exists support_messages_auth on support_messages;
