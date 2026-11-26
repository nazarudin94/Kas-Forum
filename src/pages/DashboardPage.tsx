import { useCallback, useState } from 'react'
import {
  ArrowUpRight,
  Banknote,
  Bell,
  BookOpenCheck,
  Boxes,
  ClipboardList,
  FileCheck2,
  HandCoins,
  LayoutDashboard,
  Leaf,
  LogOut,
  ReceiptText,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, LoadingState, Notice, SectionTitle } from '../components/UI'
import { formatCurrency } from '../lib/format'
import { useResource } from '../hooks/useResource'
import type { FinanceSummary, UserRole } from '../types'
import {
  BendaharaWorkspace,
  KetuaWorkspace,
  WargaWorkspace,
} from './dashboard/WorkspacePanels'

type DashboardTab =
  | 'overview'
  | 'bills'
  | 'expenses'
  | 'review'
  | 'funds'
  | 'income'
  | 'arrears'
  | 'verification'

interface NavItem {
  id: DashboardTab
  label: string
  icon: LucideIcon
}

const roleDetails: Record<UserRole, { label: string; subtitle: string; nav: NavItem[] }> = {
  WARGA: {
    label: 'Warga',
    subtitle: 'Pantau iuran dan aktivitas kas lingkungan.',
    nav: [
      { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
      { id: 'bills', label: 'Tagihan saya', icon: ReceiptText },
      { id: 'expenses', label: 'Pengeluaran', icon: ClipboardList },
    ],
  },
  BENDAHARA: {
    label: 'Bendahara',
    subtitle: 'Kelola transaksi dengan rapi dan akuntabel.',
    nav: [
      { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
      { id: 'review', label: 'Verifikasi', icon: FileCheck2 },
      { id: 'funds', label: 'Pos & tagihan', icon: Boxes },
      { id: 'expenses', label: 'Pengeluaran', icon: ClipboardList },
      { id: 'income', label: 'Pemasukan', icon: HandCoins },
    ],
  },
  KETUA: {
    label: 'Ketua blok',
    subtitle: 'Pantau laporan dan verifikasi keuangan.',
    nav: [
      { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
      { id: 'arrears', label: 'Rekap rumah', icon: UsersRound },
      { id: 'expenses', label: 'Pengeluaran', icon: ClipboardList },
      { id: 'verification', label: 'Log verifikasi', icon: BookOpenCheck },
    ],
  },
}

function SummaryCards({ summary }: { summary: FinanceSummary }) {
  const cards = [
    { label: 'Saldo kas saat ini', value: summary.currentBalance, tone: 'stat-dark', icon: Banknote },
    { label: 'Total pemasukan', value: summary.totalIncome, tone: 'stat-green', icon: ArrowUpRight },
    { label: 'Total pengeluaran', value: summary.totalExpense, tone: 'stat-light', icon: ReceiptText },
  ]

  return (
    <div className="stats-grid">
      {cards.map(({ label, value, tone, icon: Icon }) => (
        <Card className={`stat-card ${tone}`} key={label}>
          <div className="stat-label"><span>{label}</span><Icon size={17} /></div>
          <strong>{formatCurrency(value)}</strong>
          <small>{label === 'Saldo kas saat ini' ? 'Pemasukan disetujui − pengeluaran disetujui' : 'Transaksi berstatus disetujui'}</small>
        </Card>
      ))}
    </div>
  )
}

function FundHighlights({ summary }: { summary: FinanceSummary }) {
  return (
    <Card>
      <SectionTitle
        title="Pos keuangan"
        description="Ringkasan saldo per pos kas."
        action={<span className="tiny-count">{summary.funds.length} pos</span>}
      />
      {summary.funds.length === 0 ? (
        <div className="empty-inline">Belum ada pos keuangan.</div>
      ) : (
        <div className="fund-grid">
          {summary.funds.map((fund) => (
            <div className="fund-tile" key={fund.fund_id}>
              <span className={`fund-icon ${fund.fund_type === 'EVENT' ? 'fund-event' : ''}`}>
                {fund.fund_type === 'EVENT' ? <Leaf size={17} /> : <Banknote size={17} />}
              </span>
              <div className="fund-tile-info">
                <strong>{fund.fund_name}</strong>
                <span>{fund.fund_type === 'EVENT' ? 'Kas kegiatan' : 'Iuran rutin'}</span>
              </div>
              <b>{formatCurrency(fund.current_balance)}</b>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function DashboardOverview({
  role,
  summary,
}: {
  role: UserRole
  summary: FinanceSummary
}) {
  const description = role === 'WARGA'
    ? 'Informasi kas yang sudah diverifikasi bendahara.'
    : role === 'BENDAHARA'
      ? 'Ringkasan transaksi resmi yang sudah disetujui.'
      : 'Pantauan saldo dan pos keuangan blok.'

  return (
    <div className="workspace-stack">
      <div className="welcome-strip">
        <span className="welcome-icon"><ShieldCheck size={19} /></span>
        <div>
          <strong>Keuangan transparan, lingkungan nyaman.</strong>
          <p>{description}</p>
        </div>
      </div>
      <FundHighlights summary={summary} />
      {role === 'WARGA' && <WargaWorkspace tab="overview" />}
      {role === 'BENDAHARA' && <BendaharaWorkspace tab="overview" />}
      {role === 'KETUA' && <KetuaWorkspace tab="overview" />}
    </div>
  )
}

export function DashboardPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [today] = useState(
    () => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date()),
  )
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const role = user?.role ?? 'WARGA'
  const details = roleDetails[role]
  const visibleNav = details.nav.flatMap((item) => {
    const menu = user?.menus.find((entry) => entry.key === item.id && entry.canView)
    return menu ? [{ ...item, label: menu.label }] : []
  })
  const {
    data: summary,
    loading: summaryLoading,
    error: summaryError,
    reload: reloadSummary,
  } = useResource<FinanceSummary>('/api/public/summary')

  const refreshFinance = useCallback(async () => {
    await reloadSummary()
  }, [reloadSummary])

  async function handleLogout() {
    setLogoutError(null)
    try {
      await signOut()
      navigate('/', { replace: true })
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Logout gagal.')
    }
  }

  const pageTitle = activeTab === 'overview'
    ? 'Ringkasan'
    : visibleNav.find((item) => item.id === activeTab)?.label ?? 'Dashboard'

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <a className="brand" href="/" aria-label="KasKita">
          <span className="brand-mark"><Leaf size={19} /></span>
          <span>kaskita<span className="brand-dot">.</span></span>
        </a>
        <div className="header-right">
          <span className="secure-label"><ShieldCheck size={15} /> Data terlindungi</span>
          <span className="account-chip">
            <span className="account-avatar">{user?.fullName.charAt(0).toUpperCase() ?? 'K'}</span>
            <span className="account-name">{user?.fullName}</span>
            <small>{details.label}</small>
          </span>
          <Button variant="ghost" className="logout-button" onClick={handleLogout} aria-label="Keluar">
            <LogOut size={17} /><span>Keluar</span>
          </Button>
        </div>
      </header>

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <div className="sidebar-intro">
            <span className="eyebrow">RUANG KERJA</span>
            <strong>{details.label}</strong>
            <p>{details.subtitle}</p>
          </div>
          <nav className="side-nav" aria-label="Navigasi dashboard">
            {visibleNav.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={activeTab === item.id}
                onClick={() => setActiveTab(item.id)}
              />
            ))}
          </nav>
          <div className="sidebar-foot">
            <span className="sidebar-foot-icon"><Bell size={16} /></span>
            <span><b>Perlu bantuan?</b><small>Hubungi pengurus blok.</small></span>
          </div>
        </aside>

        <main className="dashboard-main">
          <div className="mobile-nav">
            {visibleNav.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={activeTab === item.id}
                onClick={() => setActiveTab(item.id)}
              />
            ))}
          </div>

          <div className="page-heading">
            <div>
              <span className="eyebrow">KAS BLOK · {details.label.toUpperCase()}</span>
              <h1>{pageTitle}</h1>
              <p>{activeTab === 'overview' ? `Halo, ${user?.fullName}. Berikut kondisi kas terbaru.` : details.subtitle}</p>
            </div>
            <span className="today-label">
              <span className="live-dot" />
              {today}
            </span>
          </div>

          {logoutError && <Notice>{logoutError}</Notice>}
          {summaryError && <Notice>{summaryError}</Notice>}
          {summaryLoading && !summary && <LoadingState label="Memuat ringkasan kas..." />}
          {summary && <SummaryCards summary={summary} />}

          {summary && activeTab === 'overview' && <DashboardOverview role={role} summary={summary} />}
          {role === 'WARGA' && activeTab !== 'overview' && (
            <WargaWorkspace tab={activeTab} onFinanceChange={refreshFinance} />
          )}
          {role === 'BENDAHARA' && activeTab !== 'overview' && (
            <BendaharaWorkspace tab={activeTab} onFinanceChange={refreshFinance} />
          )}
          {role === 'KETUA' && activeTab !== 'overview' && (
            <KetuaWorkspace tab={activeTab} />
          )}
        </main>
      </div>
    </div>
  )
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: NavItem
  active: boolean
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      className={`nav-item ${active ? 'nav-item-active' : ''}`}
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={18} />
      <span>{item.label}</span>
    </button>
  )
}
