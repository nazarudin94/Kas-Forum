import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { ArrowUpRight, Eye, EyeOff, Leaf, ShieldCheck, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Notice } from '../components/UI'
import { api } from '../lib/api'
import { formatCurrency } from '../lib/format'
import type { FinanceSummary, UserRole } from '../types'

const dashboardPaths: Record<UserRole, string> = {
  WARGA: '/dashboard/warga',
  BENDAHARA: '/dashboard/bendahara',
  KETUA: '/dashboard/ketua',
}

export function LoginPage() {
  const { signIn, startupError } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [summaryUnavailable, setSummaryUnavailable] = useState(false)

  useEffect(() => {
    void api<FinanceSummary>('/api/public/summary')
      .then((result) => {
        setSummary(result)
        setSummaryUnavailable(false)
      })
      .catch(() => setSummaryUnavailable(true))
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const user = await signIn(username.trim(), password)
      navigate(user.mustChangePassword ? '/change-password' : dashboardPaths[user.role], { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Login gagal. Periksa kembali data Anda.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-wrap">
        <section className="login-story">
          <a className="brand brand-light" href="/" aria-label="KasKita beranda">
            <span className="brand-mark"><Leaf size={19} /></span>
            <span>kaskita<span className="brand-dot">.</span></span>
          </a>
          <div className="story-copy">
            <span className="eyebrow eyebrow-light"><span className="live-dot" /> KAS BLOK TRANSPARAN</span>
            <h1>Urus kas bersama, <em>lebih terbuka.</em></h1>
            <p>
              Pantau iuran, kegiatan, dan pengeluaran lingkungan dalam satu tempat.
              Rapi untuk pengurus, jelas untuk semua warga.
            </p>
          </div>
          <div className="public-balance">
            <div className="balance-heading">
              <span className="balance-icon"><WalletCards size={18} /></span>
              <span>Saldo kas terverifikasi</span>
              <span className="balance-live">LIVE</span>
            </div>
            <strong>{summary ? formatCurrency(summary.currentBalance) : '—'}</strong>
            <div className="balance-meta">
              <span><i className="positive-dot" /> {summary ? formatCurrency(summary.totalIncome) : '—'} masuk</span>
              <span>{summary ? summary.funds.length : '—'} pos aktif</span>
            </div>
            {summaryUnavailable && <small className="summary-unavailable">Ringkasan kas belum dapat dimuat.</small>}
          </div>
          <div className="story-foot">
            <ShieldCheck size={17} />
            <span>Data pribadi warga tetap terlindungi</span>
          </div>
        </section>

        <section className="login-side">
          <div className="mobile-brand">
            <a className="brand" href="/">
              <span className="brand-mark"><Leaf size={19} /></span>
              <span>kaskita<span className="brand-dot">.</span></span>
            </a>
          </div>
          <div className="login-card">
            <div className="login-card-heading">
              <span className="eyebrow">SELAMAT DATANG</span>
              <h2>Masuk ke akun</h2>
              <p>Gunakan kode rumah atau username pengurus.</p>
            </div>

            {(error || startupError) && <Notice>{error || startupError}</Notice>}

            <form className="form-stack" onSubmit={handleSubmit}>
              <label className="field">
                <span>Kode rumah / username</span>
                <input
                  autoComplete="username"
                  placeholder="Contoh: F-01"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Password / PIN</span>
                <span className="password-input">
                  <input
                    autoComplete="current-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Masukkan password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <button
                    className="password-toggle"
                    type="button"
                    onClick={() => setShowPassword((shown) => !shown)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>
              <Button className="login-submit" type="submit" disabled={submitting}>
                {submitting ? 'Memeriksa...' : 'Masuk'}
                {!submitting && <ArrowUpRight size={18} />}
              </Button>
            </form>

            <div className="login-note">
              <ShieldCheck size={16} />
              <span>Akun Anda hanya dapat melihat dan mengelola data sesuai peran.</span>
            </div>
          </div>
          <footer className="login-footer">
            <span>KasKita · Transparan bersama</span>
            <span>Butuh bantuan? Hubungi pengurus blok</span>
          </footer>
        </section>
      </div>
    </main>
  )
}
