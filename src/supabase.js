import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://wlkfkgkgszazgsngykcc.supabase.co'
const key = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_ccRe7Ir7dbyLpYlTa97E2g_o2qJD6QD'

export const supabase = createClient(url, key)
