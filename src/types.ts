export type UserRole = 'WARGA' | 'BENDAHARA' | 'KETUA'
export type MoneyValue = string | number
export type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type BillStatus = 'UNPAID' | 'PENDING' | 'PAID'

export interface User {
  id: string
  username: string
  fullName: string
  role: UserRole
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

export interface HouseArrears {
  houseId: number
  houseCode: string
  headName: string
  outstandingBillCount: number
  outstandingAmount: MoneyValue
}
