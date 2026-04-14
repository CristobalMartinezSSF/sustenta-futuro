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

export default function DashboardPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const supabase = createClient()

      // Check auth first
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      // Fetch leads
      const { data, error: fetchError } = await supabase
        .from('leads')
        .select('id, name, company, email, status, created_at')
        .order('created_at', { ascending: false })

      if (fetchError) {
        setError(`Error al cargar proyectos: ${fetchError.message} (code: ${fetchError.code})`)
      } else {
        setLeads((data as Lead[]) ?? [])
      }
      setLoading(false)
    }

    init()
  }, [router])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen" style={{ background: '#000000', color: '#F0F0F0' }}>
      {/* Nav */}
      <header
        className="border-b px-6 py-4 flex items-center justify-between"
        style={{ borderColor: 'rgba(255,255,255,0.08)', background: '#000000' }}
      >
        <span className="text-white font-semibold tracking-tight">
          Sustenta Futuro
        </span>
        <button
          onClick={handleLogout}
          className="text-sm transition-opacity hover:opacity-70"
          style={{ color: 'rgba(240,240,240,0.5)' }}
        >
          Cerrar sesión
        </button>
      </header>

      {/* Main */}
      <main className="px-6 py-8 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Proyectos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>
            Solicitudes recibidas desde el sitio web
          </p>
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
                        style={{
                          borderBottom:
                            idx < leads.length - 1
                              ? '1px solid rgba(255,255,255,0.04)'
                              : 'none',
                        }}
                        className="transition-colors hover:bg-white/[0.02]"
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
    </div>
  )
}
