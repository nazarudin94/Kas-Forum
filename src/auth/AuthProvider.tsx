import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthContext } from './AuthContext'
import { getSupabase, usernameToAuthEmail } from '../lib/supabase'
import type { MenuPermission, User, UserRole } from '../types'

const userRoles: UserRole[] = ['WARGA', 'BENDAHARA', 'KETUA']

function isUserRole(value: string): value is UserRole {
  return userRoles.includes(value as UserRole)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [startupError, setStartupError] = useState<string | null>(null)

  const loadUser = useCallback(async () => {
    const supabase = getSupabase()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    if (!authData.user) {
      setUser(null)
      return null
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, username, full_name, role_id, warga_id, must_change_password, is_active')
      .eq('id', authData.user.id)
      .single()
    if (profileError) throw profileError
    if (!profile.is_active) {
      await supabase.auth.signOut()
      throw new Error('Akun tidak aktif atau tidak ditemukan.')
    }

    const [{ data: role, error: roleError }, { data: menuRows, error: menuError }] = await Promise.all([
      supabase.from('roles').select('role_key').eq('id', profile.role_id).single(),
      supabase
        .from('role_menus')
        .select('can_view, can_create, can_update, can_delete, menus!inner(menu_key, label, path, sort_order)')
        .eq('role_id', profile.role_id)
        .eq('can_view', true),
    ])
    if (roleError) throw roleError
    if (menuError) throw menuError
    if (!isUserRole(role.role_key)) throw new Error('Peran akun tidak valid.')

    let houseId: number | null = null
    if (profile.warga_id !== null) {
      const { data: warga, error: wargaError } = await supabase
        .from('warga')
        .select('house_id')
        .eq('id', profile.warga_id)
        .single()
      if (wargaError) throw wargaError
      houseId = Number(warga.house_id)
    }

    const menus: MenuPermission[] = menuRows.map((row) => {
      const menu = row.menus[0]
      return {
        key: menu.menu_key,
        label: menu.label,
        path: menu.path,
        sortOrder: menu.sort_order,
        canView: row.can_view,
        canCreate: row.can_create,
        canUpdate: row.can_update,
        canDelete: row.can_delete,
      }
    })
    const loadedUser: User = {
      id: profile.id,
      username: profile.username,
      fullName: profile.full_name,
      role: role.role_key,
      houseId,
      mustChangePassword: profile.must_change_password,
      menus,
    }
    setUser(loadedUser)
    setStartupError(null)
    return loadedUser
  }, [])

  const refreshUser = useCallback(async () => {
    const loadedUser = await loadUser()
    if (!loadedUser) throw new Error('Sesi login tidak ditemukan.')
    return loadedUser
  }, [loadUser])

  // oxlint-disable react/set-state-in-effect
  useEffect(() => {
    let active = true
    let configTimer: number | undefined
    const supabase = (() => {
      try {
        return getSupabase()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Konfigurasi Supabase belum tersedia.'
        configTimer = window.setTimeout(() => {
          if (active) {
            setStartupError(message)
            setLoading(false)
          }
        }, 0)
        return null
      }
    })()
    if (!supabase) {
      return () => {
        active = false
        if (configTimer !== undefined) window.clearTimeout(configTimer)
      }
    }

    void loadUser()
      .catch((error: unknown) => {
        if (active) {
          setUser(null)
          setStartupError(error instanceof Error ? error.message : 'Sesi tidak dapat dimuat.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        return
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        window.setTimeout(() => {
          if (active) void loadUser().catch((error: unknown) => {
            setStartupError(error instanceof Error ? error.message : 'Profil akun tidak dapat dimuat.')
          })
        }, 0)
      }
    })

    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [loadUser])
  // oxlint-enable react/set-state-in-effect

  const signIn = useCallback(async (username: string, password: string) => {
    const supabase = getSupabase()
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToAuthEmail(username),
      password,
    })
    if (error) throw error
    return refreshUser()
  }, [refreshUser])

  const signOut = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut()
    if (error) throw error
    setUser(null)
  }, [])

  const changePassword = useCallback(async (password: string) => {
    const supabase = getSupabase()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
    const { error: flagError } = await supabase.rpc('mark_password_changed')
    if (flagError) throw flagError
  }, [])

  const value = useMemo(
    () => ({ user, loading, startupError, signIn, signOut, refreshUser, changePassword }),
    [user, loading, startupError, signIn, signOut, refreshUser, changePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
