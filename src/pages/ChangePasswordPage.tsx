import type { FormEvent } from 'react'
import { useState } from 'react'
import { ArrowLeft, KeyRound, Leaf, ShieldCheck } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Notice } from '../components/UI'
import type { UserRole } from '../types'

const dashboardPaths: Record<UserRole, string> = {
  WARGA: '/dashboard/warga',
  BENDAHARA: '/dashboard/bendahara',
  KETUA: '/dashboard/ketua',
}

export function ChangePasswordPage() {
  const { user, refreshUser, changePassword } = useAuth()
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password baru belum sama.')
      return
    }
    if (newPassword.length < 6) {
      setError('Password baru minimal 6 karakter.')
      return
    }

    setSubmitting(true)
    try {
      await changePassword(newPassword)
      const updatedUser = await refreshUser()
      navigate(dashboardPaths[updatedUser.role], { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Password belum dapat diperbarui.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="password-page">
      <a className="brand" href="/">
        <span className="brand-mark"><Leaf size={19} /></span>
        <span>kaskita<span className="brand-dot">.</span></span>
      </a>
      <section className="password-card">
        <span className="password-mark"><KeyRound size={22} /></span>
        <span className="eyebrow">KEAMANAN AKUN</span>
        <h1>Ganti password</h1>
        <p className="password-intro">
          {user?.mustChangePassword
            ? 'Untuk melindungi akun, ganti password sementara sebelum melanjutkan.'
            : 'Gunakan password yang kuat dan tidak dipakai bersama orang lain.'}
        </p>
        {error && <Notice>{error}</Notice>}
        <form className="form-stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Password baru</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={6}
              maxLength={72}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Ulangi password baru</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Menyimpan...' : 'Simpan password'}
          </Button>
        </form>
        {!user?.mustChangePassword && (
          <Link className="back-link" to={dashboardPaths[user?.role ?? 'WARGA']}>
            <ArrowLeft size={16} /> Kembali ke dashboard
          </Link>
        )}
        <div className="login-note">
          <ShieldCheck size={16} />
          <span>Password disimpan dengan aman dan tidak ditampilkan kembali.</span>
        </div>
      </section>
    </main>
  )
}
