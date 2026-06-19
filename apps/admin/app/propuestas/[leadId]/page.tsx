'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

type ProposalStatus = 'draft' | 'approved' | 'sent' | 'accepted' | 'rejected'

interface Snapshot {
  evaluation?: Record<string, unknown> | null
  notes?: Array<{ content: string; created_at: string; created_by: string | null }> | null
  lead?: { full_name?: string; company?: string | null; email?: string } | null
  captured_at?: string
}

interface Proposal {
  id: string
  lead_id: string
  status: ProposalStatus
  version: number
  is_principal: boolean
  title: string | null
  snapshot: Snapshot | null
  created_at: string
}

interface Lead {
  id: string
  full_name: string
  company: string | null
  email: string
}

interface Attachment {
  path: string
  name: string
  mime: string
  size: number
}

interface ChatMessage {
  id: string
  proposal_id: string
  author_id: string | null
  author_name: string | null
  body: string | null
  attachments: Attachment[] | null
  created_at: string
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

const ALL_STATUSES: ProposalStatus[] = ['draft', 'approved', 'sent', 'accepted', 'rejected']

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://sustenta-futuro-api.onrender.com'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function money(v: unknown, currency: unknown): string {
  if (v == null || v === '') return '—'
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isNaN(n)) return String(v)
  return `${n.toLocaleString('es-CL')} ${String(currency ?? 'UF')}`
}

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${formatDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120)
}

// ─── Discussion thread (per proposal version) ──────────────────────────────────

