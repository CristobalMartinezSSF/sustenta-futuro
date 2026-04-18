'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
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
  email: string
  phone: string | null
  company: string | null
  message: string | null
  source: string | null
  status: LeadStatus
  assigned_to: string | null
  project_title: string | null
  created_at: string
}

interface Note {
  id: string
  lead_id: string
  content: string
  created_at: string
  created_by: string | null
}

interface LevantamientoRespuesta {
  id: string
  lead_id: string
  pregunta: string
  respuesta: string
  orden: number
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Nuevo contacto',
  reviewing: 'Reunión inicial',
  contacted: 'Levantamiento',
  qualified: 'Propuesta creada',
  proposal_pending: 'En negociación',
  won: 'Ganado',
  lost: 'Perdido',
}

const STATUS_COLORS: Record<LeadStatus, { bg: string; text: string; border: string }> = {
  new:              { bg: 'rgba(100,100,100,0.12)', text: '#9ca3af', border: 'rgba(100,100,100,0.2)' },
  reviewing:        { bg: 'rgba(59,130,246,0.1)',   text: '#60a5fa', border: 'rgba(59,130,246,0.2)' },
  contacted:        { bg: 'rgba(234,179,8,0.1)',    text: '#fbbf24', border: 'rgba(234,179,8,0.2)' },
  qualified:        { bg: 'rgba(168,85,247,0.1)',   text: '#c084fc', border: 'rgba(168,85,247,0.2)' },
  proposal_pending: { bg: 'rgba(249,115,22,0.1)',   text: '#fb923c', border: 'rgba(249,115,22,0.2)' },
  won:              { bg: 'rgba(34,197,94,0.1)',    text: '#4ade80', border: 'rgba(34,197,94,0.2)' },
  lost:             { bg: 'rgba(239,68,68,0.1)',    text: '#f87171', border: 'rgba(239,68,68,0.2)' },
}

const PIPELINE_STEPS: LeadStatus[] = [
  'new',
  'reviewing',
  'contacted',
  'qualified',
  'proposal_pending',
  'won',
  'lost',
]

const PREGUNTAS_ESTANDAR = [
  '¿Cual es el objetivo principal del sistema que necesitas?',
  '¿Quienes seran los usuarios del sistema? (roles, cantidad estimada)',
  '¿Que funcionalidades son imprescindibles para el lanzamiento?',
  '¿Existen integraciones con sistemas externos requeridas? (ERP, CRM, APIs, etc.)',
  '¿Cual es el plazo esperado de entrega?',
  '¿Cual es el presupuesto aproximado disponible?',
  '¿Tienes referentes visuales o sistemas similares que te gusten?',
  '¿Cual es la infraestructura tecnologica actual de tu empresa?',
  '¿Hay requisitos de seguridad, compliance o normativas especificas a cumplir?',
  '¿Que problema critico resuelve este sistema para tu empresa?',
]

function formatDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`
}

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export default function LeadDetailPage() {
  const router = useRouter()
  const params = useParams()
  const leadId = params.id as string

  const [lead, setLead] = useState<Lead | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)
  const [accessToken, setAccessToken] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  // Inline edit for project_title
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Status update
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Notes
  const [noteText, setNoteText] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)

  // Levantamiento
  const [levantamiento, setLevantamiento] = useState<LevantamientoRespuesta[]>([])
  const [levantamientoExists, setLevantamientoExists] = useState(true) // false = table missing
  const [initiatingLevantamiento, setInitiatingLevantamiento] = useState(false)
  const [savingRespuestaId, setSavingRespuestaId] = useState<string | null>(null)
  // Local draft values keyed by respuesta id
  const [respuestaDrafts, setRespuestaDrafts] = useState<Record<string, string>>({})

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
          setUserId(refreshData.session.user.id)

          const { data: roleData } = await supabase.rpc('get_my_role')
          if (roleData === 'admin') setIsAdmin(true)

          const token = refreshData.session.access_token
          const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
          const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

          // Fetch lead
          const leadRes = await fetch(
            `${baseUrl}/rest/v1/leads?id=eq.${leadId}&select=*`,
            {
              headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${token}`,
              },
            }
          )

          if (!leadRes.ok) {
            const body = await leadRes.text()
            setError(`Error cargando proyecto: ${body}`)
            setLoading(false)
            return
          }

          const leadData = await leadRes.json()
          if (!leadData || leadData.length === 0) {
            setError('Proyecto no encontrado.')
            setLoading(false)
            return
          }

          const fetchedLead = leadData[0] as Lead
          setLead(fetchedLead)
          setTitleValue(fetchedLead.project_title ?? '')

          // Fetch notes
          const notesRes = await fetch(
            `${baseUrl}/rest/v1/lead_notes?lead_id=eq.${leadId}&order=created_at.desc&select=*`,
            {
              headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${token}`,
              },
            }
          )
          if (notesRes.ok) {
            const notesData = await notesRes.json()
            setNotes((notesData as Note[]) ?? [])
          }

          // Fetch levantamiento (silent fail if table missing)
          try {
            const levRes = await fetch(
              `${baseUrl}/rest/v1/levantamiento_respuestas?lead_id=eq.${leadId}&order=orden.asc`,
              {
                headers: {
                  'apikey': anonKey,
                  'Authorization': `Bearer ${token}`,
                },
              }
            )
            if (levRes.ok) {
              const levData = await levRes.json()
              const rows = (levData as LevantamientoRespuesta[]) ?? []
              setLevantamiento(rows)
              const drafts: Record<string, string> = {}
              rows.forEach((r) => { drafts[r.id] = r.respuesta ?? '' })
              setRespuestaDrafts(drafts)
            } else {
              // Table likely doesn't exist — hide section silently
              setLevantamientoExists(false)
            }
          } catch {
            setLevantamientoExists(false)
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
  }, [leadId])

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [editingTitle])

  async function saveTitle() {
    if (!lead || savingTitle) return
    const trimmed = titleValue.trim()
    if (trimmed === (lead.project_title ?? '')) {
      setEditingTitle(false)
      return
    }
    setSavingTitle(true)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/leads?id=eq.${leadId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ project_title: trimmed || null }),
        }
      )
      if (res.ok) {
        const updated = await res.json()
        if (updated && updated[0]) {
          setLead(updated[0] as Lead)
          setTitleValue(updated[0].project_title ?? '')
        }
      }
    } finally {
      setSavingTitle(false)
      setEditingTitle(false)
    }
  }

  async function handleStatusChange(newStatus: LeadStatus) {
    if (!lead || updatingStatus || lead.status === newStatus) return
    setUpdatingStatus(true)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/leads?id=eq.${leadId}`,
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
          setLead(updated[0] as Lead)
        }
      }
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function handleAddNote() {
    if (!noteText.trim() || addingNote) return
    setNoteError(null)
    setAddingNote(true)
    try {
      const body: Record<string, string> = {
        lead_id: leadId,
        content: noteText.trim(),
      }
      if (userId) body.created_by = userId

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/lead_notes`,
        {
          method: 'POST',
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(body),
        }
      )

      if (!res.ok) {
        const errBody = await res.text()
        setNoteError(`Error al guardar nota: ${errBody}`)
      } else {
        const newNotes = await res.json()
        if (newNotes && newNotes[0]) {
          setNotes((prev) => [newNotes[0] as Note, ...prev])
        }
        setNoteText('')
      }
    } finally {
      setAddingNote(false)
    }
  }

  async function handleInitLevantamiento() {
    if (initiatingLevantamiento) return
    setInitiatingLevantamiento(true)
    try {
      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

      const rows = PREGUNTAS_ESTANDAR.map((pregunta, idx) => ({
        lead_id: leadId,
        pregunta,
        respuesta: '',
        orden: idx + 1,
      }))

      const res = await fetch(
        `${baseUrl}/rest/v1/levantamiento_respuestas`,
        {
          method: 'POST',
          headers: {
            'apikey': anonKey,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(rows),
        }
      )

      if (res.ok) {
        const created = await res.json()
        const sorted = (created as LevantamientoRespuesta[]).sort((a, b) => a.orden - b.orden)
        setLevantamiento(sorted)
        const drafts: Record<string, string> = {}
        sorted.forEach((r) => { drafts[r.id] = r.respuesta ?? '' })
        setRespuestaDrafts(drafts)
      }
    } finally {
      setInitiatingLevantamiento(false)
    }
  }

  async function handleSaveRespuesta(id: string) {
    if (savingRespuestaId === id) return
    const value = respuestaDrafts[id] ?? ''
    setSavingRespuestaId(id)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/levantamiento_respuestas?id=eq.${id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ respuesta: value, updated_at: new Date().toISOString() }),
        }
      )
      if (res.ok) {
        setLevantamiento((prev) =>
          prev.map((r) => (r.id === id ? { ...r, respuesta: value } : r))
        )
      }
    } finally {
      setSavingRespuestaId(null)
    }
  }

  if (!authChecked || loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: '#000000' }}
      >
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

  if (error || !lead) {
    return (
      <div className="min-h-screen" style={{ background: '#000000', color: '#F0F0F0' }}>
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
            <span className="text-sm font-medium" style={{ color: '#4B9BF5' }}>Leads</span>
            <button onClick={() => router.push('/propuestas')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Propuestas</button>
            <button onClick={() => router.push('/proyectos')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Proyectos</button>
            {isAdmin && <button onClick={() => router.push('/usuarios')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Usuarios</button>}
            {isAdmin && <button onClick={() => router.push('/configuracion')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Config. Landing</button>}
            <button onClick={handleLogout} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Cerrar sesion</button>
          </div>
        </header>
        <main className="px-6 py-8 max-w-4xl mx-auto">
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.15)',
              color: '#f87171',
            }}
          >
            {error ?? 'Lead no encontrado.'}
          </div>
        </main>
      </div>
    )
  }

  const currentStatus = (lead.status ?? 'new') as LeadStatus
  const statusStyle = STATUS_COLORS[currentStatus] ?? STATUS_COLORS.new

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
          <span className="text-sm font-medium" style={{ color: '#4B9BF5' }}>Leads</span>
          <button onClick={() => router.push('/propuestas')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Propuestas</button>
          <button onClick={() => router.push('/proyectos')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Proyectos</button>
          {isAdmin && <button onClick={() => router.push('/usuarios')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Usuarios</button>}
          {isAdmin && <button onClick={() => router.push('/configuracion')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Config. Landing</button>}
          <button onClick={handleLogout} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Cerrar sesion</button>
        </div>
      </header>

      <main className="px-6 py-8 max-w-4xl mx-auto space-y-8">

        {/* Header: title + status badge + actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            {/* Editable project title */}
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  ref={titleInputRef}
                  type="text"
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveTitle()
                    if (e.key === 'Escape') {
                      setTitleValue(lead.project_title ?? '')
                      setEditingTitle(false)
                    }
                  }}
                  className="text-xl font-semibold text-white outline-none rounded-lg px-3 py-1.5 w-72 focus:ring-1 focus:ring-[#4B9BF5]/40"
                  style={{
                    background: '#111111',
                    border: '1px solid rgba(255,255,255,0.15)',
                  }}
                  placeholder="Nombre del proyecto..."
                  disabled={savingTitle}
                />
                {savingTitle && (
                  <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                )}
              </div>
            ) : (
              <button
                onClick={() => setEditingTitle(true)}
                className="text-left group flex items-center gap-2"
                title="Clic para editar"
              >
                <h1 className="text-xl font-semibold text-white">
                  {lead.project_title || lead.name}
                </h1>
                <span
                  className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'rgba(240,240,240,0.35)' }}
                >
                  editar
                </span>
              </button>
            )}
            <p className="text-sm" style={{ color: 'rgba(240,240,240,0.4)' }}>
              Creado el {formatDateShort(lead.created_at)}
            </p>
          </div>

          {/* Right side: status badge + Crear propuesta button */}
          <div className="flex items-center gap-3 self-start flex-wrap">
            <button
              onClick={() => {
                const params = new URLSearchParams({ lead_id: lead.id, lead_name: lead.name })
                router.push(`/propuestas?${params.toString()}`)
              }}
              className="rounded-lg px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(240,240,240,0.8)',
              }}
            >
              Crear propuesta
            </button>
            <span
              className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium"
              style={{
                background: statusStyle.bg,
                color: statusStyle.text,
                border: `1px solid ${statusStyle.border}`,
              }}
            >
              {STATUS_LABELS[currentStatus]}
            </span>
          </div>
        </div>

        {/* Pipeline stepper */}
        <div
          className="rounded-xl border p-5"
          style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <p className="text-xs font-medium uppercase tracking-wider mb-4" style={{ color: 'rgba(240,240,240,0.35)' }}>
            Etapa del lead
          </p>
          <div className="flex items-start gap-0 overflow-x-auto pb-1">
            {PIPELINE_STEPS.map((step, idx) => {
              const isCurrent = step === currentStatus
              const isCompleted =
                step !== 'lost' &&
                currentStatus !== 'lost' &&
                idx < PIPELINE_STEPS.indexOf(currentStatus)

              return (
                <div key={step} className="flex items-center">
                  <button
                    onClick={() => handleStatusChange(step)}
                    disabled={updatingStatus}
                    className="flex flex-col items-center gap-2 group"
                    style={{ minWidth: '72px' }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all"
                      style={
                        isCurrent
                          ? {
                              background: 'rgba(75,155,245,0.15)',
                              border: '2px solid #4B9BF5',
                              color: '#4B9BF5',
                              boxShadow: '0 0 0 3px rgba(75,155,245,0.1)',
                            }
                          : isCompleted
                          ? {
                              background: 'rgba(92,184,92,0.15)',
                              border: '2px solid rgba(92,184,92,0.5)',
                              color: '#5CB85C',
                            }
                          : {
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: 'rgba(240,240,240,0.25)',
                            }
                      }
                    >
                      {isCompleted ? '✓' : idx + 1}
                    </div>
                    <span
                      className="text-center leading-tight"
                      style={{
                        fontSize: '10px',
                        color: isCurrent
                          ? '#4B9BF5'
                          : isCompleted
                          ? 'rgba(92,184,92,0.8)'
                          : 'rgba(240,240,240,0.3)',
                        maxWidth: '68px',
                      }}
                    >
                      {STATUS_LABELS[step]}
                    </span>
                  </button>
                  {idx < PIPELINE_STEPS.length - 1 && (
                    <div
                      className="h-px w-4 flex-shrink-0 mt-[-18px]"
                      style={{
                        background: isCompleted
                          ? 'rgba(92,184,92,0.3)'
                          : 'rgba(255,255,255,0.08)',
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>
          {updatingStatus && (
            <p className="text-xs mt-3" style={{ color: 'rgba(240,240,240,0.35)' }}>
              Guardando cambio de estado...
            </p>
          )}
        </div>

        {/* Contact info card */}
        <div
          className="rounded-xl border p-5"
          style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'rgba(240,240,240,0.35)' }}>
            Informacion de contacto
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <InfoRow label="Nombre" value={lead.name} />
            <InfoRow label="Email" value={lead.email} />
            <InfoRow label="Telefono" value={lead.phone} />
            <InfoRow label="Empresa" value={lead.company} />
            {lead.source && <InfoRow label="Fuente" value={lead.source} />}
          </dl>
          {lead.message && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <dt className="text-xs mb-1.5" style={{ color: 'rgba(240,240,240,0.35)' }}>Mensaje</dt>
              <dd
                className="text-sm leading-relaxed whitespace-pre-wrap"
                style={{ color: 'rgba(240,240,240,0.75)' }}
              >
                {lead.message}
              </dd>
            </div>
          )}
        </div>

        {/* Levantamiento section — only shown when table exists */}
        {levantamientoExists && (
          <div
            className="rounded-xl border p-5"
            style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(240,240,240,0.35)' }}>
                Levantamiento
              </p>
              {levantamiento.length > 0 && (
                <p className="text-xs" style={{ color: 'rgba(240,240,240,0.3)' }}>
                  {levantamiento.filter((r) => r.respuesta && r.respuesta.trim() !== '').length} / {levantamiento.length} respondidas
                </p>
              )}
            </div>

            {levantamiento.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-4">
                <p className="text-sm text-center" style={{ color: 'rgba(240,240,240,0.4)' }}>
                  Aun no se ha iniciado el cuestionario de levantamiento para este lead.
                </p>
                <button
                  onClick={handleInitLevantamiento}
                  disabled={initiatingLevantamiento}
                  className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
                  style={{ background: '#4B9BF5', color: '#ffffff' }}
                >
                  {initiatingLevantamiento ? 'Iniciando...' : 'Iniciar levantamiento'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {levantamiento.map((r, idx) => (
                  <div key={r.id}>
                    <label
                      className="block text-xs mb-2 font-medium"
                      style={{ color: 'rgba(240,240,240,0.55)' }}
                    >
                      <span style={{ color: 'rgba(75,155,245,0.7)', marginRight: '6px' }}>
                        {idx + 1}.
                      </span>
                      {r.pregunta}
                    </label>
                    <div className="relative">
                      <textarea
                        value={respuestaDrafts[r.id] ?? ''}
                        onChange={(e) =>
                          setRespuestaDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        onBlur={() => handleSaveRespuesta(r.id)}
                        rows={3}
                        placeholder="Escribe la respuesta aqui..."
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: '#F0F0F0',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          width: '100%',
                          resize: 'vertical',
                          fontSize: '14px',
                          lineHeight: '1.5',
                          outline: 'none',
                        }}
                        className="focus:ring-1 focus:ring-[#4B9BF5]/30 transition-colors"
                      />
                      {savingRespuestaId === r.id && (
                        <div
                          className="absolute top-2 right-2 w-3 h-3 rounded-full border border-white/20 border-t-white animate-spin"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notes section */}
        <div
          className="rounded-xl border p-5"
          style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'rgba(240,240,240,0.35)' }}>
            Notas
          </p>

          {/* Add note form */}
          <div className="flex flex-col gap-2 mb-5">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleAddNote()
                }
              }}
              placeholder="Agregar una nota... (Cmd+Enter para guardar)"
              rows={3}
              className="w-full rounded-lg px-3.5 py-2.5 text-sm text-white outline-none resize-none transition-colors focus:ring-1 focus:ring-[#4B9BF5]/40"
              style={{
                background: '#111111',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#F0F0F0',
              }}
            />
            {noteError && (
              <p
                className="text-xs rounded px-3 py-2"
                style={{
                  color: '#f87171',
                  background: 'rgba(248,113,113,0.08)',
                  border: '1px solid rgba(248,113,113,0.15)',
                }}
              >
                {noteError}
              </p>
            )}
            <div className="flex justify-end">
              <button
                onClick={handleAddNote}
                disabled={!noteText.trim() || addingNote}
                className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
                style={{ background: '#4B9BF5', color: '#ffffff' }}
              >
                {addingNote ? 'Guardando...' : 'Agregar nota'}
              </button>
            </div>
          </div>

          {/* Notes list */}
          {notes.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'rgba(240,240,240,0.25)' }}>
              No hay notas aun.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {notes.map((note) => (
                <li
                  key={note.id}
                  className="rounded-lg px-4 py-3"
                  style={{
                    background: '#111111',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(240,240,240,0.8)' }}>
                    {note.content}
                  </p>
                  <p className="text-xs mt-2" style={{ color: 'rgba(240,240,240,0.3)' }}>
                    {formatDate(note.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs mb-0.5" style={{ color: 'rgba(240,240,240,0.35)' }}>{label}</dt>
      <dd className="text-sm" style={{ color: value ? 'rgba(240,240,240,0.8)' : 'rgba(240,240,240,0.2)' }}>
        {value ?? '—'}
      </dd>
    </div>
  )
}
