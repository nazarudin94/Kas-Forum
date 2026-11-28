import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/AuthContext'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { dashboardPathForRole } from './lib/roles'
import type { UserRole } from './types'

function SplashLoader() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(145deg, #17392f 4%, #244d3b 60%, #1c4434)',
        color: '#ffffff',
      }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="76" height="76" fill="none" aria-hidden="true">
        <rect width="64" height="64" rx="20" fill="rgba(188, 229, 138, 0.16)" />
        <path
          d="M45.5 18.5c-13.2.5-21.8 5.7-24.5 14.8-1.9 6.7 2.1 12.2 8.1 12.2 8.2 0 15.2-10.3 16.4-27Z"
          fill="#BCE58A"
        />
        <path
          d="M17.5 47c3.4-9.8 10.3-16.5 20.6-20.6"
          stroke="#E6F4D8"
          strokeLinecap="round"
          strokeWidth="3"
        />
        <circle cx="44.5" cy="45.5" r="3.6" fill="#A7D870" />
      </svg>
      <div style={{ marginTop: '14px', fontSize: '26px', fontWeight: 800, letterSpacing: '-0.8px' }}>
        kaskita<span style={{ color: '#a7d870' }}>.</span>
      </div>
    </div>
  )
}

function RoleHome() {
  const { user, loading } = useAuth()
  if (loading) return <SplashLoader />
  if (!user) return <Navigate to="/" replace />
  return <Navigate to={dashboardPathForRole(user.role)} replace />
}

function ProtectedRoute({ role }: { role?: UserRole }) {
  const { user, loading } = useAuth()
  if (loading) return <SplashLoader />
  if (!user) return <Navigate to="/" replace />
  if (role && user.role !== role) return <Navigate to={dashboardPathForRole(user.role)} replace />
  return <DashboardPage />
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <SplashLoader />
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
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let listenerHandle: { remove: () => Promise<void> } | undefined
    void CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      // 1. Jika ada dialog/modal HTML5 yang sedang terbuka, tutup dialog lebih dulu
      const openDialog = document.querySelector('dialog[open]') as HTMLDialogElement | null
      if (openDialog) {
        openDialog.close()
        return
      }
      // 2. Jika berada di halaman Login ('/' atau '/login'), langsung keluar dari aplikasi
      //    meskipun WebView masih menyimpan riwayat halaman sebelum logout
      const currentPath = window.location.pathname
      if (currentPath === '/' || currentPath === '/login') {
        void CapacitorApp.exitApp()
        return
      }
      // 3. Jika histori halaman bisa kembali, navigasi mundur
      if (canGoBack) {
        window.history.back()
        return
      }
      // 4. Keluar dari aplikasi
      void CapacitorApp.exitApp()
    }).then((handle) => {
      listenerHandle = handle
    })

    return () => {
      if (listenerHandle) void listenerHandle.remove()
    }
  }, [])

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
