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
  ['percent_profit', '% від чистого прибутку'],
  ['mixed', 'Змішана (ставка за рейс + %)'],
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

export const CURRENCIES = ['UAH', 'EUR', 'USD', 'PLN']

// Документи рейсу
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
export const docTypeLabel = (t) => ({ ...Object.fromEntries(DOC_TYPES), ...Object.fromEntries(STAT_DOC_TYPES) })[t] || t

// Статутні документи — завжди під рукою для відправки замовнику
export const STAT_DOC_TYPES = [
  ['fop_extract', 'Виписка ФОП'],
  ['license', 'Ліцензія'],
  ['single_tax', 'Витяг єдиного податку'],
  ['requisites', 'Реквізити'],
  ['tech_passport_truck', 'Техпаспорт тягача'],
  ['tech_passport_trailer', 'Техпаспорт причепа'],
  ['driver_license', 'Права водія'],
  ['driver_passport', 'Закордонний паспорт водія'],
  ['stat_other', 'Інше (статутне)'],
]

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

// Системи оподаткування для безготівкового фрахту
export const TAX_SYSTEMS = [
  ['tov_single', 'ТОВ, єдиний 3 гр 5%'],
  ['tov_single_vat', 'ТОВ, єдиний 3 гр 3% + ПДВ'],
  ['tov_general_vat', 'ТОВ, загальна + ПДВ'],
  ['fop_single_5', 'ФОП, єдиний 3 гр 5%'],
  ['fop_single_3_vat', 'ФОП, єдиний 3 гр 3% + ПДВ'],
  ['fop_general_vat', 'ФОП, загальна + ПДВ'],
]
export const taxSystemLabel = (s) => Object.fromEntries(TAX_SYSTEMS)[s] || s
