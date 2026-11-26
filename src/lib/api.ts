import { getSupabase } from './supabase'

type Row = Record<string, any>

function unwrap<T>(result: { data: T; error: Error | null }): T {
  if (result.error) throw result.error
  return result.data
}

function unwrapRows<T>(result: { data: T[] | null; error: Error | null }): T[] {
  if (result.error) throw result.error
  if (!result.data) throw new Error('Supabase tidak mengembalikan daftar data.')
  return result.data
}

function bodyOf(options: RequestInit) {
  if (typeof options.body !== 'string') return {}
  const parsed: unknown = JSON.parse(options.body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Format data permintaan tidak valid.')
  }
  return parsed as Record<string, unknown>
}

function mapExpense(row: Row) {
  return {
    id: Number(row.id),
    fundId: Number(row.fund_id),
    fundName: row.fund_name ?? row.finance_funds?.name,
    title: row.title,
    description: row.description,
    amount: row.amount,
    expenseDate: row.expense_date,
    proofUrl: row.proof_url,
    status: row.status,
    createdAt: row.created_at,
  }
}

function mapFund(row: Row) {
  return {
    id: Number(row.id),
    name: row.name,
    type: row.type,
    amountPerHouse: row.amount_per_house,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    createdAt: row.created_at,
  }
}

function mapPayment(row: Row) {
  return {
    id: Number(row.id),
    billId: row.bill_id === null ? null : Number(row.bill_id),
    houseId: row.house_id === null ? null : Number(row.house_id),
    houseCode: row.houses?.house_code ?? row.house_code ?? null,
    fundId: Number(row.fund_id),
    fundName: row.finance_funds?.name ?? row.fund_name,
    incomeSource: row.income_source,
    amountPaid: row.amount_paid,
    paymentMethod: row.payment_method,
    proofUrl: row.proof_url,
    notes: row.notes,
    status: row.status,
    rejectReason: row.reject_reason,
    createdAt: row.created_at,
    submittedBy: row.users?.full_name,
    verifiedAt: row.verified_at,
    verifierName: row.verifier_name ?? row.users?.full_name,
  }
}

