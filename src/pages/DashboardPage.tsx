import { useCallback, useState } from 'react'
import {
  ArrowUpRight,
  Banknote,
  Bell,
  BookOpenCheck,
  Boxes,
  CalendarCheck,
  ClipboardList,
  FileCheck2,
  HandCoins,
  LayoutDashboard,
  KeyRound,
  Leaf,
  LogOut,
  ReceiptText,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, LoadingState, Notice, SectionTitle } from '../components/UI'
import { formatCurrency } from '../lib/format'
import { useResource } from '../hooks/useResource'
import type { Bill, FinanceSummary, Payment, User, UserRole } from '../types'
import {
  BendaharaWorkspace,
  KetuaWorkspace,
  RondaPanel,
  WargaRondaInfoCard,
  WargaWorkspace,
} from './dashboard/WorkspacePanels'
import { RbacManagementPanel } from './dashboard/RbacManagementPanel'

type DashboardTab =
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
  | 'rbac'
  | 'role_menu'

interface NavItem {
  id: DashboardTab
  label: string
  icon: LucideIcon
}

const roleDetails: Partial<Record<UserRole, { label: string; subtitle: string; nav: NavItem[] }>> = {
  WARGA: {
    label: 'Warga',
    subtitle: 'Pantau iuran dan aktivitas kas lingkungan.',
    nav: [
      { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
      { id: 'bills', label: 'Tagihan saya', icon: ReceiptText },
      { id: 'expenses', label: 'Pengeluaran', icon: ClipboardList },
      { id: 'profile', label: 'Profil saya', icon: UserRound },
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
      { id: 'ronda', label: 'Jadwal Ronda', icon: CalendarCheck },
    ],
  },
  KETUA: {
    label: 'Ketua blok',
    subtitle: 'Pantau laporan dan verifikasi keuangan.',
    nav: [
      { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
      { id: 'arrears', label: 'Rekap rumah', icon: UsersRound },
      { id: 'expenses', label: 'Pengeluaran', icon: ClipboardList },
      { id: 'ronda', label: 'Jadwal Ronda', icon: CalendarCheck },
      { id: 'verification', label: 'Log verifikasi', icon: BookOpenCheck },
    ],
  },
  SEKRETARIS: {
    label: 'Sekretaris',
    subtitle: 'Kelola jadwal ronda dan administrasi warga.',
    nav: [
      { id: 'overview', label: 'Ringkasan', icon: LayoutDashboard },
      { id: 'ronda', label: 'Jadwal Ronda', icon: CalendarCheck },
      { id: 'arrears', label: 'Rekap rumah', icon: UsersRound },
      { id: 'expenses', label: 'Pengeluaran', icon: ClipboardList },
    ],
  },
  ADMIN: {
    label: 'Administrator',
    subtitle: 'Kelola akun pengguna dan hak akses.',
    nav: [
      { id: 'rbac', label: 'Manajemen RBAC', icon: KeyRound },
      { id: 'role_menu', label: 'Role Menu', icon: ShieldCheck },
    ],
  },
}

const menuIcons: Record<DashboardTab, LucideIcon> = {
  overview: LayoutDashboard,
  bills: ReceiptText,
  expenses: ClipboardList,
  profile: UserRound,
  review: FileCheck2,
  funds: Boxes,
  income: HandCoins,
  arrears: UsersRound,
  verification: BookOpenCheck,
  ronda: CalendarCheck,
  rbac: KeyRound,
  role_menu: ShieldCheck,
}

function isDashboardTab(value: string): value is DashboardTab {
  return Object.prototype.hasOwnProperty.call(menuIcons, value)
}

function isBendaharaTab(tab: DashboardTab): tab is 'review' | 'funds' | 'expenses' | 'income' {
  return tab === 'review' || tab === 'funds' || tab === 'expenses' || tab === 'income'
}

function isKetuaTab(tab: DashboardTab): tab is 'arrears' | 'verification' {
  return tab === 'arrears' || tab === 'verification'
}

function initialDashboardTab(user: User | null): DashboardTab {
  if (user?.role === 'ADMIN') return 'rbac'
  if (user && !roleDetails[user.role]) {
    const assignedTab = user.menus.flatMap((menu) => isDashboardTab(menu.key) ? [menu.key] : [])[0]
    return assignedTab ?? 'overview'
  }
  return 'overview'
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

function FundHighlights({ summary, onlyActive = false }: { summary: FinanceSummary; onlyActive?: boolean }) {
  const visibleFunds = onlyActive
    ? summary.funds.filter((fund) => fund.fund_status === 'ACTIVE')
    : summary.funds

  return (
    <Card>
      <SectionTitle
        title="Pos keuangan"
        description="Ringkasan saldo per pos kas."
        action={<span className="tiny-count">{visibleFunds.length} pos</span>}
      />
      {visibleFunds.length === 0 ? (
        <div className="empty-inline">Belum ada pos keuangan.</div>
      ) : (
        <div className="fund-grid">
          {visibleFunds.map((fund) => (
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
      {role === 'WARGA' && <WargaRondaInfoCard />}
      <FundHighlights summary={summary} onlyActive={role === 'WARGA'} />
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
  const [activeTab, setActiveTab] = useState<DashboardTab>(() => initialDashboardTab(user))
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const role = user?.role ?? 'WARGA'
  const details = roleDetails[role] ?? {
    label: user?.roleName ?? role,
    subtitle: 'Akses berdasarkan menu yang diberikan administrator.',
    nav: user?.menus.flatMap((menu) => isDashboardTab(menu.key)
      ? [{ id: menu.key, label: menu.label, icon: menuIcons[menu.key] }]
      : []) ?? [],
  }
  const canViewOverview = Boolean(user?.menus.some((menu) => menu.key === 'overview' && menu.canView))
  const canViewReview = Boolean(user?.menus.some((menu) => menu.key === 'review' && menu.canView))
  const canViewBills = Boolean(user?.menus.some((menu) => menu.key === 'bills' && menu.canView))
  const isCustomRole = !roleDetails[role]
  const configuredNav = details.nav.flatMap((item) => {
    const menu = user?.menus.find((entry) => entry.key === item.id && entry.canView)
    return menu ? [{ ...item, label: menu.label }] : []
  })
  const configuredKeys = new Set(details.nav.map((item) => item.id))
  const extraNav = (user?.menus ?? [])
    .filter((menu) => menu.canView && isDashboardTab(menu.key) && !configuredKeys.has(menu.key as DashboardTab))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((menu) => ({
      id: menu.key as DashboardTab,
      label: menu.label,
      icon: menuIcons[menu.key as DashboardTab] ?? LayoutDashboard,
    }))
  const visibleNav = [...configuredNav, ...extraNav]
  const {
    data: summary,
    loading: summaryLoading,
    error: summaryError,
    reload: reloadSummary,
  } = useResource<FinanceSummary>(
    role !== 'ADMIN' && canViewOverview ? '/api/public/summary' : null,
  )
  const {
    data: pendingReviews,
    reload: reloadPendingReviews,
  } = useResource<Payment[]>(
    canViewReview ? '/api/bendahara/payments/pending' : null,
  )
  const {
    data: residentBills,
    reload: reloadResidentBills,
  } = useResource<Bill[]>(
    canViewBills ? '/api/warga/bills' : null,
  )
  const pendingReviewCount = pendingReviews?.length ?? 0
  const unpaidBillCount = residentBills?.filter((bill) => bill.status === 'UNPAID').length ?? 0

  function badgeCountForTab(tab: DashboardTab): number {
    if (tab === 'review') return pendingReviewCount
    if (tab === 'bills') return unpaidBillCount
    return 0
  }

  const refreshFinance = useCallback(async () => {
    await Promise.all([reloadSummary(), reloadPendingReviews(), reloadResidentBills()])
  }, [reloadSummary, reloadPendingReviews, reloadResidentBills])

  function handleTabChange(tab: DashboardTab) {
    setActiveTab(tab)
    if (canViewReview) void reloadPendingReviews()
    if (canViewBills) void reloadResidentBills()
  }

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
                badgeCount={badgeCountForTab(item.id)}
                onClick={() => handleTabChange(item.id)}
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
                badgeCount={badgeCountForTab(item.id)}
                onClick={() => handleTabChange(item.id)}
              />
            ))}
          </div>

          <div className="page-heading">
            <div>
              <span className="eyebrow">{details.label.toUpperCase()}</span>
              <h1>{pageTitle}</h1>
              <p>
                {activeTab === 'overview' && role !== 'ADMIN'
                  ? `Halo, ${user?.fullName}. Berikut kondisi kas terbaru.`
                  : details.subtitle}
              </p>
            </div>
            <span className="today-label">
              <span className="live-dot" />
              {today}
            </span>
          </div>

          {logoutError && <Notice>{logoutError}</Notice>}
          {visibleNav.length === 0 && (
            <Notice variant="info">Role ini belum memiliki menu. Hubungi ADMIN untuk mengatur permission.</Notice>
          )}
          {role !== 'ADMIN' && summaryError && <Notice>{summaryError}</Notice>}
          {canViewOverview && activeTab !== 'profile' && summaryLoading && !summary && (
            <LoadingState label="Memuat ringkasan kas..." />
          )}
          {canViewOverview && activeTab !== 'profile' && summary && <SummaryCards summary={summary} />}

          {canViewOverview && summary && activeTab === 'overview' && (
            <DashboardOverview role={role} summary={summary} />
          )}
          {role === 'WARGA' && activeTab !== 'overview' && activeTab !== 'ronda' && activeTab !== 'rbac' && activeTab !== 'role_menu' && (
            <WargaWorkspace tab={activeTab} onFinanceChange={refreshFinance} />
          )}
          {activeTab === 'ronda' && <RondaPanel readonly={role === 'WARGA'} />}
          {role === 'BENDAHARA' && activeTab !== 'overview' && activeTab !== 'ronda' && activeTab !== 'rbac' && activeTab !== 'role_menu' && (
            <BendaharaWorkspace tab={activeTab} onFinanceChange={refreshFinance} />
          )}
          {role === 'KETUA' && activeTab !== 'overview' && activeTab !== 'ronda' && activeTab !== 'rbac' && activeTab !== 'role_menu' && (
            <KetuaWorkspace tab={activeTab} />
          )}
          {role === 'SEKRETARIS' && activeTab !== 'overview' && activeTab !== 'ronda' && activeTab !== 'rbac' && activeTab !== 'role_menu' && (
            <KetuaWorkspace tab={activeTab} />
          )}
          {isCustomRole && activeTab !== 'ronda' && isBendaharaTab(activeTab) && (
            <BendaharaWorkspace tab={activeTab} onFinanceChange={refreshFinance} />
          )}
          {isCustomRole && activeTab !== 'ronda' && isKetuaTab(activeTab) && <KetuaWorkspace tab={activeTab} />}
          {role === 'ADMIN' && activeTab === 'rbac' && <RbacManagementPanel section="users" />}
          {role === 'ADMIN' && activeTab === 'role_menu' && <RbacManagementPanel section="role-menu" />}
        </main>
      </div>
    </div>
  )
}

function NavButton({
  item,
  active,
  badgeCount = 0,
  onClick,
}: {
  item: NavItem
  active: boolean
  badgeCount?: number
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
      {badgeCount > 0 && (
        <span className="nav-badge" aria-label={`${badgeCount} item pada ${item.label}`}>
          {badgeCount}
        </span>
      )}
    </button>
  )
}
