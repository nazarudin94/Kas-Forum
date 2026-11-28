import type { ClipboardEvent, FormEvent } from 'react'
import { useState } from 'react'
import { ArrowUpRight, Eye, EyeOff, KeyRound, Leaf, Search, ShieldCheck, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, LoadingState, Notice } from '../components/UI'
import { useResource } from '../hooks/useResource'
import { api, jsonBody } from '../lib/api'
import { dashboardPathForRole } from '../lib/roles'
import type { ClaimableHouse, HouseOccupancyStatus } from '../types'

type AuthMode = 'login' | 'claim'

const SAVED_LOGIN_KEY = 'kaskita_saved_login_v1'

function loadSavedCredentials(): { username: string; password: string; remember: boolean } {
  try {
    const raw = window.localStorage.getItem(SAVED_LOGIN_KEY)
    if (!raw) return { username: '', password: '', remember: true }
    const parsed = JSON.parse(atob(raw)) as { u?: unknown; p?: unknown }
    if (typeof parsed.u === 'string' && typeof parsed.p === 'string') {
      return { username: parsed.u, password: parsed.p, remember: true }
    }
  } catch {
    // Abaikan jika format penyimpanan lama tidak valid
  }
  return { username: '', password: '', remember: true }
}

function saveCredentials(username: string, password: string) {
  try {
    const encoded = btoa(JSON.stringify({ u: username, p: password }))
    window.localStorage.setItem(SAVED_LOGIN_KEY, encoded)
  } catch {
    // Abaikan jika storage penuh / dibatasi browser
  }
}

function clearSavedCredentials() {
  try {
    window.localStorage.removeItem(SAVED_LOGIN_KEY)
  } catch {
    // Abaikan jika storage dibatasi
  }
}

