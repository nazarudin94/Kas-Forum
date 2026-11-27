import type { MoneyValue } from '../types'

const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

const thousandFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0,
})

export function formatCurrency(value: MoneyValue | bigint): string {
  return currencyFormatter.format(typeof value === 'bigint' ? value : BigInt(value))
}

export function formatNominalInput(value: MoneyValue): string {
  const digits = String(value).replace(/\D/g, '').slice(0, 15)
  if (!digits) return ''
  const normalized = digits.replace(/^0+(?=\d)/, '')
  return thousandFormatter.format(BigInt(normalized))
}

export function parseNominalInput(value: string): number {
  const digits = value.replace(/\D/g, '')
  if (!digits) return Number.NaN
  return Number(digits)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function safeProofUrl(value: string): string | null {
  try {
    const url = new URL(value, window.location.origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}
