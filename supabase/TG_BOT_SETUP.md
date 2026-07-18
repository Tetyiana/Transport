# Налаштування Telegram-бота для водіїв

## 1. Створити бота
У Telegram → @BotFather → `/newbot` → назва (напр. «Transport Водії») → отримати токен.

## 2. SQL
Supabase → SQL Editor → виконати `migration_003.sql`.

## 3. Секрети
Supabase → Edge Functions → Secrets (або Settings → Edge Functions):
- `TELEGRAM_BOT_TOKEN` = токен від BotFather
- `TG_WEBHOOK_SECRET` = будь-який випадковий рядок, напр. 20 символів

## 4. Деплой функції
Supabase → Edge Functions → Deploy new function → назва `tg-bot` →
вставити вміст `functions/tg-bot/index.ts` → **Verify JWT: вимкнути** → Deploy.

## 5. Вебхук
Відкрити в браузері (підставити свої значення):

```
https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=https://wlkfkgkgszazgsngykcc.supabase.co/functions/v1/tg-bot&secret_token=<TG_WEBHOOK_SECRET>
```

Має відповісти `{"ok":true,...}`.

## 6. Підключення водія
Застосунок → Водії → «Код підключення» → водій відкриває бота і надсилає
`/start КОД`. Після цього:
- «Надіслати водію (Telegram)» у картці рейсу йде напряму в його чат;
- водій сам фіксує спідометр (початок/кінець) і витрати по активному рейсу
  (категорія → сума з валютою → примітка), валюта конвертується за курсом НБУ.
