'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type LeadStatus =
  | 'new'
  | 'reviewing'
  | 'contacted'
  | 'qualified'
  | 'proposal_pending'
  | 'won'
  | 'lost'

interface Lead {
  id: string
  name: string
  company: string | null
  email: string
  status: LeadStatus
  created_at: string
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Sin iniciar',
  reviewing: 'Esperando reunión',
  contacted: 'En prototipado',
  qualified: 'En propuesta',
  proposal_pending: 'En desarrollo',
  won: 'Completado',
  lost: 'Cancelado',
}

const STATUS_COLORS: Record<LeadStatus, { bg: string; text: string; border: string }> = {
  new: {
    bg: 'rgba(100,100,100,0.12)',
    text: '#9ca3af',
    border: 'rgba(100,100,100,0.2)',
  },
  reviewing: {
    bg: 'rgba(59,130,246,0.1)',
    text: '#60a5fa',
    border: 'rgba(59,130,246,0.2)',
  },
  contacted: {
    bg: 'rgba(234,179,8,0.1)',
    text: '#fbbf24',
    border: 'rgba(234,179,8,0.2)',
  },
  qualified: {
    bg: 'rgba(168,85,247,0.1)',
    text: '#c084fc',
    border: 'rgba(168,85,247,0.2)',
  },
  proposal_pending: {
    bg: 'rgba(249,115,22,0.1)',
    text: '#fb923c',
    border: 'rgba(249,115,22,0.2)',
  },
  won: {
    bg: 'rgba(34,197,94,0.1)',
    text: '#4ade80',
    border: 'rgba(34,197,94,0.2)',
  },
  lost: {
    bg: 'rgba(239,68,68,0.1)',
    text: '#f87171',
    border: 'rgba(239,68,68,0.2)',
  },
}

type LeanPhase = 'PLANIFICAR' | 'CONSTRUIR' | 'CONTINUAR' | '—'

const LEAN_PHASE: Record<LeadStatus, LeanPhase> = {
  new: '—',
  reviewing: 'PLANIFICAR',
  contacted: 'PLANIFICAR',
  qualified: 'PLANIFICAR',
  proposal_pending: 'CONSTRUIR',
  won: 'CONTINUAR',
  lost: '—',
}

const LEAN_COLORS: Record<LeanPhase, { bg: string; text: string; border: string }> = {
  PLANIFICAR: {
    bg: 'rgba(59,130,246,0.1)',
    text: '#60a5fa',
    border: 'rgba(59,130,246,0.2)',
  },
  CONSTRUIR: {
    bg: 'rgba(234,179,8,0.1)',
    text: '#fbbf24',
    border: 'rgba(234,179,8,0.2)',
  },
  CONTINUAR: {
    bg: 'rgba(34,197,94,0.1)',
    text: '#4ade80',
    border: 'rgba(34,197,94,0.2)',
  },
  '—': {
    bg: 'transparent',
    text: 'rgba(240,240,240,0.3)',
    border: 'transparent',
  },
}

