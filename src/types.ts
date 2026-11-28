export type BuiltInUserRole = 'WARGA' | 'BENDAHARA' | 'KETUA' | 'SEKRETARIS' | 'ADMIN'
export type UserRole = BuiltInUserRole | (string & {})
export type MoneyValue = string | number
export type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type BillStatus = 'UNPAID' | 'PENDING' | 'PAID'

export type RondaDayKey = 'SENIN' | 'SELASA' | 'RABU' | 'KAMIS' | 'JUMAT' | 'SABTU' | 'MINGGU'

export interface RondaSchedule {
  id: number
  dayKey: RondaDayKey
  dayLabel: string
  houseId: number
  houseCode: string
  blockCode: string
  houseNumber: string
  houseIsActive: boolean
  headName: string | null
  phoneMasked?: string | null
  phone?: string | null
  notes: string | null
  createdAt: string
  sortOrder: number
}

export interface User {
  id: string
  username: string
  fullName: string
  role: UserRole
  roleName: string
  houseId: number | null
  mustChangePassword: boolean
  menus: MenuPermission[]
}

export interface MenuPermission {
  key: string
  label: string
  path: string
  sortOrder: number
  canView: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}

export interface FundSummary {
  fund_id: number
  fund_name: string
  fund_type: 'RECURRING' | 'EVENT'
  fund_status: 'ACTIVE' | 'CLOSED'
  total_income: MoneyValue
  total_expense: MoneyValue
  current_balance: MoneyValue
}

export interface FinanceSummary {
  funds: FundSummary[]
  totalIncome: MoneyValue
  totalExpense: MoneyValue
  currentBalance: MoneyValue
}

export interface Bill {
  id: number
  fundId: number
  fundName: string
  fundType: 'RECURRING' | 'EVENT'
  periodKey: string
  amountDue: MoneyValue
  status: BillStatus
  dueDate?: string | null
  paidAt: string | null
  createdAt: string
}

export interface Payment {
  id: number
  billId: number | null
  houseId: number | null
  houseCode?: string | null
  fundId?: number
  fundName: string
  incomeSource?: string
  amountPaid: MoneyValue
  paymentMethod: 'TRANSFER' | 'CASH'
  proofUrl?: string | null
  notes?: string | null
  status: PaymentStatus
  rejectReason?: string | null
  createdAt?: string
  submittedBy?: string
  verifiedAt?: string | null
  verifierName?: string | null
}

export interface FinanceFund {
  id: number
  name: string
  type: 'RECURRING' | 'EVENT'
  amountPerHouse: MoneyValue
  description: string | null
  startDate: string | null
  endDate: string | null
  dueDay?: number | null
  status: 'ACTIVE' | 'CLOSED'
  createdAt: string
}

export interface Expense {
  id: number
  fundId: number
  fundName: string
  title: string
  description: string | null
  amount: MoneyValue
  expenseDate: string
  proofUrl: string | null
  status: 'PENDING' | 'APPROVED'
  createdAt: string
}

export type HouseOccupancyStatus = 'OWNER_OCCUPIED' | 'RENTED' | 'VACANT'

export interface HouseArrears {
  houseId: number
  houseCode: string
  blockCode: string
  houseNumber: string
  headName: string
  occupancyStatus: HouseOccupancyStatus
  ownerPhone?: string | null
  wargaId?: number | null
  ktpVerified?: boolean
  kkVerified?: boolean
  isActive: boolean
  phoneMasked?: string | null
  phone?: string | null
  claimCode?: string | null
  hasAccount?: boolean
  outstandingBillCount: number
  outstandingAmount: MoneyValue
}

export interface ClaimableHouse {
  houseId: number
  houseCode: string
  blockCode: string
  houseNumber: string
  hasAccount: boolean
}

export interface UnpaidHouseBill {
  billId: number
  houseId: number
  houseCode: string
  headName: string
  fundId: number
  fundName: string
  fundType: 'RECURRING' | 'EVENT'
  periodKey: string
  amountDue: MoneyValue
  dueDate: string | null
}

export interface WargaProfile {
  username: string
  fullName: string
  houseCode: string
  blockCode: string
  houseNumber: string
  headName: string
  occupancyStatus: HouseOccupancyStatus
  ownerPhone?: string | null
  ktpVerified?: boolean
  kkVerified?: boolean
  phone: string | null
  phoneMasked?: string | null
  createdAt: string
}
