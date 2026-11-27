import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Clock3, CircleDollarSign } from 'lucide-react'
import { formatNominalInput } from '../lib/format'
import type { BillStatus, PaymentStatus } from '../types'

type Status = BillStatus | PaymentStatus | 'APPROVED'

const statusContent: Record<Status, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  PAID: { label: 'Lunas', className: 'status-green', icon: CheckCircle2 },
  APPROVED: { label: 'Disetujui', className: 'status-green', icon: CheckCircle2 },
  PENDING: { label: 'Menunggu', className: 'status-amber', icon: Clock3 },
  UNPAID: { label: 'Belum lunas', className: 'status-red', icon: AlertCircle },
  REJECTED: { label: 'Ditolak', className: 'status-red', icon: AlertCircle },
}

export function StatusBadge({ status }: { status: Status }) {
  const config = statusContent[status]
  const Icon = config.icon
  return (
    <span className={`status-badge ${config.className}`}>
      <Icon size={14} aria-hidden="true" />
      {config.label}
    </span>
  )
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  return (
    <button
      className={`button button-${variant} transition-all duration-200 ${className}`}
      {...props}
    />
  )
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <section className={`panel ${className}`}>{children}</section>
}

export function Notice({
  children,
  variant = 'error',
}: {
  children: ReactNode
  variant?: 'error' | 'success' | 'info'
}) {
  return <div className={`notice notice-${variant}`}>{children}</div>
}

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><CircleDollarSign size={23} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}

export function LoadingState({ label = 'Memuat data...' }: { label?: string }) {
  return <div className="loading-state"><span className="spinner" />{label}</div>
}

export function MoneyInput({
  value,
  onValueChange,
  placeholder = 'Contoh: 50.000',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string
  onValueChange: (formattedValue: string) => void
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange(formatNominalInput(event.target.value))}
      {...props}
    />
  )
}