function ProposalChat({
  proposalId,
  currentUser,
}: {
  proposalId: string
  currentUser: { id: string; name: string } | null
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const BUCKET = 'proposal-attachments'

  async function loadMessages() {
    setLoading(true)
    try {
      const sb = createClient()
      const { data: { session } } = await sb.auth.getSession()
      const token = session?.access_token ?? ''
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      const res = await fetch(
        `${base}/rest/v1/proposal_messages?proposal_id=eq.${proposalId}&order=created_at.asc`,
        { headers: { apikey: key, Authorization: `Bearer ${token}` } }
      )
      const rows: ChatMessage[] = res.ok ? ((await res.json()) ?? []) : []
      setMessages(rows)

      const paths = rows.flatMap((m) => (m.attachments ?? []).map((a) => a.path))
      if (paths.length) {
        const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600)
        const map: Record<string, string> = {}
        ;(data ?? []).forEach((d) => {
          if (d.path && d.signedUrl) map[d.path] = d.signedUrl
        })
        setUrls(map)
      } else {
        setUrls({})
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId])

  async function handleSend() {
    if ((!text.trim() && files.length === 0) || sending) return
    setSending(true)
    try {
      const sb = createClient()
      const uploaded: Attachment[] = []
      for (const f of files) {
        const path = `${proposalId}/${crypto.randomUUID()}-${safeName(f.name)}`
        const { error } = await sb.storage.from(BUCKET).upload(path, f, { upsert: false })
        if (error) {
          alert(`No se pudo subir ${f.name}: ${error.message}`)
          continue
        }
        uploaded.push({ path, name: f.name, mime: f.type, size: f.size })
      }

      const { data: { session } } = await sb.auth.getSession()
      const token = session?.access_token ?? ''
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      const res = await fetch(`${base}/rest/v1/proposal_messages`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          proposal_id: proposalId,
          author_id: currentUser?.id ?? null,
          author_name: currentUser?.name ?? 'Equipo',
          body: text.trim() || null,
          attachments: uploaded,
        }),
      })
      if (!res.ok) {
        alert(`No se pudo enviar el mensaje (error ${res.status}).`)
        return
      }
      setText('')
      setFiles([])
      await loadMessages()
    } catch {
      alert('Error de red al enviar el mensaje. Reintenta en unos segundos.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(240,240,240,0.35)' }}>
        Conversación
      </p>

      {/* Messages */}
      <div className="flex flex-col gap-3 mb-4">
        {loading ? (
          <p className="text-xs" style={{ color: 'rgba(240,240,240,0.35)' }}>Cargando…</p>
        ) : messages.length === 0 ? (
          <p className="text-xs" style={{ color: 'rgba(240,240,240,0.3)' }}>
            Aún no hay mensajes en esta versión. Escribe el primero.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-white">{m.author_name || 'Equipo'}</span>
                <span className="text-[11px]" style={{ color: 'rgba(240,240,240,0.3)' }}>{formatTime(m.created_at)}</span>
              </div>
              {m.body && <p className="text-sm whitespace-pre-wrap" style={{ color: 'rgba(240,240,240,0.85)' }}>{m.body}</p>}
              {(m.attachments ?? []).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {(m.attachments ?? []).map((a, i) => {
                    const url = urls[a.path]
                    const isImg = a.mime?.startsWith('image/')
                    if (isImg && url) {
                      return (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={a.name} className="rounded-lg object-cover" style={{ height: '88px', width: '88px', border: '1px solid rgba(255,255,255,0.1)' }} />
                        </a>
                      )
                    }
                    return (
                      <a
                        key={i}
                        href={url ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-opacity hover:opacity-80"
                        style={{ background: 'rgba(75,155,245,0.08)', border: '1px solid rgba(75,155,245,0.15)', color: '#4B9BF5' }}
                      >
                        <span aria-hidden>📎</span>
                        <span className="max-w-[180px] truncate">{a.name}</span>
                        {a.size ? <span style={{ color: 'rgba(240,240,240,0.35)' }}>{formatSize(a.size)}</span> : null}
                      </a>
                    )
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe un mensaje…"
          rows={2}
          className="w-full resize-none bg-transparent outline-none text-sm"
          style={{ color: '#F0F0F0' }}
        />
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {files.map((f, i) => (
              <span key={i} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(240,240,240,0.7)' }}>
                {f.name}
                <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} style={{ color: 'rgba(240,240,240,0.45)' }}>✕</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mt-2">
          <label className="cursor-pointer text-xs transition-opacity hover:opacity-80" style={{ color: 'rgba(240,240,240,0.5)' }}>
            📎 Adjuntar
            <input
              type="file"
              multiple
              accept="image/*,application/pdf,.txt,.doc,.docx,.xls,.xlsx,.csv,.zip"
              className="hidden"
              onChange={(e) => {
                setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])
                e.target.value = ''
              }}
            />
          </label>
          <button
            onClick={handleSend}
            disabled={sending || (!text.trim() && files.length === 0)}
            className="rounded-lg px-4 py-1.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: 'rgba(75,155,245,0.12)', border: '1px solid rgba(75,155,245,0.25)', color: '#4B9BF5' }}
          >
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeadProposalsPage() {
  const router = useRouter()
  const params = useParams()
  const leadId = params.leadId as string

  const [authChecked, setAuthChecked] = useState(false)
  const [accessToken, setAccessToken] = useState('')
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null)
  const [lead, setLead] = useState<Lead | null>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [projects, setProjects] = useState<{ id: string; proposal_id: string | null; status: string }[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

        const { data: prof } = await supabase
          .from('admin_profiles')
          .select('full_name')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()
        setCurrentUser({ id: user.id, name: (prof?.full_name as string) || user.email || 'Equipo' })

        const base = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        const headers = { apikey: key, Authorization: `Bearer ${token}` }

        const [leadRes, propRes, projRes] = await Promise.all([
          fetch(`${base}/rest/v1/leads?id=eq.${leadId}&select=id,full_name,company,email&limit=1`, { headers }),
          fetch(`${base}/rest/v1/lead_proposals?lead_id=eq.${leadId}&select=*&order=version.desc`, { headers }),
          fetch(`${base}/rest/v1/projects?lead_id=eq.${leadId}&select=id,proposal_id,status`, { headers }),
        ])

        if (leadRes.ok) {
          const rows = await leadRes.json()
          setLead(rows?.[0] ?? null)
        }
        if (projRes.ok) setProjects((await projRes.json()) ?? [])
        if (!propRes.ok) {
          setError(`Error ${propRes.status}: ${await propRes.text()}`)
        } else {
          const rows: Proposal[] = (await propRes.json()) ?? []
          setProposals(rows)
          const principal = rows.find((p) => p.is_principal) ?? rows[0]
          setSelectedId(principal?.id ?? null)
        }
      } catch {
        window.location.href = '/login'
      }
      setLoading(false)
    }
    init()
  }, [leadId])

  async function refetchProposals() {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const res = await fetch(
      `${base}/rest/v1/lead_proposals?lead_id=eq.${leadId}&select=*&order=version.desc`,
      { headers: { apikey: key, Authorization: `Bearer ${accessToken}` } }
    )
    if (res.ok) setProposals((await res.json()) ?? [])
  }

  async function handleSetPrincipal(p: Proposal) {
    if (p.is_principal || busy) return
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/leads/${leadId}/proposal/${p.id}/principal`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) { alert(`No se pudo marcar como principal (error ${res.status}).`); return }
      setProposals((prev) => prev.map((x) => ({ ...x, is_principal: x.id === p.id })))
    } catch {
      alert('Error de red al marcar principal. Reintenta en unos segundos (el servidor puede estar despertando).')
    } finally {
      setBusy(false)
    }
  }

  async function handleConvert(p: Proposal) {
    if (busy) return
    if (!confirm('¿Convertir esta propuesta en proyecto? El lead pasará a "Ganado" y se creará su tablero de desarrollo.')) return
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/leads/${leadId}/proposal/${p.id}/convert`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) { alert(`No se pudo convertir en proyecto (error ${res.status}).`); return }
      const project = await res.json()
      setProjects((prev) =>
        prev.some((x) => x.id === project.id) ? prev : [...prev, project]
      )
      setProposals((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: 'accepted' } : x)))
      router.push(`/kanban?project=${project.id}`)
    } catch {
      alert('Error de red al convertir en proyecto. Reintenta en unos segundos (el servidor puede estar despertando).')
    } finally {
      setBusy(false)
    }
  }

  async function handleSendToClient(p: Proposal) {
    if (busy) return
    const to = lead?.email || p.snapshot?.lead?.email
    if (!to) { alert('Este lead no tiene un correo registrado para enviarle la propuesta.'); return }
    if (!confirm(`Se enviará la propuesta (versión ${p.version}) al cliente: ${to}\n\nEl lead pasará a "Propuesta enviada". ¿Continuar?`)) return
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/leads/${leadId}/proposal/${p.id}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        alert(res.status === 502
          ? 'No se pudo enviar el correo al cliente. Reintenta en unos segundos.'
          : `No se pudo enviar la propuesta (error ${res.status}).`)
        return
      }
      setProposals((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: 'sent' } : x)))
      alert(`Propuesta enviada a ${to}.`)
    } catch {
      alert('Error de red al enviar la propuesta. Reintenta en unos segundos (el servidor puede estar despertando).')
    } finally {
      setBusy(false)
    }
  }

  async function handleNewVersion() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`${API_URL}/leads/${leadId}/proposal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        alert(res.status === 400
          ? 'Este lead no tiene ficha de evaluación. Crea la ficha antes de generar una propuesta.'
          : `No se pudo crear la versión (error ${res.status}).`)
        return
      }
      const created = await res.json()
      await refetchProposals()
      setSelectedId(created.id)
    } catch {
      alert('Error de red al crear la versión. Reintenta en unos segundos (el servidor puede estar despertando).')
    } finally {
      setBusy(false)
    }
  }

  async function handleStatusChange(p: Proposal, newStatus: ProposalStatus) {
    if (newStatus === p.status || busy) return
    // "Enviada" must go through the real send flow (PDF + email to client),
    // never a silent status flip.
    if (newStatus === 'sent') { void handleSendToClient(p); return }
    setBusy(true)
    const patch: Record<string, unknown> = { status: newStatus }
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/lead_proposals?id=eq.${p.id}`,
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
        setProposals((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: newStatus } : x)))
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadPDF() {
    try {
      const res = await fetch(`${API_URL}/leads/${leadId}/proposal/pdf`, {
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

  const selected = proposals.find((p) => p.id === selectedId) ?? null
  const selectedProject = selected ? projects.find((pr) => pr.proposal_id === selected.id) ?? null : null
  const ev = (selected?.snapshot?.evaluation ?? {}) as Record<string, unknown>
  const notes = selected?.snapshot?.notes ?? []

  return (
    <div className="min-h-screen" style={{ background: '#000000', color: '#F0F0F0' }}>
      {/* Nav */}
      <header className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.08)', background: '#000000' }}>
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Sustenta Futuro" style={{ height: '28px', width: 'auto' }} />
          <span className="text-white font-semibold tracking-tight" style={{ fontFamily: 'var(--font-montserrat)' }}>Sustenta Futuro</span>
        </div>
        <div className="flex items-center gap-5">
          <button onClick={() => router.push('/')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Leads</button>
          <button onClick={() => router.push('/propuestas')} className="text-sm font-medium transition-opacity hover:opacity-70" style={{ color: '#4B9BF5' }}>Propuestas</button>
          <button onClick={() => router.push('/proyectos')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Proyectos</button>
          <button onClick={() => router.push('/kanban')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Kanban</button>
          <button onClick={handleLogout} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Cerrar sesion</button>
        </div>
      </header>

      <main className="px-6 py-8 max-w-6xl mx-auto space-y-6">
        {/* Back + header */}
        <button onClick={() => router.push('/propuestas')} className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-100" style={{ color: 'rgba(240,240,240,0.5)' }}>
          <span aria-hidden>←</span> Volver a Propuestas
        </button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">{lead?.full_name ?? 'Propuestas del lead'}</h1>
            {lead?.company && <p className="text-sm mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>{lead.company}</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => router.push(`/leads/${leadId}`)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(240,240,240,0.8)' }}
            >
              Ver lead
            </button>
            <button
              onClick={handleNewVersion}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: 'rgba(75,155,245,0.12)', border: '1px solid rgba(75,155,245,0.25)', color: '#4B9BF5' }}
            >
              + Nueva versión
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)', color: '#f87171' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-3 text-sm" style={{ color: 'rgba(240,240,240,0.4)' }}>
            <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" /> Cargando…
          </div>
        ) : proposals.length === 0 ? (
          <div className="rounded-xl border p-10 text-center text-sm" style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(240,240,240,0.4)' }}>
            Este lead aún no tiene propuestas. Usa “+ Nueva versión” para crear la primera (requiere ficha de evaluación).
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
            {/* Version history */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgba(240,240,240,0.35)' }}>
                Versiones ({proposals.length})
              </p>
              {proposals.map((p) => {
                const isSel = p.id === selectedId
                const sc = STATUS_COLORS[p.status]
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className="text-left rounded-lg border p-3 transition-colors"
                    style={{
                      background: isSel ? 'rgba(75,155,245,0.08)' : '#0a0a0a',
                      borderColor: isSel ? 'rgba(75,155,245,0.35)' : 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-white">v{p.version}</span>
                      {p.is_principal && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}>
                          PRINCIPAL
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-1 line-clamp-1" style={{ color: 'rgba(240,240,240,0.65)' }}>
                      {p.title || str(p.snapshot?.evaluation?.['project_title']) || 'Sin título'}
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <span className="text-[11px] rounded px-1.5 py-0.5" style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                        {STATUS_LABELS[p.status]}
                      </span>
                      <span className="text-[11px] tabular-nums" style={{ color: 'rgba(240,240,240,0.35)' }}>{formatDate(p.created_at)}</span>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Selected version (read-only snapshot) */}
            {selected && (
              <div className="rounded-xl border p-6 flex flex-col gap-5" style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}>
                {/* version header + actions */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-white">
                        {selected.title || str(ev['project_title']) || `Versión ${selected.version}`}
                      </h2>
                      {selected.is_principal && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}>PRINCIPAL</span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>
                      Versión {selected.version} · congelada el {formatDate(selected.snapshot?.captured_at ?? selected.created_at)} · solo lectura
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {!selected.is_principal && (
                      <button
                        onClick={() => handleSetPrincipal(selected)}
                        disabled={busy}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
                        style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80' }}
                      >
                        Marcar como principal
                      </button>
                    )}
                    <button
                      onClick={handleDownloadPDF}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                      style={{ background: 'rgba(75,155,245,0.08)', border: '1px solid rgba(75,155,245,0.15)', color: '#4B9BF5' }}
                    >
                      Descargar PDF
                    </button>
                    {selected.status !== 'accepted' && (
                      <button
                        onClick={() => handleSendToClient(selected)}
                        disabled={busy}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
                        style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }}
                      >
                        {selected.status === 'sent' ? 'Reenviar al cliente' : 'Enviar al cliente'}
                      </button>
                    )}
                    {selectedProject ? (
                      <button
                        onClick={() => router.push(`/kanban?project=${selectedProject.id}`)}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
                        style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)', color: '#c084fc' }}
                      >
                        Ver proyecto →
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConvert(selected)}
                        disabled={busy}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
                        style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)', color: '#c084fc' }}
                      >
                        Convertir en proyecto
                      </button>
                    )}
                  </div>
                </div>

                {/* status selector */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs" style={{ color: 'rgba(240,240,240,0.4)' }}>Estado:</span>
                  {ALL_STATUSES.map((s) => {
                    const sc = STATUS_COLORS[s]
                    const active = s === selected.status
                    return (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(selected, s)}
                        disabled={busy}
                        className="rounded-md px-2 py-0.5 text-xs transition-opacity hover:opacity-90 disabled:opacity-40"
                        style={{
                          background: active ? sc.bg : 'transparent',
                          color: active ? sc.text : 'rgba(240,240,240,0.4)',
                          border: `1px solid ${active ? sc.border : 'rgba(255,255,255,0.08)'}`,
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    )
                  })}
                </div>

                {/* snapshot content */}
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {str(ev['description']) && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs mb-1" style={{ color: 'rgba(240,240,240,0.35)' }}>Descripción</dt>
                      <dd className="text-sm" style={{ color: 'rgba(240,240,240,0.85)' }}>{str(ev['description'])}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs mb-1" style={{ color: 'rgba(240,240,240,0.35)' }}>Precio cliente</dt>
                    <dd className="text-sm font-medium" style={{ color: '#4ade80' }}>{money(ev['client_price'], ev['price_currency'])}</dd>
                  </div>
                  <div>
                    <dt className="text-xs mb-1" style={{ color: 'rgba(240,240,240,0.35)' }}>Duración</dt>
                    <dd className="text-sm" style={{ color: 'rgba(240,240,240,0.85)' }}>{str(ev['total_duration']) || '—'}</dd>
                  </div>
                  {ev['monthly_maintenance'] != null && (
                    <div>
                      <dt className="text-xs mb-1" style={{ color: 'rgba(240,240,240,0.35)' }}>Mantención mensual</dt>
                      <dd className="text-sm" style={{ color: 'rgba(240,240,240,0.85)' }}>{money(ev['monthly_maintenance'], ev['price_currency'])}</dd>
                    </div>
                  )}
                  {str(ev['payment_method']) && (
                    <div>
                      <dt className="text-xs mb-1" style={{ color: 'rgba(240,240,240,0.35)' }}>Forma de pago</dt>
                      <dd className="text-sm" style={{ color: 'rgba(240,240,240,0.85)' }}>{str(ev['payment_method'])}</dd>
                    </div>
                  )}
                  {str(ev['risks']) && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs mb-1" style={{ color: 'rgba(240,240,240,0.35)' }}>Riesgos</dt>
                      <dd className="text-sm" style={{ color: 'rgba(240,240,240,0.85)' }}>{str(ev['risks'])}</dd>
                    </div>
                  )}
                </dl>

                {/* notes snapshot */}
                {notes.length > 0 && (
                  <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'rgba(240,240,240,0.35)' }}>
                      Notas ({notes.length}) — al momento de esta versión
                    </p>
                    <div className="flex flex-col gap-2">
                      {notes.map((n, i) => (
                        <div key={i} className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <p className="text-sm" style={{ color: 'rgba(240,240,240,0.8)' }}>{n.content}</p>
                          <p className="text-[11px] mt-1" style={{ color: 'rgba(240,240,240,0.3)' }}>{formatDate(n.created_at)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Discussion thread (per version) */}
                <ProposalChat key={selected.id} proposalId={selected.id} currentUser={currentUser} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
