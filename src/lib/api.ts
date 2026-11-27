import { getSupabase } from './supabase'

type Row = Record<string, any>

function toError(error: { message?: string } | Error): Error {
  if (error instanceof Error) return error
  return new Error(typeof error.message === 'string' && error.message ? error.message : 'Permintaan ke Supabase gagal.')
}

function unwrap<T>(result: { data: T; error: { message?: string } | Error | null }): T {
  if (result.error) throw toError(result.error)
  return result.data
}

function unwrapRows<T>(result: { data: T[] | null; error: { message?: string } | Error | null }): T[] {
  if (result.error) throw toError(result.error)
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
    dueDay: row.due_day !== null && row.due_day !== undefined ? Number(row.due_day) : null,
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
    fundName: row.finance_funds?.name ?? row.fund_name,
    fundType: row.finance_funds?.type ?? row.fund_type,
    periodKey: row.period_key,
    amountDue: row.amount_due,
    status: row.status,
    dueDate: row.due_date,
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

  if (path === '/api/public/claimable-houses' && method === 'GET') {
    const rows = unwrapRows(await supabase.rpc('get_claimable_houses'))
    return rows.map((row) => ({
      houseId: Number((row as Row).house_id),
      houseCode: (row as Row).house_code,
      blockCode: (row as Row).block_code,
      houseNumber: (row as Row).house_number,
      hasAccount: Boolean((row as Row).has_account),
    })) as T
  }

  if (path === '/api/public/claim-house' && method === 'POST') {
    const { data, error } = await supabase.functions.invoke('claim-warga-account', { body })
    if (error) {
      let message = error.message
      if ('context' in error && error.context instanceof Response) {
        try {
          const payload: unknown = await error.context.clone().json()
          if (
            typeof payload === 'object'
            && payload !== null
            && 'message' in payload
            && typeof payload.message === 'string'
          ) {
            message = payload.message
          }
        } catch {
          message = error.message
        }
      }
      throw new Error(message || 'Aktivasi akun warga gagal.')
    }
    return data as T
  }

  if ((path === '/api/public/expenses' || path === '/api/ketua/expenses') && method === 'GET') {
    const rows = unwrapRows(await supabase.from('v_public_expenses').select('*').order('expense_date', { ascending: false }))
    return rows.map((row) => mapExpense(row as Row)) as T
  }

  if (path === '/api/warga/bills' && method === 'GET') {
    // Jalankan sync idempoten di latar belakang
    try {
      await supabase.rpc('sync_resident_bills')
    } catch {
      // Abaikan jika sync belum tersedia, lanjutkan query tabel bills
    }

    const currentPeriod = new Date().toISOString().slice(0, 7)
    const { data: rows, error } = await supabase
      .from('bills')
      .select('id, fund_id, period_key, amount_due, status, due_date, paid_at, created_at, finance_funds!inner(name, type, status)')
      .eq('finance_funds.status', 'ACTIVE')
      .lte('period_key', currentPeriod)
      .order('due_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (error) throw toError(error)
    return (rows ?? []).map((row) => mapBill(row as Row)) as T
  }

  if (path === '/api/warga/profile' && method === 'GET') {
    return unwrap(await supabase.rpc('get_warga_profile')) as T
  }

  if (path === '/api/warga/profile' && method === 'PUT') {
    unwrap(await supabase.rpc('update_warga_profile', {
      requested_full_name: String(body.fullName ?? ''),
      requested_head_name: String(body.headName ?? ''),
      requested_occupancy_status: String(body.occupancyStatus ?? 'OWNER_OCCUPIED'),
      requested_phone: body.phone ? String(body.phone) : null,
    }))
    return { message: 'Profil berhasil diperbarui.' } as T
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
      requested_end_date: body.endDate ? String(body.endDate) : null,
      requested_due_day: body.dueDay !== undefined && body.dueDay !== null && String(body.dueDay) !== '' ? Number(body.dueDay) : 10,
      requested_status: String(body.status ?? 'ACTIVE'),
    }))
    return { id } as T
  }

  const fundMatch = path.match(/^\/api\/bendahara\/funds\/(\d+)$/)
  if (fundMatch && method === 'PUT') {
    unwrap(await supabase.rpc('update_fund', {
      requested_fund_id: Number(fundMatch[1]),
      requested_name: String(body.name),
      requested_type: String(body.type),
      requested_amount_per_house: Number(body.amountPerHouse),
      requested_description: String(body.description ?? ''),
      requested_start_date: body.startDate ? String(body.startDate) : null,
      requested_end_date: body.endDate ? String(body.endDate) : null,
      requested_due_day: body.dueDay !== undefined && body.dueDay !== null && String(body.dueDay) !== '' ? Number(body.dueDay) : 10,
      requested_status: String(body.status ?? 'ACTIVE'),
    }))
    return { message: 'Pos keuangan berhasil diperbarui.' } as T
  }

  if (fundMatch && method === 'DELETE') {
    unwrap(await supabase.rpc('delete_fund', {
      requested_fund_id: Number(fundMatch[1]),
    }))
    return { message: 'Pos keuangan berhasil dihapus.' } as T
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

  if (path === '/api/bendahara/bills/unpaid' && method === 'GET') {
    const rows = unwrapRows(await supabase.rpc('get_unpaid_bills_for_cash'))
    return rows.map((row) => ({
      billId: Number((row as Row).bill_id),
      houseId: Number((row as Row).house_id),
      houseCode: (row as Row).house_code,
      headName: (row as Row).head_name,
      fundId: Number((row as Row).fund_id),
      fundName: (row as Row).fund_name,
      fundType: (row as Row).fund_type,
      periodKey: (row as Row).period_key,
      amountDue: (row as Row).amount_due,
      dueDate: (row as Row).due_date ?? null,
    })) as T
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
      blockCode: row.block_code,
      houseNumber: row.house_number,
      headName: row.head_name,
      occupancyStatus: row.occupancy_status ?? 'OWNER_OCCUPIED',
      isActive: row.is_active,
      phoneMasked: row.phone_masked ?? null,
      phone: row.phone ?? null,
      claimCode: row.claim_code ?? null,
      hasAccount: Boolean(row.has_account),
      outstandingBillCount: Number(row.outstanding_bill_count),
      outstandingAmount: row.outstanding_amount,
    })) as T
  }

  if (path === '/api/ketua/verification-log' && method === 'GET') {
    const rows = unwrapRows(await supabase.from('v_verification_log').select('*').order('verified_at', { ascending: false }))
    return rows.map((row) => mapPayment(row as Row)) as T
  }

  if (path === '/api/ronda/schedules' && method === 'GET') {
    const rows = unwrapRows(await supabase.from('v_ronda_schedules').select('*').order('sort_order').order('house_code'))
    return rows.map((row) => ({
      id: Number(row.id),
      dayKey: row.day_key,
      dayLabel: row.day_label,
      houseId: Number(row.house_id),
      houseCode: row.house_code,
      blockCode: row.block_code,
      houseNumber: row.house_number,
      houseIsActive: Boolean(row.house_is_active),
      headName: row.head_name ?? null,
      phoneMasked: row.phone_masked ?? null,
      phone: row.phone ?? null,
      notes: row.notes ?? null,
      createdAt: row.created_at,
      sortOrder: Number(row.sort_order),
    })) as T
  }

  if (path === '/api/ronda/schedules' && method === 'POST') {
    const newId = unwrap(await supabase.rpc('save_ronda_entry', {
      requested_id: body.id ? Number(body.id) : null,
      requested_day_key: String(body.dayKey),
      requested_house_id: Number(body.houseId),
      requested_notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
    }))
    return { id: Number(newId), message: 'Jadwal ronda berhasil disimpan.' } as T
  }

  const deleteRondaMatch = path.match(/^\/api\/ronda\/schedules\/(\d+)$/)
  if (deleteRondaMatch && method === 'DELETE') {
    unwrap(await supabase.rpc('delete_ronda_entry', {
      requested_id: Number(deleteRondaMatch[1]),
    }))
    return { message: 'Jadwal ronda berhasil dihapus.' } as T
  }

  throw new Error(`Operasi Supabase belum didukung: ${method} ${path}`)
}

export function jsonBody(value: unknown): string {
  return JSON.stringify(value)
}
