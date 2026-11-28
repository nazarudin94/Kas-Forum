import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, EyeOff, Plus, UserPlus, X } from 'lucide-react'
import { Button, Card, EmptyState, LoadingState, Notice, SectionTitle } from '../../components/UI'
import { useAuth } from '../../auth/AuthContext'
import { getSupabase, getSupabaseSchema } from '../../lib/supabase'

type PermissionAction = 'can_view' | 'can_create' | 'can_update' | 'can_delete'

interface RbacRole {
  id: number
  role_key: string
  name: string
}

interface RbacMenu {
  id: number
  menu_key: string
  label: string
  path: string
  sort_order: number
}

interface RoleMenuPermission {
  role_id: number
  menu_id: number
  can_view: boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
}

interface RbacUser {
  id: string
  username: string
  full_name: string
  role_id: number
  warga_id: number | null
  is_active: boolean
}

interface WargaRecord {
  id: number
  house_id: number
  head_name: string
}

interface HouseRecord {
  id: number
  house_code: string
}

type PermissionDraft = Record<number, Record<number, Omit<RoleMenuPermission, 'role_id' | 'menu_id'>>>

function requireRows<T>(
  result: { data: T[] | null; error: Error | null },
  label: string,
): T[] {
  if (result.error) throw result.error
  if (!result.data) throw new Error(`Data ${label} tidak dikembalikan Supabase.`)
  return result.data
}

function initialDraft(roles: RbacRole[], menus: RbacMenu[], permissions: RoleMenuPermission[]): PermissionDraft {
  return Object.fromEntries(roles.map((role) => [
    role.id,
    Object.fromEntries(menus.map((menu) => {
      const current = permissions.find((item) => item.role_id === role.id && item.menu_id === menu.id)
      return [menu.id, {
        can_view: current?.can_view ?? false,
        can_create: current?.can_create ?? false,
        can_update: current?.can_update ?? false,
        can_delete: current?.can_delete ?? false,
      }]
    })),
  ]))
}

async function invokeAdminUserManagement(body: Record<string, unknown>) {
  const supabase = getSupabase()
  const action = body.action

  if (action === 'set-active') {
    const { error: rpcError } = await supabase.rpc('set_user_active', {
      requested_user_id: body.userId,
      requested_is_active: body.isActive,
    })
    if (!rpcError) return
    if (!rpcError.message?.includes('not found') && rpcError.code !== 'PGRST202') {
      throw new Error(rpcError.message)
    }
  } else if (action === 'create') {
    const { error: rpcError } = await supabase.rpc('admin_create_user', {
      requested_username: String(body.username ?? ''),
      requested_full_name: String(body.fullName ?? ''),
      requested_password: String(body.password ?? ''),
      requested_role_id: Number(body.roleId),
      requested_warga_id: body.wargaId !== null && body.wargaId !== undefined ? Number(body.wargaId) : null,
      requested_is_active: body.isActive ?? true,
    })
    if (!rpcError) return
    if (!rpcError.message?.includes('not found') && rpcError.code !== 'PGRST202') {
      throw new Error(rpcError.message)
    }
  } else if (action === 'update') {
    const { error: rpcError } = await supabase.rpc('admin_update_user', {
      requested_user_id: body.userId,
      requested_username: String(body.username ?? ''),
      requested_full_name: String(body.fullName ?? ''),
      requested_role_id: Number(body.roleId),
      requested_warga_id: body.wargaId !== null && body.wargaId !== undefined ? Number(body.wargaId) : null,
    })
    if (!rpcError) return
    if (!rpcError.message?.includes('not found') && rpcError.code !== 'PGRST202') {
      throw new Error(rpcError.message)
    }
  }

  const payloadBody = {
    ...body,
    schema: getSupabaseSchema(),
  }
  const { error } = await supabase.functions.invoke('admin-user-management', {
    body: payloadBody,
  })
  if (!error) return

  let message = error.message
  if ('context' in error && error.context instanceof Response) {
    try {
      const payload: unknown = await error.context.clone().json()
      if (
        typeof payload === 'object'
        && payload !== null
        && 'message' in payload
        && typeof payload.message === 'string'
      ) {
        message = payload.message
      }
    } catch {
      message = error.message
    }
  }
  throw new Error(message)
}

