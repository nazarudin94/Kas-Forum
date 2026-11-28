import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarCheck,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileCheck,
  FileCheck2,
  FileImage,
  FileText,
  KeyRound,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Power,
  Printer,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react'
import { Button, Card, EmptyState, LoadingState, MoneyInput, Notice, SectionTitle, StatusBadge } from '../../components/UI'
import { useAuth } from '../../auth/AuthContext'
import { useResource } from '../../hooks/useResource'
import { api, jsonBody } from '../../lib/api'
import {
  exportRondaScheduleCsv,
  exportRondaSchedulePrint,
  exportWargaListCsv,
  exportWargaListPrint,
} from '../../lib/export'
import { formatCurrency, formatDate, formatNominalInput, parseNominalInput } from '../../lib/format'
import { getProofSignedUrl, uploadPaymentProof } from '../../lib/storage'
import { getSupabase } from '../../lib/supabase'
import type {
  Bill,
  Expense,
  FinanceFund,
  HouseArrears,
  HouseOccupancyStatus,
  Payment,
  RondaDayKey,
  RondaSchedule,
  UnpaidHouseBill,
  WargaProfile,
} from '../../types'

type PanelTab =
  | 'overview'
  | 'bills'
  | 'expenses'
  | 'profile'
  | 'review'
  | 'funds'
  | 'income'
  | 'arrears'
  | 'verification'
  | 'ronda'

interface WorkspaceProps {
  tab: PanelTab
  onFinanceChange?: () => Promise<void>
}

export function WargaWorkspace({ tab, onFinanceChange = async () => {} }: WorkspaceProps) {
  if (tab === 'expenses') {
    return <ReadonlyExpensePanel endpoint="/api/public/expenses" />
  }
  if (tab === 'profile') {
    return <WargaProfilePanel />
  }
  return <WargaBillsPanel onFinanceChange={onFinanceChange} />
}

export function BendaharaWorkspace({ tab, onFinanceChange = async () => {} }: WorkspaceProps) {
  if (tab === 'review') return <PaymentReviewPanel onFinanceChange={onFinanceChange} />
  if (tab === 'funds') return <FundsPanel onFinanceChange={onFinanceChange} />
  if (tab === 'expenses') return <BendaharaExpensePanel onFinanceChange={onFinanceChange} />
  if (tab === 'income') return <IncomePanel onFinanceChange={onFinanceChange} />
  return null
}

export function KetuaWorkspace({ tab }: WorkspaceProps) {
  if (tab === 'arrears') return <ArrearsPanel />
  if (tab === 'expenses') return <ReadonlyExpensePanel endpoint="/api/ketua/expenses" />
  if (tab === 'verification') return <VerificationPanel />
  return (
    <div className="workspace-stack">
      <ArrearsPanel compact />
      <VerificationPanel compact />
    </div>
  )
}

