'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

type ProposalStatus = 'draft' | 'approved' | 'sent' | 'accepted' | 'rejected'

interface LeadProposal {
  id: string
  lead_id: string
  status: ProposalStatus
  version: number
  is_principal: boolean
  title: string | null
  created_at: string
  leads: {
    full_name: string
    company: string | null
    email: string
  } | null
  lead_evaluations: {
    project_title: string | null
  } | null
}

interface LeadGroup {
  lead_id: string
  lead: LeadProposal['leads']
  count: number
  principal: LeadProposal
  latestDate: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: 'Borrador',
  approved: 'Aprobada',
  sent: 'Enviada',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
}

const STATUS_COLORS: Record<ProposalStatus, { bg: string; text: string; border: string }> = {
  draft: { bg: 'rgba(255,255,255,0.06)', text: 'rgba(240,240,240,0.5)', border: 'rgba(255,255,255,0.1)' },
  approved: { bg: 'rgba(96,165,250,0.1)', text: '#60a5fa', border: 'rgba(96,165,250,0.2)' },
  sent: { bg: 'rgba(251,191,36,0.1)', text: '#fbbf24', border: 'rgba(251,191,36,0.2)' },
  accepted: { bg: 'rgba(74,222,128,0.1)', text: '#4ade80', border: 'rgba(74,222,128,0.2)' },
  rejected: { bg: 'rgba(248,113,113,0.1)', text: '#f87171', border: 'rgba(248,113,113,0.2)' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function groupByLead(proposals: LeadProposal[]): LeadGroup[] {
  const map = new Map<string, LeadProposal[]>()
  for (const p of proposals) {
    const arr = map.get(p.lead_id) ?? []
    arr.push(p)
    map.set(p.lead_id, arr)
  }
  return Array.from(map.values())
    .map((arr) => {
      const sorted = [...arr].sort((a, b) => b.version - a.version)
      const principal = sorted.find((p) => p.is_principal) ?? sorted[0]
      return {
        lead_id: principal.lead_id,
        lead: principal.leads,
        count: arr.length,
        principal,
        latestDate: sorted[0].created_at,
      }
    })
    .sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime())
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProposalStatus }) {
  const s = STATUS_COLORS[status] ?? STATUS_COLORS.draft
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {[160, 200, 70, 90, 80].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)', width: `${w}px` }} />
        </td>
      ))}
    </tr>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function PropuestasPageInner() {
  const router = useRouter()

  const [authChecked, setAuthChecked] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [proposals, setProposals] = useState<LeadProposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const supabase = createClient()
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (!user || userError) { window.location.href = '/login'; return }

        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError || !refreshData.session) { window.location.href = '/login'; return }

        setAuthChecked(true)
        const token = refreshData.session.access_token

        const { data: roleData } = await supabase.rpc('get_my_role')
        if (roleData === 'admin') setIsAdmin(true)

        const base = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        const headers = { apikey: key, Authorization: `Bearer ${token}` }

        const res = await fetch(
          `${base}/rest/v1/lead_proposals?select=*,leads(full_name,company,email),lead_evaluations(project_title)&order=version.desc`,
          { headers }
        )

        if (!res.ok) {
          setError(`Error ${res.status}: ${await res.text()}`)
        } else {
          setProposals((await res.json()) ?? [])
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

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#000000' }}>
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    )
  }

  const groups = groupByLead(proposals)

  const Nav = (
    <header
      className="border-b px-6 py-4 flex items-center justify-between"
      style={{ borderColor: 'rgba(255,255,255,0.08)', background: '#000000' }}
    >
      <div className="flex items-center gap-2.5">
        <img src="/logo.png" alt="Sustenta Futuro" style={{ height: '28px', width: 'auto' }} />
        <span className="text-white font-semibold tracking-tight" style={{ fontFamily: 'var(--font-montserrat)' }}>
          Sustenta Futuro
        </span>
      </div>
      <div className="flex items-center gap-5">
        <button onClick={() => router.push('/')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>
          Leads
        </button>
        <span className="text-sm font-medium" style={{ color: '#4B9BF5' }}>
          Propuestas
        </span>
        <button onClick={() => router.push('/kanban')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>
          Kanban
        </button>
        {isAdmin && (
          <button onClick={() => router.push('/usuarios')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>
            Usuarios
          </button>
        )}
        {isAdmin && (
          <button onClick={() => router.push('/configuracion')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>
            Config. Landing
          </button>
        )}
        <button onClick={handleLogout} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>
          Cerrar sesion
        </button>
      </div>
    </header>
  )

  return (
    <div className="min-h-screen" style={{ background: '#000000', color: '#F0F0F0' }}>
      {Nav}

      <main className="px-6 py-8 max-w-7xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Propuestas</h1>
            <p className="text-sm mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>
              Un lead por fila — entra para ver todas sus versiones de propuesta
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

        {error && (
          <div className="rounded-lg px-4 py-3 text-sm mb-6" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)', color: '#f87171' }}>
            {error}
          </div>
        )}

        <div className="rounded-xl border overflow-hidden" style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Lead', 'Propuesta principal', 'Versiones', 'Estado', 'Fecha'].map((col) => (
                    <th key={col} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(240,240,240,0.35)' }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
                ) : groups.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center text-sm" style={{ color: 'rgba(240,240,240,0.3)' }}>
                      No hay propuestas generadas aún. Completa la ficha de evaluación de un lead para generar una.
                    </td>
                  </tr>
                ) : (
                  groups.map((g, idx) => (
                    <tr
                      key={g.lead_id}
                      onClick={() => router.push(`/propuestas/${g.lead_id}`)}
                      className="transition-colors hover:bg-white/[0.025] cursor-pointer"
                      style={{ borderBottom: idx < groups.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                    >
                      {/* Lead */}
                      <td className="px-4 py-3">
                        <p className="font-medium text-white whitespace-nowrap">{g.lead?.full_name ?? '—'}</p>
                        {g.lead?.company && (
                          <p className="text-xs mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>{g.lead.company}</p>
                        )}
                      </td>

                      {/* Propuesta principal */}
                      <td className="px-4 py-3 max-w-xs" style={{ color: 'rgba(240,240,240,0.85)' }}>
                        <span className="line-clamp-2 leading-snug">
                          {g.principal.title || g.principal.lead_evaluations?.project_title || `Versión ${g.principal.version}`}
                        </span>
                      </td>

                      {/* Versiones */}
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'rgba(240,240,240,0.6)' }}>
                        {g.count} {g.count === 1 ? 'versión' : 'versiones'}
                      </td>

                      {/* Estado (principal) */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={g.principal.status} />
                      </td>

                      {/* Fecha */}
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums" style={{ color: 'rgba(240,240,240,0.45)' }}>
                        {formatDate(g.latestDate)}
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

export default function PropuestasPage() {
  return (
    <Suspense>
      <PropuestasPageInner />
    </Suspense>
  )
}