export function RbacManagementPanel({ section }: { section: 'users' | 'role-menu' }) {
  const { user: currentUser } = useAuth()
  const createUserDialog = useRef<HTMLDialogElement>(null)
  const createRoleDialog = useRef<HTMLDialogElement>(null)
  const [roles, setRoles] = useState<RbacRole[]>([])
  const [menus, setMenus] = useState<RbacMenu[]>([])
  const [permissions, setPermissions] = useState<RoleMenuPermission[]>([])
  const [users, setUsers] = useState<RbacUser[]>([])
  const [warga, setWarga] = useState<WargaRecord[]>([])
  const [houses, setHouses] = useState<HouseRecord[]>([])
  const [draft, setDraft] = useState<PermissionDraft>({})
  const [loading, setLoading] = useState(true)
  const [savingRoleId, setSavingRoleId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabase()
      const [roleResult, menuResult, permissionResult] = await Promise.all([
        supabase.from('roles').select('id, role_key, name').order('id'),
        supabase.from('menus').select('id, menu_key, label, path, sort_order').order('sort_order'),
        supabase.from('role_menus').select('role_id, menu_id, can_view, can_create, can_update, can_delete'),
      ])
      const roleRows = requireRows(roleResult, 'role')
      const menuRows = requireRows(menuResult, 'menu')
      const permissionRows = requireRows(permissionResult, 'permission role-menu')
      let userRows: RbacUser[] = []
      let wargaRows: WargaRecord[] = []
      let houseRows: HouseRecord[] = []
      if (section === 'users') {
        const [userResult, wargaResult, houseResult] = await Promise.all([
          supabase.from('users').select('id, username, full_name, role_id, warga_id, is_active').order('username'),
          supabase.from('warga').select('id, house_id, head_name').order('id'),
          supabase.from('houses').select('id, house_code').order('house_code'),
        ])
        userRows = requireRows(userResult, 'pengguna')
        wargaRows = requireRows(wargaResult, 'data warga')
        houseRows = requireRows(houseResult, 'rumah')
      }
      setRoles(roleRows)
      setMenus(menuRows)
      setPermissions(permissionRows)
      setUsers(userRows)
      setWarga(wargaRows)
      setHouses(houseRows)
      setDraft(initialDraft(roleRows, menuRows, permissionRows))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Data RBAC gagal dimuat.')
    } finally {
      setLoading(false)
    }
  }, [section])

  // oxlint-disable react/set-state-in-effect
  useEffect(() => {
    void loadData()
  }, [loadData])
  // oxlint-enable react/set-state-in-effect

  function updatePermission(roleId: number, menuId: number, action: PermissionAction, value: boolean) {
    setDraft((current) => {
      const existing = current[roleId]?.[menuId] ?? {
        can_view: false,
        can_create: false,
        can_update: false,
        can_delete: false,
      }
      const updated = { ...existing, [action]: value }
      if (action === 'can_view' && !value) {
        updated.can_create = false
        updated.can_update = false
        updated.can_delete = false
      } else if (action !== 'can_view' && value) {
        updated.can_view = true
      }
      return {
        ...current,
        [roleId]: { ...current[roleId], [menuId]: updated },
      }
    })
  }

  async function saveMatrix(role: RbacRole) {
    setSavingRoleId(role.id)
    setError(null)
    setSuccess(null)
    try {
      const requestedPermissions = menus.map((menu) => {
        const item = draft[role.id]?.[menu.id]
        return {
          menu_id: menu.id,
          can_view: Boolean(item?.can_view),
          can_create: Boolean(item?.can_create),
          can_update: Boolean(item?.can_update),
          can_delete: Boolean(item?.can_delete),
        }
      })
      const { error: saveError } = await getSupabase().rpc('save_role_menu_matrix', {
        requested_role_id: role.id,
        requested_permissions: requestedPermissions,
      })
      if (saveError) {
        throw new Error(saveError.message || saveError.details || saveError.hint || 'Gagal menyimpan permission role.')
      }
      setSuccess(`Permission untuk role ${role.name} berhasil disimpan. Pengguna dengan role ini perlu memuat ulang (refresh) halaman agar menu diperbarui.`)
      await loadData()
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'object' && reason !== null && 'message' in reason && typeof (reason as { message: unknown }).message === 'string'
            ? (reason as { message: string }).message
            : 'Permission role gagal disimpan.'
      setError(message)
    } finally {
      setSavingRoleId(null)
    }
  }

  const houseCodeById = new Map(houses.map((house) => [house.id, house.house_code]))
  const roleById = new Map(roles.map((role) => [role.id, role]))
  const menuById = new Map(menus.map((menu) => [menu.id, menu]))

  return (
    <div className="workspace-stack">
      {error && <Notice>{error}</Notice>}
      {success && <Notice variant="success">{success}</Notice>}

      {section === 'role-menu' && <Card>
        <SectionTitle
          title="Role Menu"
          description="Lihat menu yang diberikan ke setiap role dan atur hak aksesnya."
          action={(
            <div className="rbac-heading-actions">
              <span className="tiny-count">{roles.length} role · {menus.length} menu</span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => createRoleDialog.current?.showModal()}
                disabled={loading}
              >
                <Plus size={15} /> Tambah role
              </Button>
            </div>
          )}
        />
        {loading && roles.length === 0 ? <LoadingState /> : (
          <div className="rbac-role-list">
            {roles.map((role) => (
              <span className="rbac-role-chip" key={role.id}>
                <strong>{role.name}</strong><small>{role.role_key}</small>
              </span>
            ))}
          </div>
        )}
      </Card>}

      {section === 'role-menu' && <Card>
        <SectionTitle
          title="Permission per role"
          description="Aksi create, update, atau delete otomatis mengaktifkan akses view."
        />
        {loading && roles.length === 0 ? <LoadingState /> : roles.map((role) => {
          const isRoleDirty = menus.some((menu) => {
            const current = permissions.find((item) => item.role_id === role.id && item.menu_id === menu.id)
            const d = draft[role.id]?.[menu.id]
            if (!d) return false
            return (
              d.can_view !== (current?.can_view ?? false)
              || d.can_create !== (current?.can_create ?? false)
              || d.can_update !== (current?.can_update ?? false)
              || d.can_delete !== (current?.can_delete ?? false)
            )
          })

          return (
          <section className="rbac-matrix-section" key={role.id}>
            <div className="rbac-matrix-heading">
              <div>
                <h3>{role.name}</h3>
                <span>{role.role_key}</span>
                {isRoleDirty && <small style={{ color: '#d97706', marginLeft: 8, fontWeight: 600 }}>• Ada perubahan belum disimpan</small>}
              </div>
              <Button
                type="button"
                variant={isRoleDirty ? 'primary' : 'secondary'}
                disabled={savingRoleId !== null || loading}
                onClick={() => void saveMatrix(role)}
              >
                {savingRoleId === role.id ? 'Menyimpan...' : isRoleDirty ? 'Simpan perubahan *' : 'Simpan permission'}
              </Button>
            </div>
            <div className="rbac-table-wrap">
              <table className="rbac-table">
                <thead>
                  <tr><th>Menu</th><th>Lihat</th><th>Buat</th><th>Ubah</th><th>Hapus</th></tr>
                </thead>
                <tbody>
                  {menus.map((menu) => {
                    const permission = draft[role.id]?.[menu.id]
                    const adminManagementMenu = menu.menu_key === 'rbac' || menu.menu_key === 'role_menu'
                    const protectAdmin = role.role_key === 'ADMIN' && adminManagementMenu
                    const adminOtherMenu = role.role_key === 'ADMIN' && !adminManagementMenu
                    const adminOnlyMenu = role.role_key !== 'ADMIN' && adminManagementMenu
                    const wargaOnlyMenu = role.role_key !== 'WARGA' && (menu.menu_key === 'bills' || menu.menu_key === 'profile')
                    return (
                      <tr key={menu.id}>
                        <td><strong>{menu.label}</strong><small>{menu.menu_key} · {menu.path}</small></td>
                        {(['can_view', 'can_create', 'can_update', 'can_delete'] as const).map((action) => (
                          <td key={action}>
                            <input
                              aria-label={`${role.name}: ${menu.label} - ${action.replace('can_', '')}`}
                              type="checkbox"
                              checked={permission?.[action] ?? false}
                              disabled={
                                savingRoleId !== null
                                || adminOtherMenu
                                || adminOnlyMenu
                                || wargaOnlyMenu
                                || (protectAdmin && (action === 'can_view' || action === 'can_update'))
                              }
                              onChange={(event) => updatePermission(role.id, menu.id, action, event.target.checked)}
                            />
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )})}
      </Card>}

      {section === 'users' && <Card>
        <SectionTitle
          title="Pengguna dan menu"
          description="Ubah profil atau role, lihat menu berdasarkan role, dan nonaktifkan akun tanpa menghapus riwayat."
          action={(
            <Button
              type="button"
              onClick={() => createUserDialog.current?.showModal()}
              disabled={loading || roles.length === 0}
            >
              <UserPlus size={15} /> Tambah pengguna
            </Button>
          )}
        />
        {loading && users.length === 0 ? <LoadingState /> : users.length === 0 ? (
          <EmptyState title="Belum ada profil pengguna" description="Buat akun Auth lalu tambahkan profil ke public.users." />
        ) : (
          <div className="rbac-table-wrap">
            <table className="rbac-table rbac-user-table">
              <thead>
                <tr><th>Profil</th><th>Role</th><th>Data warga</th><th>Menu</th><th>Status</th><th>Aksi</th></tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const role = roleById.get(user.role_id)
                  const userMenus = permissions
                    .filter((permission) => permission.role_id === user.role_id && permission.can_view)
                    .map((permission) => menuById.get(permission.menu_id)?.label)
                    .filter((label): label is string => Boolean(label))
                  const currentWarga = warga.find((record) => record.id === user.warga_id)
                  const houseCode = currentWarga ? houseCodeById.get(currentWarga.house_id) : null
                  return (
                    <UserAssignmentRow
                      key={user.id}
                      user={user}
                      currentUserId={currentUser?.id ?? ''}
                      currentRoleName={role?.name ?? 'Role tidak ditemukan'}
                      roles={roles}
                      warga={warga}
                      houseCodeById={houseCodeById}
                      userMenus={userMenus}
                      houseCode={houseCode}
                      onSaved={loadData}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>}

      {section === 'users' && <dialog className="rbac-modal rbac-modal-small" ref={createUserDialog} aria-labelledby="rbac-create-title">
        <div className="rbac-modal-head">
          <div>
            <h2 id="rbac-create-title">Tambah pengguna</h2>
            <p>Password sementara wajib diganti saat login pertama.</p>
          </div>
          <button
            className="rbac-modal-close"
            type="button"
            aria-label="Tutup form tambah pengguna"
            onClick={() => createUserDialog.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        <NewUserForm
          roles={roles}
          warga={warga}
          houseCodeById={houseCodeById}
          onCreated={async () => {
            setSuccess('Pengguna berhasil dibuat.')
            await loadData()
          }}
          onClose={() => createUserDialog.current?.close()}
        />
      </dialog>}

      {section === 'role-menu' && <dialog className="rbac-modal rbac-modal-small" ref={createRoleDialog} aria-labelledby="rbac-role-create-title">
        <div className="rbac-modal-head">
          <div>
            <h2 id="rbac-role-create-title">Tambah role</h2>
            <p>Pilih menu awal untuk role ini. Hak akses selain melihat dapat diatur di matriks.</p>
          </div>
          <button
            className="rbac-modal-close"
            type="button"
            aria-label="Tutup form tambah role"
            onClick={() => createRoleDialog.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        <NewRoleForm
          menus={menus}
          onCreated={async () => {
            setSuccess('Role dan menu awal berhasil ditambahkan.')
            await loadData()
          }}
          onClose={() => createRoleDialog.current?.close()}
        />
      </dialog>}
    </div>
  )
}

function NewRoleForm({
  menus,
  onCreated,
  onClose,
}: {
  menus: RbacMenu[]
  onCreated: () => Promise<void>
  onClose: () => void
}) {
  const [roleKey, setRoleKey] = useState('')
  const [name, setName] = useState('')
  const [selectedMenuIds, setSelectedMenuIds] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const normalizedRoleKey = roleKey.trim().toUpperCase()
  const availableMenus = menus.filter((menu) => (
    (!['rbac', 'role_menu'].includes(menu.menu_key) || normalizedRoleKey === 'ADMIN')
    && (!['bills', 'profile'].includes(menu.menu_key) || normalizedRoleKey === 'WARGA')
  ))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { error: createError } = await getSupabase().rpc('create_rbac_role', {
        requested_role_key: roleKey,
        requested_name: name,
        requested_menu_ids: selectedMenuIds,
      })
      if (createError) throw createError
      setRoleKey('')
      setName('')
      setSelectedMenuIds([])
      await onCreated()
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Role gagal dibuat.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="rbac-create-form" onSubmit={(event) => void submit(event)}>
      {error && <Notice>{error}</Notice>}
      <div className="rbac-create-grid">
        <label className="field">
          <span>Kode role</span>
          <input
            autoComplete="off"
            maxLength={30}
            pattern="[A-Z][A-Z0-9_]{1,29}"
            placeholder="KOORDINATOR"
            required
            value={roleKey}
            onChange={(event) => {
              const nextRoleKey = event.target.value.toUpperCase()
              setRoleKey(nextRoleKey)
              setSelectedMenuIds((current) => current.filter((menuId) => menus.some((menu) => (
                menu.id === menuId
                && (!['rbac', 'role_menu'].includes(menu.menu_key) || nextRoleKey.trim() === 'ADMIN')
                && (!['bills', 'profile'].includes(menu.menu_key) || nextRoleKey.trim() === 'WARGA')
              ))))
            }}
          />
        </label>
        <label className="field">
          <span>Nama role</span>
          <input
            maxLength={80}
            placeholder="Koordinator"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      </div>
      <fieldset className="rbac-role-menu-picker">
        <legend>Menu role</legend>
        <div className="rbac-role-menu-options">
          {availableMenus.map((menu) => (
            <label className="rbac-role-menu-option" key={menu.id}>
              <input
                type="checkbox"
                checked={selectedMenuIds.includes(menu.id)}
                onChange={(event) => {
                  setSelectedMenuIds((current) => event.target.checked
                    ? [...current, menu.id]
                    : current.filter((menuId) => menuId !== menu.id))
                }}
              />
              <span><strong>{menu.label}</strong><small>{menu.path}</small></span>
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" disabled={submitting || selectedMenuIds.length === 0}>
        {submitting ? 'Menyimpan...' : 'Simpan role'}
      </Button>
    </form>
  )
}

function NewUserForm({
  roles,
  warga,
  houseCodeById,
  onCreated,
  onClose,
}: {
  roles: RbacRole[]
  warga: WargaRecord[]
  houseCodeById: Map<number, string>
  onCreated: () => Promise<void>
  onClose: () => void
}) {
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [roleId, setRoleId] = useState('')
  const [wargaId, setWargaId] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const role = roles.find((item) => String(item.id) === roleId)
  const isResidentRole = role?.role_key === 'WARGA'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Konfirmasi password sementara belum sama.')
      return
    }
    setSubmitting(true)
    try {
      await invokeAdminUserManagement({
        action: 'create',
        username,
        fullName,
        password,
        roleId: Number(roleId),
        wargaId: isResidentRole ? Number(wargaId) : null,
        isActive,
      })
      setUsername('')
      setFullName('')
      setPassword('')
      setConfirmPassword('')
      setRoleId('')
      setWargaId('')
      setIsActive(true)
      await onCreated()
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pengguna gagal dibuat.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="rbac-create-form" onSubmit={(event) => void submit(event)}>
      {error && <Notice>{error}</Notice>}
      <div className="rbac-create-grid">
        <label className="field">
          <span>Username</span>
          <input
            autoComplete="off"
            maxLength={30}
            pattern="[A-Za-z0-9._-]{1,30}"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Nama lengkap</span>
          <input
            autoComplete="name"
            maxLength={120}
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Password sementara (min. 6 karakter)</span>
          <span className="password-input">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={6}
              maxLength={72}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              className="password-toggle"
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? 'Sembunyikan password sementara' : 'Tampilkan password sementara'}
            >
              {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          </span>
        </label>
        <label className="field">
          <span>Konfirmasi password sementara</span>
          <span className="password-input">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={6}
              maxLength={72}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            <button
              className="password-toggle"
              type="button"
              onClick={() => setShowConfirmPassword((shown) => !shown)}
              aria-label={showConfirmPassword ? 'Sembunyikan konfirmasi password' : 'Tampilkan konfirmasi password'}
            >
              {showConfirmPassword ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          </span>
        </label>
        <label className="field">
          <span>Role</span>
          <select
            required
            value={roleId}
            onChange={(event) => {
              setRoleId(event.target.value)
              setWargaId('')
            }}
          >
            <option value="">Pilih role</option>
            {roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Status akun</span>
          <select
            required
            value={isActive ? 'active' : 'inactive'}
            onChange={(event) => setIsActive(event.target.value === 'active')}
          >
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </label>
        {isResidentRole && (
          <label className="field rbac-create-wide">
            <span>Data warga / rumah</span>
            <select
              required
              value={wargaId}
              onChange={(event) => setWargaId(event.target.value)}
            >
              <option value="">Pilih warga</option>
              {warga.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.head_name} · {houseCodeById.get(record.house_id) ?? `Rumah ${record.house_id}`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <Button type="submit" disabled={submitting || !roles.length || (isResidentRole && !wargaId)}>
        {submitting ? 'Membuat akun...' : 'Tambah pengguna'}
      </Button>
    </form>
  )
}

function UserAssignmentRow({
  user,
  currentUserId,
  currentRoleName,
  roles,
  warga,
  houseCodeById,
  userMenus,
  houseCode,
  onSaved,
}: {
  user: RbacUser
  currentUserId: string
  currentRoleName: string
  roles: RbacRole[]
  warga: WargaRecord[]
  houseCodeById: Map<number, string>
  userMenus: string[]
  houseCode: string | null | undefined
  onSaved: () => Promise<void>
}) {
  const [username, setUsername] = useState(user.username)
  const [fullName, setFullName] = useState(user.full_name)
  const [roleId, setRoleId] = useState(String(user.role_id))
  const [wargaId, setWargaId] = useState(user.warga_id === null ? '' : String(user.warga_id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedRole = roles.find((role) => String(role.id) === roleId)
  const isResidentRole = selectedRole?.role_key === 'WARGA'
  const changed = username !== user.username
    || fullName !== user.full_name
    || roleId !== String(user.role_id)
    || wargaId !== (user.warga_id === null ? '' : String(user.warga_id))

  async function saveAssignment() {
    setSaving(true)
    setError(null)
    try {
      await invokeAdminUserManagement({
        action: 'update',
        userId: user.id,
        username,
        fullName,
        roleId: Number(roleId),
        wargaId: isResidentRole && wargaId ? Number(wargaId) : null,
      })
      await onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Role pengguna gagal diperbarui.')
    } finally {
      setSaving(false)
    }
  }

  async function setActive(active: boolean) {
    if (!active && !window.confirm(`Nonaktifkan akun ${user.username}? Riwayat dan profilnya tetap disimpan.`)) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await invokeAdminUserManagement({
        action: 'set-active',
        userId: user.id,
        isActive: active,
      })
      await onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Status akun gagal diperbarui.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr>
      <td>
        <input
          aria-label={`Nama lengkap untuk ${user.username}`}
          maxLength={120}
          required
          value={fullName}
          disabled={saving}
          onChange={(event) => setFullName(event.target.value)}
        />
        <input
          aria-label={`Username untuk ${user.username}`}
          autoComplete="off"
          maxLength={30}
          pattern="[A-Za-z0-9._-]{1,30}"
          required
          value={username}
          disabled={saving}
          onChange={(event) => setUsername(event.target.value)}
        />
        {error && <small className="rbac-row-error">{error}</small>}
      </td>
      <td>
        <span className="rbac-current-role">{currentRoleName}</span>
        <select
          aria-label={`Role untuk ${user.username}`}
          value={roleId}
          disabled={saving}
          onChange={(event) => {
            const nextRoleId = event.target.value
            const nextRole = roles.find((role) => String(role.id) === nextRoleId)
            setRoleId(nextRoleId)
            if (nextRole?.role_key !== 'WARGA') setWargaId('')
          }}
        >
          {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
      </td>
      <td>
        {isResidentRole ? (
          <select
            aria-label={`Data warga untuk ${user.username}`}
            value={wargaId}
            disabled={saving}
            onChange={(event) => setWargaId(event.target.value)}
          >
            <option value="">Pilih rumah</option>
            {warga.map((record) => (
              <option key={record.id} value={record.id}>
                {houseCodeById.get(record.house_id) ?? `Rumah ${record.house_id}`} · {record.head_name}
              </option>
            ))}
          </select>
        ) : <span>{houseCode ?? '—'}</span>}
      </td>
      <td>
        <div className="rbac-menu-chips">
          {userMenus.map((menu) => <span className="rbac-menu-chip" key={menu}>{menu}</span>)}
          {userMenus.length === 0 && <span className="rbac-menu-empty">Tidak ada menu aktif</span>}
        </div>
      </td>
      <td><span className={`rbac-status ${user.is_active ? 'rbac-status-active' : 'rbac-status-inactive'}`}>
        {user.is_active ? 'Aktif' : 'Nonaktif'}
      </span></td>
      <td>
        <div className="rbac-row-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={saving || !changed || (isResidentRole && !wargaId)}
            onClick={() => void saveAssignment()}
          >
            {saving ? 'Menyimpan...' : 'Simpan perubahan'}
          </Button>
          <Button
            type="button"
            variant={user.is_active ? 'danger' : 'secondary'}
            disabled={saving || user.id === currentUserId}
            onClick={() => void setActive(!user.is_active)}
          >
            {user.is_active ? 'Nonaktifkan' : 'Aktifkan'}
          </Button>
        </div>
      </td>
    </tr>
  )
}
