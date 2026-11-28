import type { CapacitorConfig } from '@capacitor/cli'

/**
 * =========================================================================
 * KONFIGURASI CAPACITOR — OPSI B: LIVE VERCEL URL (AUTO-UPDATE)
 * =========================================================================
 * Ganti URL di bawah ini dengan alamat domain Production Vercel Anda
 * (contoh: 'https://kaskita-rt.vercel.app' — tanpa tanda '/' di akhir).
 *
 * Keuntungan:
 * Setiap kali Anda git push fitur/perbaikan baru ke Vercel, tampilan APK
 * di HP seluruh warga langsung terupdate otomatis tanpa perlu bagi APK ulang!
 */
const LIVE_VERCEL_URL =
  process.env.CAPACITOR_SERVER_URL?.trim() ||
  'https://kas-forum.vercel.app'

const isLiveUrlConfigured =
  LIVE_VERCEL_URL.startsWith('https://') &&
  !LIVE_VERCEL_URL.includes('GANTI-DENGAN-URL-VERCEL-ANDA')

const config: CapacitorConfig = {
  appId: 'id.kaskita.app',
  appName: 'KasKita',
  webDir: 'dist',
  server: isLiveUrlConfigured
    ? {
      url: LIVE_VERCEL_URL.replace(/\/+$/, ''),
      cleartext: false,
      androidScheme: 'https',
    }
    : {
      androidScheme: 'https',
    },
}

export default config
