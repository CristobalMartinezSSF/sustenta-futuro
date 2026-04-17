'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

type PropuestaStatus = 'reviewing' | 'sent' | 'approved' | 'rejected'

interface Lead {
  id: string
  name: string
  company: string | null
  email: string
}

interface Propuesta {
  id: string
  lead_id: string
  title: string
  description: string | null
  status: PropuestaStatus
  cost: number | null
  duration_weeks: number | null
  stack: string | null
  functionalities: string | null
  implementation_plan: string | null
  payment_method: string | null
  created_at: string
  updated_at: string | null
  leads: {
    name: string
    company: string | null
    email: string
  } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<PropuestaStatus, string> = {
  reviewing: 'En revisión',
  sent: 'Enviada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
}

const STATUS_COLORS: Record<PropuestaStatus, { bg: string; text: string; border: string }> = {
  reviewing: {
    bg: 'rgba(96,165,250,0.1)',
    text: '#60a5fa',
    border: 'rgba(96,165,250,0.2)',
  },
  sent: {
    bg: 'rgba(251,191,36,0.1)',
    text: '#fbbf24',
    border: 'rgba(251,191,36,0.2)',
  },
  approved: {
    bg: 'rgba(74,222,128,0.1)',
    text: '#4ade80',
    border: 'rgba(74,222,128,0.2)',
  },
  rejected: {
    bg: 'rgba(248,113,113,0.1)',
    text: '#f87171',
    border: 'rgba(248,113,113,0.2)',
  },
}

const ALL_STATUSES: PropuestaStatus[] = ['reviewing', 'sent', 'approved', 'rejected']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function formatCost(value: number | null): string {
  if (value == null) return '—'
  return '$' + Math.round(value).toLocaleString('es-CL')
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PropuestaStatus }) {
  const s = STATUS_COLORS[status] ?? STATUS_COLORS.reviewing
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
      style={{
        background: s.bg,
        color: s.text,
        border: `1px solid ${s.border}`,
      }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {[140, 160, 90, 80, 70, 80].map((w, i) => (
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

// ─── Status Dropdown ──────────────────────────────────────────────────────────

function StatusDropdown({
  propuesta,
  accessToken,
  onUpdated,
}: {
  propuesta: Propuesta
  accessToken: string
  onUpdated: (updated: Propuesta) => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSelect(newStatus: PropuestaStatus) {
    if (newStatus === propuesta.status || saving) return
    setOpen(false)
    setSaving(true)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/propuestas?id=eq.${propuesta.id}`,
        {
          method: 'PATCH',
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({ status: newStatus, updated_at: new Date().toISOString() }),
        }
      )
      if (res.ok) {
        const data = await res.json()
        const updated = data && data[0] ? { ...propuesta, ...data[0] } : { ...propuesta, status: newStatus }

        // If approving, create a project automatically
        if (newStatus === 'approved') {
          await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/proyectos`, {
            method: 'POST',
            headers: {
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({
              propuesta_id: propuesta.id,
              lead_id: propuesta.lead_id,
              title: propuesta.title,
              status: 'active',
              cost: propuesta.cost,
              duration_weeks: propuesta.duration_weeks,
            }),
          })
        }

        onUpdated(updated as Propuesta)
      }
    } finally {
      setSaving(false)
    }
  }

  const currentStyle = STATUS_COLORS[propuesta.status] ?? STATUS_COLORS.reviewing

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
        style={{
          background: currentStyle.bg,
          color: currentStyle.text,
          border: `1px solid ${currentStyle.border}`,
        }}
      >
        {saving ? (
          <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin inline-block" />
        ) : null}
        {STATUS_LABELS[propuesta.status]}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="currentColor"
          style={{ opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 rounded-xl border shadow-2xl z-20 py-1 min-w-[140px]"
          style={{ background: '#111111', borderColor: 'rgba(255,255,255,0.1)', top: '100%' }}
        >
          {ALL_STATUSES.map((s) => {
            const sc = STATUS_COLORS[s]
            const isActive = s === propuesta.status
            return (
              <button
                key={s}
                onClick={() => handleSelect(s)}
                className="w-full text-left px-3 py-2 text-xs transition-colors hover:bg-white/[0.05]"
                style={{
                  color: isActive ? sc.text : 'rgba(240,240,240,0.7)',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {STATUS_LABELS[s]}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Create Propuesta Modal ───────────────────────────────────────────────────

interface CreateForm {
  lead_id: string
  title: string
  description: string
  stack: string
  functionalities: string
  implementation_plan: string
  cost: string
  duration_weeks: string
  payment_method: string
}

const EMPTY_FORM: CreateForm = {
  lead_id: '',
  title: '',
  description: '',
  stack: '',
  functionalities: '',
  implementation_plan: '',
  cost: '',
  duration_weeks: '',
  payment_method: '',
}

function CreatePropuestaModal({
  leads,
  accessToken,
  onClose,
  onCreated,
}: {
  leads: Lead[]
  accessToken: string
  onClose: () => void
  onCreated: (p: Propuesta) => void
}) {
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function set<K extends keyof CreateForm>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.lead_id || !form.title.trim()) return
    setFormError(null)
    setSubmitting(true)

    const payload: Record<string, unknown> = {
      lead_id: form.lead_id,
      title: form.title.trim(),
      status: 'reviewing',
    }
    if (form.description.trim()) payload.description = form.description.trim()
    if (form.stack.trim()) payload.stack = form.stack.trim()
    if (form.functionalities.trim()) payload.functionalities = form.functionalities.trim()
    if (form.implementation_plan.trim()) payload.implementation_plan = form.implementation_plan.trim()
    if (form.payment_method.trim()) payload.payment_method = form.payment_method.trim()
    const costNum = parseFloat(form.cost.replace(/[^0-9.]/g, ''))
    if (!isNaN(costNum)) payload.cost = costNum
    const weeksNum = parseInt(form.duration_weeks, 10)
    if (!isNaN(weeksNum)) payload.duration_weeks = weeksNum

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/propuestas`, {
        method: 'POST',
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.text()
        setFormError(`Error al crear propuesta: ${body}`)
        return
      }

      const data = await res.json()
      if (data && data[0]) {
        // Attach lead data from local state
        const matchedLead = leads.find((l) => l.id === form.lead_id) ?? null
        const created: Propuesta = {
          ...data[0],
          leads: matchedLead
            ? { name: matchedLead.name, company: matchedLead.company, email: matchedLead.email }
            : null,
        }
        onCreated(created)
      }
    } catch {
      setFormError('Error inesperado. Intenta nuevamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: '#111111',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#F0F0F0',
  }

  const labelStyle: React.CSSProperties = { color: 'rgba(240,240,240,0.6)' }

  function Field({
    label,
    required,
    children,
  }: {
    label: string
    required?: boolean
    children: React.ReactNode
  }) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-xs" style={labelStyle}>
          {label}
          {required && <span style={{ color: '#f87171' }}> *</span>}
        </label>
        {children}
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.8)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-xl rounded-xl border shadow-2xl"
        style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.1)' }}
      >
        {/* Modal header */}
        <div
          className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <h2 className="text-base font-semibold text-white">Crear propuesta</h2>
          <button
            onClick={onClose}
            className="text-lg leading-none transition-opacity hover:opacity-60"
            style={{ color: 'rgba(240,240,240,0.4)' }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Modal body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          {/* Lead */}
          <Field label="Lead" required>
            <select
              required
              value={form.lead_id}
              onChange={(e) => set('lead_id', e.target.value)}
              className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#4B9BF5]/40"
              style={{ ...inputStyle, appearance: 'none' }}
            >
              <option value="" style={{ background: '#111111' }}>
                Seleccionar lead...
              </option>
              {leads.map((l) => (
                <option key={l.id} value={l.id} style={{ background: '#111111' }}>
                  {l.name}
                  {l.company ? ` — ${l.company}` : ''}
                </option>
              ))}
            </select>
          </Field>

          {/* Título */}
          <Field label="Título" required>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#4B9BF5]/40"
              style={inputStyle}
              placeholder="Ej: Plataforma de gestión de residuos"
            />
          </Field>

          {/* Descripción */}
          <Field label="Descripción">
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className="rounded-lg px-3 py-2 text-sm outline-none resize-none focus:ring-1 focus:ring-[#4B9BF5]/40"
              style={inputStyle}
              placeholder="Descripción general del proyecto..."
            />
          </Field>

          {/* Stack */}
          <Field label="Stack tecnológico">
            <input
              type="text"
              value={form.stack}
              onChange={(e) => set('stack', e.target.value)}
              className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#4B9BF5]/40"
              style={inputStyle}
              placeholder="Ej: Next.js, FastAPI, Supabase, Tailwind"
            />
          </Field>

          {/* Funcionalidades */}
          <Field label="Funcionalidades">
            <textarea
              rows={3}
              value={form.functionalities}
              onChange={(e) => set('functionalities', e.target.value)}
              className="rounded-lg px-3 py-2 text-sm outline-none resize-none focus:ring-1 focus:ring-[#4B9BF5]/40"
              style={inputStyle}
              placeholder="Lista de funcionalidades principales..."
            />
          </Field>

          {/* Plan de implementación */}
          <Field label="Plan de implementación">
            <textarea
              rows={3}
              value={form.implementation_plan}
              onChange={(e) => set('implementation_plan', e.target.value)}
              className="rounded-lg px-3 py-2 text-sm outline-none resize-none focus:ring-1 focus:ring-[#4B9BF5]/40"
              style={inputStyle}
              placeholder="Fases del proyecto, hitos, entregables..."
            />
          </Field>

          {/* Costo + Duración */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Costo estimado (CLP)">
              <input
                type="text"
                value={form.cost}
                onChange={(e) => set('cost', e.target.value)}
                className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#4B9BF5]/40"
                style={inputStyle}
                placeholder="Ej: 4500000"
              />
            </Field>
            <Field label="Duración (semanas)">
              <input
                type="number"
                min="1"
                value={form.duration_weeks}
                onChange={(e) => set('duration_weeks', e.target.value)}
                className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#4B9BF5]/40"
                style={inputStyle}
                placeholder="Ej: 12"
              />
            </Field>
          </div>

          {/* Método de pago */}
          <Field label="Método de pago">
            <input
              type="text"
              value={form.payment_method}
              onChange={(e) => set('payment_method', e.target.value)}
              className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#4B9BF5]/40"
              style={inputStyle}
              placeholder="Ej: 50% anticipo, 50% al entregar"
            />
          </Field>

          {/* Estado inicial (read-only display) */}
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs"
            style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)' }}
          >
            <span style={{ color: 'rgba(240,240,240,0.5)' }}>Estado inicial:</span>
            <StatusBadge status="reviewing" />
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

          {/* Actions */}
          <div
            className="flex justify-end gap-2 pt-2"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
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
              disabled={submitting || !form.lead_id || !form.title.trim()}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
              style={{ background: '#4B9BF5', color: '#ffffff' }}
            >
              {submitting && (
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              )}
              {submitting ? 'Creando...' : 'Crear propuesta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PropuestasPage() {
  const router = useRouter()

  const [authChecked, setAuthChecked] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [accessToken, setAccessToken] = useState('')

  const [propuestas, setPropuestas] = useState<Propuesta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tableUnavailable, setTableUnavailable] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        const supabase = createClient()

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()
        if (!user || userError) {
          window.location.href = '/login'
          return
        }

        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError || !refreshData.session) {
          window.location.href = '/login'
          return
        }

        setAuthChecked(true)
        const token = refreshData.session.access_token
        setAccessToken(token)

        const { data: roleData } = await supabase.rpc('get_my_role')
        if (roleData === 'admin') setIsAdmin(true)

        const base = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        const headers = { apikey: key, Authorization: `Bearer ${token}` }

        // Fetch propuestas with lead join
        const propRes = await fetch(
          `${base}/rest/v1/propuestas?select=*,leads(name,company,email)&order=created_at.desc`,
          { headers }
        )

        if (!propRes.ok) {
          const body = await propRes.text()
          // 404 or "relation does not exist" → show friendly unavailable state
          if (
            propRes.status === 404 ||
            propRes.status === 400 ||
            body.includes('does not exist') ||
            body.includes('relation') ||
            body.includes('42P01')
          ) {
            setTableUnavailable(true)
          } else {
            setError(`Error ${propRes.status}: ${body}`)
          }
        } else {
          const propData = await propRes.json()
          setPropuestas((propData as Propuesta[]) ?? [])

          }
      } catch {
        window.location.href = '/login'
      }
      setLoading(false)
    }

    init()
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function handlePropuestaUpdated(updated: Propuesta) {
    setPropuestas((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  // ── Loading / auth gate ──────────────────────────────────────────────────

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#000000' }}>
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    )
  }

  // ── Nav (shared) ─────────────────────────────────────────────────────────

  const Nav = (
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
        <button
          onClick={() => router.push('/')}
          className="text-sm transition-opacity hover:opacity-70"
          style={{ color: 'rgba(240,240,240,0.5)' }}
        >
          Leads
        </button>
        <span className="text-sm font-medium" style={{ color: '#4B9BF5' }}>
          Propuestas
        </span>
        <button
          onClick={() => router.push('/proyectos')}
          className="text-sm transition-opacity hover:opacity-70"
          style={{ color: 'rgba(240,240,240,0.5)' }}
        >
          Proyectos
        </button>
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
            Config. Landing
          </button>
        )}
        <button
          onClick={handleLogout}
          className="text-sm transition-opacity hover:opacity-70"
          style={{ color: 'rgba(240,240,240,0.5)' }}
        >
          Cerrar sesion
        </button>
      </div>
    </header>
  )

  // ── Table unavailable state ───────────────────────────────────────────────

  if (tableUnavailable) {
    return (
      <div className="min-h-screen" style={{ background: '#000000', color: '#F0F0F0' }}>
        {Nav}
        <main className="px-6 py-8 max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-white">Propuestas</h1>
            <p className="text-sm mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>
              Propuestas formales generadas desde leads
            </p>
          </div>
          <div
            className="rounded-xl border p-16 flex flex-col items-center justify-center text-center"
            style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
              style={{ background: 'rgba(75,155,245,0.08)', border: '1px solid rgba(75,155,245,0.12)' }}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#4B9BF5" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3-10.5H21M3 3h9M3 21h18M9 6h6M9 9h6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18V3H3z" />
              </svg>
            </div>
            <h2 className="text-white font-medium mb-2">Proxima disponibilidad</h2>
            <p className="text-sm max-w-sm" style={{ color: 'rgba(240,240,240,0.4)' }}>
              La sección de propuestas estará disponible en breve. Contacta al administrador para activar la
              base de datos.
            </p>
          </div>
        </main>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: '#000000', color: '#F0F0F0' }}>
      {Nav}

      <main className="px-6 py-8 max-w-7xl mx-auto">
        {/* Page header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Propuestas</h1>
            <p className="text-sm mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>
              Propuestas formales generadas desde leads
            </p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="flex-shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-85"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(240,240,240,0.8)' }}
          >
            ← Ir a Leads
          </button>
        </div>

        {/* Error banner */}
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
                  {['Lead', 'Titulo', 'Estado', 'Costo', 'Duracion', 'Fecha'].map((col) => (
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
                    <SkeletonRow />
                  </>
                ) : propuestas.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-16 text-center text-sm"
                      style={{ color: 'rgba(240,240,240,0.3)' }}
                    >
                      No hay propuestas registradas aun.
                    </td>
                  </tr>
                ) : (
                  propuestas.map((p, idx) => (
                    <tr
                      key={p.id}
                      className="transition-colors hover:bg-white/[0.025]"
                      style={{
                        borderBottom:
                          idx < propuestas.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      }}
                    >
                      {/* Lead */}
                      <td className="px-4 py-3">
                        <p className="font-medium text-white whitespace-nowrap">
                          {p.leads?.name ?? '—'}
                        </p>
                        {p.leads?.company && (
                          <p className="text-xs mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>
                            {p.leads.company}
                          </p>
                        )}
                      </td>

                      {/* Titulo */}
                      <td
                        className="px-4 py-3 max-w-xs"
                        style={{ color: 'rgba(240,240,240,0.85)' }}
                      >
                        <span className="line-clamp-2 leading-snug">{p.title}</span>
                      </td>

                      {/* Estado con dropdown */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusDropdown
                          propuesta={p}
                          accessToken={accessToken}
                          onUpdated={handlePropuestaUpdated}
                        />
                      </td>

                      {/* Costo */}
                      <td
                        className="px-4 py-3 whitespace-nowrap tabular-nums"
                        style={{ color: p.cost != null ? 'rgba(240,240,240,0.75)' : 'rgba(240,240,240,0.25)' }}
                      >
                        {formatCost(p.cost)}
                      </td>

                      {/* Duracion */}
                      <td
                        className="px-4 py-3 whitespace-nowrap"
                        style={{ color: p.duration_weeks != null ? 'rgba(240,240,240,0.75)' : 'rgba(240,240,240,0.25)' }}
                      >
                        {p.duration_weeks != null ? `${p.duration_weeks} sem.` : '—'}
                      </td>

                      {/* Fecha */}
                      <td
                        className="px-4 py-3 whitespace-nowrap tabular-nums"
                        style={{ color: 'rgba(240,240,240,0.45)' }}
                      >
                        {formatDate(p.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

    </div>
  )
}
