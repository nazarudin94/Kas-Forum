import { getSupabase } from './supabase'

/**
 * Kompresi gambar client-side menjadi format WebP berkualitas tinggi dengan ukuran berkas kecil (~80-150 KB).
 * Membatasi dimensi maksimum (default 1280px) dan kualitas 0.82.
 */
export async function compressImageToWebP(
  file: File,
  maxDimension = 1280,
  quality = 0.82
): Promise<Blob> {
  // Jika file sudah webp dan ukurannya kecil (< 200KB), gunakan langsung
  if (file.type === 'image/webp' && file.size < 200 * 1024) {
    return file
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Berkas gambar tidak dapat dibuka.'))
      img.onload = () => {
        let width = img.width
        let height = img.height

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width)
            width = maxDimension
          } else {
            width = Math.round((width * maxDimension) / height)
            height = maxDimension
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Gagal memproses gambar pada canvas.'))
          return
        }

        // Background putih untuk gambar dengan transparansi (misal PNG logo/struk)
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Gagal mengompresi gambar ke WebP.'))
              return
            }
            resolve(blob)
          },
          'image/webp',
          quality
        )
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Unggah bukti pembayaran terkompresi ke private bucket Supabase Storage `payment-proofs`.
 * Jalur berkas: payment-proofs/<userId>/<timestamp>-<random>.webp
 * Mengembalikan path relatif di storage, misalnya: `${userId}/17171717-abcd.webp`
 */
export async function uploadPaymentProof(file: File): Promise<string> {
  const supabase = getSupabase()
  const { data: authData, error: authErr } = await supabase.auth.getUser()
  if (authErr || !authData.user) {
    throw new Error('Sesi login telah berakhir. Silakan login kembali.')
  }

  const userId = authData.user.id
  const compressedBlob = await compressImageToWebP(file)

  const timestamp = Date.now()
  const randomSuffix = Math.random().toString(36).substring(2, 8)
  const filePath = `${userId}/${timestamp}-${randomSuffix}.webp`

  const { error: uploadErr } = await supabase.storage
    .from('payment-proofs')
    .upload(filePath, compressedBlob, {
      contentType: 'image/webp',
      cacheControl: '31536000', // 1 tahun
      upsert: false,
    })

  if (uploadErr) {
    throw new Error(`Gagal mengunggah foto bukti pembayaran: ${uploadErr.message}`)
  }

  return filePath
}

/**
 * Mendapatkan signed URL sementara (valid 1 jam) untuk melihat bukti pembayaran privat dari Supabase Storage.
 * Jika URL adalah link eksternal (http/https biasa atau blob), fungsi langsung mengembalikannya.
 */
export async function getProofSignedUrl(proofPathOrUrl: string): Promise<string | null> {
  if (!proofPathOrUrl) return null

  // Jika URL publik/eksternal standar
  if (proofPathOrUrl.startsWith('http://') || proofPathOrUrl.startsWith('https://') || proofPathOrUrl.startsWith('blob:')) {
    return proofPathOrUrl
  }

  // Jika berupa path di bucket storage
  const cleanPath = proofPathOrUrl.replace(/^payment-proofs\//, '')
  const supabase = getSupabase()
  const { data, error } = await supabase.storage
    .from('payment-proofs')
    .createSignedUrl(cleanPath, 3600) // 1 jam

  if (error || !data?.signedUrl) {
    console.error('Gagal membuat signed URL bukti transfer:', error)
    return null
  }

  return data.signedUrl
}
