-- Migration 010: кілька точок завантаження/розвантаження
alter table trips add column if not exists extra_loads jsonb default '[]'::jsonb;
alter table trips add column if not exists extra_unloads jsonb default '[]'::jsonb;
