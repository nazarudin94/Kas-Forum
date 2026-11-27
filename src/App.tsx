import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/AuthContext'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { dashboardPathForRole } from './lib/roles'
import type { UserRole } from './types'

function RoleHome() {
  const { user, loading } = useAuth()
  if (loading) return <div className="screen-loader">Memuat sesi...</div>
  if (!user) return <Navigate to="/" replace />
  return <Navigate to={dashboardPathForRole(user.role)} replace />
}

function ProtectedRoute({ role }: { role?: UserRole }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="screen-loader">Memuat sesi...</div>
  if (!user) return <Navigate to="/" replace />
  if (role && user.role !== role) return <Navigate to={dashboardPathForRole(user.role)} replace />
  return <DashboardPage />
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <div className="screen-loader">Memuat sesi...</div>
  return (
    <Routes>
      <Route path="/" element={user ? <RoleHome /> : <LoginPage />} />
      <Route path="/dashboard/warga" element={<ProtectedRoute role="WARGA" />} />
      <Route path="/dashboard/bendahara" element={<ProtectedRoute role="BENDAHARA" />} />
      <Route path="/dashboard/ketua" element={<ProtectedRoute role="KETUA" />} />
      <Route path="/dashboard/sekretaris" element={<ProtectedRoute role="SEKRETARIS" />} />
      <Route path="/dashboard/admin" element={<ProtectedRoute role="ADMIN" />} />
      <Route path="/dashboard/custom" element={<ProtectedRoute />} />
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
