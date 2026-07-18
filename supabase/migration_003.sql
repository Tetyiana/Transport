-- Migration 003: Telegram-бот для водіїв
alter table drivers add column if not exists telegram_chat_id bigint;
alter table drivers add column if not exists tg_link_code text;

-- стан діалогу бота (edge function без пам'яті між запитами)
create table if not exists bot_sessions (
  chat_id bigint primary key,
  state text,
  data jsonb default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
