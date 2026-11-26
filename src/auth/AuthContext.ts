import { createContext, useContext } from 'react'
import type { User } from '../types'

export interface AuthContextValue {
  user: User | null
  loading: boolean
  startupError: string | null
  signIn: (username: string, password: string) => Promise<User>
  signOut: () => Promise<void>
  refreshUser: () => Promise<User>
  changePassword: (password: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth harus digunakan di dalam AuthProvider.')
  return context
}
