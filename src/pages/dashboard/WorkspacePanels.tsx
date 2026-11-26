import type { FormEvent } from 'react'
import { useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ExternalLink,
  FileImage,
  Plus,
  RefreshCw,
  RotateCcw,
  Wallet,
  X,
} from 'lucide-react'
import { Button, Card, EmptyState, LoadingState, Notice, SectionTitle, StatusBadge } from '../../components/UI'
import { useResource } from '../../hooks/useResource'
import { api, jsonBody } from '../../lib/api'
import { formatCurrency, formatDate, safeProofUrl } from '../../lib/format'
import type {
  Bill,
  Expense,
  FinanceFund,
  HouseArrears,
  Payment,
} from '../../types'

type PanelTab =
  | 'overview'
  | 'bills'
  | 'expenses'
  | 'review'
  | 'funds'
  | 'income'
  | 'arrears'
  | 'verification'

interface WorkspaceProps {
  tab: PanelTab
  onFinanceChange?: () => Promise<void>
}

export function WargaWorkspace({ tab, onFinanceChange = async () => {} }: WorkspaceProps) {
  if (tab === 'expenses') {
    return <ReadonlyExpensePanel endpoint="/api/public/expenses" />
  }
  return <WargaBillsPanel onFinanceChange={onFinanceChange} />
}

