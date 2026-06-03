'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

type ProposalStatus = 'draft' | 'approved' | 'sent' | 'accepted' | 'rejected'

interface LeadProposal {
  id: string
  lead_id: string
  evaluation_id: string | null
  pdf_storage_path: string | null
  status: ProposalStatus
  approved_by: string | null
  approved_at: string | null
  sent_at: string | null
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

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: 'Borrador',
  approved: 'Aprobada',
  sent: 'Enviada',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
}

const STATUS_COLORS: Record<ProposalStatus, { bg: string; text: string; border: string }> = {
  draft: {
    bg: 'rgba(255,255,255,0.06)',
    text: 'rgba(240,240,240,0.5)',
    border: 'rgba(255,255,255,0.1)',
  },
  approved: {
    bg: 'rgba(96,165,250,0.1)',
    text: '#60a5fa',
    border: 'rgba(96,165,250,0.2)',
  },
  sent: {
    bg: 'rgba(251,191,36,0.1)',
    text: '#fbbf24',
    border: 'rgba(251,191,36,0.2)',
  },
  accepted: {
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

const ALL_STATUSES: ProposalStatus[] = ['draft', 'approved', 'sent', 'accepted', 'rejected']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
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
      {[160, 200, 90, 60, 80].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)', width: `${w}px` }} />
        </td>
      ))}
    </tr>
  )
}

// ─── Status Dropdown ──────────────────────────────────────────────────────────

function StatusDropdown({
  proposal,
  accessToken,
  onUpdated,
}: {
  proposal: LeadProposal
  accessToken: string
  onUpdated: (updated: LeadProposal) => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSelect(newStatus: ProposalStatus) {
    if (newStatus === proposal.status || saving) return
    setOpen(false)
    setSaving(true)

    const patch: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'sent') patch.sent_at = new Date().toISOString()

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/lead_proposals?id=eq.${proposal.id}`,
        {
          method: 'PATCH',
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify(patch),
        }
      )
      if (res.ok) {
        const data = await res.json()
        const updated = data?.[0] ? { ...proposal, ...data[0] } : { ...proposal, status: newStatus }
        onUpdated(updated as LeadProposal)
      }
    } finally {
      setSaving(false)
    }
  }

  const currentStyle = STATUS_COLORS[proposal.status] ?? STATUS_COLORS.draft

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
        style={{ background: currentStyle.bg, color: currentStyle.text, border: `1px solid ${currentStyle.border}` }}
      >
        {saving && <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin inline-block" />}
        {STATUS_LABELS[proposal.status]}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
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
            const isActive = s === proposal.status
            return (
              <button
                key={s}
                onClick={() => handleSelect(s)}
                className="w-full text-left px-3 py-2 text-xs transition-colors hover:bg-white/[0.05]"
                style={{ color: isActive ? sc.text : 'rgba(240,240,240,0.7)', fontWeight: isActive ? 600 : 400 }}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

function PropuestasPageInner() {
  const router = useRouter()

  const [authChecked, setAuthChecked] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [accessToken, setAccessToken] = useState('')
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
        setAccessToken(token)

        const { data: roleData } = await supabase.rpc('get_my_role')
        if (roleData === 'admin') setIsAdmin(true)

        const base = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        const headers = { apikey: key, Authorization: `Bearer ${token}` }

        const res = await fetch(
          `${base}/rest/v1/lead_proposals?select=*,leads(full_name,company,email),lead_evaluations(project_title)&order=created_at.desc`,
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

  function handleUpdated(updated: LeadProposal) {
    setProposals((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  async function handleDownloadPDF(leadId: string) {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://sustenta-futuro-api.onrender.com'
      const res = await fetch(`${apiUrl}/leads/${leadId}/proposal/pdf`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) { alert('Error al generar el PDF'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `propuesta-${leadId.slice(0, 8)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Error al descargar el PDF')
    }
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#000000' }}>
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    )
  }

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
              Propuestas PDF generadas desde la ficha de evaluación
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
                  {['Lead', 'Proyecto', 'Estado', 'PDF', 'Fecha'].map((col) => (
                    <th key={col} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(240,240,240,0.35)' }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
                ) : proposals.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center text-sm" style={{ color: 'rgba(240,240,240,0.3)' }}>
                      No hay propuestas generadas aún. Completa la ficha de evaluación de un lead para generar una.
                    </td>
                  </tr>
                ) : (
                  proposals.map((p, idx) => (
                    <tr
                      key={p.id}
                      className="transition-colors hover:bg-white/[0.025]"
                      style={{ borderBottom: idx < proposals.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                    >
                      {/* Lead */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => router.push(`/leads/${p.lead_id}`)}
                          className="text-left hover:opacity-80 transition-opacity"
                        >
                          <p className="font-medium text-white whitespace-nowrap">{p.leads?.full_name ?? '—'}</p>
                          {p.leads?.company && (
                            <p className="text-xs mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>{p.leads.company}</p>
                          )}
                        </button>
                      </td>

                      {/* Proyecto */}
                      <td className="px-4 py-3 max-w-xs" style={{ color: 'rgba(240,240,240,0.85)' }}>
                        <span className="line-clamp-2 leading-snug">
                          {p.lead_evaluations?.project_title ?? '—'}
                        </span>
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusDropdown proposal={p} accessToken={accessToken} onUpdated={handleUpdated} />
                      </td>

                      {/* PDF */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => handleDownloadPDF(p.lead_id)}
                          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80"
                          style={{ background: 'rgba(75,155,245,0.08)', border: '1px solid rgba(75,155,245,0.15)', color: '#4B9BF5' }}
                        >
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                          </svg>
                          Descargar
                        </button>
                      </td>

                      {/* Fecha */}
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums" style={{ color: 'rgba(240,240,240,0.45)' }}>
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

export default function PropuestasPage() {
  return (
    <Suspense>
      <PropuestasPageInner />
    </Suspense>
  )
}