export function LoginPage() {
  const { signIn, startupError } = useAuth()
  const navigate = useNavigate()
  const [initialParams] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const rawCode = (params.get('code') ?? '').trim().toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6)
    const rawHouse = (params.get('house') ?? '').trim().toUpperCase()
    const isClaim = params.get('mode') === 'claim' || Boolean(rawCode)
    return { isClaim, rawCode, rawHouse }
  })
  const [savedCreds] = useState(() => loadSavedCredentials())
  const [mode, setMode] = useState<AuthMode>(() => (initialParams.isClaim ? 'claim' : 'login'))
  const [username, setUsername] = useState(() => savedCreds.username)
  const [password, setPassword] = useState(() => savedCreds.password)
  const [rememberMe, setRememberMe] = useState(() => savedCreds.remember)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const claimableHousesResource = useResource<ClaimableHouse[]>(
    mode === 'claim' ? '/api/public/claimable-houses' : null,
  )
  const allClaimableHouses = claimableHousesResource.data ?? []
  // Hanya tampilkan rumah yang belum diaktifkan (belum memiliki akun aktif)
  const unactivatedHouses = allClaimableHouses.filter((item) => !item.hasAccount)

  const [houseSearchQuery, setHouseSearchQuery] = useState('')
  const [houseBlockFilter, setHouseBlockFilter] = useState('ALL')
  const [selectedHouseId, setSelectedHouseId] = useState('')
  const [claimCode, setClaimCode] = useState(() => initialParams.rawCode)
  const [fullName, setFullName] = useState('')
  const [occupancyStatus, setOccupancyStatus] = useState<HouseOccupancyStatus>('OWNER_OCCUPIED')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [phone, setPhone] = useState('')
  const [claimPassword, setClaimPassword] = useState('')
  const [confirmClaimPassword, setConfirmClaimPassword] = useState('')
  const [showClaimPassword, setShowClaimPassword] = useState(false)
  const [showConfirmClaimPassword, setShowConfirmClaimPassword] = useState(false)

  const availableBlocks = Array.from(new Set(unactivatedHouses.map((item) => item.blockCode).filter(Boolean))).sort()

  const filteredClaimableHouses = unactivatedHouses.filter((item) => {
    if (houseBlockFilter !== 'ALL' && item.blockCode !== houseBlockFilter) return false
    if (houseSearchQuery.trim()) {
      const q = houseSearchQuery.toLowerCase().trim()
      return item.houseCode.toLowerCase().includes(q)
        || item.blockCode.toLowerCase().includes(q)
        || item.houseNumber.toLowerCase().includes(q)
    }
    return true
  })

  const activeClaimHouse = filteredClaimableHouses.find((item) => String(item.houseId) === selectedHouseId)
    ?? (selectedHouseId ? unactivatedHouses.find((item) => String(item.houseId) === selectedHouseId) : undefined)
    ?? (initialParams.rawHouse ? unactivatedHouses.find((item) => item.houseCode === initialParams.rawHouse) : undefined)
    ?? filteredClaimableHouses[0]

  function handleClaimCodePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text')
    if (!pasted) return
    const codeMatch = pasted.match(/kode\s*klaim\s*[:=-]?\s*([A-Za-z0-9]{6})/i)
    const houseMatch = pasted.match(/rumah\s*[:=-]?\s*([A-Za-z0-9/-]+)/i)
    if (codeMatch) {
      event.preventDefault()
      setClaimCode(codeMatch[1].toUpperCase())
      if (houseMatch) {
        const matchedHouse = unactivatedHouses.find(
          (item) => item.houseCode.toUpperCase() === houseMatch[1].toUpperCase(),
        )
        if (matchedHouse) setSelectedHouseId(String(matchedHouse.houseId))
      }
      return
    }
    const trimmed = pasted.trim().toUpperCase()
    if (trimmed.length <= 8) {
      event.preventDefault()
      setClaimCode(trimmed.replace(/[^A-Z0-9]/g, '').slice(0, 6))
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError(null)
    if (nextMode === 'claim') {
      void claimableHousesResource.reload()
    }
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const trimmedUsername = username.trim()
      const user = await signIn(trimmedUsername, password)
      if (rememberMe) {
        saveCredentials(trimmedUsername, password)
      } else {
        clearSavedCredentials()
      }
      navigate(dashboardPathForRole(user.role), { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Login gagal. Periksa kembali data Anda.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleClaimSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeClaimHouse) {
      setError('Pilih nomor rumah terlebih dahulu.')
      return
    }
    if (claimPassword !== confirmClaimPassword) {
      setError('Konfirmasi password belum sama.')
      return
    }
    if (claimPassword.length < 6) {
      setError('Password minimal 6 karakter.')
      return
    }

    if (occupancyStatus === 'RENTED' && !ownerPhone.trim()) {
      setError('Nomor HP / WhatsApp pemilik rumah yang mengontrakkan wajib diisi.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const result = await api<{ username: string; houseCode: string; message: string }>(
        '/api/public/claim-house',
        {
          method: 'POST',
          body: jsonBody({
            houseId: activeClaimHouse.houseId,
            claimCode: claimCode.trim().toUpperCase(),
            fullName: fullName.trim(),
            occupancyStatus,
            ownerPhone: occupancyStatus === 'RENTED' ? ownerPhone.trim() || null : null,
            phone: phone.trim() || null,
            password: claimPassword,
          }),
        },
      )
      const loggedInUser = await signIn(result.username, claimPassword)
      saveCredentials(result.username, claimPassword)
      navigate(dashboardPathForRole(loggedInUser.role), { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Aktivasi akun warga gagal.')
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
          {/* <div className="story-foot">
            <ShieldCheck size={17} />
            <span>Data pribadi warga tetap terlindungi</span>
          </div> */}
        </section>

        <section className="login-side">
          <div className="mobile-brand">
            <a className="brand" href="/">
              <span className="brand-mark"><Leaf size={19} /></span>
              <span>kaskita<span className="brand-dot">.</span></span>
            </a>
          </div>
          <div className={`login-card ${mode === 'claim' ? 'login-card-wide' : ''}`}>
            <div className="login-mode-tabs" role="tablist" aria-label="Mode autentikasi">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                className={`login-mode-tab ${mode === 'login' ? 'login-mode-tab-active' : ''}`}
                onClick={() => switchMode('login')}
              >
                Masuk
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'claim'}
                className={`login-mode-tab ${mode === 'claim' ? 'login-mode-tab-active' : ''}`}
                onClick={() => switchMode('claim')}
              >
                <KeyRound size={14} /> Aktivasi Warga
              </button>
            </div>

            <div className="login-card-heading">
              <span className="eyebrow">{mode === 'login' ? 'SELAMAT DATANG' : 'AKTIVASI RUMAH'}</span>
              <h2>{mode === 'login' ? 'Masuk ke akun' : 'Klaim akun rumah'}</h2>
              <p>
                {mode === 'login'
                  ? 'Gunakan kode rumah atau username pengurus.'
                  : 'Pilih nomor rumah dan masukkan kode klaim 6 karakter dari pengurus.'}
              </p>
            </div>

            {(error || startupError) && <Notice>{error || startupError}</Notice>}

            {mode === 'login' ? (
              <form className="form-stack" name="kaskita-login" method="post" onSubmit={handleLoginSubmit}>
                <label className="field">
                  <span>Kode rumah / username</span>
                  <input
                    id="login-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    placeholder="Contoh: F-01"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Password</span>
                  <span className="password-input">
                    <input
                      id="login-password"
                      name="password"
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
                      {showPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                  </span>
                </label>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontSize: '13px',
                    color: '#415548',
                    marginTop: '-2px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => {
                      const checked = event.target.checked
                      setRememberMe(checked)
                      if (!checked) clearSavedCredentials()
                    }}
                    style={{
                      width: '16px',
                      height: '16px',
                      accentColor: '#1b4332',
                      cursor: 'pointer',
                      margin: 0,
                    }}
                  />
                  <span>Ingat username &amp; password di perangkat ini</span>
                </label>
                <Button className="login-submit" type="submit" disabled={submitting}>
                  {submitting ? 'Memeriksa...' : 'Masuk'}
                  {!submitting && <ArrowUpRight size={16} />}
                </Button>
              </form>
            ) : claimableHousesResource.loading && !claimableHousesResource.data ? (
              <LoadingState label="Memuat daftar rumah..." />
            ) : unactivatedHouses.length === 0 ? (
              <Notice variant="info">
                Belum ada rumah yang menunggu aktivasi baru. Semua rumah yang terdaftar telah aktif atau belum diterbitkan kode klaim oleh pengurus.
              </Notice>
            ) : (
              <form className="form-stack" onSubmit={handleClaimSubmit}>
                {/* Panel Pencarian & Filter Rumah */}
                <div style={{ background: '#f8faf9', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8e4', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#163326' }}>
                      Cari Rumah ({filteredClaimableHouses.length} dari {unactivatedHouses.length} belum aktif)
                    </span>
                    {(houseSearchQuery || houseBlockFilter !== 'ALL') && (
                      <button
                        type="button"
                        onClick={() => {
                          setHouseSearchQuery('')
                          setHouseBlockFilter('ALL')
                        }}
                        style={{ border: 'none', background: 'transparent', color: '#1b4332', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Reset filter
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 140px', position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <Search size={14} style={{ position: 'absolute', left: '8px', color: '#687e72' }} />
                      <input
                        type="text"
                        placeholder="Ketik kode/blok/no rumah..."
                        value={houseSearchQuery}
                        onChange={(e) => setHouseSearchQuery(e.target.value)}
                        style={{
                          width: '100%',
                          height: '32px',
                          paddingLeft: '28px',
                          paddingRight: '24px',
                          fontSize: '12px',
                          borderRadius: '6px',
                          border: '1px solid #ccd8d1',
                          background: '#ffffff',
                        }}
                      />
                      {houseSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setHouseSearchQuery('')}
                          style={{ position: 'absolute', right: '6px', background: 'transparent', border: 'none', color: '#83958b', cursor: 'pointer', padding: '2px' }}
                          title="Hapus pencarian"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    {availableBlocks.length > 1 && (
                      <select
                        value={houseBlockFilter}
                        onChange={(e) => setHouseBlockFilter(e.target.value)}
                        style={{
                          height: '32px',
                          fontSize: '12px',
                          borderRadius: '6px',
                          border: '1px solid #ccd8d1',
                          background: '#ffffff',
                          padding: '0 8px',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="ALL">Semua Blok</option>
                        {availableBlocks.map((b) => (
                          <option key={b} value={b}>Blok {b}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {filteredClaimableHouses.length === 0 ? (
                  <Notice variant="info">
                    Tidak ditemukan rumah belum aktif yang cocok dengan filter. Silakan reset kata kunci pencarian.
                  </Notice>
                ) : (
                  <>
                    <div className="claim-form-grid">
                      <label className="field field-sm">
                        <span>Pilih nomor rumah</span>
                        <select
                          value={activeClaimHouse ? String(activeClaimHouse.houseId) : ''}
                          onChange={(event) => setSelectedHouseId(event.target.value)}
                          required
                        >
                          {filteredClaimableHouses.map((house) => (
                            <option key={house.houseId} value={house.houseId}>
                              {house.houseCode} (Blok {house.blockCode} No. {house.houseNumber})
                            </option>
                          ))}
                        </select>
                        <small>
                          Username login: <b>{activeClaimHouse?.houseCode}</b>
                        </small>
                      </label>

                      <label className="field field-sm">
                        <span>Kode klaim pengurus (6 kar.)</span>
                        <input
                          autoComplete="off"
                          maxLength={6}
                          placeholder="Contoh: K7P9M4"
                          value={claimCode}
                          onPaste={handleClaimCodePaste}
                          onChange={(event) => setClaimCode(event.target.value.toUpperCase())}
                          required
                        />
                      </label>

                      <label className="field field-sm">
                        <span>Nama lengkap / kepala warga</span>
                        <input
                          autoComplete="name"
                          maxLength={120}
                          placeholder="Contoh: Budi Santoso"
                          value={fullName}
                          onChange={(event) => setFullName(event.target.value)}
                          required
                        />
                      </label>

                      <label className="field field-sm">
                        <span>Status hunian</span>
                        <select
                          value={occupancyStatus}
                          onChange={(event) => setOccupancyStatus(event.target.value as HouseOccupancyStatus)}
                        >
                          <option value="OWNER_OCCUPIED">Dihuni pemilik</option>
                          <option value="RENTED">Dikontrakan</option>
                          <option value="VACANT">Belum dihuni</option>
                        </select>
                      </label>

                      {occupancyStatus === 'RENTED' && (
                        <>
                          <label className="field field-sm claim-field-full">
                            <span>No. HP/WA Pemilik Rumah <small>(Yang Mengontrakkan)</small> <span style={{ color: '#dc2626' }}>*</span></span>
                            <input
                              type="tel"
                              required
                              maxLength={30}
                              placeholder="Contoh: 0812-3456-7890"
                              value={ownerPhone}
                              onChange={(event) => setOwnerPhone(event.target.value)}
                            />
                          </label>
                          <div className="claim-field-full" style={{ fontSize: '11px', color: '#1e3a8a', background: '#eff6ff', padding: '8px 10px', borderRadius: '6px', border: '1px solid #bfdbfe', margin: '4px 0 8px' }}>
                            📌 <b>Perhatian Rumah Dikontrakan:</b> Berkas KTP & KK yang harus diserahkan kepada Sekretaris berjumlah <b>2 berkas</b> (1 berkas milik Pemilik Rumah dan 1 berkas milik Warga yang Mengontrak).
                          </div>
                        </>
                      )}

                      <label className="field field-sm claim-field-full">
                        <span>No. WhatsApp / Telepon <small>(opsional)</small></span>
                        <input
                          type="tel"
                          maxLength={30}
                          placeholder="Contoh: 0812-3456-7890"
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                        />
                      </label>

                      <label className="field field-sm">
                        <span>Buat password (min. 6 kar.)</span>
                        <span className="password-input">
                          <input
                            autoComplete="new-password"
                            type={showClaimPassword ? 'text' : 'password'}
                            minLength={6}
                            maxLength={72}
                            placeholder="Buat password"
                            value={claimPassword}
                            onChange={(event) => setClaimPassword(event.target.value)}
                            required
                          />
                          <button
                            className="password-toggle"
                            type="button"
                            onClick={() => setShowClaimPassword((shown) => !shown)}
                            aria-label={showClaimPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                          >
                            {showClaimPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                          </button>
                        </span>
                      </label>

                      <label className="field field-sm">
                        <span>Ulangi password</span>
                        <span className="password-input">
                          <input
                            autoComplete="new-password"
                            type={showConfirmClaimPassword ? 'text' : 'password'}
                            minLength={6}
                            maxLength={72}
                            placeholder="Ketik ulang password"
                            value={confirmClaimPassword}
                            onChange={(event) => setConfirmClaimPassword(event.target.value)}
                            required
                          />
                          <button
                            className="password-toggle"
                            type="button"
                            onClick={() => setShowConfirmClaimPassword((shown) => !shown)}
                            aria-label={showConfirmClaimPassword ? 'Sembunyikan konfirmasi password' : 'Tampilkan konfirmasi password'}
                          >
                            {showConfirmClaimPassword ? <Eye size={16} /> : <EyeOff size={16} />}
                          </button>
                        </span>
                      </label>
                    </div>

                    <Button className="login-submit" type="submit" disabled={submitting}>
                      {submitting ? 'Mengaktifkan akun...' : 'Aktivasi & Masuk'}
                      {!submitting && <ArrowUpRight size={17} />}
                    </Button>
                  </>
                )}
              </form>
            )}

            <div className="login-note">
              <ShieldCheck size={16} />
              <span>
                {mode === 'login'
                  ? 'Belum punya akun warga? Klik tab Aktivasi Warga di atas.'
                  : 'Kode klaim bersifat sekali pakai dan otomatis hangus setelah akun aktif.'}
              </span>
            </div>
          </div>
          <footer className="login-footer">
            <span>KasKita v1 · Dibuat oleh suntree.dev</span>
            <span>Butuh bantuan? Hubungi pengurus blok F & B</span>
          </footer>
        </section>
      </div>
    </main>
  )
}
