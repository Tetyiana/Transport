-- Migration 008: термін дії документів (страховки, дозволи) для нагадувань
alter table documents add column if not exists valid_until date;
