-- ============================================================
-- Transport: управлінський облік перевізника + експедиції
-- Виконати в Supabase → SQL Editor → New query → Run
-- ============================================================

-- 1. Контрагенти (експедиції, вантажовідправники, СТО, перевізники тощо)
create table counterparties (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('expedition','shipper','sto','carrier','other')),
  name text not null,
  edrpou text,
  contacts jsonb default '{}'::jsonb,          -- телефони, email, адреси
  contract_form text check (contract_form in ('single_contract','contract_per_trip','application_per_trip','mixed')),
  payment_terms_days int,                       -- договірний термін оплати
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Машини
create table vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,                           -- зручна назва, напр. "DAF BC1234"
  plate_truck text,
  plate_trailer text,
  current_odometer int,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

-- 3. Водії
create table drivers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  pay_scheme text not null default 'percent_freight'
    check (pay_scheme in ('percent_freight','per_km','per_trip','percent_profit')),
  pay_percent numeric,                          -- для percent_freight / percent_profit
  rate_km_ua numeric,                           -- для per_km
  rate_km_abroad numeric,
  rate_per_trip numeric,                        -- для per_trip
  taxes_included boolean not null default true, -- оф. податки включено в ставку чи ні
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

-- 4. Рейси
create table trips (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('carrier','expedition')), -- ми перевізник чи експедитор
  number text,                                  -- внутрішній номер рейсу
  customer_id uuid references counterparties(id),      -- замовник
  carrier_id uuid references counterparties(id),       -- перевізник (для режиму expedition)
  vehicle_id uuid references vehicles(id),
  driver_id uuid references drivers(id),
  route_from text,
  route_to text,
  status text not null default 'confirmed' check (status in (
    'confirmed',          -- рейс підтверджено (Della/Lardi)
    'application_signed', -- заявку підписано
    'loading',            -- завантаження
    'customs_export',     -- замитнення
    'in_transit',         -- в дорозі / кордон
    'customs_import',     -- розмитнення
    'unloading',          -- розвантаження
    'docs_pending',       -- чекаємо підписану ТТН/ЦМР
    'docs_sent',          -- пакет документів відправлено замовнику
    'awaiting_payment',
    'paid',
    'closed',
    'cancelled'
  )),
  freight_amount numeric,                       -- фрахт
  commission_amount numeric,                    -- комісія (expedition: дохід = комісія)
  carrier_payment numeric,                      -- оплата перевізнику (expedition)
  currency text not null default 'UAH',
  odometer_start int,
  odometer_end int,
  km_ua numeric,                                -- пробіг по Україні
  km_abroad numeric,                            -- пробіг за кордоном
  loading_date date,
  unloading_date date,
  ttn_sent_date date,                           -- коли відправили оригінали ТТН/ЦМР
  ttn_due_date date,                            -- термін отримання ТТН замовником
  payment_due_date date,
  payment_received_date date,
  notes text,
  created_at timestamptz not null default now()
);

-- 5. Чек-лист кроків рейсу (детальний бізнес-процес, гнучкий)
create table trip_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  step text not null,        -- напр. 'e_queue', 'sms_driver', 't1', 'rmpd_in', 'ens', 'pd_zdp'
  title text not null,       -- людська назва кроку
  done boolean not null default false,
  done_at timestamptz,
  note text,
  sort_order int not null default 0
);

-- 6. Документи (PDF в Supabase Storage, лінк тут)
create table documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  counterparty_id uuid references counterparties(id),
  doc_type text not null check (doc_type in (
    'contract','application','cmr_ttn','customs_declaration','t1',
    'invoice','act','insurance','other'
  )),
  title text,
  file_url text,
  signed boolean not null default false,        -- накладено печатку/підпис
  created_at timestamptz not null default now()
);

-- 7. Категорії витрат (стандартні + власні)
create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  scope text not null default 'both' check (scope in ('carrier','expedition','both')),
  is_custom boolean not null default false
);

insert into expense_categories (name, scope) values
  ('Пальне','carrier'), ('ПММ','carrier'), ('Акумулятори','carrier'),
  ('Шини','carrier'), ('Страховки','carrier'), ('ЗП водія','carrier'),
  ('Податки на ЗП','carrier'), ('Податки ФОП','both'), ('Дороги','carrier'),
  ('Відрядження','carrier'), ('Сервіс','carrier'), ('ТО','carrier'),
  ('Запчастини','carrier'), ('Оренда','both'),
  ('Оплата перевізнику','expedition'), ('ЗП','expedition');

-- 8. Витрати: прив'язка або до рейсу, або до машини напряму
create table expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  category_id uuid not null references expense_categories(id),
  counterparty_id uuid references counterparties(id),  -- кому платили (СТО тощо), необов'язково
  amount numeric not null,
  currency text not null default 'UAH',
  expense_date date not null default current_date,
  payment_form text check (payment_form in ('cash','card','bank')),
  note text,
  created_at timestamptz not null default now(),
  constraint expense_link check (trip_id is not null or vehicle_id is not null)
);

-- 9. Доходи
create table incomes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete set null,
  counterparty_id uuid references counterparties(id),
  amount numeric not null,
  currency text not null default 'UAH',
  income_date date not null default current_date,
  payment_form text not null check (payment_form in ('cash','card','bank')),
  prro_required boolean not null default false, -- готівка: нагадування провести через ПРРО
  prro_done boolean not null default false,     -- проведено і включено в базу оподаткування
  in_tax_base boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

-- готівка → автоматично ставимо нагадування про ПРРО
create or replace function set_prro_flag() returns trigger as $$
begin
  if new.payment_form = 'cash' then
    new.prro_required := true;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger incomes_prro before insert on incomes
  for each row execute function set_prro_flag();

-- 10. Нарахування ЗП водію по рейсу
create table driver_payroll (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  driver_id uuid not null references drivers(id),
  scheme text not null check (scheme in ('percent_freight','per_km','per_trip','percent_profit')),
  base_amount numeric,          -- база розрахунку (фрахт, км, прибуток)
  amount numeric not null,      -- нараховано
  taxes_included boolean not null default true,
  paid boolean not null default false,
  paid_date date,
  note text,
  created_at timestamptz not null default now()
);

-- Індекси
create index on trips (status);
create index on trips (customer_id);
create index on trips (vehicle_id);
create index on expenses (trip_id);
create index on expenses (vehicle_id);
create index on incomes (trip_id);
create index on incomes (prro_required) where prro_required and not prro_done;
create index on trip_events (trip_id);
create index on documents (trip_id);

-- RLS: доступ лише авторизованим користувачам
alter table counterparties enable row level security;
alter table vehicles enable row level security;
alter table drivers enable row level security;
alter table trips enable row level security;
alter table trip_events enable row level security;
alter table documents enable row level security;
alter table expense_categories enable row level security;
alter table expenses enable row level security;
alter table incomes enable row level security;
alter table driver_payroll enable row level security;

do $$
declare t text;
begin
  foreach t in array array['counterparties','vehicles','drivers','trips','trip_events',
    'documents','expense_categories','expenses','incomes','driver_payroll']
  loop
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Storage bucket для PDF (заявки, ЦМР, декларації)
insert into storage.buckets (id, name, public) values ('docs','docs', false)
on conflict do nothing;

create policy "auth_docs_read" on storage.objects for select to authenticated
  using (bucket_id = 'docs');
create policy "auth_docs_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'docs');
create policy "auth_docs_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'docs');
