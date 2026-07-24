-- Migration 009: схема ЗП «змішана»
alter table drivers drop constraint if exists drivers_pay_scheme_check;
alter table drivers add constraint drivers_pay_scheme_check
  check (pay_scheme in ('percent_freight','per_km','per_trip','percent_profit','mixed'));
alter table driver_payroll drop constraint if exists driver_payroll_scheme_check;
alter table driver_payroll add constraint driver_payroll_scheme_check
  check (scheme in ('percent_freight','per_km','per_trip','percent_profit','mixed'));