function mapBill(row: Row) {
  return {
    id: Number(row.id),
    fundId: Number(row.fund_id),
    fundName: row.finance_funds?.name,
    fundType: row.finance_funds?.type,
    periodKey: row.period_key,
    amountDue: row.amount_due,
    status: row.status,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const supabase = getSupabase()
  const method = (options.method ?? 'GET').toUpperCase()
  const body = bodyOf(options)

  if (path === '/api/public/summary' && method === 'GET') {
    return unwrap(await supabase.rpc('get_public_finance_summary')) as T
  }

  if ((path === '/api/public/expenses' || path === '/api/ketua/expenses') && method === 'GET') {
    const rows = unwrapRows(await supabase.from('v_public_expenses').select('*').order('expense_date', { ascending: false }))
    return rows.map((row) => mapExpense(row as Row)) as T
  }

  if (path === '/api/warga/bills' && method === 'GET') {
    const rows = unwrapRows(await supabase
      .from('bills')
      .select('id, fund_id, period_key, amount_due, status, paid_at, created_at, finance_funds(name, type)')
      .order('created_at', { ascending: false }))
    return rows.map((row) => mapBill(row as Row)) as T
  }

  if (path === '/api/warga/payments' && method === 'GET') {
    const rows = unwrapRows(await supabase
      .from('payments')
      .select('id, bill_id, house_id, fund_id, amount_paid, payment_method, status, reject_reason, created_at, finance_funds(name)')
      .order('created_at', { ascending: false }))
    return rows.map((row) => mapPayment(row as Row)) as T
  }

  if (path === '/api/warga/payments' && method === 'POST') {
    unwrap(await supabase.rpc('submit_resident_payment', {
      requested_bill_id: Number(body.billId),
      requested_amount: Number(body.amountPaid),
      requested_proof_url: String(body.proofUrl ?? ''),
      requested_notes: String(body.notes ?? ''),
    }))
    return { message: 'Pengajuan pembayaran berhasil dikirim.' } as T
  }

  if (path === '/api/bendahara/payments/pending' && method === 'GET') {
    const rows = unwrapRows(await supabase
      .from('payments')
      .select('id, bill_id, house_id, fund_id, income_source, amount_paid, payment_method, proof_url, notes, status, reject_reason, created_at, finance_funds(name), houses(house_code), users!payments_submitted_by_fkey(full_name)')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true }))
    return rows.map((row) => mapPayment(row as Row)) as T
  }

  const reviewMatch = path.match(/^\/api\/bendahara\/payments\/(\d+)\/(approve|reject)$/)
  if (reviewMatch && method === 'POST') {
    unwrap(await supabase.rpc('review_payment', {
      requested_payment_id: Number(reviewMatch[1]),
      requested_action: reviewMatch[2],
      requested_reason: String(body.reason ?? ''),
    }))
    return { message: 'Status pembayaran berhasil diperbarui.' } as T
  }

  if (path === '/api/bendahara/funds' && method === 'GET') {
    const rows = unwrapRows(await supabase.from('finance_funds').select('*').order('created_at', { ascending: false }))
    return rows.map((row) => mapFund(row as Row)) as T
  }

  if (path === '/api/bendahara/funds' && method === 'POST') {
    const id = unwrap(await supabase.rpc('create_fund', {
      requested_name: String(body.name),
      requested_type: String(body.type),
      requested_amount_per_house: Number(body.amountPerHouse),
      requested_description: String(body.description ?? ''),
      requested_start_date: body.startDate ? String(body.startDate) : null,
    }))
    return { id } as T
  }

  if (path === '/api/bendahara/bills/generate' && method === 'POST') {
    const createdCount = unwrap(await supabase.rpc('generate_bills', {
      requested_fund_id: Number(body.fundId),
      requested_period_key: String(body.periodKey),
    }))
    return { createdCount } as T
  }

  if (path === '/api/bendahara/expenses' && method === 'GET') {
    const rows = unwrapRows(await supabase
      .from('expenses')
      .select('id, fund_id, title, description, amount, expense_date, proof_url, status, created_at, finance_funds(name)')
      .order('expense_date', { ascending: false }))
    return rows.map((row) => mapExpense(row as Row)) as T
  }

  if (path === '/api/bendahara/expenses' && method === 'POST') {
    const id = unwrap(await supabase.rpc('create_expense', {
      requested_fund_id: Number(body.fundId),
      requested_title: String(body.title),
      requested_amount: Number(body.amount),
      requested_date: String(body.expenseDate),
      requested_description: String(body.description ?? ''),
      requested_proof_url: String(body.proofUrl ?? ''),
    }))
    return { id, status: 'APPROVED' } as T
  }

  if (path === '/api/bendahara/income' && method === 'POST') {
    const id = unwrap(await supabase.rpc('record_other_income', {
      requested_fund_id: Number(body.fundId),
      requested_source: String(body.incomeSource),
      requested_amount: Number(body.amountPaid),
      requested_method: String(body.paymentMethod),
      requested_notes: String(body.notes ?? ''),
    }))
    return { id } as T
  }

  if (path === '/api/bendahara/payments/cash' && method === 'POST') {
    unwrap(await supabase.rpc('record_cash_payment', {
      requested_bill_id: Number(body.billId),
      requested_amount: Number(body.amountPaid),
    }))
    return { message: 'Pembayaran tunai berhasil dicatat.' } as T
  }

  const resetMatch = path.match(/^\/api\/bendahara\/users\/([^/]+)\/reset-password$/)
  if (resetMatch && method === 'POST') {
    unwrap(await supabase.functions.invoke('reset-warga-password', {
      body: { userId: resetMatch[1] },
    }))
    return { message: 'Password warga berhasil direset.' } as T
  }

  if (path === '/api/ketua/houses/arrears' && method === 'GET') {
    const rows = unwrapRows(await supabase.from('v_house_arrears').select('*').order('house_code'))
    return rows.map((row) => ({
      houseId: Number(row.house_id),
      houseCode: row.house_code,
      headName: row.head_name,
      outstandingBillCount: Number(row.outstanding_bill_count),
      outstandingAmount: row.outstanding_amount,
    })) as T
  }

  if (path === '/api/ketua/verification-log' && method === 'GET') {
    const rows = unwrapRows(await supabase.from('v_verification_log').select('*').order('verified_at', { ascending: false }))
    return rows.map((row) => mapPayment(row as Row)) as T
  }

  throw new Error(`Operasi Supabase belum didukung: ${method} ${path}`)
}

export function jsonBody(value: unknown): string {
  return JSON.stringify(value)
}
