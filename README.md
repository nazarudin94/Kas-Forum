# KasKita — Frontend

Frontend React + Vite + TypeScript dengan Tailwind CSS. UI dirancang mobile-first untuk warga, bendahara, dan ketua. Autentikasi dan akses data menggunakan Supabase Auth + PostgreSQL dengan RLS.

## Menjalankan

1. Ikuti langkah di `../supabase/README.md` untuk menyiapkan project, menjalankan migrasi, mengisi seed, dan membuat akun Auth.
2. Salin `.env.example` menjadi `.env.local`, lalu isi URL project Supabase dan publishable/anon key.
3. Dari folder `FE`, jalankan `npm install`, lalu `npm run dev`.
4. Buka URL yang ditampilkan Vite.

Jangan pernah memasukkan `service_role` key ke dalam FE. Operasi sensitif dilakukan melalui RPC database atau Edge Function; RLS tetap membatasi akses meskipun request dibuat di luar UI.

## Deploy ke Vercel

1. Push repository ke GitHub, lalu import repository tersebut di Vercel.
2. Pada **Root Directory**, pilih `FE` (aktifkan pengaturan agar perubahan root diterapkan).
3. Pilih preset **Vite**. Build command `npm run build`, output directory `dist`, dan install command `npm install` (atau biarkan Vercel mendeteksi `package-lock.json`).
4. Tambahkan environment variables `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` di **Project Settings → Environment Variables**. Publishable/anon key boleh digunakan di browser; jangan pernah menambahkan `service_role` key.
5. Deploy. `vercel.json` di folder FE menyiapkan rewrite agar URL React Router seperti `/dashboard/warga` tetap terbuka saat halaman dimuat ulang.
6. Di Supabase **Authentication → URL Configuration**, set **Site URL** ke domain produksi Vercel. Tambahkan domain produksi dan domain preview yang dipakai ke **Redirect URLs** jika nanti memakai alur reset password atau email link.
7. Jika fitur reset PIN digunakan, set secret `APP_ORIGINS` pada Supabase ke origin FE yang diizinkan, misalnya `https://nama-project.vercel.app`, lalu deploy ulang Edge Function `reset-warga-password`. Untuk domain preview, tambahkan origin preview yang perlu diizinkan, dipisahkan koma.

FE berjalan sebagai static site; deploy Vercel **tidak** menerapkan migration atau seed dan tidak menjalankan backend Fastify/MySQL yang ada. Terapkan database terpisah dari root repository dengan perintah di `../supabase/README.md`. Operasi FE saat ini menuju Supabase Auth/PostgreSQL/RPC, sedangkan reset password warga menggunakan Supabase Edge Function.

## Fitur

- Login dan perubahan password wajib.
- Warga: ringkasan kas, tagihan pribadi, pengajuan pembayaran, dan pengeluaran terverifikasi.
- Bendahara: verifikasi pembayaran, pengelolaan pos/tagihan, pemasukan, pengeluaran, pembayaran tunai, dan reset PIN.
- Ketua: ringkasan, rekap tagihan per rumah, pengeluaran, dan log verifikasi read-only.

Menu dibaca dari tabel RBAC `roles`, `menus`, dan `role_menus`. Nilai `proofUrl` masih berupa tautan/path; file bukti perlu lebih dulu ditempatkan pada storage yang dikonfigurasi.
