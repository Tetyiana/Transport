-- Migration 005: номер зголошення RMPD/SENT
alter table trips add column if not exists rmpd_number text;
