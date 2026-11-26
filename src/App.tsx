import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/AuthContext'
import { ChangePasswordPage } from './pages/ChangePasswordPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import type { UserRole } from './types'

const dashboardPaths: Record<UserRole, string> = {
  WARGA: '/dashboard/warga',
  BENDAHARA: '/dashboard/bendahara',
  KETUA: '/dashboard/ketua',
}

function RoleHome() {
  const { user, loading } = useAuth()
  if (loading) return <div className="screen-loader">Memuat sesi...</div>
  if (!user) return <Navigate to="/" replace />
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />
  return <Navigate to={dashboardPaths[user.role]} replace />
}

function ProtectedRoute({ role }: { role?: UserRole }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="screen-loader">Memuat sesi...</div>
  if (!user) return <Navigate to="/" replace />
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }
  if (role && user.role !== role) return <Navigate to={dashboardPaths[user.role]} replace />
  return role ? <DashboardPage /> : <ChangePasswordPage />
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <div className="screen-loader">Memuat sesi...</div>
  return (
    <Routes>
      <Route path="/" element={user ? <RoleHome /> : <LoginPage />} />
      <Route path="/change-password" element={<ProtectedRoute />} />
      <Route path="/dashboard/warga" element={<ProtectedRoute role="WARGA" />} />
      <Route path="/dashboard/bendahara" element={<ProtectedRoute role="BENDAHARA" />} />
      <Route path="/dashboard/ketua" element={<ProtectedRoute role="KETUA" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
