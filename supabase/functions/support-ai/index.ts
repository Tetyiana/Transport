// AI-асистент техпідтримки TirKolija.
// Вимагає секрет ANTHROPIC_API_KEY (console.anthropic.com → API Keys).
// Деплой як звичайно: назва support-ai, Verify JWT вимкнути (авторизацію перевіряємо самі).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

const SYSTEM = `Ти — AI-асистент технічної підтримки застосунку TirKolija (управлінський облік транспортного бізнесу: рейси, витрати з курсами НБУ, пальне (норма/факт), ЗП водіїв, документи (заявки, рахунки, акти, договори з шаблонами), Telegram-бот для водіїв (@TirKolia_bot: спідометр, витрати, фото документів), аналітика для перевізника і експедитора. Стек: React на Vercel, база Supabase, Edge Function tg-bot).
Відповідай українською, коротко і по суті. Якщо проблема схожа на кеш браузера — порадь повністю закрити і відкрити вкладку. Якщо бот не відповідає — порадь перевірити Logs функції tg-bot і getWebhookInfo. Якщо потрібна зміна коду — чесно скажи, що це передасться розробнику (Claude в чаті), і сформулюй проблему для нього. Не вигадуй функцій, яких немає.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return json({ ok: false, error: 'Секрет ANTHROPIC_API_KEY не заданий' })

  // перевірка користувача
  const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY') ?? 'sb_publishable_ccRe7Ir7dbyLpYlTa97E2g_o2qJD6QD')
  const { data: { user } } = await anon.auth.getUser(auth)
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401)

  const { ticket_id } = await req.json().catch(() => ({}))
  if (!ticket_id) return json({ ok: false, error: 'ticket_id required' }, 400)

  const { data: t } = await db.from('support_tickets').select('*').eq('id', ticket_id).single()
  const { data: msgs } = await db.from('support_messages').select('*').eq('ticket_id', ticket_id).order('created_at')
  if (!t) return json({ ok: false, error: 'ticket not found' }, 404)

  const history = [
    { role: 'user', content: `Звернення${t.page ? ` (розділ: ${t.page})` : ''}: ${t.title}\n${t.description || ''}` },
    ...(msgs || []).map((m) => ({ role: m.author === 'user' ? 'user' : 'assistant', content: m.body })),
  ]
  // Anthropic API вимагає чергування — злипаємо поспіль однакові ролі
  const merged: { role: string; content: string }[] = []
  for (const m of history) {
    if (merged.length && merged[merged.length - 1].role === m.role) merged[merged.length - 1].content += '\n' + m.content
    else merged.push({ ...m })
  }

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, system: SYSTEM, messages: merged }),
  })
  const data = await r.json()
  const text = (data?.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim()
  if (!text) return json({ ok: false, error: data?.error?.message || 'Порожня відповідь AI' })

  await db.from('support_messages').insert({ ticket_id, author: 'assistant', body: text })
  if (t.status === 'new') await db.from('support_tickets').update({ status: 'answered' }).eq('id', ticket_id)
  return json({ ok: true })
})
