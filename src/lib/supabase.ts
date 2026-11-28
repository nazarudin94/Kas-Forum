import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | undefined

export function getSupabaseSchema(): string {
  return import.meta.env.VITE_SUPABASE_SCHEMA || (import.meta.env.DEV ? 'dev' : 'public')
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