function Badge({
  label,
  style,
}: {
  label: string
  style: { bg: string; text: string; border: string }
}) {
  if (label === '—') {
    return (
      <span style={{ color: style.text }} className="text-xs">
        —
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
      style={{
        background: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
      }}
    >
      {label}
    </span>
  )
}

function SkeletonRow() {
  return (
    <tr>
      {[...Array(6)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className="h-4 rounded animate-pulse"
            style={{
              background: 'rgba(255,255,255,0.06)',
              width: i === 0 ? '120px' : i === 1 ? '100px' : i === 4 ? '80px' : '140px',
            }}
          />
        </td>
      ))}
    </tr>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

// --- Create Project Modal ---

interface CreateLeadForm {
  name: string
  email: string
  phone: string
  company: string
  message: string
  status: LeadStatus
}

function CreateProjectModal({
  onClose,
  onCreated,
  accessToken,
}: {
  onClose: () => void
  onCreated: (lead: Lead) => void
  accessToken: string
}) {
  const [form, setForm] = useState<CreateLeadForm>({
    name: '',
    email: '',
    phone: '',
    company: '',
    message: '',
    status: 'new',
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function set<K extends keyof CreateLeadForm>(key: K, value: CreateLeadForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim()) return
    setFormError(null)
    setSubmitting(true)

    const payload: Record<string, string> = {
      name: form.name.trim(),
      email: form.email.trim(),
      status: form.status,
    }
    if (form.phone.trim()) payload.phone = form.phone.trim()
    if (form.company.trim()) payload.company = form.company.trim()
    if (form.message.trim()) payload.message = form.message.trim()

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/leads`,
        {
          method: 'POST',
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(payload),
        }
      )

      if (!res.ok) {
        const body = await res.text()
        setFormError(`Error al crear proyecto: ${body}`)
        return
      }

      const data = await res.json()
      if (data && data[0]) {
        onCreated(data[0] as Lead)
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-xl border p-6 shadow-2xl"
        style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.1)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Crear proyecto</h2>
          <button
            onClick={onClose}
            className="text-lg leading-none transition-opacity hover:opacity-60"
            style={{ color: 'rgba(240,240,240,0.4)' }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Nombre */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={labelStyle}>
                Nombre <span style={{ color: '#f87171' }}>*</span>
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#4B9BF5]/40"
                style={inputStyle}
                placeholder="Juan Pérez"
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
                placeholder="juan@empresa.cl"
              />
            </div>

            {/* Telefono */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={labelStyle}>Telefono</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#4B9BF5]/40"
                style={inputStyle}
                placeholder="+56 9 1234 5678"
              />
            </div>

            {/* Empresa */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={labelStyle}>Empresa</label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => set('company', e.target.value)}
                className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#4B9BF5]/40"
                style={inputStyle}
                placeholder="Empresa S.A."
              />
            </div>
          </div>

          {/* Mensaje */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs" style={labelStyle}>Mensaje</label>
            <textarea
              value={form.message}
              onChange={(e) => set('message', e.target.value)}
              rows={3}
              className="rounded-lg px-3 py-2 text-sm outline-none resize-none focus:ring-1 focus:ring-[#4B9BF5]/40"
              style={inputStyle}
              placeholder="Descripcion del proyecto..."
            />
          </div>

          {/* Estado inicial */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs" style={labelStyle}>Estado inicial</label>
            <select
              value={form.status}
              onChange={(e) => set('status', e.target.value as LeadStatus)}
              className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#4B9BF5]/40"
              style={{ ...inputStyle, appearance: 'none' }}
            >
              {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((s) => (
                <option key={s} value={s} style={{ background: '#111111' }}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
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
              disabled={submitting || !form.name.trim() || !form.email.trim()}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
              style={{ background: '#4B9BF5', color: '#ffffff' }}
            >
              {submitting ? 'Creando...' : 'Crear proyecto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- Dashboard ---

export default function DashboardPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [accessToken, setAccessToken] = useState<string>('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

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
        if (!refreshError && refreshData.session) {
          setAuthChecked(true)
          setAccessToken(refreshData.session.access_token)

          // Check role for conditional nav
          const { data: roleData } = await supabase.rpc('get_my_role')
          if (roleData === 'admin') setIsAdmin(true)

          const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/leads?select=id,name,company,email,status,created_at&order=created_at.desc`
          const res = await fetch(url, {
            headers: {
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              'Authorization': `Bearer ${refreshData.session.access_token}`,
            },
          })

          if (!res.ok) {
            const body = await res.text()
            setError(`Error ${res.status}: ${body}`)
          } else {
            const data = await res.json()
            setLeads((data as Lead[]) ?? [])
          }
        } else {
          window.location.href = '/login'
          return
        }
      } catch {
        window.location.href = '/login'
      }
      setLoading(false)
    }

    init()
  }, [])

  if (!authChecked) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#000000' }}>
      <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
    </div>
  )

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function handleLeadCreated(newLead: Lead) {
    setLeads((prev) => [newLead, ...prev])
    setShowCreateModal(false)
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
          {isAdmin && (
            <button
              onClick={() => router.push('/usuarios')}
              className="text-sm transition-opacity hover:opacity-70"
              style={{ color: 'rgba(240,240,240,0.5)' }}
            >
              Usuarios
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => router.push('/configuracion')}
              className="text-sm transition-opacity hover:opacity-70"
              style={{ color: 'rgba(240,240,240,0.5)' }}
            >
              Configuración
            </button>
          )}
          <button
            onClick={handleLogout}
            className="text-sm transition-opacity hover:opacity-70"
            style={{ color: 'rgba(240,240,240,0.5)' }}
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="px-6 py-8 max-w-7xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Proyectos</h1>
            <p className="text-sm mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>
              Solicitudes recibidas desde el sitio web
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex-shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-85"
            style={{ background: '#4B9BF5', color: '#ffffff' }}
          >
            Crear proyecto
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

        {/* Table container */}
        <div
          className="rounded-xl border overflow-hidden"
          style={{
            background: '#0a0a0a',
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Nombre', 'Empresa', 'Email', 'Estado', 'Fase Lean', 'Fecha'].map(
                    (col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                        style={{ color: 'rgba(240,240,240,0.35)' }}
                      >
                        {col}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </>
                ) : leads.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-16 text-center text-sm"
                      style={{ color: 'rgba(240,240,240,0.3)' }}
                    >
                      No hay proyectos registrados aún.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead, idx) => {
                    const status = (lead.status ?? 'new') as LeadStatus
                    const statusLabel = STATUS_LABELS[status] ?? status
                    const statusStyle = STATUS_COLORS[status] ?? STATUS_COLORS.new
                    const leanPhase = LEAN_PHASE[status] ?? '—'
                    const leanStyle = LEAN_COLORS[leanPhase]

                    return (
                      <tr
                        key={lead.id}
                        onClick={() => router.push(`/leads/${lead.id}`)}
                        style={{
                          borderBottom:
                            idx < leads.length - 1
                              ? '1px solid rgba(255,255,255,0.04)'
                              : 'none',
                          cursor: 'pointer',
                        }}
                        className="transition-colors hover:bg-white/[0.03]"
                      >
                        <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                          {lead.name}
                        </td>
                        <td
                          className="px-4 py-3 whitespace-nowrap"
                          style={{ color: 'rgba(240,240,240,0.6)' }}
                        >
                          {lead.company ?? '—'}
                        </td>
                        <td
                          className="px-4 py-3"
                          style={{ color: 'rgba(240,240,240,0.6)' }}
                        >
                          {lead.email}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge label={statusLabel} style={statusStyle} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge label={leanPhase} style={leanStyle} />
                        </td>
                        <td
                          className="px-4 py-3 whitespace-nowrap tabular-nums"
                          style={{ color: 'rgba(240,240,240,0.45)' }}
                        >
                          {formatDate(lead.created_at)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Create project modal */}
      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleLeadCreated}
          accessToken={accessToken}
        />
      )}
    </div>
  )
}
