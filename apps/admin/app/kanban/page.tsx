'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

type PhaseStatus = 'pending' | 'in_progress' | 'review' | 'approved'
type TaskStatus  = 'todo' | 'in_progress' | 'review' | 'done'

interface Phase {
  id: string
  name: string
  description: string | null
  order_index: number
  status: PhaseStatus
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

interface Task {
  id: string
  phase_id: string
  title: string
  description: string | null
  status: TaskStatus
  order_index: number
  created_at: string
}

interface TaskNote {
  id: string
  task_id: string
  author_id: string | null
  content: string
  created_at: string
  admin_profiles: { full_name: string } | null
}

interface DailyReport {
  id: string
  phase_id: string | null
  report_date: string
  accomplished: string
  blockers: string | null
  next_steps: string | null
  created_at: string
  admin_profiles: { full_name: string } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<PhaseStatus, string> = {
  pending:     'Pendiente',
  in_progress: 'En progreso',
  review:      'En revisión',
  approved:    'Aprobada',
}

const PHASE_COLORS: Record<PhaseStatus, { bg: string; text: string; border: string }> = {
  pending:     { bg: 'rgba(255,255,255,0.04)', text: 'rgba(240,240,240,0.4)',  border: 'rgba(255,255,255,0.07)' },
  in_progress: { bg: 'rgba(251,191,36,0.08)',  text: '#fbbf24',                border: 'rgba(251,191,36,0.15)' },
  review:      { bg: 'rgba(96,165,250,0.08)',  text: '#60a5fa',                border: 'rgba(96,165,250,0.15)' },
  approved:    { bg: 'rgba(74,222,128,0.08)',  text: '#4ade80',                border: 'rgba(74,222,128,0.15)' },
}

const COLUMNS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: 'todo',        label: 'Por hacer',   accent: 'rgba(240,240,240,0.25)' },
  { status: 'in_progress', label: 'En progreso', accent: '#fbbf24' },
  { status: 'review',      label: 'En revisión', accent: '#60a5fa' },
  { status: 'done',        label: 'Hecho',       accent: '#4ade80' },
]

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hdrs(token: string, prefer = 'return=representation') {
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Prefer: prefer,
  }
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

const inputCss: React.CSSProperties = {
  background: '#111111',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#F0F0F0',
  outline: 'none',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '14px',
  width: '100%',
}

// ─── PhaseBadge ───────────────────────────────────────────────────────────────

function PhaseBadge({ status }: { status: PhaseStatus }) {
  const s = PHASE_COLORS[status]
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      {PHASE_LABELS[status]}
    </span>
  )
}

// ─── PhaseModal ───────────────────────────────────────────────────────────────

