-- Migration 006: контроль пального, валюта ставки за рейс, оподаткування фрахту
alter table vehicles add column if not exists fuel_norm numeric;          -- норма, л/100 км
alter table expenses add column if not exists liters numeric;             -- літри (для пального)
alter table drivers add column if not exists rate_per_trip_currency text default 'UAH';
alter table trips add column if not exists freight_pay_form text check (freight_pay_form in ('bank','cash','card'));
alter table trips add column if not exists tax_system text;
