import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | undefined

export function getSupabaseSchema(): string {
  // Kunci paksa: di production build ATAU domain selain localhost/127.0.0.1,
  // selalu gunakan schema 'public' agar tidak mungkin bocor ke 'dev'
  // meskipun VITE_SUPABASE_SCHEMA=dev ada di .env.local atau Vercel Environment Variables.
  if (import.meta.env.PROD) {
    return 'public'
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return 'public'
    }
  }
  return import.meta.env.VITE_SUPABASE_SCHEMA?.trim() || 'dev'
}

export function getSupabase(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  const schema = getSupabaseSchema()

  if (!url || !key) {
    throw new Error('Konfigurasi Supabase belum lengkap. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.')
  }
  if (!client) {
    client = createClient(url, key, {
      db: {
        schema: schema as 'public',
      },
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  }
  return client
}

export function usernameToAuthEmail(username: string) {
  return `${username.trim().toLowerCase()}@auth.kaskita.invalid`
}
