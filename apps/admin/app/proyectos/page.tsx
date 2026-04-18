'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type ProjectStatus = 'active' | 'en_desarrollo' | 'en_entrega' | 'completed' | 'cancelled'

interface Proyecto {
  id: string
  propuesta_id: string | null
  lead_id: string | null
  title: string
  status: ProjectStatus
  cost: number | null
  duration_weeks: number | null
  started_at: string | null
  created_at: string
  leads: { name: string; company: string | null } | null
  propuestas: { title: string } | null
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active:       'Activo',
  en_desarrollo: 'En desarrollo',
  en_entrega:   'En entrega',
  completed:    'Completado',
  cancelled:    'Cancelado',
}

const STATUS_COLORS: Record<ProjectStatus, { bg: string; text: string; border: string }> = {
  active:        { bg: 'rgba(74,222,128,0.1)',  text: '#4ade80', border: 'rgba(74,222,128,0.2)' },
  en_desarrollo: { bg: 'rgba(251,191,36,0.1)',  text: '#fbbf24', border: 'rgba(251,191,36,0.2)' },
  en_entrega:    { bg: 'rgba(168,85,247,0.1)',  text: '#c084fc', border: 'rgba(168,85,247,0.2)' },
  completed:     { bg: 'rgba(96,165,250,0.1)',  text: '#60a5fa', border: 'rgba(96,165,250,0.2)' },
  cancelled:     { bg: 'rgba(248,113,113,0.1)', text: '#f87171', border: 'rgba(248,113,113,0.2)' },
}

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value)
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export default function ProyectosPage() {
  const router = useRouter()

  const [authChecked, setAuthChecked] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [accessToken, setAccessToken] = useState<string>('')

  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [loading, setLoading] = useState(true)
  const [tableExists, setTableExists] = useState(true)

  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const supabase = createClient()
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (!user || userError) { window.location.href = '/login'; return }

        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError || !refreshData.session) { window.location.href = '/login'; return }

        const token = refreshData.session.access_token
        setAccessToken(token)

        const { data: roleData } = await supabase.rpc('get_my_role')
        if (roleData === 'admin') setIsAdmin(true)

        setAuthChecked(true)

        const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

        const res = await fetch(
          `${baseUrl}/rest/v1/proyectos?select=*,leads(name,company),propuestas(title)&order=created_at.desc`,
          {
            headers: {
              'apikey': anonKey,
              'Authorization': `Bearer ${token}`,
            },
          }
        )

        if (!res.ok) {
          const body = await res.text()
          // Detect table-not-found errors (PostgREST returns 404 or a PGRST116 code)
          if (res.status === 404 || body.includes('relation') || body.includes('does not exist') || body.includes('PGRST')) {
            setTableExists(false)
          }
          setLoading(false)
          return
        }

        const data = await res.json()
        setProyectos((data as Proyecto[]) ?? [])
      } catch {
        window.location.href = '/login'
      }
      setLoading(false)
    }
    init()
  }, [])

  async function handleStatusChange(id: string, newStatus: ProjectStatus) {
    if (updatingId) return
    setUpdatingId(id)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/proyectos?id=eq.${id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ status: newStatus }),
        }
      )
      if (res.ok) {
        const updated = await res.json()
        if (updated && updated[0]) {
          setProyectos((prev) =>
            prev.map((p) => (p.id === id ? { ...p, status: updated[0].status } : p))
          )
        }
      }
    } finally {
      setUpdatingId(null)
    }
  }

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

  return (
    <div className="min-h-screen" style={{ background: '#000000', color: '#F0F0F0' }}>
      {/* Nav */}
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
          <button onClick={() => router.push('/')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Leads</button>
          <button onClick={() => router.push('/propuestas')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Propuestas</button>
          <span className="text-sm font-medium" style={{ color: '#4B9BF5' }}>Proyectos</span>
          {isAdmin && <button onClick={() => router.push('/usuarios')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Usuarios</button>}
          {isAdmin && <button onClick={() => router.push('/configuracion')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Config. Landing</button>}
          <button onClick={handleLogout} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Cerrar sesión</button>
        </div>
      </header>

      {/* Main */}
      <main className="px-6 py-8 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Proyectos</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>
            Proyectos activos originados desde una propuesta aprobada
          </p>
        </div>

        {/* Table not yet created */}
        {!tableExists && (
          <div
            className="rounded-xl border p-12 flex flex-col items-center justify-center text-center"
            style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <div
              className="rounded-full mb-4 flex items-center justify-center"
              style={{ width: '48px', height: '48px', background: 'rgba(75,155,245,0.08)', border: '1px solid rgba(75,155,245,0.15)' }}
            >
              <span style={{ fontSize: '20px', lineHeight: 1 }}>&#9200;</span>
            </div>
            <h2 className="text-white font-medium mb-2">Modulo proximamente</h2>
            <p className="text-sm max-w-xs" style={{ color: 'rgba(240,240,240,0.35)' }}>
              La tabla de proyectos aun no ha sido creada en la base de datos. Este modulo
              estara disponible en breve.
            </p>
          </div>
        )}

        {/* Loading */}
        {tableExists && loading && (
          <div className="flex items-center justify-center py-24">
            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {tableExists && !loading && proyectos.length === 0 && (
          <div
            className="rounded-xl border p-16 flex flex-col items-center justify-center text-center"
            style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <div
              className="rounded-full mb-4 flex items-center justify-center"
              style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="3" y="3" width="14" height="14" rx="2" stroke="rgba(240,240,240,0.25)" strokeWidth="1.5" />
                <path d="M7 10h6M10 7v6" stroke="rgba(240,240,240,0.25)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="text-white font-medium mb-2">No hay proyectos activos</h2>
            <p className="text-sm max-w-sm" style={{ color: 'rgba(240,240,240,0.35)' }}>
              Los proyectos se crean automaticamente cuando una propuesta es aprobada.
            </p>
          </div>
        )}

        {/* Table */}
        {tableExists && !loading && proyectos.length > 0 && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(240,240,240,0.35)' }}>
                      Lead
                    </th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(240,240,240,0.35)' }}>
                      Proyecto
                    </th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(240,240,240,0.35)' }}>
                      Estado
                    </th>
                    <th className="text-right px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(240,240,240,0.35)' }}>
                      Costo
                    </th>
                    <th className="text-right px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(240,240,240,0.35)' }}>
                      Duracion
                    </th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(240,240,240,0.35)' }}>
                      Inicio
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {proyectos.map((p, idx) => {
                    const badge = STATUS_COLORS[p.status] ?? STATUS_COLORS.active
                    const isUpdating = updatingId === p.id
                    return (
                      <tr
                        key={p.id}
                        style={{
                          borderBottom: idx < proyectos.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        }}
                      >
                        {/* Lead */}
                        <td className="px-5 py-4">
                          <p className="font-medium text-white">{p.leads?.name ?? '—'}</p>
                          {p.leads?.company && (
                            <p className="text-xs mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>
                              {p.leads.company}
                            </p>
                          )}
                        </td>

                        {/* Title */}
                        <td className="px-5 py-4">
                          <p style={{ color: 'rgba(240,240,240,0.8)' }}>{p.title}</p>
                          {p.propuestas?.title && (
                            <p className="text-xs mt-0.5" style={{ color: 'rgba(240,240,240,0.3)' }}>
                              {p.propuestas.title}
                            </p>
                          )}
                        </td>

                        {/* Status dropdown */}
                        <td className="px-5 py-4">
                          <div className="relative inline-flex items-center gap-1.5">
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ background: badge.text }}
                            />
                            <select
                              value={p.status}
                              disabled={isUpdating}
                              onChange={(e) => handleStatusChange(p.id, e.target.value as ProjectStatus)}
                              className="text-xs font-medium rounded-md px-2 py-1 outline-none cursor-pointer transition-opacity disabled:opacity-50 appearance-none pr-5"
                              style={{
                                background: badge.bg,
                                color: badge.text,
                                border: `1px solid ${badge.border}`,
                              }}
                            >
                              {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => (
                                <option
                                  key={s}
                                  value={s}
                                  style={{ background: '#111111', color: '#F0F0F0' }}
                                >
                                  {STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                            {isUpdating && (
                              <div className="w-3 h-3 rounded-full border border-white/20 border-t-white animate-spin ml-1" />
                            )}
                          </div>
                        </td>

                        {/* Cost */}
                        <td className="px-5 py-4 text-right" style={{ color: 'rgba(240,240,240,0.7)' }}>
                          {formatCurrency(p.cost)}
                        </td>

                        {/* Duration */}
                        <td className="px-5 py-4 text-right" style={{ color: 'rgba(240,240,240,0.7)' }}>
                          {p.duration_weeks !== null && p.duration_weeks !== undefined
                            ? `${p.duration_weeks} sem.`
                            : '—'}
                        </td>

                        {/* Started at */}
                        <td className="px-5 py-4" style={{ color: 'rgba(240,240,240,0.5)' }}>
                          {formatDateShort(p.started_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