function PhaseModal({
  initial, maxOrder, token, onClose, onSaved,
}: {
  initial?: Phase; maxOrder: number; token: string
  onClose: () => void; onSaved: (p: Phase) => void
}) {
  const [name, setName]       = useState(initial?.name ?? '')
  const [desc, setDesc]       = useState(initial?.description ?? '')
  const [status, setStatus]   = useState<PhaseStatus>(initial?.status ?? 'pending')
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setErr(null)
    const body: Record<string, unknown> = {
      name: name.trim(),
      description: desc.trim() || null,
      status,
    }
    let res: Response
    if (initial) {
      res = await fetch(`${SB_URL}/rest/v1/phases?id=eq.${initial.id}`,
        { method: 'PATCH', headers: hdrs(token), body: JSON.stringify(body) })
    } else {
      body.project_id = 'sg-sustenta-futuro'
      body.order_index = maxOrder + 1
      res = await fetch(`${SB_URL}/rest/v1/phases`,
        { method: 'POST', headers: hdrs(token), body: JSON.stringify(body) })
    }
    if (res.ok) { const d = await res.json(); onSaved(d[0] ?? { ...initial, ...body }) }
    else setErr(await res.text())
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-xl border shadow-2xl"
        style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="text-base font-semibold text-white">{initial ? 'Editar fase' : 'Nueva fase'}</h2>
          <button onClick={onClose} style={{ color: 'rgba(240,240,240,0.4)' }} className="hover:opacity-60">✕</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs" style={{ color: 'rgba(240,240,240,0.5)' }}>Nombre *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required style={inputCss} placeholder="Ej: Fase 4 — Kanban" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs" style={{ color: 'rgba(240,240,240,0.5)' }}>Descripción</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3}
              style={{ ...inputCss, resize: 'none' }} placeholder="Descripción de la fase..." />
          </div>
          {initial && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: 'rgba(240,240,240,0.5)' }}>Estado</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as PhaseStatus)}
                style={{ ...inputCss, appearance: 'none' }}>
                {(Object.keys(PHASE_LABELS) as PhaseStatus[]).map((s) => (
                  <option key={s} value={s} style={{ background: '#111' }}>{PHASE_LABELS[s]}</option>
                ))}
              </select>
            </div>
          )}
          {err && <p className="text-xs rounded px-3 py-2" style={{ color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)' }}>{err}</p>}
          <div className="flex justify-end gap-2 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:opacity-70"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(240,240,240,0.7)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving || !name.trim()} className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
              style={{ background: '#4B9BF5', color: '#fff' }}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── TaskModal ────────────────────────────────────────────────────────────────

function TaskModal({
  task, phaseId, initialStatus, profileId, token, onClose, onSaved, onDeleted,
}: {
  task: Task | null; phaseId: string; initialStatus: TaskStatus
  profileId: string; token: string
  onClose: () => void; onSaved: (t: Task) => void; onDeleted?: (id: string) => void
}) {
  const [title, setTitle]   = useState(task?.title ?? '')
  const [desc, setDesc]     = useState(task?.description ?? '')
  const [notes, setNotes]   = useState<TaskNote[]>([])
  const [noteText, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [addingNote, setAddingNote] = useState(false)
  const [err, setErr]       = useState<string | null>(null)
  const isEdit = !!task

  useEffect(() => {
    if (!task) return
    fetch(`${SB_URL}/rest/v1/task_notes?task_id=eq.${task.id}&select=*,admin_profiles(full_name)&order=created_at.asc`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then(setNotes).catch(() => {})
  }, [task, token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true); setErr(null)
    const body = { title: title.trim(), description: desc.trim() || null }
    let res: Response
    if (task) {
      res = await fetch(`${SB_URL}/rest/v1/tasks?id=eq.${task.id}`,
        { method: 'PATCH', headers: hdrs(token), body: JSON.stringify(body) })
    } else {
      res = await fetch(`${SB_URL}/rest/v1/tasks`,
        { method: 'POST', headers: hdrs(token),
          body: JSON.stringify({ ...body, phase_id: phaseId, status: initialStatus, order_index: 0 }) })
    }
    if (res.ok) { const d = await res.json(); onSaved(d[0] ?? { ...task, ...body }) }
    else setErr(await res.text())
    setSaving(false)
  }

  async function deleteTask() {
    if (!task || !onDeleted) return
    if (!confirm('¿Eliminar esta tarea?')) return
    await fetch(`${SB_URL}/rest/v1/tasks?id=eq.${task.id}`,
      { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } })
    onDeleted(task.id)
  }

  async function addNote() {
    if (!noteText.trim() || !task) return
    setAddingNote(true)
    const body = { task_id: task.id, content: noteText.trim(), author_id: profileId || null }
    const res = await fetch(`${SB_URL}/rest/v1/task_notes`,
      { method: 'POST', headers: hdrs(token), body: JSON.stringify(body) })
    if (res.ok) {
      const d = await res.json()
      setNotes((prev) => [...prev, d[0]])
      setNote('')
    }
    setAddingNote(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-xl border shadow-2xl flex flex-col max-h-[90vh]"
        style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.1)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="text-base font-semibold text-white">{isEdit ? 'Editar tarea' : 'Nueva tarea'}</h2>
          <div className="flex items-center gap-3">
            {isEdit && onDeleted && (
              <button onClick={deleteTask} className="text-xs hover:opacity-70" style={{ color: '#f87171' }}>
                Eliminar
              </button>
            )}
            <button onClick={onClose} style={{ color: 'rgba(240,240,240,0.4)' }} className="hover:opacity-60">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-4">
          <form id="task-form" onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: 'rgba(240,240,240,0.5)' }}>Título *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required style={inputCss}
                placeholder="Descripción breve de la tarea" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={{ color: 'rgba(240,240,240,0.5)' }}>Detalle</label>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3}
                style={{ ...inputCss, resize: 'none' }} placeholder="Contexto, criterios de aceptación..." />
            </div>
          </form>

          {/* Notes — only in edit mode */}
          {isEdit && (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'rgba(240,240,240,0.35)' }}>
                Comentarios ({notes.length})
              </p>
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg px-3 py-2.5"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-white">
                      {n.admin_profiles?.full_name ?? 'Admin'}
                    </span>
                    <span className="text-xs" style={{ color: 'rgba(240,240,240,0.3)' }}>{fmtDate(n.created_at)}</span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(240,240,240,0.7)' }}>{n.content}</p>
                </div>
              ))}
              <div className="flex gap-2">
                <input value={noteText} onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote() } }}
                  style={{ ...inputCss, flex: 1 }} placeholder="Agregar comentario..." />
                <button onClick={addNote} disabled={addingNote || !noteText.trim()}
                  className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40 flex-shrink-0"
                  style={{ background: '#4B9BF5', color: '#fff' }}>
                  {addingNote ? '...' : 'Enviar'}
                </button>
              </div>
            </div>
          )}

          {err && <p className="text-xs rounded px-3 py-2" style={{ color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)' }}>{err}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:opacity-70"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(240,240,240,0.7)' }}>
            Cancelar
          </button>
          <button form="task-form" type="submit" disabled={saving || !title.trim()} className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
            style={{ background: '#4B9BF5', color: '#fff' }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ReportModal ──────────────────────────────────────────────────────────────

function ReportModal({
  phaseId, profileId, token, onClose, onCreated,
}: {
  phaseId: string; profileId: string; token: string
  onClose: () => void; onCreated: (r: DailyReport) => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [accomplished, setAccomplished] = useState('')
  const [blockers, setBlockers]         = useState('')
  const [nextSteps, setNextSteps]       = useState('')
  const [saving, setSaving]             = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!accomplished.trim()) return
    setSaving(true)
    const body = {
      phase_id: phaseId,
      author_id: profileId || null,
      report_date: today,
      accomplished: accomplished.trim(),
      blockers: blockers.trim() || null,
      next_steps: nextSteps.trim() || null,
    }
    const res = await fetch(`${SB_URL}/rest/v1/daily_reports`,
      { method: 'POST', headers: hdrs(token), body: JSON.stringify(body) })
    if (res.ok) { const d = await res.json(); onCreated(d[0]) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-xl border shadow-2xl"
        style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="text-base font-semibold text-white">Reporte diario — {today}</h2>
          <button onClick={onClose} style={{ color: 'rgba(240,240,240,0.4)' }} className="hover:opacity-60">✕</button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs" style={{ color: 'rgba(240,240,240,0.5)' }}>¿Qué se hizo hoy? *</label>
            <textarea value={accomplished} onChange={(e) => setAccomplished(e.target.value)} required rows={3}
              style={{ ...inputCss, resize: 'none' }} placeholder="Avances y tareas completadas..." />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs" style={{ color: 'rgba(240,240,240,0.5)' }}>Bloqueos</label>
            <textarea value={blockers} onChange={(e) => setBlockers(e.target.value)} rows={2}
              style={{ ...inputCss, resize: 'none' }} placeholder="Problemas o dependencias que frenan el avance..." />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs" style={{ color: 'rgba(240,240,240,0.5)' }}>Próximos pasos</label>
            <textarea value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} rows={2}
              style={{ ...inputCss, resize: 'none' }} placeholder="Plan para mañana..." />
          </div>
          <div className="flex justify-end gap-2 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:opacity-70"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(240,240,240,0.7)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving || !accomplished.trim()} className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
              style={{ background: '#4B9BF5', color: '#fff' }}>
              {saving ? 'Guardando...' : 'Publicar reporte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function KanbanPageInner() {
  const router = useRouter()

  // Auth
  const [authChecked, setAuthChecked] = useState(false)
  const [isAdmin, setIsAdmin]         = useState(false)
  const [token, setToken]             = useState('')
  const [profileId, setProfileId]     = useState('')

  // Data
  const [phases, setPhases]           = useState<Phase[]>([])
  const [selectedPhase, setSelected]  = useState<Phase | null>(null)
  const [tasks, setTasks]             = useState<Task[]>([])
  const [reports, setReports]         = useState<DailyReport[]>([])
  const [tab, setTab]                 = useState<'board' | 'reports'>('board')

  // Loading
  const [loadingPhases, setLoadingPhases] = useState(true)
  const [loadingTasks, setLoadingTasks]   = useState(false)

  // Drag
  const draggedId = useRef<string | null>(null)

  // Modals
  const [phaseModal, setPhaseModal]   = useState<{ open: boolean; phase?: Phase }>({ open: false })
  const [taskModal, setTaskModal]     = useState<{ open: boolean; task: Task | null; initialStatus: TaskStatus }>({ open: false, task: null, initialStatus: 'todo' })
  const [reportModal, setReportModal] = useState(false)

  // ── Auth init ────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      try {
        const supabase = createClient()
        const { data: { user }, error: ue } = await supabase.auth.getUser()
        if (!user || ue) { window.location.href = '/login'; return }
        const { data: rd, error: re } = await supabase.auth.refreshSession()
        if (re || !rd.session) { window.location.href = '/login'; return }

        setAuthChecked(true)
        const t = rd.session.access_token
        setToken(t)

        const { data: role } = await supabase.rpc('get_my_role')
        if (role === 'admin') setIsAdmin(true)

        const headers = { apikey: SB_KEY, Authorization: `Bearer ${t}` }

        // Get admin profile id for notes authorship
        const pRes = await fetch(
          `${SB_URL}/rest/v1/admin_profiles?user_id=eq.${user.id}&select=id&limit=1`,
          { headers })
        if (pRes.ok) {
          const pData = await pRes.json()
          if (pData[0]) setProfileId(pData[0].id)
        }

        // Load phases
        const phRes = await fetch(
          `${SB_URL}/rest/v1/phases?project_id=eq.sg-sustenta-futuro&order=order_index.asc`,
          { headers })
        if (phRes.ok) {
          const phData: Phase[] = await phRes.json()
          setPhases(phData ?? [])
          if (phData?.length) {
            setSelected(phData[0])
            loadTasksFor(phData[0].id, t)
          }
        }
      } catch { window.location.href = '/login' }
      setLoadingPhases(false)
    }
    init()
  }, [])

  async function loadTasksFor(phaseId: string, t: string) {
    setLoadingTasks(true)
    const res = await fetch(
      `${SB_URL}/rest/v1/tasks?phase_id=eq.${phaseId}&order=order_index.asc,created_at.asc`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${t}` } })
    if (res.ok) setTasks((await res.json()) ?? [])
    setLoadingTasks(false)
  }

  async function loadReportsFor(phaseId: string, t: string) {
    const res = await fetch(
      `${SB_URL}/rest/v1/daily_reports?phase_id=eq.${phaseId}&select=*,admin_profiles(full_name)&order=report_date.desc`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${t}` } })
    if (res.ok) setReports((await res.json()) ?? [])
  }

  function selectPhase(phase: Phase) {
    setSelected(phase)
    setTab('board')
    loadTasksFor(phase.id, token)
    loadReportsFor(phase.id, token)
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // ── Drag & Drop ──────────────────────────────────────────────────────────

  async function handleDrop(newStatus: TaskStatus) {
    const id = draggedId.current
    if (!id) return
    const task = tasks.find((t) => t.id === id)
    if (!task || task.status === newStatus) return

    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: newStatus } : t))
    await fetch(`${SB_URL}/rest/v1/tasks?id=eq.${id}`,
      { method: 'PATCH', headers: hdrs(token, 'return=minimal'), body: JSON.stringify({ status: newStatus }) })
    draggedId.current = null
  }

  // ── Phase CRUD ───────────────────────────────────────────────────────────

  function handlePhaseSaved(phase: Phase) {
    setPhases((prev) => {
      const idx = prev.findIndex((p) => p.id === phase.id)
      if (idx >= 0) {
        const updated = [...prev]; updated[idx] = phase; return updated
      }
      return [...prev, phase]
    })
    if (selectedPhase?.id === phase.id) setSelected(phase)
    setPhaseModal({ open: false })
  }

  // ── Task CRUD ────────────────────────────────────────────────────────────

  function handleTaskSaved(task: Task) {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === task.id)
      if (idx >= 0) { const u = [...prev]; u[idx] = task; return u }
      return [...prev, task]
    })
    setTaskModal({ open: false, task: null, initialStatus: 'todo' })
  }

  function handleTaskDeleted(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    setTaskModal({ open: false, task: null, initialStatus: 'todo' })
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#000' }}>
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    )
  }

  // ── Nav ──────────────────────────────────────────────────────────────────

  const Nav = (
    <header className="border-b px-6 py-4 flex items-center justify-between flex-shrink-0"
      style={{ borderColor: 'rgba(255,255,255,0.08)', background: '#000' }}>
      <div className="flex items-center gap-2.5">
        <img src="/logo.png" alt="Sustenta Futuro" style={{ height: '28px', width: 'auto' }} />
        <span className="text-white font-semibold tracking-tight" style={{ fontFamily: 'var(--font-montserrat)' }}>
          Sustenta Futuro
        </span>
      </div>
      <div className="flex items-center gap-5">
        <button onClick={() => router.push('/')} className="text-sm hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Leads</button>
        <button onClick={() => router.push('/propuestas')} className="text-sm hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Propuestas</button>
        <span className="text-sm font-medium" style={{ color: '#4B9BF5' }}>Kanban</span>
        {isAdmin && <button onClick={() => router.push('/usuarios')} className="text-sm hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Usuarios</button>}
        {isAdmin && <button onClick={() => router.push('/configuracion')} className="text-sm hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Config. Landing</button>}
        <button onClick={handleLogout} className="text-sm hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Cerrar sesion</button>
      </div>
    </header>
  )

  // ── Layout ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#000', color: '#F0F0F0' }}>
      {Nav}

      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 65px)' }}>

        {/* ── Sidebar: Phases ── */}
        <aside className="flex flex-col border-r overflow-y-auto flex-shrink-0"
          style={{ width: '260px', borderColor: 'rgba(255,255,255,0.07)', background: '#000' }}>
          <div className="flex items-center justify-between px-4 py-4"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(240,240,240,0.35)' }}>
              Fases
            </span>
            <button
              onClick={() => setPhaseModal({ open: true })}
              className="rounded-md px-2.5 py-1 text-xs font-medium hover:opacity-80"
              style={{ background: 'rgba(75,155,245,0.1)', border: '1px solid rgba(75,155,245,0.2)', color: '#4B9BF5' }}>
              + Nueva
            </button>
          </div>

          {loadingPhases ? (
            <div className="px-4 py-6 flex flex-col gap-2">
              {[1,2,3].map((i) => (
                <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
              ))}
            </div>
          ) : phases.length === 0 ? (
            <p className="px-4 py-8 text-xs text-center" style={{ color: 'rgba(240,240,240,0.3)' }}>
              Sin fases. Crea la primera.
            </p>
          ) : (
            <div className="flex flex-col py-2">
              {phases.map((phase) => {
                const active = selectedPhase?.id === phase.id
                return (
                  <button
                    key={phase.id}
                    onClick={() => selectPhase(phase)}
                    className="flex flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
                    style={{
                      background: active ? 'rgba(75,155,245,0.06)' : 'transparent',
                      borderLeft: active ? '2px solid #4B9BF5' : '2px solid transparent',
                    }}>
                    <span className="text-sm font-medium text-white leading-snug line-clamp-1">{phase.name}</span>
                    <PhaseBadge status={phase.status} />
                  </button>
                )
              })}
            </div>
          )}
        </aside>

        {/* ── Main Board ── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {!selectedPhase ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm" style={{ color: 'rgba(240,240,240,0.3)' }}>
                Selecciona una fase para ver el tablero
              </p>
            </div>
          ) : (
            <>
              {/* Phase header */}
              <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#000' }}>
                <div className="flex items-center gap-3">
                  <div>
                    <h1 className="text-base font-semibold text-white">{selectedPhase.name}</h1>
                    {selectedPhase.description && (
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>{selectedPhase.description}</p>
                    )}
                  </div>
                  <PhaseBadge status={selectedPhase.status} />
                </div>
                <div className="flex items-center gap-2">
                  {/* Tabs */}
                  <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                    {(['board', 'reports'] as const).map((t) => (
                      <button key={t} onClick={() => { setTab(t); if (t === 'reports') loadReportsFor(selectedPhase.id, token) }}
                        className="px-3 py-1.5 text-xs font-medium transition-colors"
                        style={{
                          background: tab === t ? 'rgba(75,155,245,0.15)' : 'transparent',
                          color: tab === t ? '#4B9BF5' : 'rgba(240,240,240,0.5)',
                        }}>
                        {t === 'board' ? 'Tablero' : 'Reportes'}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setPhaseModal({ open: true, phase: selectedPhase })}
                    className="rounded-lg px-3 py-1.5 text-xs hover:opacity-70"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(240,240,240,0.6)' }}>
                    Editar
                  </button>
                </div>
              </div>

              {/* Tab: Board */}
              {tab === 'board' && (
                <div className="flex-1 overflow-x-auto overflow-y-hidden p-5">
                  <div className="flex gap-4 h-full" style={{ minWidth: '900px' }}>
                    {COLUMNS.map((col) => {
                      const colTasks = tasks.filter((t) => t.status === col.status)
                      return (
                        <div key={col.status}
                          className="flex flex-col rounded-xl flex-1"
                          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', minWidth: '220px' }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleDrop(col.status)}>
                          {/* Column header */}
                          <div className="flex items-center justify-between px-3 py-3"
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.accent }} />
                              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: col.accent }}>
                                {col.label}
                              </span>
                              <span className="text-xs rounded-full px-1.5 py-0.5 font-medium"
                                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(240,240,240,0.45)' }}>
                                {colTasks.length}
                              </span>
                            </div>
                            <button
                              onClick={() => setTaskModal({ open: true, task: null, initialStatus: col.status })}
                              className="text-xs hover:opacity-70"
                              style={{ color: 'rgba(240,240,240,0.35)' }}>
                              +
                            </button>
                          </div>

                          {/* Tasks */}
                          <div className="flex flex-col gap-2 p-3 flex-1 overflow-y-auto">
                            {loadingTasks ? (
                              [1,2].map((i) => (
                                <div key={i} className="h-16 rounded-lg animate-pulse"
                                  style={{ background: 'rgba(255,255,255,0.04)' }} />
                              ))
                            ) : colTasks.length === 0 ? (
                              <div className="flex-1 flex items-center justify-center"
                                style={{ minHeight: '80px' }}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={() => handleDrop(col.status)}>
                                <p className="text-xs" style={{ color: 'rgba(240,240,240,0.2)' }}>Vacío</p>
                              </div>
                            ) : (
                              colTasks.map((task) => (
                                <div key={task.id}
                                  draggable
                                  onDragStart={() => { draggedId.current = task.id }}
                                  onClick={() => setTaskModal({ open: true, task, initialStatus: task.status })}
                                  className="rounded-lg p-3 cursor-pointer select-none transition-all hover:border-white/20"
                                  style={{
                                    background: '#111',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                                  }}>
                                  <p className="text-sm font-medium text-white leading-snug">{task.title}</p>
                                  {task.description && (
                                    <p className="text-xs mt-1.5 line-clamp-2 leading-relaxed"
                                      style={{ color: 'rgba(240,240,240,0.4)' }}>
                                      {task.description}
                                    </p>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Tab: Reports */}
              {tab === 'reports' && (
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="max-w-2xl mx-auto">
                    <div className="flex items-center justify-between mb-5">
                      <h2 className="text-sm font-semibold text-white">Reportes diarios</h2>
                      <button
                        onClick={() => setReportModal(true)}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium hover:opacity-85"
                        style={{ background: '#4B9BF5', color: '#fff' }}>
                        + Nuevo reporte
                      </button>
                    </div>

                    {reports.length === 0 ? (
                      <p className="text-sm text-center py-12" style={{ color: 'rgba(240,240,240,0.3)' }}>
                        Sin reportes para esta fase.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-4">
                        {reports.map((r) => (
                          <div key={r.id} className="rounded-xl p-4"
                            style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.07)' }}>
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-sm font-semibold text-white">{fmtDate(r.report_date)}</span>
                              <span className="text-xs" style={{ color: 'rgba(240,240,240,0.35)' }}>
                                · {r.admin_profiles?.full_name ?? 'Admin'}
                              </span>
                            </div>
                            <div className="flex flex-col gap-2.5">
                              <div>
                                <p className="text-xs font-medium mb-1 uppercase tracking-wider" style={{ color: 'rgba(240,240,240,0.35)' }}>Hecho hoy</p>
                                <p className="text-sm leading-relaxed" style={{ color: 'rgba(240,240,240,0.8)' }}>{r.accomplished}</p>
                              </div>
                              {r.blockers && (
                                <div>
                                  <p className="text-xs font-medium mb-1 uppercase tracking-wider" style={{ color: 'rgba(248,113,113,0.6)' }}>Bloqueos</p>
                                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(240,240,240,0.6)' }}>{r.blockers}</p>
                                </div>
                              )}
                              {r.next_steps && (
                                <div>
                                  <p className="text-xs font-medium mb-1 uppercase tracking-wider" style={{ color: 'rgba(96,165,250,0.6)' }}>Próximos pasos</p>
                                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(240,240,240,0.6)' }}>{r.next_steps}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      {phaseModal.open && (
        <PhaseModal
          initial={phaseModal.phase}
          maxOrder={phases.length}
          token={token}
          onClose={() => setPhaseModal({ open: false })}
          onSaved={handlePhaseSaved}
        />
      )}

      {taskModal.open && selectedPhase && (
        <TaskModal
          task={taskModal.task}
          phaseId={selectedPhase.id}
          initialStatus={taskModal.initialStatus}
          profileId={profileId}
          token={token}
          onClose={() => setTaskModal({ open: false, task: null, initialStatus: 'todo' })}
          onSaved={handleTaskSaved}
          onDeleted={handleTaskDeleted}
        />
      )}

      {reportModal && selectedPhase && (
        <ReportModal
          phaseId={selectedPhase.id}
          profileId={profileId}
          token={token}
          onClose={() => setReportModal(false)}
          onCreated={(r) => { setReports((prev) => [r, ...prev]); setReportModal(false) }}
        />
      )}
    </div>
  )
}

export default function KanbanPage() {
  return (
    <Suspense>
      <KanbanPageInner />
    </Suspense>
  )
}
