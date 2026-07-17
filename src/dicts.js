export const TRIP_STATUSES = [
  ['confirmed', 'Підтверджено'],
  ['application_signed', 'Заявку підписано'],
  ['loading', 'Завантаження'],
  ['customs_export', 'Замитнення'],
  ['in_transit', 'В дорозі'],
  ['customs_import', 'Розмитнення'],
  ['unloading', 'Розвантаження'],
  ['docs_pending', 'Чекаємо ТТН/ЦМР'],
  ['docs_sent', 'Документи відправлено'],
  ['awaiting_payment', 'Очікує оплати'],
  ['paid', 'Оплачено'],
  ['closed', 'Закрито'],
  ['cancelled', 'Скасовано'],
]
export const statusLabel = (s) => Object.fromEntries(TRIP_STATUSES)[s] || s

export const CP_TYPES = [
  ['expedition', 'Експедиція'],
  ['shipper', 'Вантажовідправник'],
  ['sto', 'СТО'],
  ['carrier', 'Перевізник'],
  ['other', 'Інше'],
]
export const cpTypeLabel = (t) => Object.fromEntries(CP_TYPES)[t] || t

export const PAY_SCHEMES = [
  ['percent_freight', '% від фрахту'],
  ['per_km', 'Ставка за км'],
  ['per_trip', 'Ставка за рейс'],
  ['percent_profit', '% від прибутку'],
]
export const schemeLabel = (s) => Object.fromEntries(PAY_SCHEMES)[s] || s

export const PAY_FORMS = [
  ['bank', 'Безготівка'],
  ['card', 'Картка'],
  ['cash', 'Готівка'],
]
export const payFormLabel = (f) => Object.fromEntries(PAY_FORMS)[f] || f || '—'

export const CONTRACT_FORMS = [
  ['single_contract', 'Один договір + заявки'],
  ['contract_per_trip', 'Договір на кожен рейс'],
  ['application_per_trip', 'Заявка на кожен рейс'],
  ['mixed', 'Змішана форма'],
]

export const DOC_TYPES = [
  ['contract', 'Договір'],
  ['application', 'Заявка'],
  ['cmr_ttn', 'ТТН/ЦМР'],
  ['customs_declaration', 'Митна декларація'],
  ['t1', 'Т1'],
  ['invoice', 'Рахунок'],
  ['act', 'Акт'],
  ['insurance', 'Страховка'],
  ['other', 'Інше'],
]
export const docTypeLabel = (t) => Object.fromEntries(DOC_TYPES)[t] || t

// Типовий чек-лист рейсу перевізника (за бізнес-процесом)
export const CARRIER_CHECKLIST = [
  'Пакет документів (PDF) відправлено замовнику',
  'Заявку підписано (печатка + підпис)',
  'Водію: завантаження, вигрузка, замитнення, контакт експедитора, маршрут',
  'Спідометр на виїзді зафіксовано',
  'ТТН/ЦМР із завантаження в базі',
  'Митна декларація із замитнення в базі',
  'Постановка в е-чергу',
  'СМС водію: черга і пункт пропуску',
  'Т1 по митній декларації',
  'РМПД і СЕНТ, делегування і ЕНС',
  'Перетин кордону',
  'Розмитнення',
  'Розвантаження',
  'Підписана ТТН/ЦМР в базі',
  'Рахунок + акт + договір + заявка + ЦМР відправлено НП замовнику',
  'Термін отримання ТТН зафіксовано',
  'Термін оплати виставлено',
  'Оплату отримано',
  'Спідометр і всі витрати рейсу зафіксовано',
  'ЗП водію нараховано',
  'ЗП водію виплачено',
]
export const EXPEDITION_CHECKLIST = [
  'Заявку підписано',
  'Перевізника призначено',
  'Рейс виконано',
  'Документи від перевізника отримано',
  'Пакет документів відправлено замовнику',
  'Оплату від замовника отримано',
  'Перевізнику оплачено',
]