function WargaBillsPanel({ onFinanceChange }: { onFinanceChange: () => Promise<void> }) {
  const billsResource = useResource<Bill[]>('/api/warga/bills')
  const paymentsResource = useResource<Payment[]>('/api/warga/payments')
  const [billId, setBillId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const bills = billsResource.data ?? []
  const unpaidBills = bills.filter((bill) => bill.status === 'UNPAID')
  const selectedBill = unpaidBills.find((bill) => String(bill.id) === billId) ?? unpaidBills[0]

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      setSelectedFile(null)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
      return
    }

    if (!file.type.startsWith('image/')) {
      setError('Hanya berkas gambar (JPG, PNG, WebP) yang diperbolehkan.')
      return
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setError(null)
  }

  function clearSelectedFile() {
    setSelectedFile(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedBill) return
    if (!selectedFile) {
      setError('Silakan pilih foto / tangkapan layar bukti transfer.')
      return
    }

    const amountPaid = Number(selectedBill.amountDue)
    if (!Number.isSafeInteger(amountPaid) || amountPaid <= 0) {
      setError('Nominal tagihan tidak dapat diproses dengan aman. Hubungi bendahara.')
      return
    }

    setSubmitting(true)
    setError(null)
    setSuccess(null)
    setUploadProgress('Mengompresi & mengunggah bukti...')

    try {
      const storagePath = await uploadPaymentProof(selectedFile)

      setUploadProgress('Mengirim pengajuan...')
      await api('/api/warga/payments', {
        method: 'POST',
        body: jsonBody({
          billId: selectedBill.id,
          amountPaid,
          proofUrl: storagePath,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      })
      setSuccess('Pengajuan terkirim. Foto bukti transfer berhasil diunggah dan menunggu verifikasi bendahara.')
      clearSelectedFile()
      setNotes('')
      await Promise.all([billsResource.reload(), paymentsResource.reload(), onFinanceChange()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pengajuan pembayaran gagal.')
    } finally {
      setSubmitting(false)
      setUploadProgress(null)
    }
  }

  return (
    <div className="workspace-stack">
      <Card>
        <SectionTitle
          title="Tagihan rumah"
          description="Tagihan yang tampil hanya milik akun Anda."
          action={<span className="tiny-count">{bills.length} tagihan</span>}
        />
        {billsResource.error && <Notice>{billsResource.error}</Notice>}
        {billsResource.loading && !billsResource.data ? <LoadingState /> : (
          bills.length === 0
            ? <EmptyState title="Belum ada tagihan" description="Tagihan dari bendahara akan muncul di sini." />
            : <div className="bill-list">
              {bills.map((bill) => (
                <article className="bill-row" key={bill.id}>
                  <span className={`bill-icon ${bill.status === 'PAID' ? 'bill-icon-paid' : ''}`}>
                    <Wallet size={19} />
                  </span>
                  <div className="bill-main">
                    <strong>{bill.fundName}</strong>
                    <span>{bill.periodKey} · {bill.fundType === 'EVENT' ? 'Kegiatan' : 'Iuran rutin'}</span>
                    {bill.dueDate && (
                      <small className="due-date-label">
                        Batas bayar: <b>{formatDate(bill.dueDate)}</b>
                      </small>
                    )}
                  </div>
                  <div className="bill-amount">
                    <strong>{formatCurrency(bill.amountDue)}</strong>
                    <StatusBadge status={bill.status} />
                  </div>
                </article>
              ))}
            </div>
        )}
      </Card>

      {unpaidBills.length > 0 && (
        <Card className="payment-form-card">
          <SectionTitle
            title="Ajukan pembayaran"
            description="Kirim pengajuan setelah Anda melakukan transfer."
          />
          {error && <Notice>{error}</Notice>}
          {success && <Notice variant="success">{success}</Notice>}
          <form className="form-grid" onSubmit={submitPayment}>
            <label className="field">
              <span>Pilih tagihan</span>
              <select
                value={selectedBill ? String(selectedBill.id) : ''}
                onChange={(event) => setBillId(event.target.value)}
                required
              >
                {unpaidBills.map((bill) => (
                  <option value={bill.id} key={bill.id}>
                    {bill.fundName} · {bill.periodKey}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Nominal tagihan</span>
              <input value={selectedBill ? formatCurrency(selectedBill.amountDue) : ''} readOnly />
            </label>
            <div className="field field-wide">
              <span>Foto / Tangkapan layar bukti transfer</span>
              <div className="proof-upload-zone">
                {!selectedFile ? (
                  <div>
                    <label className="button button-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <Upload size={16} /> Pilih foto bukti transfer
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                        disabled={submitting}
                      />
                    </label>
                    <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#6d7d74' }}>
                      Format JPG, PNG, atau WebP. Otomatis dikompresi menjadi WebP hemat kuota.
                    </p>
                  </div>
                ) : (
                  <div className="proof-preview-wrapper">
                    {previewUrl && (
                      <img src={previewUrl} alt="Pratinjau bukti transfer" className="proof-preview-img" />
                    )}
                    <div className="proof-preview-meta">
                      <strong>{selectedFile.name}</strong>
                      <span>Ukuran asli: {(selectedFile.size / 1024).toFixed(0)} KB (akan dikompresi)</span>
                      <Button
                        type="button"
                        variant="ghost"
                        className="button-small"
                        onClick={clearSelectedFile}
                        disabled={submitting}
                        style={{ alignSelf: 'flex-start', marginTop: '4px', color: '#a2483e' }}
                      >
                        <X size={13} /> Ganti foto
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <label className="field field-wide">
              <span>Catatan <small>(opsional)</small></span>
              <input
                maxLength={255}
                placeholder="Contoh: transfer tanggal 22 November"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            <div className="field-wide form-actions">
              <Button type="submit" disabled={submitting || !selectedBill}>
                {submitting ? (uploadProgress ?? 'Mengirim...') : 'Kirim pengajuan'}
                <ArrowUpRight size={17} />
              </Button>
              <span className="form-footnote">Saldo resmi berubah setelah disetujui bendahara.</span>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <SectionTitle title="Riwayat pembayaran" description="Status pengajuan dan pembayaran rumah Anda." />
        {paymentsResource.error && <Notice>{paymentsResource.error}</Notice>}
        {paymentsResource.loading && !paymentsResource.data ? <LoadingState /> : (
          !paymentsResource.data?.length
            ? <EmptyState title="Belum ada riwayat" description="Pembayaran yang Anda ajukan akan tercatat di sini." />
            : <div className="activity-list">
              {paymentsResource.data.map((payment) => (
                <article className="activity-row" key={payment.id}>
                  <span className={`activity-icon ${payment.status === 'APPROVED' ? 'activity-approved' : payment.status === 'REJECTED' ? 'activity-rejected' : 'activity-pending'}`}>
                    {payment.status === 'APPROVED' ? <Check size={17} /> : payment.status === 'REJECTED' ? <X size={17} /> : <RefreshCw size={17} />}
                  </span>
                  <div className="activity-main">
                    <strong>{payment.fundName}</strong>
                    <span>{payment.createdAt ? formatDate(payment.createdAt) : 'Pembayaran'}</span>
                    {payment.rejectReason && <small className="reject-note">Alasan: {payment.rejectReason}</small>}
                  </div>
                  <div className="activity-amount">
                    <strong>{formatCurrency(payment.amountPaid)}</strong>
                    <StatusBadge status={payment.status} />
                  </div>
                </article>
              ))}
            </div>
        )}
      </Card>
    </div>
  )
}

function WargaProfilePanel() {
  const profileResource = useResource<WargaProfile>('/api/warga/profile')
  const { user, refreshUser, changePassword } = useAuth()
  const canUpdate = Boolean(user?.menus.some((menu) => menu.key === 'profile' && menu.canUpdate))

  if (profileResource.loading && !profileResource.data) {
    return (
      <Card>
        <LoadingState label="Memuat profil warga..." />
      </Card>
    )
  }

  if (profileResource.error || !profileResource.data) {
    return (
      <Card>
        <Notice>{profileResource.error ?? 'Profil warga tidak ditemukan.'}</Notice>
      </Card>
    )
  }

  const profile = profileResource.data
  const profileKey = `${profile.fullName}|${profile.headName}|${profile.occupancyStatus}|${profile.phone ?? ''}`

  return (
    <WargaProfileContent
      key={profileKey}
      profile={profile}
      canUpdate={canUpdate}
      onProfileSaved={async () => {
        await Promise.all([profileResource.reload(), refreshUser()])
      }}
      onChangePassword={changePassword}
    />
  )
}

function WargaProfileContent({
  profile,
  canUpdate,
  onProfileSaved,
  onChangePassword,
}: {
  profile: WargaProfile
  canUpdate: boolean
  onProfileSaved: () => Promise<void>
  onChangePassword: (password: string) => Promise<void>
}) {
  const [fullName, setFullName] = useState(profile.fullName)
  const [headName, setHeadName] = useState(profile.headName)
  const [occupancyStatus, setOccupancyStatus] = useState<HouseOccupancyStatus>(profile.occupancyStatus)
  const [ownerPhone, setOwnerPhone] = useState(profile.ownerPhone ?? '')
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingProfile(true)
    setProfileError(null)
    setProfileSuccess(null)
    try {
      await api('/api/warga/profile', {
        method: 'PUT',
        body: jsonBody({
          fullName: fullName.trim(),
          headName: headName.trim(),
          occupancyStatus,
          ownerPhone: occupancyStatus === 'RENTED' ? ownerPhone.trim() || null : null,
          phone: phone.trim() || null,
        }),
      })
      await onProfileSaved()
      setProfileSuccess('Profil dan data hunian berhasil diperbarui.')
    } catch (reason) {
      setProfileError(reason instanceof Error ? reason.message : 'Profil gagal diperbarui.')
    } finally {
      setSavingProfile(false)
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(null)
    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi password baru belum sama.')
      return
    }
    if (newPassword.length < 6) {
      setPasswordError('Password baru minimal 6 karakter.')
      return
    }
    setSavingPassword(true)
    try {
      await onChangePassword(newPassword)
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSuccess('Password akun berhasil diperbarui.')
    } catch (reason) {
      setPasswordError(reason instanceof Error ? reason.message : 'Password gagal diperbarui.')
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="workspace-stack">
      <Card>
        <SectionTitle
          title="Informasi rumah & akun"
          description="Identitas unit rumah yang terhubung dengan akun Anda."
          action={<span className="tiny-count">Rumah {profile.houseCode}</span>}
        />
        <div className="arrears-row">
          <span className="house-avatar">{profile.houseCode.slice(0, 1)}</span>
          <div className="arrears-house">
            <strong>{profile.houseCode} · {profile.headName}</strong>
            <span>Blok {profile.blockCode} · Nomor {profile.houseNumber} · Username: {profile.username}</span>
            <span className="house-occupancy-label">
              {profile.occupancyStatus === 'RENTED'
                ? `Dikontrakan${profile.ownerPhone ? ` · Pemilik: ${profile.ownerPhone}` : ''}`
                : profile.occupancyStatus === 'VACANT'
                  ? 'Belum dihuni'
                  : 'Dihuni pemilik'}
              {profile.phoneMasked ? ` · Telp/WA: ${profile.phoneMasked} (Terenkripsi)` : ''}
            </span>
          </div>
          <div className="arrears-count">
            <small>Terdaftar {formatDate(profile.createdAt)}</small>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle
          title="Status Berkas Administrasi (KTP & KK)"
          description="Verifikasi berkas kependudukan resmi oleh Sekretaris lingkungan."
        />
        <div className="warga-doc-grid">
          <div className={`warga-doc-item ${profile.ktpVerified ? 'warga-doc-item-verified' : ''}`}>
            <span className="warga-doc-icon">
              {profile.ktpVerified ? <FileCheck2 size={20} /> : <FileText size={20} />}
            </span>
            <div className="warga-doc-info">
              <strong>KTP (Kartu Tanda Penduduk)</strong>
              <span style={{ color: profile.ktpVerified ? '#15803d' : '#b45309' }}>
                {profile.ktpVerified ? '✓ Sudah Diserahkan & Diverifikasi Sekretaris' : '⏳ Belum Diserahkan ke Sekretaris'}
              </span>
            </div>
          </div>

          <div className={`warga-doc-item ${profile.kkVerified ? 'warga-doc-item-verified' : ''}`}>
            <span className="warga-doc-icon">
              {profile.kkVerified ? <FileCheck2 size={20} /> : <FileText size={20} />}
            </span>
            <div className="warga-doc-info">
              <strong>Kartu Keluarga (KK)</strong>
              <span style={{ color: profile.kkVerified ? '#15803d' : '#b45309' }}>
                {profile.kkVerified ? '✓ Sudah Diserahkan & Diverifikasi Sekretaris' : '⏳ Belum Diserahkan ke Sekretaris'}
              </span>
            </div>
          </div>
        </div>

        {(!profile.ktpVerified || !profile.kkVerified) && (
          <div style={{ fontSize: '12px', color: '#713f12', marginTop: '12px', background: '#fefce8', padding: '9px 12px', borderRadius: '8px', border: '1px solid #fef08a' }}>
            ℹ️ <b>Perhatian:</b> Berkas kependudukan Anda belum lengkap. Silakan serahkan fotokopi atau tunjukkan berkas KTP & Kartu Keluarga (KK) kepada Sekretaris atau pengurus blok.
          </div>
        )}

        {profile.occupancyStatus === 'RENTED' && (
          <div style={{ fontSize: '12px', color: '#1e3a8a', marginTop: '12px', background: '#eff6ff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
            📌 <b>Catatan Khusus Rumah Kontrakan:</b> Karena rumah berstatus dikontrakan, berkas KTP dan KK yang harus dilampirkan/diserahkan ke Sekretaris masing-masing <b>2 berkas</b> (1 berkas milik Pemilik Rumah dan 1 berkas milik Warga yang Mengontrak).
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle
          title="Perbarui data profil"
          description="Sesuaikan nama akun, kepala warga, status hunian, atau nomor kontak."
        />
        {profileError && <Notice>{profileError}</Notice>}
        {profileSuccess && <Notice variant="success">{profileSuccess}</Notice>}
        <form className="form-grid" onSubmit={submitProfile}>
          <label className="field">
            <span>Username login</span>
            <input value={profile.username} readOnly />
          </label>
          <label className="field">
            <span>Kode rumah</span>
            <input value={profile.houseCode} readOnly />
          </label>
          <label className="field">
            <span>Nama lengkap akun</span>
            <input
              maxLength={120}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              disabled={!canUpdate || savingProfile}
              required
            />
          </label>
          <label className="field">
            <span>Nama kepala warga</span>
            <input
              maxLength={120}
              value={headName}
              onChange={(event) => setHeadName(event.target.value)}
              disabled={!canUpdate || savingProfile}
              required
            />
          </label>
          <label className="field">
            <span>Status hunian</span>
            <select
              value={occupancyStatus}
              onChange={(event) => setOccupancyStatus(event.target.value as HouseOccupancyStatus)}
              disabled={!canUpdate || savingProfile}
            >
              <option value="OWNER_OCCUPIED">Dihuni pemilik</option>
              <option value="RENTED">Dikontrakan</option>
              <option value="VACANT">Belum dihuni</option>
            </select>
          </label>
          {occupancyStatus === 'RENTED' && (
            <label className="field field-wide">
              <span>Nomor HP / WhatsApp Pemilik Rumah <small>(Yang Mengontrakkan)</small> <span style={{ color: '#dc2626' }}>*</span></span>
              <input
                type="tel"
                maxLength={30}
                placeholder="Contoh: 0812-3456-7890"
                value={ownerPhone}
                onChange={(event) => setOwnerPhone(event.target.value)}
                disabled={!canUpdate || savingProfile}
                required={occupancyStatus === 'RENTED'}
              />
              <small>Diisi oleh penghuni / yang punya rumah agar pengurus lingkungan dapat menghubungi pemilik unit.</small>
            </label>
          )}
          <label className="field">
            <span>No. WhatsApp / Telepon <small>(opsional)</small></span>
            <input
              type="tel"
              maxLength={30}
              placeholder="Contoh: 0812-3456-7890"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={!canUpdate || savingProfile}
            />
          </label>
          {canUpdate && (
            <div className="field-wide form-actions">
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? 'Menyimpan...' : 'Simpan profil'}
              </Button>
            </div>
          )}
        </form>
      </Card>

      <Card>
        <SectionTitle
          title="Keamanan akun"
          description="Ganti password atau PIN login Anda secara berkala."
        />
        {passwordError && <Notice>{passwordError}</Notice>}
        {passwordSuccess && <Notice variant="success">{passwordSuccess}</Notice>}
        <form className="form-grid" onSubmit={submitPassword}>
          <label className="field">
            <span>Password baru (min. 6 karakter)</span>
            <span className="password-input">
              <input
                type={showNewPassword ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={6}
                maxLength={72}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowNewPassword((shown) => !shown)}
                aria-label={showNewPassword ? 'Sembunyikan password baru' : 'Tampilkan password baru'}
              >
                {showNewPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </span>
          </label>
          <label className="field">
            <span>Ulangi password baru</span>
            <span className="password-input">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={6}
                maxLength={72}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowConfirmPassword((shown) => !shown)}
                aria-label={showConfirmPassword ? 'Sembunyikan konfirmasi password baru' : 'Tampilkan konfirmasi password baru'}
              >
                {showConfirmPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </span>
          </label>
          <div className="field-wide form-actions">
            <Button type="submit" variant="secondary" disabled={savingPassword}>
              {savingPassword ? 'Memperbarui...' : 'Ubah password'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

function PaymentReviewPanel({
  onFinanceChange,
}: {
  onFinanceChange: () => Promise<void>
}) {
  const resource = useResource<Payment[]>('/api/bendahara/payments/pending')
  const payments = resource.data ?? []

  async function updateList() {
    await Promise.all([resource.reload(), onFinanceChange()])
  }

  return (
    <Card>
      <SectionTitle
        title="Menunggu verifikasi"
        description="Periksa bukti transfer sebelum menyetujui pembayaran."
        action={<span className="tiny-count">{payments.length} pengajuan</span>}
      />
      {resource.error && <Notice>{resource.error}</Notice>}
      {resource.loading && !resource.data ? <LoadingState /> : (
        payments.length === 0
          ? <EmptyState title="Semua sudah diperiksa" description="Pengajuan baru akan muncul di daftar ini." />
          : <div className="review-list">
            {payments.map((payment) => (
              <PaymentReviewCard key={payment.id} payment={payment} onUpdated={updateList} />
            ))}
          </div>
      )}
    </Card>
  )
}

function PaymentReviewCard({
  payment,
  onUpdated,
}: {
  payment: Payment
  onUpdated: () => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [signedProofUrl, setSignedProofUrl] = useState<string | null>(null)
  const [loadingProof, setLoadingProof] = useState(false)

  useEffect(() => {
    let active = true
    if (payment.proofUrl) {
      getProofSignedUrl(payment.proofUrl)
        .then((url) => {
          if (active) setSignedProofUrl(url)
        })
        .finally(() => {
          if (active) setLoadingProof(false)
        })
    }

    return () => {
      active = false
    }
  }, [payment.proofUrl])

  async function decide(action: 'approve' | 'reject') {
    if (action === 'reject' && !reason.trim()) {
      setError('Tuliskan alasan penolakan terlebih dahulu.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api(`/api/bendahara/payments/${payment.id}/${action}`, {
        method: 'POST',
        ...(action === 'reject' ? { body: jsonBody({ reason: reason.trim() }) } : {}),
      })
      await onUpdated()
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : 'Status pembayaran gagal diperbarui.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="review-card">
      <div className="review-card-top">
        <span className="review-avatar">{payment.houseCode?.slice(0, 1) ?? 'K'}</span>
        <div className="review-person">
          <strong>{payment.houseCode ?? 'Kas umum'}</strong>
          <span>{payment.submittedBy ?? payment.incomeSource ?? 'Pengajuan warga'}</span>
        </div>
        <div className="review-value">
          <strong>{formatCurrency(payment.amountPaid)}</strong>
          <span>{payment.fundName}</span>
        </div>
      </div>
      {payment.notes && <p className="review-notes">“{payment.notes}”</p>}
      {loadingProof ? (
        <p style={{ margin: '12px 0 0', fontSize: '11px', color: '#6d7d74' }}>Memuat tautan bukti aman...</p>
      ) : signedProofUrl ? (
        <a className="proof-link" href={signedProofUrl} target="_blank" rel="noreferrer">
          <FileImage size={16} /> Lihat foto bukti pembayaran <ExternalLink size={14} />
        </a>
      ) : <p className="missing-proof">Bukti pembayaran tidak dilampirkan atau tidak ditemukan.</p>}
      {error && <Notice>{error}</Notice>}
      <div className="review-actions">
        <label className="field">
          <span>Alasan penolakan</span>
          <input
            maxLength={255}
            placeholder="Wajib diisi jika menolak"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <div className="review-buttons">
          <Button type="button" variant="danger" disabled={busy} onClick={() => void decide('reject')}>
            <X size={16} /> Tolak
          </Button>
          <Button type="button" disabled={busy} onClick={() => void decide('approve')}>
            <Check size={16} /> Setujui
          </Button>
        </div>
      </div>
    </article>
  )
}

function FundsPanel({ onFinanceChange }: { onFinanceChange: () => Promise<void> }) {
  const resource = useResource<FinanceFund[]>('/api/bendahara/funds')
  const fundDialog = useRef<HTMLDialogElement>(null)
  const [editingFund, setEditingFund] = useState<FinanceFund | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<'RECURRING' | 'EVENT'>('RECURRING')
  const [amount, setAmount] = useState('10.000')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [dueDay, setDueDay] = useState('10')
  const [status, setStatus] = useState<'ACTIVE' | 'CLOSED'>('ACTIVE')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const funds = resource.data ?? []

  function openCreateModal() {
    setEditingFund(null)
    setName('')
    setType('RECURRING')
    setAmount('10.000')
    setDescription('')
    setStartDate('')
    setEndDate('')
    setDueDay('10')
    setStatus('ACTIVE')
    setError(null)
    setModalOpen(true)
    fundDialog.current?.showModal()
  }

  function openEditModal(fund: FinanceFund) {
    setEditingFund(fund)
    setName(fund.name)
    setType(fund.type)
    setAmount(formatNominalInput(fund.amountPerHouse))
    setDescription(fund.description ?? '')
    setStartDate(fund.startDate ?? '')
    setEndDate(fund.endDate ?? '')
    setDueDay(fund.dueDay !== null && fund.dueDay !== undefined ? String(fund.dueDay) : '10')
    setStatus(fund.status)
    setError(null)
    setModalOpen(true)
    fundDialog.current?.showModal()
  }

  function closeModal() {
    setModalOpen(false)
    fundDialog.current?.close()
  }

  async function handleSaveFund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amountPerHouse = parseNominalInput(amount)
    if (!Number.isSafeInteger(amountPerHouse) || amountPerHouse < 0) {
      setError('Nominal harus berupa bilangan bulat rupiah yang valid.')
      return
    }
    const numericDueDay = Number(dueDay)
    if (type === 'RECURRING' && (!Number.isInteger(numericDueDay) || numericDueDay < 1 || numericDueDay > 28)) {
      setError('Tanggal jatuh tempo harus di antara tanggal 1 sampai 28.')
      return
    }
    if (startDate && endDate && endDate < startDate) {
      setError('Bulan selesai tidak boleh lebih awal dari bulan mulai.')
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      if (editingFund) {
        await api(`/api/bendahara/funds/${editingFund.id}`, {
          method: 'PUT',
          body: jsonBody({
            name: name.trim(),
            type,
            amountPerHouse,
            ...(description.trim() ? { description: description.trim() } : {}),
            ...(startDate ? { startDate } : {}),
            ...(endDate ? { endDate } : {}),
            dueDay: type === 'RECURRING' ? numericDueDay : null,
            status,
          }),
        })
        setSuccess(`Pos keuangan "${name}" berhasil diperbarui.`)
      } else {
        await api('/api/bendahara/funds', {
          method: 'POST',
          body: jsonBody({
            name: name.trim(),
            type,
            amountPerHouse,
            ...(description.trim() ? { description: description.trim() } : {}),
            ...(startDate ? { startDate } : {}),
            ...(endDate ? { endDate } : {}),
            dueDay: type === 'RECURRING' ? numericDueDay : null,
            status,
          }),
        })
        setSuccess('Pos keuangan berhasil dibuat.')
      }
      closeModal()
      await Promise.all([resource.reload(), onFinanceChange()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Gagal menyimpan pos keuangan.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteFund(fund: FinanceFund) {
    if (!window.confirm(`Hapus pos keuangan "${fund.name}"? Jika sudah ada riwayat transaksi, pos tidak dapat dihapus.`)) {
      return
    }
    setDeletingId(fund.id)
    setError(null)
    setSuccess(null)
    try {
      await api(`/api/bendahara/funds/${fund.id}`, {
        method: 'DELETE',
      })
      setSuccess(`Pos keuangan "${fund.name}" berhasil dihapus.`)
      await Promise.all([resource.reload(), onFinanceChange()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Gagal menghapus pos keuangan.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="workspace-stack">
      {success && <Notice variant="success">{success}</Notice>}
      {error && !modalOpen && <Notice>{error}</Notice>}

      <Card>
        <SectionTitle
          title="Semua pos"
          description="Daftar pos yang digunakan untuk pencatatan kas."
          action={(
            <div className="arrears-heading-actions">
              <span className="tiny-count">{funds.length} pos</span>
              <Button className="button-small" type="button" onClick={openCreateModal}>
                <Plus size={15} /> Buat pos
              </Button>
            </div>
          )}
        />
        {resource.error && <Notice>{resource.error}</Notice>}
        {resource.loading && !resource.data ? <LoadingState /> : funds.length === 0 ? (
          <EmptyState title="Belum ada pos kas" description="Buat pos pertama untuk memulai pencatatan." />
        ) : (
          <div className="fund-table">
            {funds.map((fund) => (
              <div className="fund-table-row" key={fund.id}>
                <div>
                  <strong>{fund.name}</strong>
                  <span>{fund.type === 'EVENT' ? 'Kegiatan' : 'Rutin'} · {fund.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}</span>
                </div>
                <b>{formatCurrency(fund.amountPerHouse)}<small> / rumah</small></b>
                <div className="arrears-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    className="button-small"
                    onClick={() => openEditModal(fund)}
                    aria-label={`Ubah pos ${fund.name}`}
                  >
                    <Pencil size={14} /> Ubah
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="button-small"
                    onClick={() => void handleDeleteFund(fund)}
                    disabled={deletingId === fund.id}
                    aria-label={`Hapus pos ${fund.name}`}
                  >
                    <Trash2 size={14} /> Hapus
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <dialog className="rbac-modal rbac-modal-small" ref={fundDialog} aria-labelledby="fund-dialog-title">
        <div className="rbac-modal-head">
          <div>
            <h2 id="fund-dialog-title">{editingFund ? 'Ubah pos keuangan' : 'Buat pos keuangan'}</h2>
            <p>Atur iuran rutin atau dana kegiatan.</p>
          </div>
          <button
            className="rbac-modal-close"
            type="button"
            aria-label="Tutup modal"
            onClick={closeModal}
          >
            <X size={18} />
          </button>
        </div>
        <form className="rbac-create-form" onSubmit={handleSaveFund}>
          {error && <Notice>{error}</Notice>}
          <div className="rbac-create-grid">
            <label className="field field-wide">
              <span>Nama pos</span>
              <input maxLength={120} value={name} onChange={(event) => setName(event.target.value)} required placeholder="Contoh: Kas rutin blok" />
            </label>
            <label className="field">
              <span>Jenis</span>
              <select value={type} onChange={(event) => setType(event.target.value as 'RECURRING' | 'EVENT')}>
                <option value="RECURRING">Iuran rutin</option>
                <option value="EVENT">Kas kegiatan</option>
              </select>
            </label>
            <label className="field">
              <span>Nominal per rumah (Rp)</span>
              <MoneyInput value={amount} onValueChange={setAmount} placeholder="Contoh: 10.000" required />
            </label>
            <label className="field">
              <span>Bulan mulai <small>(opsional)</small></span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className="field">
              <span>Bulan selesai <small>(opsional)</small></span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            {type === 'RECURRING' && (
              <label className="field">
                <span>Tanggal jatuh tempo bulanan (1–28)</span>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={dueDay}
                  onChange={(event) => setDueDay(event.target.value)}
                  placeholder="Contoh: 10"
                  required
                />
              </label>
            )}
            <label className="field">
              <span>Status pos</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as 'ACTIVE' | 'CLOSED')}>
                <option value="ACTIVE">Aktif</option>
                <option value="CLOSED">Nonaktif</option>
              </select>
            </label>
            <label className="field field-wide">
              <span>Keterangan <small>(opsional)</small></span>
              <input maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Informasi singkat untuk warga" />
            </label>
          </div>
          <div className="form-actions">
            <Button className="button-small" type="submit" disabled={busy}>
              {busy ? 'Menyimpan...' : editingFund ? 'Simpan perubahan' : 'Buat pos'}
            </Button>
            <Button className="button-small" type="button" variant="secondary" onClick={closeModal} disabled={busy}>
              Batal
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  )
}

function BendaharaExpensePanel({ onFinanceChange }: { onFinanceChange: () => Promise<void> }) {
  const expensesResource = useResource<Expense[]>('/api/bendahara/expenses')
  const fundsResource = useResource<FinanceFund[]>('/api/bendahara/funds')
  const [fundId, setFundId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [proofUrl, setProofUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const numericAmount = parseNominalInput(amount)
    if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
      setError('Nominal harus berupa bilangan bulat rupiah positif.')
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await api('/api/bendahara/expenses', {
        method: 'POST',
        body: jsonBody({
          fundId: Number(fundId),
          title: title.trim(),
          amount: numericAmount,
          expenseDate,
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(proofUrl.trim() ? { proofUrl: proofUrl.trim() } : {}),
        }),
      })
      setTitle('')
      setDescription('')
      setAmount('')
      setProofUrl('')
      setSuccess('Pengeluaran tercatat dan masuk ke saldo resmi.')
      await Promise.all([expensesResource.reload(), onFinanceChange()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pengeluaran gagal disimpan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="workspace-stack">
      <Card>
        <SectionTitle title="Catat pengeluaran" description="Transaksi baru langsung tercatat sebagai disetujui." />
        {error && <Notice>{error}</Notice>}
        {success && <Notice variant="success">{success}</Notice>}
        {fundsResource.error && <Notice>{fundsResource.error}</Notice>}
        <form className="form-grid" onSubmit={submit}>
          <label className="field">
            <span>Pos keuangan</span>
            <select value={fundId} onChange={(event) => setFundId(event.target.value)} required>
              <option value="">Pilih pos</option>
              {(fundsResource.data ?? []).filter((fund) => fund.status === 'ACTIVE').map((fund) => (
                <option key={fund.id} value={fund.id}>{fund.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Tanggal</span>
            <input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} required />
          </label>
          <label className="field field-wide">
            <span>Nama pengeluaran</span>
            <input maxLength={150} value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Contoh: Perbaikan lampu jalan" />
          </label>
          <label className="field">
            <span>Nominal (Rp)</span>
            <MoneyInput value={amount} onValueChange={setAmount} required />
          </label>
          <label className="field">
            <span>Tautan nota <small>(opsional)</small></span>
            <input maxLength={255} value={proofUrl} onChange={(event) => setProofUrl(event.target.value)} placeholder="/uploads/nota.webp" />
          </label>
          <label className="field field-wide">
            <span>Keterangan <small>(opsional)</small></span>
            <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <div className="field-wide form-actions">
            <Button type="submit" disabled={busy || !(fundsResource.data?.length)}>
              {busy ? 'Menyimpan...' : 'Simpan pengeluaran'}
              <ArrowDownLeft size={17} />
            </Button>
          </div>
        </form>
      </Card>
      <ExpenseList resource={expensesResource} />
    </div>
  )
}

function ReadonlyExpensePanel({ endpoint }: { endpoint: string }) {
  const resource = useResource<Expense[]>(endpoint)
  return <ExpenseList resource={resource} />
}

function ExpenseItemRow({ expense }: { expense: Expense }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (expense.proofUrl) {
      getProofSignedUrl(expense.proofUrl).then((url) => {
        if (active) setSignedUrl(url)
      })
    }

    return () => {
      active = false
    }
  }, [expense.proofUrl])

  return (
    <article className="expense-row" key={expense.id}>
      <span className="expense-symbol"><ArrowDownLeft size={18} /></span>
      <div className="expense-main">
        <strong>{expense.title}</strong>
        <span>{expense.fundName} · {formatDate(expense.expenseDate)}</span>
        {expense.description && <small>{expense.description}</small>}
        {signedUrl && (
          <a className="inline-proof" href={signedUrl} target="_blank" rel="noreferrer">
            <FileImage size={14} /> Lihat bukti nota <ExternalLink size={13} />
          </a>
        )}
      </div>
      <div className="expense-value">
        <strong>{formatCurrency(expense.amount)}</strong>
        <StatusBadge status={expense.status} />
      </div>
    </article>
  )
}

function ExpenseList({
  resource,
}: {
  resource: { data: Expense[] | null; loading: boolean; error: string | null }
}) {
  return (
    <Card>
      <SectionTitle title="Riwayat pengeluaran" description="Pengeluaran dan bukti nota yang dapat dilihat." />
      {resource.error && <Notice>{resource.error}</Notice>}
      {resource.loading && !resource.data ? <LoadingState /> : !resource.data?.length ? (
        <EmptyState title="Belum ada pengeluaran" description="Pengeluaran yang dicatat akan muncul di sini." />
      ) : (
        <div className="expense-list">
          {resource.data.map((expense) => (
            <ExpenseItemRow key={expense.id} expense={expense} />
          ))}
        </div>
      )}
    </Card>
  )
}

function IncomePanel({ onFinanceChange }: { onFinanceChange: () => Promise<void> }) {
  const fundsResource = useResource<FinanceFund[]>('/api/bendahara/funds')
  const unpaidBillsResource = useResource<UnpaidHouseBill[]>('/api/bendahara/bills/unpaid')
  const [fundId, setFundId] = useState('')
  const [source, setSource] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'TRANSFER' | 'CASH'>('TRANSFER')
  const [notes, setNotes] = useState('')
  const [selectedHouseId, setSelectedHouseId] = useState('')
  const [selectedCashBillId, setSelectedCashBillId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const funds = (fundsResource.data ?? []).filter((fund) => fund.status === 'ACTIVE')
  const unpaidBills = unpaidBillsResource.data ?? []

  const housesWithUnpaid: Array<{ houseId: number; houseCode: string; headName: string; count: number }> = []
  for (const bill of unpaidBills) {
    const existing = housesWithUnpaid.find((item) => item.houseId === bill.houseId)
    if (existing) {
      existing.count += 1
    } else {
      housesWithUnpaid.push({
        houseId: bill.houseId,
        houseCode: bill.houseCode,
        headName: bill.headName,
        count: 1,
      })
    }
  }

  const activeHouse = housesWithUnpaid.find((item) => String(item.houseId) === selectedHouseId) ?? housesWithUnpaid[0]
  const houseUnpaidBills = activeHouse
    ? unpaidBills.filter((bill) => bill.houseId === activeHouse.houseId)
    : []
  const selectedCashBill = houseUnpaidBills.find((bill) => String(bill.billId) === selectedCashBillId) ?? houseUnpaidBills[0]

  async function recordIncome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const numericAmount = parseNominalInput(amount)
    if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
      setError('Nominal harus berupa bilangan bulat rupiah positif.')
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await api('/api/bendahara/income', {
        method: 'POST',
        body: jsonBody({
          fundId: Number(fundId),
          incomeSource: source.trim(),
          amountPaid: numericAmount,
          paymentMethod: method,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      })
      setSource('')
      setAmount('')
      setNotes('')
      setSuccess('Pemasukan berhasil dicatat dan masuk ke saldo resmi.')
      await onFinanceChange()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pemasukan gagal dicatat.')
    } finally {
      setBusy(false)
    }
  }

  async function recordCash(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCashBill) return
    const numericAmount = Number(selectedCashBill.amountDue)
    if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
      setError('Nominal tagihan tidak dapat diproses dengan aman.')
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await api('/api/bendahara/payments/cash', {
        method: 'POST',
        body: jsonBody({ billId: selectedCashBill.billId, amountPaid: numericAmount }),
      })
      setSuccess(
        `Pembayaran tunai ${selectedCashBill.houseCode} (${selectedCashBill.fundName} · ${selectedCashBill.periodKey}) tercatat dan tagihan menjadi lunas.`,
      )
      await Promise.all([unpaidBillsResource.reload(), onFinanceChange()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pembayaran tunai gagal dicatat.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="workspace-stack">
      {(error || success) && <Notice variant={success ? 'success' : 'error'}>{success ?? error}</Notice>}
      <Card>
        <SectionTitle title="Catat pemasukan lain" description="Donasi, sponsor, atau kas non-tagihan." />
        {fundsResource.error && <Notice>{fundsResource.error}</Notice>}
        <form className="form-grid" onSubmit={recordIncome}>
          <label className="field">
            <span>Pos keuangan</span>
            <select value={fundId} onChange={(event) => setFundId(event.target.value)} required>
              <option value="">Pilih pos</option>
              {funds.map((fund) => <option value={fund.id} key={fund.id}>{fund.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Sumber pemasukan</span>
            <input maxLength={100} value={source} onChange={(event) => setSource(event.target.value)} required placeholder="Contoh: Donasi warga" />
          </label>
          <label className="field">
            <span>Nominal (Rp)</span>
            <MoneyInput value={amount} onValueChange={setAmount} required />
          </label>
          <label className="field">
            <span>Metode</span>
            <select value={method} onChange={(event) => setMethod(event.target.value as 'TRANSFER' | 'CASH')}>
              <option value="TRANSFER">Transfer</option>
              <option value="CASH">Tunai</option>
            </select>
          </label>
          <label className="field field-wide">
            <span>Catatan <small>(opsional)</small></span>
            <input maxLength={255} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <div className="field-wide form-actions">
            <Button type="submit" disabled={busy || !funds.length}><ArrowUpRight size={17} /> Catat pemasukan</Button>
          </div>
        </form>
      </Card>

      <Card>
        <SectionTitle title="Pembayaran tunai tagihan" description="Tagihan dibayar penuh dan langsung berstatus lunas." />
        {unpaidBillsResource.error && <Notice>{unpaidBillsResource.error}</Notice>}
        {unpaidBillsResource.loading && !unpaidBillsResource.data ? (
          <LoadingState />
        ) : unpaidBills.length === 0 ? (
          <EmptyState
            title="Tidak ada tagihan belum lunas"
            description="Semua tagihan rumah aktif saat ini sudah lunas atau sedang menunggu verifikasi."
          />
        ) : (
          <form className="form-grid" onSubmit={recordCash}>
            <label className="field">
              <span>Pilih rumah</span>
              <select
                value={activeHouse ? String(activeHouse.houseId) : ''}
                onChange={(event) => {
                  setSelectedHouseId(event.target.value)
                  setSelectedCashBillId('')
                }}
                required
              >
                {housesWithUnpaid.map((house) => (
                  <option key={house.houseId} value={house.houseId}>
                    {house.houseCode} · {house.headName} ({house.count} tagihan)
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Tagihan belum lunas</span>
              <select
                value={selectedCashBill ? String(selectedCashBill.billId) : ''}
                onChange={(event) => setSelectedCashBillId(event.target.value)}
                required
              >
                {houseUnpaidBills.map((bill) => (
                  <option key={bill.billId} value={bill.billId}>
                    {bill.fundName} · {bill.periodKey}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-wide">
              <span>Nominal diterima</span>
              <input value={selectedCashBill ? formatCurrency(selectedCashBill.amountDue) : ''} readOnly />
            </label>
            <div className="field-wide form-actions">
              <Button type="submit" variant="secondary" disabled={busy || !selectedCashBill}>
                <Wallet size={17} /> {busy ? 'Mencatat...' : 'Catat pembayaran tunai'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}

function ArrearsPanel({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth()
  const resource = useResource<HouseArrears[]>('/api/ketua/houses/arrears')
  const houseDialog = useRef<HTMLDialogElement>(null)
  const [editingHouse, setEditingHouse] = useState<HouseArrears | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [updatingHouseId, setUpdatingHouseId] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBlock, setSelectedBlock] = useState('ALL')
  const [selectedOccupancy, setSelectedOccupancy] = useState<string>('ALL')
  const [selectedDocFilter, setSelectedDocFilter] = useState<string>('ALL')
  const [verifyingHouse, setVerifyingHouse] = useState<HouseArrears | null>(null)
  const verifyDocsDialog = useRef<HTMLDialogElement>(null)

  const rows = resource.data ?? []

  // Ambil daftar blok unik dari data rumah
  const availableBlocks = Array.from(new Set(rows.map((r) => r.blockCode).filter(Boolean))).sort()

  // Filter data berdasarkan blok, status hunian, kelengkapan berkas, dan kata kunci pencarian
  const filteredRows = rows.filter((row) => {
    if (selectedBlock !== 'ALL' && row.blockCode !== selectedBlock) {
      return false
    }
    if (selectedOccupancy !== 'ALL' && row.occupancyStatus !== selectedOccupancy) {
      return false
    }
    if (selectedDocFilter !== 'ALL') {
      const isComplete = Boolean(row.ktpVerified && row.kkVerified)
      if (selectedDocFilter === 'VERIFIED' && !isComplete) return false
      if (selectedDocFilter === 'UNVERIFIED' && isComplete) return false
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const matchCode = row.houseCode.toLowerCase().includes(q)
      const matchBlock = row.blockCode.toLowerCase().includes(q)
      const matchNum = row.houseNumber.toLowerCase().includes(q)
      const matchHead = row.headName.toLowerCase().includes(q)
      return matchCode || matchBlock || matchNum || matchHead
    }
    return true
  })

  const visibleRows = compact ? filteredRows.slice(0, 5) : filteredRows
  const permission = user?.menus.find((menu) => menu.key === 'arrears')
  const canCreate = !compact && Boolean(permission?.canCreate)
  const canUpdate = !compact && Boolean(permission?.canUpdate)
  const canDelete = !compact && Boolean(permission?.canDelete)

  function openHouseForm(house: HouseArrears | null = null) {
    setEditingHouse(house)
    setFormKey((current) => current + 1)
    setActionError(null)
    setActionSuccess(null)
    houseDialog.current?.showModal()
  }

  async function setHouseActive(house: HouseArrears, isActive: boolean) {
    const action = isActive ? 'mengaktifkan' : 'menonaktifkan'
    if (!isActive && !window.confirm(`Nonaktifkan rumah ${house.houseCode}? Riwayat tagihan dan pembayaran tetap disimpan.`)) {
      return
    }
    setUpdatingHouseId(house.houseId)
    setActionError(null)
    setActionSuccess(null)
    try {
      const { error } = await getSupabase().rpc('set_house_active', {
        requested_house_id: house.houseId,
        requested_is_active: isActive,
      })
      if (error) throw error
      setActionSuccess(`Rumah ${house.houseCode} berhasil ${action}.`)
      await resource.reload()
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : `Gagal ${action} rumah.`)
    } finally {
      setUpdatingHouseId(null)
    }
  }

  async function regenerateClaimCode(house: HouseArrears) {
    const confirmMsg = house.hasAccount
      ? `Buat kode klaim baru untuk ${house.houseCode}? Warga dapat memakai kode ini untuk mereset password sendiri.`
      : `Buat ulang kode klaim untuk rumah ${house.houseCode}?`
    if (!window.confirm(confirmMsg)) return

    setUpdatingHouseId(house.houseId)
    setActionError(null)
    setActionSuccess(null)
    try {
      const { data: newCode, error } = await getSupabase().rpc('regenerate_house_claim_code', {
        requested_house_id: house.houseId,
      })
      if (error) throw error
      setActionSuccess(`Kode klaim baru untuk rumah ${house.houseCode}: ${String(newCode)}`)
      await resource.reload()
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Gagal membuat kode klaim baru.')
    } finally {
      setUpdatingHouseId(null)
    }
  }

  async function copyPureClaimCode(house: HouseArrears) {
    if (!house.claimCode) return
    try {
      await navigator.clipboard.writeText(house.claimCode)
      setActionSuccess(`Kode klaim ${house.claimCode} (rumah ${house.houseCode}) berhasil disalin.`)
      setActionError(null)
    } catch {
      setActionError(`Kode klaim ${house.houseCode}: ${house.claimCode} (salin manual).`)
    }
  }

  return (
    <Card>
      <SectionTitle
        title="Administrasi warga & rekap rumah"
        description="Kelola data hunian, verifikasi berkas administrasi (KTP & KK), dan status tagihan kas."
        action={(
          <div className="arrears-heading-actions">
            <span className="tiny-count">{filteredRows.length} dari {rows.length} rumah</span>
            {!compact && rows.length > 0 && (
              <span className="tiny-count" style={{ color: '#15803d', background: '#dcfce7', borderColor: '#bbf7d0', fontWeight: 600 }}>
                ✓ {rows.filter((r) => r.ktpVerified && r.kkVerified).length} Berkas Lengkap
              </span>
            )}
            {!compact && filteredRows.length > 0 && (
              <>
                <Button
                  className="button-small"
                  type="button"
                  variant="secondary"
                  onClick={() => exportWargaListPrint(filteredRows)}
                  title="Cetak atau simpan daftar warga sebagai PDF"
                >
                  <Printer size={14} /> Unduh PDF
                </Button>
                <Button
                  className="button-small"
                  type="button"
                  variant="secondary"
                  onClick={() => exportWargaListCsv(filteredRows)}
                  title="Unduh daftar warga format Excel / CSV"
                >
                  <Download size={14} /> Unduh CSV
                </Button>
              </>
            )}
            {canCreate && (
              <Button className="button-small" type="button" onClick={() => openHouseForm()}>
                <Plus size={15} /> Tambah rumah
              </Button>
            )}
          </div>
        )}
      />
      {resource.error && <Notice>{resource.error}</Notice>}
      {actionError && <Notice>{actionError}</Notice>}
      {actionSuccess && <Notice variant="success">{actionSuccess}</Notice>}

      {!compact && rows.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: '10px',
            background: '#f8faf9',
            border: '1px solid #e2e8e4',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 200px', position: 'relative' }}>
            <Search size={15} style={{ color: '#687e72', position: 'absolute', left: '10px' }} />
            <input
              type="text"
              placeholder="Cari nomor/blok rumah atau nama warga..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '32px',
                paddingRight: '10px',
                height: '34px',
                fontSize: '12px',
                borderRadius: '8px',
                border: '1px solid #ccd8d1',
                background: '#ffffff',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#83958b',
                  cursor: 'pointer',
                  padding: '2px',
                }}
                title="Hapus pencarian"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {availableBlocks.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: '#687e72', fontWeight: 600 }}>Filter Blok:</span>
              <select
                value={selectedBlock}
                onChange={(e) => setSelectedBlock(e.target.value)}
                style={{
                  height: '34px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  border: '1px solid #ccd8d1',
                  background: '#ffffff',
                  padding: '0 8px',
                  cursor: 'pointer',
                }}
              >
                <option value="ALL">Semua Blok ({rows.length})</option>
                {availableBlocks.map((blk) => {
                  const countInBlock = rows.filter((r) => r.blockCode === blk).length
                  return (
                    <option key={blk} value={blk}>
                      Blok {blk} ({countInBlock})
                    </option>
                  )
                })}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#687e72', fontWeight: 600 }}>Status Hunian:</span>
            <select
              value={selectedOccupancy}
              onChange={(e) => setSelectedOccupancy(e.target.value)}
              style={{
                height: '34px',
                fontSize: '12px',
                borderRadius: '8px',
                border: '1px solid #ccd8d1',
                background: '#ffffff',
                padding: '0 8px',
                cursor: 'pointer',
              }}
            >
              <option value="ALL">Semua Hunian</option>
              <option value="OWNER_OCCUPIED">Dihuni Pemilik</option>
              <option value="RENTED">Dikontrakan</option>
              <option value="VACANT">Belum Dihuni</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#687e72', fontWeight: 600 }}>Berkas KTP/KK:</span>
            <select
              value={selectedDocFilter}
              onChange={(e) => setSelectedDocFilter(e.target.value)}
              style={{
                height: '34px',
                fontSize: '12px',
                borderRadius: '8px',
                border: '1px solid #ccd8d1',
                background: '#ffffff',
                padding: '0 8px',
                cursor: 'pointer',
              }}
            >
              <option value="ALL">Semua Berkas</option>
              <option value="UNVERIFIED">Belum Lengkap</option>
              <option value="VERIFIED">Lengkap (KTP & KK)</option>
            </select>
          </div>
        </div>
      )}

      {resource.loading && !resource.data ? <LoadingState /> : !rows.length ? (
        <EmptyState title="Belum ada data rumah" description="Tambahkan rumah untuk mulai mengelola rekap dan tagihannya." />
      ) : !visibleRows.length ? (
        <EmptyState
          title="Tidak ada rumah yang cocok"
          description={`Tidak ditemukan rumah dengan kriteria filter/pencarian yang dipilih.`}
        />
      ) : (
        <div className="arrears-list">
          {visibleRows.map((row) => (
            <div className={`arrears-row${row.isActive ? '' : ' arrears-row-inactive'}`} key={row.houseId}>
              <span className="house-avatar">{row.houseCode.slice(0, 1)}</span>
              <div className="arrears-house">
                <strong>{row.houseCode}</strong>
                <span>{row.headName}</span>
                <span className="house-occupancy-label">
                  {row.occupancyStatus === 'RENTED'
                    ? 'Dikontrakan'
                    : row.occupancyStatus === 'VACANT'
                      ? 'Belum dihuni'
                      : 'Dihuni pemilik'}
                  {row.hasAccount && !row.claimCode ? ' · Akun aktif' : ''}
                </span>
                {!compact && row.occupancyStatus === 'RENTED' && row.ownerPhone && (
                  <span className="house-owner-badge" title="Kontak pemilik/yang mengontrakkan">
                    Pemilik: <a href={`https://wa.me/${row.ownerPhone.replace(/[^0-9]/g, '').replace(/^0/, '62')}`} target="_blank" rel="noreferrer" className="wa-link">{row.ownerPhone}</a>
                  </span>
                )}
                <span style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                  <span className={`doc-badge ${row.ktpVerified ? 'doc-badge-verified' : 'doc-badge-pending'}`} title={row.ktpVerified ? 'KTP sudah diverifikasi Sekretaris' : 'KTP belum diserahkan'}>
                    KTP {row.ktpVerified ? '✓' : '—'}
                  </span>
                  <span className={`doc-badge ${row.kkVerified ? 'doc-badge-verified' : 'doc-badge-pending'}`} title={row.kkVerified ? 'KK sudah diverifikasi Sekretaris' : 'KK belum diserahkan'}>
                    KK {row.kkVerified ? '✓' : '—'}
                  </span>
                </span>
                {!compact && (row.phone || row.phoneMasked) && (
                  <span className="house-contact-badge">
                    {row.phone ? (
                      <a
                        href={`https://wa.me/${row.phone.replace(/[^0-9]/g, '').replace(/^0/, '62')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="wa-link"
                        title="Hubungi warga via WhatsApp (urgent)"
                      >
                        <MessageCircle size={13} /> {row.phone}
                      </a>
                    ) : (
                      <span><Phone size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />{row.phoneMasked}</span>
                    )}
                  </span>
                )}
                {!compact && row.claimCode && (
                  <span className="house-claim-badge">
                    Kode klaim: <b>{row.claimCode}</b>
                  </span>
                )}
                {!row.isActive && <span className="house-inactive-label">Rumah nonaktif</span>}
              </div>
              <div className="arrears-count">{row.outstandingBillCount}<small> tagihan</small></div>
              <strong className={BigInt(row.outstandingAmount) > 0n ? 'amount-warn' : 'amount-ok'}>
                {formatCurrency(row.outstandingAmount)}
              </strong>
              {(canUpdate || canDelete) && (
                <div className="arrears-actions">
                  {canUpdate && row.isActive && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="button-small"
                      onClick={() => {
                        setVerifyingHouse(row)
                        verifyDocsDialog.current?.showModal()
                      }}
                      aria-label={`Verifikasi berkas KTP & KK ${row.houseCode}`}
                      disabled={updatingHouseId !== null}
                      title="Verifikasi penyerahan berkas administrasi kependudukan (KTP & KK)"
                    >
                      <FileCheck size={14} /> Berkas
                    </Button>
                  )}
                  {row.claimCode && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="button-small"
                      onClick={() => void copyPureClaimCode(row)}
                      aria-label={`Salin kode klaim ${row.houseCode}`}
                      disabled={updatingHouseId !== null}
                    >
                      <Copy size={14} /> Salin kode
                    </Button>
                  )}
                  {canUpdate && row.isActive && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="button-small"
                      onClick={() => void regenerateClaimCode(row)}
                      aria-label={`Buat kode klaim rumah ${row.houseCode}`}
                      disabled={updatingHouseId !== null}
                    >
                      <KeyRound size={14} /> {row.claimCode ? 'Acak kode' : 'Reset kode'}
                    </Button>
                  )}
                  {canUpdate && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="button-small"
                      onClick={() => openHouseForm(row)}
                      aria-label={`Ubah data rumah ${row.houseCode}`}
                      disabled={updatingHouseId !== null}
                    >
                      <Pencil size={14} /> Ubah
                    </Button>
                  )}
                  {row.isActive && canDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="button-small"
                      onClick={() => void setHouseActive(row, false)}
                      aria-label={`Nonaktifkan rumah ${row.houseCode}`}
                      disabled={updatingHouseId !== null}
                    >
                      <Power size={14} /> Nonaktifkan
                    </Button>
                  )}
                  {!row.isActive && canUpdate && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="button-small"
                      onClick={() => void setHouseActive(row, true)}
                      aria-label={`Aktifkan rumah ${row.houseCode}`}
                      disabled={updatingHouseId !== null}
                    >
                      <Power size={14} /> Aktifkan
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
          {compact && rows.length > visibleRows.length && (
            <p className="more-note">Menampilkan {visibleRows.length} dari {rows.length} rumah.</p>
          )}
        </div>
      )}
      <dialog className="rbac-modal" ref={houseDialog} aria-labelledby="house-form-title">
        <div className="rbac-modal-head">
          <div>
            <h2 id="house-form-title">{editingHouse ? 'Ubah data rumah' : 'Tambah rumah'}</h2>
            <p>Kode rumah dibuat otomatis dari blok dan nomor rumah.</p>
          </div>
          <button
            className="rbac-modal-close"
            type="button"
            aria-label="Tutup form rumah"
            onClick={() => houseDialog.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        <HouseRecordForm
          key={formKey}
          house={editingHouse}
          onSaved={async (message) => {
            houseDialog.current?.close()
            setActionSuccess(message)
            setActionError(null)
            await resource.reload()
          }}
          onCancel={() => houseDialog.current?.close()}
        />
      </dialog>
      <dialog className="rbac-modal" ref={verifyDocsDialog} aria-labelledby="verify-docs-title">
        <div className="rbac-modal-head">
          <div>
            <h2 id="verify-docs-title">Verifikasi Berkas Kependudukan</h2>
            <p>Konfirmasi berkas KTP dan KK yang telah diserahkan warga ke Sekretaris.</p>
          </div>
          <button
            className="rbac-modal-close"
            type="button"
            aria-label="Tutup form verifikasi berkas"
            onClick={() => {
              verifyDocsDialog.current?.close()
              setVerifyingHouse(null)
            }}
          >
            <X size={18} />
          </button>
        </div>
        {verifyingHouse && (
          <VerifyDocsForm
            key={verifyingHouse.houseId}
            house={verifyingHouse}
            onSaved={async (message) => {
              verifyDocsDialog.current?.close()
              setVerifyingHouse(null)
              setActionSuccess(message)
              setActionError(null)
              await resource.reload()
            }}
            onCancel={() => {
              verifyDocsDialog.current?.close()
              setVerifyingHouse(null)
            }}
          />
        )}
      </dialog>
    </Card>
  )
}

function HouseRecordForm({
  house,
  onSaved,
  onCancel,
}: {
  house: HouseArrears | null
  onSaved: (message: string) => Promise<void>
  onCancel: () => void
}) {
  const [blockCode, setBlockCode] = useState(house?.blockCode ?? '')
  const [houseNumber, setHouseNumber] = useState(house?.houseNumber ?? '')
  const [headName, setHeadName] = useState(house?.headName ?? '')
  const [occupancyStatus, setOccupancyStatus] = useState<HouseOccupancyStatus>(
    house?.occupancyStatus ?? 'OWNER_OCCUPIED',
  )
  const [ownerPhone, setOwnerPhone] = useState(house?.ownerPhone ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewHouseCode = `${blockCode.trim().toUpperCase()}-${houseNumber.trim().toUpperCase()}`

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { error: saveError } = await getSupabase().rpc('save_house_record', {
        requested_house_id: house?.houseId ?? null,
        requested_block_code: blockCode,
        requested_house_number: houseNumber,
        requested_head_name: headName,
        requested_occupancy_status: occupancyStatus,
        requested_owner_phone: occupancyStatus === 'RENTED' ? ownerPhone.trim() || null : null,
      })
      if (saveError) throw saveError
      await onSaved(`Data rumah ${previewHouseCode} berhasil ${house ? 'diperbarui' : 'ditambahkan'}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Data rumah gagal disimpan.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="rbac-create-form" onSubmit={(event) => void submit(event)}>
      {error && <Notice>{error}</Notice>}
      <div className="rbac-create-grid">
        <label className="field">
          <span>Kode blok</span>
          <input
            autoComplete="off"
            maxLength={10}
            pattern="[A-Za-z0-9]{1,10}"
            required
            value={blockCode}
            onChange={(event) => setBlockCode(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Nomor rumah</span>
          <input
            autoComplete="off"
            maxLength={20}
            pattern="[A-Za-z0-9][A-Za-z0-9/-]{0,19}"
            required
            value={houseNumber}
            onChange={(event) => setHouseNumber(event.target.value)}
          />
        </label>
        <label className="field field-wide">
          <span>Nama kepala warga <small>(opsional — diisi warga saat aktivasi)</small></span>
          <input
            autoComplete="name"
            maxLength={120}
            placeholder="Kosongkan jika belum diketahui"
            value={headName}
            onChange={(event) => setHeadName(event.target.value)}
          />
          <small>Preview kode rumah & username login: {previewHouseCode}</small>
        </label>
        <label className="field field-wide">
          <span>Status hunian</span>
          <select
            required
            value={occupancyStatus}
            onChange={(event) => setOccupancyStatus(event.target.value as HouseOccupancyStatus)}
          >
            <option value="OWNER_OCCUPIED">Dihuni pemilik</option>
            <option value="RENTED">Dikontrakan</option>
            <option value="VACANT">Belum dihuni</option>
          </select>
        </label>
        {occupancyStatus === 'RENTED' && (
          <label className="field field-wide">
            <span>Nomor Telepon / WhatsApp Pemilik Rumah <small>(opsional — diisi pemilik/penghuni)</small></span>
            <input
              type="tel"
              maxLength={30}
              placeholder="Contoh: 0812-3456-7890 (bisa dikosongkan pengurus)"
              value={ownerPhone}
              onChange={(event) => setOwnerPhone(event.target.value)}
            />
            <small>Pengurus dapat mengosongkan ini jika belum diketahui; pemilik rumah atau warga yang mengontrak dapat melengkapinya melalui menu profil akun.</small>
          </label>
        )}
      </div>
      <div className="form-actions">
        <Button className="button-small" type="submit" disabled={submitting}>
          {submitting ? 'Menyimpan...' : house ? 'Simpan perubahan' : 'Tambah rumah'}
        </Button>
        <Button className="button-small" type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Batal
        </Button>
      </div>
    </form>
  )
}

function VerifyDocsForm({
  house,
  onSaved,
  onCancel,
}: {
  house: HouseArrears
  onSaved: (message: string) => Promise<void>
  onCancel: () => void
}) {
  const [ktpVerified, setKtpVerified] = useState(Boolean(house.ktpVerified))
  const [kkVerified, setKkVerified] = useState(Boolean(house.kkVerified))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await api('/api/sekretaris/warga/verify-docs', {
        method: 'POST',
        body: jsonBody({
          wargaId: house.wargaId ?? null,
          houseId: house.houseId,
          ktpVerified,
          kkVerified,
        }),
      })
      await onSaved(`Status berkas kependudukan untuk rumah ${house.houseCode} (${house.headName}) berhasil diperbarui.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Gagal memperbarui verifikasi berkas.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="rbac-create-form" onSubmit={(event) => void submit(event)}>
      {error && <Notice>{error}</Notice>}
      <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#f8faf9', borderRadius: '8px', border: '1px solid #e2e8e4' }}>
        <div style={{ fontWeight: 600, fontSize: '14px', color: '#163326' }}>
          {house.houseCode} · {house.headName}
        </div>
        <div style={{ fontSize: '12px', color: '#687e72', marginTop: '2px' }}>
          Blok {house.blockCode} No. {house.houseNumber} · {house.occupancyStatus === 'RENTED' ? 'Dikontrakan' : house.occupancyStatus === 'VACANT' ? 'Belum dihuni' : 'Dihuni pemilik'}
        </div>
      </div>

      {house.occupancyStatus === 'RENTED' && (
        <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '12px', color: '#1e3a8a' }}>
          <strong>ℹ️ Catatan Rumah Dikontrakan:</strong>
          <div style={{ marginTop: '2px' }}>
            Pastikan berkas KTP dan KK yang diserahkan/diverifikasi lengkap <b>2 berkas</b> (1 berkas milik Pemilik Rumah dan 1 berkas milik Warga yang Mengontrak).
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', padding: '10px 12px', border: '1px solid #d1ded7', borderRadius: '8px', background: ktpVerified ? '#f0fdf4' : '#ffffff' }}>
          <input
            type="checkbox"
            checked={ktpVerified}
            onChange={(e) => setKtpVerified(e.target.checked)}
            style={{ marginTop: '3px', width: '18px', height: '18px', accentColor: '#1b4332', cursor: 'pointer' }}
          />
          <div>
            <strong style={{ display: 'block', fontSize: '13px', color: '#163326' }}>
              KTP (Kartu Tanda Penduduk) Sudah Diserahkan
            </strong>
            <span style={{ fontSize: '12px', color: '#687e72' }}>
              Warga telah menyerahkan atau menunjukkan dokumen KTP yang sah kepada Sekretaris.
            </span>
          </div>
        </label>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', padding: '10px 12px', border: '1px solid #d1ded7', borderRadius: '8px', background: kkVerified ? '#f0fdf4' : '#ffffff' }}>
          <input
            type="checkbox"
            checked={kkVerified}
            onChange={(e) => setKkVerified(e.target.checked)}
            style={{ marginTop: '3px', width: '18px', height: '18px', accentColor: '#1b4332', cursor: 'pointer' }}
          />
          <div>
            <strong style={{ display: 'block', fontSize: '13px', color: '#163326' }}>
              KK (Kartu Keluarga) Sudah Diserahkan
            </strong>
            <span style={{ fontSize: '12px', color: '#687e72' }}>
              Warga telah menyerahkan atau menunjukkan dokumen Kartu Keluarga yang sah kepada Sekretaris.
            </span>
          </div>
        </label>
      </div>

      <p style={{ fontSize: '11px', color: '#687e72', margin: '0 0 16px' }}>
        💡 Status verifikasi berkas ini akan langsung tampil di akun warga pada profil/dashboard warga.
      </p>

      <div className="form-actions">
        <Button className="button-small" type="submit" disabled={submitting}>
          {submitting ? 'Menyimpan...' : 'Simpan Verifikasi Berkas'}
        </Button>
        <Button className="button-small" type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Batal
        </Button>
      </div>
    </form>
  )
}

function VerificationPanel({ compact = false }: { compact?: boolean }) {
  const resource = useResource<Payment[]>('/api/ketua/verification-log')
  const rows = resource.data ?? []
  const visibleRows = compact ? rows.slice(0, 5) : rows
  return (
    <Card>
      <SectionTitle
        title="Log verifikasi"
        description="Riwayat keputusan bendahara atas pembayaran."
        action={<span className="tiny-count">{rows.length} catatan</span>}
      />
      {resource.error && <Notice>{resource.error}</Notice>}
      {resource.loading && !resource.data ? <LoadingState /> : !rows.length ? (
        <EmptyState title="Belum ada verifikasi" description="Aktivitas verifikasi akan tercatat di sini." />
      ) : (
        <div className="activity-list">
          {visibleRows.map((row) => (
            <article className="activity-row" key={row.id}>
              <span className={`activity-icon ${row.status === 'APPROVED' ? 'activity-approved' : 'activity-rejected'}`}>
                {row.status === 'APPROVED' ? <Check size={17} /> : <X size={17} />}
              </span>
              <div className="activity-main">
                <strong>{row.houseCode ?? 'Kas umum'} · {row.fundName}</strong>
                <span>{row.verifierName ?? 'Bendahara'} · {formatDate(row.verifiedAt)}</span>
                {row.rejectReason && <small className="reject-note">Alasan: {row.rejectReason}</small>}
              </div>
              <div className="activity-amount">
                <strong>{formatCurrency(row.amountPaid)}</strong>
                <StatusBadge status={row.status} />
              </div>
            </article>
          ))}
          {compact && rows.length > visibleRows.length && (
            <p className="more-note">Menampilkan {visibleRows.length} dari {rows.length} catatan.</p>
          )}
        </div>
      )}
    </Card>
  )
}

const RONDA_DAYS: { key: RondaDayKey; label: string }[] = [
  { key: 'SENIN', label: 'Malam Senin' },
  { key: 'SELASA', label: 'Malam Selasa' },
  { key: 'RABU', label: 'Malam Rabu' },
  { key: 'KAMIS', label: 'Malam Kamis' },
  { key: 'JUMAT', label: 'Malam Jumat' },
  { key: 'SABTU', label: 'Malam Sabtu' },
  { key: 'MINGGU', label: 'Malam Minggu' },
]

function getTodayRondaDayKey(): RondaDayKey {
  // Malam ronda: misal hari Minggu malam dihitung Malam Senin (atau hari kalender saat ini)
  const dayIndex = new Date().getDay() // 0: Minggu, 1: Senin, 2: Selasa, ... 6: Sabtu
  switch (dayIndex) {
    case 1: return 'SENIN'
    case 2: return 'SELASA'
    case 3: return 'RABU'
    case 4: return 'KAMIS'
    case 5: return 'JUMAT'
    case 6: return 'SABTU'
    case 0: return 'MINGGU'
    default: return 'SENIN'
  }
}

export function WargaRondaInfoCard() {
  const { user } = useAuth()
  const resource = useResource<RondaSchedule[]>('/api/ronda/schedules')
  const schedules = resource.data ?? []

  // Cari jadwal untuk rumah warga yang sedang login
  const myHouseId = user?.houseId
  const mySchedules = schedules.filter((s) => s.houseId === myHouseId)
  const todayKey = getTodayRondaDayKey()
  const todaySchedules = schedules.filter((s) => s.dayKey === todayKey)

  return (
    <Card>
      <SectionTitle
        title="Jadwal Ronda Warga"
        description="Informasi jadwal giliran pos keamanan lingkungan RT / Blok."
      />
      {resource.error && <Notice>{resource.error}</Notice>}
      {resource.loading && !resource.data ? (
        <LoadingState label="Memuat jadwal ronda..." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {mySchedules.length > 0 ? (
            <div className="warga-ronda-banner">
              <span className="warga-ronda-icon"><Shield size={24} /></span>
              <div className="warga-ronda-text">
                <strong>Jadwal Ronda Rumah Anda: {mySchedules.map((s) => s.dayLabel).join(', ')}</strong>
                <span>
                  {mySchedules.map((s) => (s.notes ? `${s.dayLabel} (${s.notes})` : s.dayLabel)).join(' · ')}
                </span>
              </div>
            </div>
          ) : (
            <div className="warga-ronda-banner no-schedule">
              <span className="warga-ronda-icon" style={{ background: '#edf4ef', color: '#275240' }}>
                <CalendarCheck size={22} />
              </span>
              <div className="warga-ronda-text">
                <strong>Rumah Anda belum terjadwal ronda</strong>
                <span>Sekretaris RT belum menetapkan giliran ronda untuk rumah Anda.</span>
              </div>
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#243b31' }}>
                Petugas Ronda Hari Ini ({RONDA_DAYS.find((d) => d.key === todayKey)?.label ?? 'Malam Ini'}):
              </span>
              <span className="tiny-count">{todaySchedules.length} rumah</span>
            </div>
            {todaySchedules.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#6d7d74', margin: 0 }}>Belum ada rumah yang dijadwalkan pada malam ini.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {todaySchedules.map((item) => (
                  <span
                    key={item.id}
                    className={`house-contact-badge ${item.houseId === myHouseId ? 'status-green' : ''}`}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    <strong>{item.houseCode}</strong>
                    {item.headName && <span>({item.headName})</span>}
                    {item.notes && <small style={{ color: '#56665e' }}>· {item.notes}</small>}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

export function RondaPanel({ readonly = false }: { readonly?: boolean }) {
  const { user } = useAuth()
  const permission = user?.menus.find((menu) => menu.key === 'ronda')
  const canManage = !readonly && Boolean(permission?.canCreate || permission?.canUpdate || permission?.canDelete)

  const resource = useResource<RondaSchedule[]>('/api/ronda/schedules')
  const housesResource = useResource<HouseArrears[]>(canManage ? '/api/ketua/houses/arrears' : null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [dayKey, setDayKey] = useState<RondaDayKey>('SENIN')
  const [selectedHouseId, setSelectedHouseId] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [panelDayFilter, setPanelDayFilter] = useState<'ALL' | RondaDayKey>('ALL')
  const [panelBlockFilter, setPanelBlockFilter] = useState('ALL')
  const [panelSearchQuery, setPanelSearchQuery] = useState('')

  const [modalBlockFilter, setModalBlockFilter] = useState('ALL')
  const [modalHouseSearch, setModalHouseSearch] = useState('')

  const schedules = resource.data ?? []
  const houses = (housesResource.data ?? []).filter((h) => h.isActive)
  const todayKey = getTodayRondaDayKey()

  // Ambil daftar blok unik dari seluruh jadwal yang terdaftar
  const availableScheduleBlocks = Array.from(new Set(schedules.map((s) => s.blockCode).filter(Boolean))).sort()

  // Filter jadwal ronda berdasarkan hari, blok, dan pencarian nomor rumah/nama
  const filteredSchedules = schedules.filter((s) => {
    if (panelDayFilter !== 'ALL' && s.dayKey !== panelDayFilter) {
      return false
    }
    if (panelBlockFilter !== 'ALL' && s.blockCode !== panelBlockFilter) {
      return false
    }
    if (panelSearchQuery.trim()) {
      const q = panelSearchQuery.toLowerCase().trim()
      const matchCode = s.houseCode.toLowerCase().includes(q)
      const matchBlock = s.blockCode.toLowerCase().includes(q)
      const matchNum = s.houseNumber.toLowerCase().includes(q)
      const matchHead = (s.headName ?? '').toLowerCase().includes(q)
      const matchNotes = (s.notes ?? '').toLowerCase().includes(q)
      return matchCode || matchBlock || matchNum || matchHead || matchNotes
    }
    return true
  })

  // Kumpulan houseId yang sudah masuk ke jadwal ronda (jika sedang edit, jangan kecualikan rumah yang sedang diedit)
  const scheduledHouseIds = new Set(
    schedules
      .filter((s) => editingId === null || s.id !== editingId)
      .map((s) => s.houseId),
  )

  // Hanya tampilkan rumah yang BELUM terjadwal ronda
  const unscheduledHouses = houses.filter((h) => !scheduledHouseIds.has(h.houseId))

  const availableModalBlocks = Array.from(new Set(unscheduledHouses.map((h) => h.blockCode).filter(Boolean))).sort()

  const filteredModalHouses = unscheduledHouses.filter((h) => {
    if (modalBlockFilter !== 'ALL' && h.blockCode !== modalBlockFilter) {
      return false
    }
    if (modalHouseSearch.trim()) {
      const q = modalHouseSearch.toLowerCase().trim()
      const matchCode = h.houseCode.toLowerCase().includes(q)
      const matchBlock = h.blockCode.toLowerCase().includes(q)
      const matchNum = h.houseNumber.toLowerCase().includes(q)
      const matchHead = h.headName.toLowerCase().includes(q)
      return matchCode || matchBlock || matchNum || matchHead
    }
    return true
  })

  function openAddModal(defaultDay?: RondaDayKey) {
    setEditingId(null)
    setDayKey(defaultDay ?? 'SENIN')
    // Pilih rumah pertama dari yang belum terjadwal
    const firstUnscheduled = houses.find((h) => !schedules.some((s) => s.houseId === h.houseId))
    setSelectedHouseId(firstUnscheduled ? String(firstUnscheduled.houseId) : '')
    setNotes('')
    setModalBlockFilter('ALL')
    setModalHouseSearch('')
    setError(null)
    setSuccess(null)
    setDialogOpen(true)
  }

  function openEditModal(schedule: RondaSchedule) {
    setEditingId(schedule.id)
    setDayKey(schedule.dayKey)
    setSelectedHouseId(String(schedule.houseId))
    setNotes(schedule.notes ?? '')
    setModalBlockFilter('ALL')
    setModalHouseSearch('')
    setError(null)
    setSuccess(null)
    setDialogOpen(true)
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedHouseId) {
      setError('Pilih rumah terlebih dahulu.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await api('/api/ronda/schedules', {
        method: 'POST',
        body: jsonBody({
          id: editingId,
          dayKey,
          houseId: Number(selectedHouseId),
          notes: notes.trim(),
        }),
      })
      setSuccess('Jadwal ronda berhasil disimpan.')
      setDialogOpen(false)
      await resource.reload()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Gagal menyimpan jadwal ronda.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number, houseCode: string, dayLabel: string) {
    if (!window.confirm(`Hapus rumah ${houseCode} dari jadwal ${dayLabel}?`)) {
      return
    }

    setDeletingId(id)
    setError(null)
    setSuccess(null)
    try {
      await api(`/api/ronda/schedules/${id}`, {
        method: 'DELETE',
      })
      setSuccess(`Rumah ${houseCode} berhasil dihapus dari jadwal ronda.`)
      await resource.reload()
    } catch (delError) {
      setError(delError instanceof Error ? delError.message : 'Gagal menghapus jadwal ronda.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="workspace-stack">
      <Card>
        <SectionTitle
          title="Jadwal Ronda Lingkungan"
          description="Pembagian regu ronda malam (Malam Senin s.d. Malam Minggu) untuk menjaga keamanan lingkungan."
          action={(
            <div className="arrears-heading-actions">
              {schedules.length > 0 && (
                <>
                  <Button
                    className="button-small"
                    type="button"
                    variant="secondary"
                    onClick={() => exportRondaSchedulePrint(filteredSchedules)}
                    title="Cetak atau simpan jadwal ronda sebagai PDF"
                  >
                    <Printer size={14} /> Unduh PDF
                  </Button>
                  <Button
                    className="button-small"
                    type="button"
                    variant="secondary"
                    onClick={() => exportRondaScheduleCsv(filteredSchedules)}
                    title="Unduh jadwal ronda format Excel / CSV"
                  >
                    <Download size={14} /> Unduh CSV
                  </Button>
                </>
              )}
              {canManage && (
                <Button className="button-small" type="button" onClick={() => openAddModal()}>
                  <Plus size={15} /> Tambah jadwal ronda
                </Button>
              )}
            </div>
          )}
        />
        {resource.error && <Notice>{resource.error}</Notice>}
        {error && <Notice>{error}</Notice>}
        {success && <Notice variant="success">{success}</Notice>}

        {/* Bilah Filter Jadwal Ronda Lingkungan */}
        {schedules.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '10px',
              marginTop: '12px',
              marginBottom: '6px',
              padding: '10px 14px',
              borderRadius: '10px',
              background: '#f8faf9',
              border: '1px solid #e2e8e4',
            }}
          >
            {/* Input Pencarian Nomor Rumah / Nama Warga / Catatan */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 200px', position: 'relative' }}>
              <Search size={15} style={{ color: '#687e72', position: 'absolute', left: '10px' }} />
              <input
                type="text"
                placeholder="Cari nomor rumah, nama warga, atau regu..."
                value={panelSearchQuery}
                onChange={(e) => setPanelSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: '32px',
                  paddingRight: '10px',
                  height: '34px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  border: '1px solid #ccd8d1',
                  background: '#ffffff',
                }}
              />
              {panelSearchQuery && (
                <button
                  type="button"
                  onClick={() => setPanelSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: '#83958b',
                    cursor: 'pointer',
                    padding: '2px',
                  }}
                  title="Hapus pencarian"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filter Malam Ronda (Hari) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: '#687e72', fontWeight: 600 }}>Hari:</span>
              <select
                value={panelDayFilter}
                onChange={(e) => setPanelDayFilter(e.target.value as 'ALL' | RondaDayKey)}
                style={{
                  height: '34px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  border: '1px solid #ccd8d1',
                  background: '#ffffff',
                  padding: '0 8px',
                  cursor: 'pointer',
                }}
              >
                <option value="ALL">Semua Malam (7 Hari)</option>
                {RONDA_DAYS.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label} {d.key === todayKey ? '★ Hari Ini' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Blok */}
            {availableScheduleBlocks.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#687e72', fontWeight: 600 }}>Blok:</span>
                <select
                  value={panelBlockFilter}
                  onChange={(e) => setPanelBlockFilter(e.target.value)}
                  style={{
                    height: '34px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    border: '1px solid #ccd8d1',
                    background: '#ffffff',
                    padding: '0 8px',
                    cursor: 'pointer',
                  }}
                >
                  <option value="ALL">Semua Blok</option>
                  {availableScheduleBlocks.map((blk) => (
                    <option key={blk} value={blk}>
                      Blok {blk}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {resource.loading && !resource.data ? (
          <LoadingState label="Memuat daftar jadwal ronda..." />
        ) : (
          <div className="ronda-days-grid">
            {RONDA_DAYS
              .filter((day) => panelDayFilter === 'ALL' || day.key === panelDayFilter)
              .map((day) => {
                const daySchedules = filteredSchedules.filter((s) => s.dayKey === day.key)
                const totalInDay = schedules.filter((s) => s.dayKey === day.key).length
                const isToday = day.key === todayKey

                return (
                  <div
                    key={day.key}
                    className={`ronda-day-card ${isToday ? 'active-today' : ''}`}
                  >
                    <div className="ronda-day-header">
                      <div>
                        <strong>{day.label}</strong>
                        {isToday && <span className="ronda-today-pill" style={{ marginLeft: '6px' }}>HARI INI</span>}
                      </div>
                      <span className="ronda-badge">
                        {panelBlockFilter !== 'ALL' || panelSearchQuery.trim()
                          ? `${daySchedules.length} / ${totalInDay} rumah`
                          : `${daySchedules.length} rumah`}
                      </span>
                    </div>

                    {daySchedules.length === 0 ? (
                      <p style={{ margin: '8px 0', fontSize: '11px', color: '#88988e', fontStyle: 'italic' }}>
                        {panelBlockFilter !== 'ALL' || panelSearchQuery.trim()
                          ? 'Tidak ada rumah cocok dengan filter.'
                          : 'Belum ada rumah terjadwal.'}
                      </p>
                    ) : (
                      <div className="ronda-house-list">
                        {daySchedules.map((schedule) => {
                          const isMyHouse = user?.houseId === schedule.houseId
                          return (
                            <div
                              key={schedule.id}
                              className={`ronda-house-item ${isMyHouse ? 'my-house' : ''}`}
                            >
                              <div className="ronda-house-info">
                                <strong>
                                  {schedule.houseCode}
                                  {isMyHouse && <small style={{ color: '#1f604b', marginLeft: '4px' }}>(Rumah Anda)</small>}
                                </strong>
                                <span>{schedule.headName ?? 'Warga'} (Blok {schedule.blockCode})</span>
                                {schedule.notes && (
                                  <small style={{ color: '#446654', fontStyle: 'italic' }}>“{schedule.notes}”</small>
                                )}
                                {schedule.phone && (
                                  <a
                                    href={`https://wa.me/${schedule.phone.replace(/[^0-9]/g, '').replace(/^0/, '62')}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="wa-link"
                                    style={{ marginTop: '2px', fontSize: '11px' }}
                                  >
                                    <MessageCircle size={11} /> {schedule.phone}
                                  </a>
                                )}
                              </div>

                              {canManage && (
                                <div className="ronda-house-actions">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="button-small"
                                    onClick={() => openEditModal(schedule)}
                                    disabled={deletingId === schedule.id}
                                    title="Ubah jadwal"
                                  >
                                    <Pencil size={13} />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="button-small"
                                    onClick={() => void handleDelete(schedule.id, schedule.houseCode, schedule.dayLabel)}
                                    disabled={deletingId === schedule.id}
                                    title="Hapus dari jadwal"
                                    style={{ color: '#a2483e' }}
                                  >
                                    <Trash2 size={13} />
                                  </Button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {canManage && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="button-small"
                        onClick={() => openAddModal(day.key)}
                        style={{ marginTop: '10px', alignSelf: 'flex-start', fontSize: '11px' }}
                      >
                        <Plus size={13} /> Tambah ke {day.label}
                      </Button>
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </Card>

      {/* Modal Dialog Tambah / Ubah Jadwal Ronda */}
      {dialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 30, 24, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '16px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDialogOpen(false)
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 12px 36px rgba(0, 0, 0, 0.16)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', color: '#16382c' }}>
                {editingId ? 'Ubah Jadwal Ronda' : 'Tambah Jadwal Ronda'}
              </h3>
              <Button
                type="button"
                variant="ghost"
                className="button-small"
                onClick={() => setDialogOpen(false)}
              >
                <X size={16} />
              </Button>
            </div>

            {error && <Notice>{error}</Notice>}

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label className="field">
                <span>Hari Ronda (Malam)</span>
                <select
                  value={dayKey}
                  onChange={(e) => setDayKey(e.target.value as RondaDayKey)}
                  required
                >
                  {RONDA_DAYS.map((d) => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
              </label>

              <div className="field">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Pilih Rumah Warga</span>
                  <span style={{ fontSize: '11px', color: '#687e72' }}>
                    {filteredModalHouses.length} dari {unscheduledHouses.length} rumah belum terjadwal
                  </span>
                </div>

                {/* Filter Blok dan Pencarian Nomor Rumah di dalam Modal */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  {availableModalBlocks.length > 0 && (
                    <select
                      value={modalBlockFilter}
                      onChange={(e) => setModalBlockFilter(e.target.value)}
                      style={{
                        height: '32px',
                        fontSize: '11px',
                        borderRadius: '6px',
                        border: '1px solid #ccd8d1',
                        background: '#ffffff',
                        padding: '0 6px',
                        cursor: 'pointer',
                        flex: '0 0 auto',
                      }}
                      title="Filter Blok"
                    >
                      <option value="ALL">Semua Blok</option>
                      {availableModalBlocks.map((blk) => (
                        <option key={blk} value={blk}>Blok {blk}</option>
                      ))}
                    </select>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative', flex: 1 }}>
                    <Search size={13} style={{ color: '#687e72', position: 'absolute', left: '8px' }} />
                    <input
                      type="text"
                      placeholder="Cari nomor/nama..."
                      value={modalHouseSearch}
                      onChange={(e) => setModalHouseSearch(e.target.value)}
                      style={{
                        width: '100%',
                        paddingLeft: '26px',
                        paddingRight: '22px',
                        height: '32px',
                        fontSize: '11px',
                        borderRadius: '6px',
                        border: '1px solid #ccd8d1',
                        background: '#ffffff',
                      }}
                    />
                    {modalHouseSearch && (
                      <button
                        type="button"
                        onClick={() => setModalHouseSearch('')}
                        style={{
                          position: 'absolute',
                          right: '6px',
                          background: 'transparent',
                          border: 'none',
                          color: '#83958b',
                          cursor: 'pointer',
                          padding: '2px',
                        }}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                <select
                  value={selectedHouseId}
                  onChange={(e) => setSelectedHouseId(e.target.value)}
                  required
                >
                  <option value="">-- Pilih nomor rumah --</option>
                  {filteredModalHouses.map((h) => (
                    <option key={h.houseId} value={h.houseId}>
                      {h.houseCode} — {h.headName || 'Warga'} (Blok {h.blockCode})
                    </option>
                  ))}
                </select>
              </div>

              <label className="field">
                <span>Catatan / Keterangan <small>(opsional)</small></span>
                <input
                  maxLength={100}
                  placeholder="Contoh: Koordinator regu, Jam 23:00"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <Button
                  type="button"
                  variant="secondary"
                  className="button-small"
                  onClick={() => setDialogOpen(false)}
                  disabled={saving}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  className="button-small"
                  disabled={saving || !selectedHouseId}
                >
                  {saving ? 'Menyimpan...' : 'Simpan Jadwal'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
