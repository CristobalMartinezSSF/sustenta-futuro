'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface AdminProfile {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'user'
  created_at: string
}

type UserRole = 'admin' | 'user'

interface CreateUserForm {
  full_name: string
  email: string
  password: string
  role: UserRole
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function RoleBadge({ role }: { role: 'admin' | 'user' }) {
  const isAdmin = role === 'admin'
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
      style={{
        background: isAdmin ? 'rgba(75,155,245,0.1)' : 'rgba(92,184,92,0.1)',
        color: isAdmin ? '#4B9BF5' : '#5CB85C',
        border: `1px solid ${isAdmin ? 'rgba(75,155,245,0.2)' : 'rgba(92,184,92,0.2)'}`,
      }}
    >
      {isAdmin ? 'Admin' : 'Usuario'}
    </span>
  )
}

function SkeletonRow() {
  return (
    <tr>
      {[140, 180, 60, 90].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className="h-4 rounded animate-pulse"
            style={{ background: 'rgba(255,255,255,0.06)', width: `${w}px` }}
          />
        </td>
      ))}
    </tr>
  )
}

// --- Add User Modal ---

function AddUserModal({
  onClose,
  onCreated,
  accessToken,
}: {
  onClose: () => void
  onCreated: (profile: AdminProfile) => void
  accessToken: string
}) {
  const [form, setForm] = useState<CreateUserForm>({
    full_name: '',
    email: '',
    password: '',
    role: 'user',
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function set<K extends keyof CreateUserForm>(key: K, value: CreateUserForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = form.full_name.trim()
    const trimmedEmail = form.email.trim()
    const trimmedPassword = form.password

    if (!trimmedName || !trimmedEmail || !trimmedPassword) return
    if (trimmedPassword.length < 8) {
      setFormError('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    setFormError(null)
    setSubmitting(true)

    try {
      // Step 1: Create auth user via signUp (uses anon key, safe for browser)
      // A separate client instance is used to avoid overwriting the admin's session.
      const signupClient = createClient()
      const { data: signupData, error: signupError } = await signupClient.auth.signUp({
        email: trimmedEmail,
        password: trimmedPassword,
      })

      if (signupError || !signupData.user) {
        setFormError(`Error al crear usuario: ${signupError?.message ?? 'Sin respuesta'}`)
        return
      }

      const newUserId = signupData.user.id

      // Step 2: Insert admin_profiles row using admin's JWT
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      const profileRes = await fetch(`${url}/rest/v1/admin_profiles`, {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          id: newUserId,
          email: trimmedEmail,
          full_name: trimmedName,
          role: form.role,
        }),
      })

      if (!profileRes.ok) {
        const body = await profileRes.text()
        setFormError(`Usuario creado pero error al guardar perfil: ${body}`)
        return
      }

      const profileData = await profileRes.json()
      if (profileData && profileData[0]) {
        onCreated(profileData[0] as AdminProfile)
      }
    } catch {
      setFormError('Error inesperado. Intenta nuevamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = {
    background: '#111111',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#F0F0F0',
  }
  const labelStyle = { color: 'rgba(240,240,240,0.6)' }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border p-6 shadow-2xl"
        style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.1)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Agregar usuario</h2>
          <button
            onClick={onClose}
            className="text-lg leading-none transition-opacity hover:opacity-60"
            style={{ color: 'rgba(240,240,240,0.4)' }}
            aria-label="Cerrar"
          >
            &#x2715;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Nombre completo */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs" style={labelStyle}>
              Nombre completo <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
              className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#4B9BF5]/40"
              style={inputStyle}
              placeholder="Ana González"
            />
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs" style={labelStyle}>
              Email <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#4B9BF5]/40"
              style={inputStyle}
              placeholder="ana@sustentafuturo.cl"
            />
          </div>

          {/* Contraseña */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs" style={labelStyle}>
              Contraseña <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#4B9BF5]/40"
              style={inputStyle}
              placeholder="Min. 8 caracteres"
            />
          </div>

          {/* Rol */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs" style={labelStyle}>Rol</label>
            <select
              value={form.role}
              onChange={(e) => set('role', e.target.value as UserRole)}
              className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#4B9BF5]/40"
              style={{ ...inputStyle, appearance: 'none' }}
            >
              <option value="user" style={{ background: '#111111' }}>Usuario</option>
              <option value="admin" style={{ background: '#111111' }}>Admin</option>
            </select>
          </div>

          {formError && (
            <p
              className="text-xs rounded px-3 py-2"
              style={{
                color: '#f87171',
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid rgba(248,113,113,0.15)',
              }}
            >
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm transition-opacity hover:opacity-70"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(240,240,240,0.7)',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                !form.full_name.trim() ||
                !form.email.trim() ||
                form.password.length < 8
              }
              className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
              style={{ background: '#4B9BF5', color: '#ffffff' }}
            >
              {submitting ? 'Creando...' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- Users Page ---

export default function UsuariosPage() {
  const router = useRouter()
  const [profiles, setProfiles] = useState<AdminProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [currentRole, setCurrentRole] = useState<'admin' | 'user' | null>(null)
  const [accessToken, setAccessToken] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        const supabase = createClient()

        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (!user || userError) {
          window.location.href = '/login'
          return
        }

        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError || !refreshData.session) {
          window.location.href = '/login'
          return
        }

        const token = refreshData.session.access_token
        setAccessToken(token)
        setAuthChecked(true)

        // Check role via RPC
        const { data: roleData } = await supabase.rpc('get_my_role')
        const role = roleData as 'admin' | 'user' | null
        setCurrentRole(role)

        if (role !== 'admin') {
          setLoading(false)
          return
        }

        // Fetch all profiles using admin's JWT (RLS allows authenticated SELECT)
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        const profilesRes = await fetch(
          `${url}/rest/v1/admin_profiles?select=id,email,full_name,role,created_at&order=created_at.asc`,
          {
            headers: {
              'apikey': anonKey,
              'Authorization': `Bearer ${token}`,
            },
          }
        )

        if (!profilesRes.ok) {
          const body = await profilesRes.text()
          setError(`Error al cargar usuarios: ${body}`)
        } else {
          const data = await profilesRes.json()
          setProfiles((data as AdminProfile[]) ?? [])
        }
      } catch {
        window.location.href = '/login'
        return
      }

      setLoading(false)
    }

    init()
  }, [])

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#000000' }}>
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    )
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function handleUserCreated(profile: AdminProfile) {
    setProfiles((prev) => [profile, ...prev])
    setShowAddModal(false)
  }

  // Non-admin access wall
  if (currentRole !== 'admin' && !loading) {
    return (
      <div className="min-h-screen" style={{ background: '#000000', color: '#F0F0F0' }}>
        <header
          className="border-b px-6 py-4 flex items-center justify-between"
          style={{ borderColor: 'rgba(255,255,255,0.08)', background: '#000000' }}
        >
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Sustenta Futuro" style={{ height: '28px', width: 'auto' }} />
            <span
              className="text-white font-semibold tracking-tight"
              style={{ fontFamily: 'var(--font-montserrat)' }}
            >
              Sustenta Futuro
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm transition-opacity hover:opacity-70"
            style={{ color: 'rgba(240,240,240,0.5)' }}
          >
            Cerrar sesion
          </button>
        </header>
        <main className="px-6 py-16 max-w-md mx-auto text-center">
          <div
            className="rounded-xl border p-8"
            style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <p
              className="text-4xl mb-4"
              style={{ color: 'rgba(240,240,240,0.15)' }}
            >
              &#128274;
            </p>
            <h1 className="text-white font-semibold text-lg mb-2">Sin acceso</h1>
            <p className="text-sm mb-6" style={{ color: 'rgba(240,240,240,0.45)' }}>
              Esta seccion es solo para administradores.
            </p>
            <button
              onClick={() => router.push('/')}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-85"
              style={{ background: '#4B9BF5', color: '#ffffff' }}
            >
              Volver al panel
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#000000', color: '#F0F0F0' }}>
      {/* Nav */}
      <header
        className="border-b px-6 py-4 flex items-center justify-between"
        style={{ borderColor: 'rgba(255,255,255,0.08)', background: '#000000' }}
      >
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Sustenta Futuro" style={{ height: '28px', width: 'auto' }} />
          <span
            className="text-white font-semibold tracking-tight"
            style={{ fontFamily: 'var(--font-montserrat)' }}
          >
            Sustenta Futuro
          </span>
        </div>
        <div className="flex items-center gap-5">
          <button onClick={() => router.push('/')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Leads</button>
          <button onClick={() => router.push('/propuestas')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Propuestas</button>
          <button onClick={() => router.push('/proyectos')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Proyectos</button>
          <span className="text-sm font-medium" style={{ color: '#4B9BF5' }}>Usuarios</span>
          <button onClick={() => router.push('/configuracion')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Config. Landing</button>
          <button onClick={handleLogout} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Cerrar sesión</button>
        </div>
      </header>

      {/* Main */}
      <main className="px-6 py-8 max-w-5xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Usuarios</h1>
            <p className="text-sm mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>
              Gestion de usuarios internos
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-85"
            style={{ background: '#4B9BF5', color: '#ffffff' }}
          >
            Agregar usuario
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div
            className="rounded-lg px-4 py-3 text-sm mb-6"
            style={{
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.15)',
              color: '#f87171',
            }}
          >
            {error}
          </div>
        )}

        {/* Table */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Nombre', 'Email', 'Rol', 'Fecha de creacion'].map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                      style={{ color: 'rgba(240,240,240,0.35)' }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </>
                ) : profiles.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-16 text-center text-sm"
                      style={{ color: 'rgba(240,240,240,0.3)' }}
                    >
                      No hay usuarios registrados.
                    </td>
                  </tr>
                ) : (
                  profiles.map((profile, idx) => (
                    <tr
                      key={profile.id}
                      style={{
                        borderBottom:
                          idx < profiles.length - 1
                            ? '1px solid rgba(255,255,255,0.04)'
                            : 'none',
                      }}
                    >
                      <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                        {profile.full_name ?? (
                          <span style={{ color: 'rgba(240,240,240,0.25)' }}>—</span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3"
                        style={{ color: 'rgba(240,240,240,0.6)' }}
                      >
                        {profile.email}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <RoleBadge role={profile.role} />
                      </td>
                      <td
                        className="px-4 py-3 whitespace-nowrap tabular-nums"
                        style={{ color: 'rgba(240,240,240,0.45)' }}
                      >
                        {formatDate(profile.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Add user modal */}
      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleUserCreated}
          accessToken={accessToken}
        />
      )}
    </div>
  )
}
