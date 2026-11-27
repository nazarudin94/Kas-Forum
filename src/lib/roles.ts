import type { UserRole } from '../types'

export function dashboardPathForRole(role: UserRole) {
  switch (role) {
    case 'WARGA':
      return '/dashboard/warga'
    case 'BENDAHARA':
      return '/dashboard/bendahara'
    case 'KETUA':
      return '/dashboard/ketua'
    case 'SEKRETARIS':
      return '/dashboard/sekretaris'
    case 'ADMIN':
      return '/dashboard/admin'
    default:
      return '/dashboard/custom'
  }
}
