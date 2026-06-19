'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

type ProjectStatus = 'active' | 'paused' | 'done' | 'cancelled'

interface Project {
  id: string
  name: string
  status: ProjectStatus
  started_at: string
  created_at: string
  leads: {
    full_name: string
    company: string | null
  } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Activo',
  paused: 'Pausado',
  done: 'Terminado',
  cancelled: 'Cancelado',
}

const STATUS_COLORS: Record<ProjectStatus, { bg: string; text: string; border: string }> = {
  active: { bg: 'rgba(74,222,128,0.1)', text: '#4ade80', border: 'rgba(74,222,128,0.2)' },
  paused: { bg: 'rgba(251,191,36,0.1)', text: '#fbbf24', border: 'rgba(251,191,36,0.2)' },
  done: { bg: 'rgba(96,165,250,0.1)', text: '#60a5fa', border: 'rgba(96,165,250,0.2)' },
  cancelled: { bg: 'rgba(248,113,113,0.1)', text: '#f87171', border: 'rgba(248,113,113,0.2)' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const s = STATUS_COLORS[status] ?? STATUS_COLORS.active
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function SkeletonRow() {
  return (
    <tr>
      {[200, 160, 80, 80].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)', width: `${w}px` }} />
        </td>
      ))}
    </tr>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ProyectosPageInner() {
  const router = useRouter()

  const [authChecked, setAuthChecked] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
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
          `${base}/rest/v1/projects?select=id,name,status,started_at,created_at,leads(full_name,company)&order=created_at.desc`,
          { headers }
        )

        if (!res.ok) {
          setError(`Error ${res.status}: ${await res.text()}`)
        } else {
          setProjects((await res.json()) ?? [])
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
        <button onClick={() => router.push('/propuestas')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>
          Propuestas
        </button>
        <span className="text-sm font-medium" style={{ color: '#4B9BF5' }}>
          Proyectos
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
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Proyectos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>
            Propuestas ganadas en desarrollo — entra para ver el tablero de cada proyecto
          </p>
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
                  {['Proyecto', 'Cliente', 'Estado', 'Inicio'].map((col) => (
                    <th key={col} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(240,240,240,0.35)' }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
                ) : projects.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-16 text-center text-sm" style={{ color: 'rgba(240,240,240,0.3)' }}>
                      Aún no hay proyectos. Convierte una propuesta ganada en proyecto desde su ficha de propuestas.
                    </td>
                  </tr>
                ) : (
                  projects.map((p, idx) => (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/kanban?project=${p.id}`)}
                      className="transition-colors hover:bg-white/[0.025] cursor-pointer"
                      style={{ borderBottom: idx < projects.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                    >
                      <td className="px-4 py-3 max-w-xs">
                        <span className="font-medium text-white line-clamp-2 leading-snug">{p.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-white whitespace-nowrap">{p.leads?.full_name ?? '—'}</p>
                        {p.leads?.company && (
                          <p className="text-xs mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>{p.leads.company}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap tabular-nums" style={{ color: 'rgba(240,240,240,0.45)' }}>
                        {formatDate(p.started_at)}
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

export default function ProyectosPage() {
  return (
    <Suspense>
      <ProyectosPageInner />
    </Suspense>
  )
}