export function BendaharaWorkspace({ tab, onFinanceChange = async () => {} }: WorkspaceProps) {
  if (tab === 'review') return <PaymentReviewPanel onFinanceChange={onFinanceChange} />
  if (tab === 'funds') return <FundsPanel onFinanceChange={onFinanceChange} />
  if (tab === 'expenses') return <BendaharaExpensePanel onFinanceChange={onFinanceChange} />
  if (tab === 'income') return <IncomePanel onFinanceChange={onFinanceChange} />
  return <PaymentReviewPanel compact onFinanceChange={onFinanceChange} />
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
  const [proofUrl, setProofUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const bills = billsResource.data ?? []
  const unpaidBills = bills.filter((bill) => bill.status === 'UNPAID')
  const selectedBill = unpaidBills.find((bill) => String(bill.id) === billId) ?? unpaidBills[0]

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedBill) return
    const amountPaid = Number(selectedBill.amountDue)
    if (!Number.isSafeInteger(amountPaid) || amountPaid <= 0) {
      setError('Nominal tagihan tidak dapat diproses dengan aman. Hubungi bendahara.')
      return
    }

    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      await api('/api/warga/payments', {
        method: 'POST',
        body: jsonBody({
          billId: selectedBill.id,
          amountPaid,
          proofUrl: proofUrl.trim(),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      })
      setSuccess('Pengajuan terkirim. Tagihan menunggu verifikasi bendahara.')
      setProofUrl('')
      setNotes('')
      await Promise.all([billsResource.reload(), paymentsResource.reload(), onFinanceChange()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pengajuan pembayaran gagal.')
    } finally {
      setSubmitting(false)
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
            <label className="field field-wide">
              <span>Tautan / path bukti transfer</span>
              <input
                type="text"
                maxLength={255}
                placeholder="/uploads/bukti-transfer.webp"
                value={proofUrl}
                onChange={(event) => setProofUrl(event.target.value)}
                required
              />
              <small>Unggah bukti ke penyimpanan terlebih dahulu, lalu masukkan alamatnya.</small>
            </label>
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
                {submitting ? 'Mengirim...' : 'Kirim pengajuan'}
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

function PaymentReviewPanel({
  compact = false,
  onFinanceChange,
}: {
  compact?: boolean
  onFinanceChange: () => Promise<void>
}) {
  const resource = useResource<Payment[]>('/api/bendahara/payments/pending')
  const payments = resource.data ?? []
  const visiblePayments = compact ? payments.slice(0, 3) : payments

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
            {visiblePayments.map((payment) => (
              <PaymentReviewCard key={payment.id} payment={payment} onUpdated={updateList} />
            ))}
            {compact && payments.length > visiblePayments.length && (
              <p className="more-note">Ada {payments.length - visiblePayments.length} pengajuan lain yang menunggu.</p>
            )}
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
  const proofHref = payment.proofUrl ? safeProofUrl(payment.proofUrl) : null

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
      {proofHref ? (
        <a className="proof-link" href={proofHref} target="_blank" rel="noreferrer">
          <FileImage size={16} /> Lihat bukti pembayaran <ExternalLink size={14} />
        </a>
      ) : <p className="missing-proof">Bukti pembayaran tidak dilampirkan.</p>}
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
  const [name, setName] = useState('')
  const [type, setType] = useState<'RECURRING' | 'EVENT'>('RECURRING')
  const [amount, setAmount] = useState('10000')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [periodKey, setPeriodKey] = useState(() => new Date().toISOString().slice(0, 7))
  const [selectedFundId, setSelectedFundId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const funds = resource.data ?? []

  async function createFund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amountPerHouse = Number(amount)
    if (!Number.isSafeInteger(amountPerHouse) || amountPerHouse < 0) {
      setError('Nominal harus berupa bilangan bulat rupiah yang valid.')
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await api('/api/bendahara/funds', {
        method: 'POST',
        body: jsonBody({
          name: name.trim(),
          type,
          amountPerHouse,
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(startDate ? { startDate } : {}),
        }),
      })
      setName('')
      setDescription('')
      setSuccess('Pos keuangan berhasil dibuat.')
      await Promise.all([resource.reload(), onFinanceChange()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pos keuangan gagal dibuat.')
    } finally {
      setBusy(false)
    }
  }

  async function generateBills(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedFundId) {
      setError('Pilih pos keuangan terlebih dahulu.')
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await api<{ createdCount: number }>('/api/bendahara/bills/generate', {
        method: 'POST',
        body: jsonBody({ fundId: Number(selectedFundId), periodKey: periodKey.trim() }),
      })
      setSuccess(`${result.createdCount} tagihan baru berhasil dibuat.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Tagihan gagal dibuat.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="workspace-stack">
      <Card>
        <SectionTitle title="Buat pos keuangan" description="Atur iuran rutin atau dana kegiatan." />
        {error && <Notice>{error}</Notice>}
        {success && <Notice variant="success">{success}</Notice>}
        <form className="form-grid" onSubmit={createFund}>
          <label className="field">
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
            <input type="number" min="0" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </label>
          <label className="field">
            <span>Tanggal mulai <small>(opsional)</small></span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="field field-wide">
            <span>Keterangan <small>(opsional)</small></span>
            <input maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Informasi singkat untuk warga" />
          </label>
          <div className="field-wide form-actions">
            <Button type="submit" disabled={busy}><Plus size={17} /> Buat pos</Button>
          </div>
        </form>
      </Card>

      <Card>
        <SectionTitle title="Generate tagihan" description="Tagihan dibuat untuk seluruh rumah yang aktif." />
        <form className="form-grid" onSubmit={generateBills}>
          <label className="field">
            <span>Pos keuangan</span>
            <select value={selectedFundId} onChange={(event) => setSelectedFundId(event.target.value)} required>
              <option value="">Pilih pos</option>
              {funds.filter((fund) => fund.status === 'ACTIVE').map((fund) => (
                <option key={fund.id} value={fund.id}>{fund.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Periode</span>
            <input maxLength={30} value={periodKey} onChange={(event) => setPeriodKey(event.target.value)} required placeholder="2026-11" />
          </label>
          <div className="field-wide form-actions">
            <Button type="submit" variant="secondary" disabled={busy || !funds.length}>
              <RefreshCw size={16} /> Generate tagihan
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <SectionTitle title="Semua pos" description="Daftar pos yang digunakan untuk pencatatan kas." />
        {resource.error && <Notice>{resource.error}</Notice>}
        {resource.loading && !resource.data ? <LoadingState /> : funds.length === 0 ? (
          <EmptyState title="Belum ada pos kas" description="Buat pos pertama untuk memulai pencatatan." />
        ) : (
          <div className="fund-table">
            {funds.map((fund) => (
              <div className="fund-table-row" key={fund.id}>
                <div><strong>{fund.name}</strong><span>{fund.type === 'EVENT' ? 'Kegiatan' : 'Rutin'} · {fund.status === 'ACTIVE' ? 'Aktif' : 'Ditutup'}</span></div>
                <b>{formatCurrency(fund.amountPerHouse)}<small> / rumah</small></b>
              </div>
            ))}
          </div>
        )}
      </Card>
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
    const numericAmount = Number(amount)
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
            <input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required />
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
          {resource.data.map((expense) => {
            const proofHref = expense.proofUrl ? safeProofUrl(expense.proofUrl) : null
            return (
              <article className="expense-row" key={expense.id}>
                <span className="expense-symbol"><ArrowDownLeft size={18} /></span>
                <div className="expense-main">
                  <strong>{expense.title}</strong>
                  <span>{expense.fundName} · {formatDate(expense.expenseDate)}</span>
                  {expense.description && <small>{expense.description}</small>}
                  {proofHref && (
                    <a className="inline-proof" href={proofHref} target="_blank" rel="noreferrer">
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
          })}
        </div>
      )}
    </Card>
  )
}

function IncomePanel({ onFinanceChange }: { onFinanceChange: () => Promise<void> }) {
  const fundsResource = useResource<FinanceFund[]>('/api/bendahara/funds')
  const [fundId, setFundId] = useState('')
  const [source, setSource] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'TRANSFER' | 'CASH'>('TRANSFER')
  const [notes, setNotes] = useState('')
  const [cashBillId, setCashBillId] = useState('')
  const [cashAmount, setCashAmount] = useState('')
  const [resetUserId, setResetUserId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const funds = (fundsResource.data ?? []).filter((fund) => fund.status === 'ACTIVE')

  async function recordIncome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const numericAmount = Number(amount)
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
    const numericAmount = Number(cashAmount)
    if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
      setError('Nominal harus berupa bilangan bulat rupiah positif.')
      return
    }
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await api('/api/bendahara/payments/cash', {
        method: 'POST',
        body: jsonBody({ billId: Number(cashBillId), amountPaid: numericAmount }),
      })
      setCashBillId('')
      setCashAmount('')
      setSuccess('Pembayaran tunai tercatat dan tagihan menjadi lunas.')
      await onFinanceChange()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pembayaran tunai gagal dicatat.')
    } finally {
      setBusy(false)
    }
  }

  async function resetPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!window.confirm('Reset password warga ini ke PIN sementara? Warga harus menggantinya saat login.')) return
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await api(`/api/bendahara/users/${encodeURIComponent(resetUserId.trim())}/reset-password`, { method: 'POST' })
      setResetUserId('')
      setSuccess('PIN direset. Sampaikan PIN sementara sesuai konfigurasi kepada warga secara pribadi.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'PIN gagal direset.')
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
            <input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required />
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
        <form className="form-grid" onSubmit={recordCash}>
          <label className="field">
            <span>ID tagihan</span>
            <input type="number" min="1" step="1" value={cashBillId} onChange={(event) => setCashBillId(event.target.value)} required />
          </label>
          <label className="field">
            <span>Nominal diterima (Rp)</span>
            <input type="number" min="1" step="1" value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} required />
          </label>
          <div className="field-wide form-actions">
            <Button type="submit" variant="secondary" disabled={busy}><Wallet size={17} /> Catat pembayaran tunai</Button>
          </div>
        </form>
      </Card>

      <Card>
        <SectionTitle title="Reset PIN warga" description="Warga wajib mengganti PIN sementara saat login berikutnya." />
        <form className="form-grid" onSubmit={resetPin}>
          <label className="field">
            <span>ID akun warga (UUID)</span>
            <input type="text" maxLength={36} value={resetUserId} onChange={(event) => setResetUserId(event.target.value)} required />
          </label>
          <div className="field form-actions align-end">
            <Button type="submit" variant="secondary" disabled={busy}><RotateCcw size={17} /> Reset PIN</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

function ArrearsPanel({ compact = false }: { compact?: boolean }) {
  const resource = useResource<HouseArrears[]>('/api/ketua/houses/arrears')
  const rows = resource.data ?? []
  const visibleRows = compact ? rows.slice(0, 5) : rows
  return (
    <Card>
      <SectionTitle
        title="Rekap tagihan rumah"
        description="Tagihan belum lunas atau masih menunggu verifikasi."
        action={<span className="tiny-count">{rows.length} rumah</span>}
      />
      {resource.error && <Notice>{resource.error}</Notice>}
      {resource.loading && !resource.data ? <LoadingState /> : !rows.length ? (
        <EmptyState title="Belum ada rekap" description="Data rumah akan muncul setelah tagihan dibuat." />
      ) : (
        <div className="arrears-list">
          {visibleRows.map((row) => (
            <div className="arrears-row" key={row.houseId}>
              <span className="house-avatar">{row.houseCode.slice(0, 1)}</span>
              <div className="arrears-house"><strong>{row.houseCode}</strong><span>{row.headName}</span></div>
              <div className="arrears-count">{row.outstandingBillCount}<small> tagihan</small></div>
              <strong className={BigInt(row.outstandingAmount) > 0n ? 'amount-warn' : 'amount-ok'}>
                {formatCurrency(row.outstandingAmount)}
              </strong>
            </div>
          ))}
          {compact && rows.length > visibleRows.length && (
            <p className="more-note">Menampilkan {visibleRows.length} dari {rows.length} rumah.</p>
          )}
        </div>
      )}
    </Card>
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
