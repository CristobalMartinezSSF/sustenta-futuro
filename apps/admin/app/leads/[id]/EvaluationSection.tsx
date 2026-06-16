'use client'

import { useEffect, useState } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

type VerdictValue = 'pending' | 'viable' | 'not_viable'
type ComplexityValue = 'low' | 'medium' | 'high'

interface Evaluation {
  id: string
  lead_id: string
  project_title: string | null
  description: string | null
  functionalities: unknown[] | null
  stack: unknown[] | null
  phases: unknown[] | null
  estimated_hours: number | null
  internal_cost: number | null
  client_price: number | null
  price_currency: string | null
  price_breakdown: unknown[] | null
  monthly_maintenance: number | null
  payment_method: string | null
  total_duration: string | null
  offer_validity: number | null
  complexity: ComplexityValue | null
  margin: number | null
  risks: string | null
  verdict: VerdictValue
  verdict_by: string | null
  verdict_at: string | null
  notes: string | null
}

// Local editable form shape (lists held as multiline text for simple editing).
interface Form {
  project_title: string
  description: string
  functionalities: string
  stack: string
  phases: string
  estimated_hours: string
  internal_cost: string
  client_price: string
  price_currency: string
  price_breakdown: string
  monthly_maintenance: string
  payment_method: string
  total_duration: string
  offer_validity: string
  complexity: ComplexityValue | ''
  risks: string
  notes: string
}

const EMPTY_FORM: Form = {
  project_title: '', description: '', functionalities: '', stack: '', phases: '',
  estimated_hours: '', internal_cost: '', client_price: '', price_currency: 'UF',
  price_breakdown: '', monthly_maintenance: '', payment_method: '', total_duration: '',
  offer_validity: '15', complexity: '', risks: '', notes: '',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://sustenta-futuro-api.onrender.com'

const VERDICT_LABELS: Record<VerdictValue, string> = {
  pending: 'Pendiente',
  viable: 'Viable',
  not_viable: 'No viable',
}

const VERDICT_COLORS: Record<VerdictValue, { bg: string; text: string; border: string }> = {
  pending: { bg: 'rgba(234,179,8,0.1)', text: '#fbbf24', border: 'rgba(234,179,8,0.25)' },
  viable: { bg: 'rgba(34,197,94,0.1)', text: '#4ade80', border: 'rgba(34,197,94,0.25)' },
  not_viable: { bg: 'rgba(239,68,68,0.1)', text: '#f87171', border: 'rgba(239,68,68,0.25)' },
}

/** Array (of strings or objects) → multiline text for editing. */
function listToText(value: unknown[] | null): string {
  if (!value || !Array.isArray(value)) return ''
  return value
    .map((item) =>
      typeof item === 'string' ? item : typeof item === 'object' && item !== null
        ? Object.values(item).join(' - ')
        : String(item)
    )
    .join('\n')
}

/** Multiline text → array of trimmed, non-empty strings. */
function textToList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

function formatMoney(value: number | null, currency: string | null): string {
  if (value == null) return '—'
  const formatted = Number.isInteger(value)
    ? value.toLocaleString('es-CL')
    : value.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${formatted} ${currency || 'UF'}`
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function EvaluationSection({
  leadId,
  accessToken,
  userId,
  onLeadStatusChange,
}: {
  leadId: string
  accessToken: string
  userId: string
  /** Called after a 'viable' verdict advances the lead so the parent can refresh. */
  onLeadStatusChange?: (status: string) => void
}) {
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [form, setForm] = useState<Form>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settingVerdict, setSettingVerdict] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const restHeaders = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }

  // ── Load existing evaluation ────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `${base}/rest/v1/lead_evaluations?lead_id=eq.${leadId}&select=*&limit=1`,
          { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } }
        )
        if (res.ok) {
          const data = await res.json()
          if (data && data[0]) {
            applyEvaluation(data[0] as Evaluation)
          }
        }
      } catch {
        // Silent — section simply shows an empty ficha.
      }
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  function applyEvaluation(ev: Evaluation) {
    setEvaluation(ev)
    setForm({
      project_title: ev.project_title ?? '',
      description: ev.description ?? '',
      functionalities: listToText(ev.functionalities),
      stack: listToText(ev.stack),
      phases: listToText(ev.phases),
      estimated_hours: ev.estimated_hours?.toString() ?? '',
      internal_cost: ev.internal_cost?.toString() ?? '',
      client_price: ev.client_price?.toString() ?? '',
      price_currency: ev.price_currency ?? 'UF',
      price_breakdown: listToText(ev.price_breakdown),
      monthly_maintenance: ev.monthly_maintenance?.toString() ?? '',
      payment_method: ev.payment_method ?? '',
      total_duration: ev.total_duration ?? '',
      offer_validity: ev.offer_validity?.toString() ?? '15',
      complexity: ev.complexity ?? '',
      risks: ev.risks ?? '',
      notes: ev.notes ?? '',
    })
  }

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  // ── Save (upsert) ────────────────────────────────────────────────────────────
  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError(null)
    setSaved(false)

    const payload: Record<string, unknown> = {
      project_title: form.project_title.trim() || null,
      description: form.description.trim() || null,
      functionalities: textToList(form.functionalities),
      stack: textToList(form.stack),
      phases: textToList(form.phases),
      estimated_hours: form.estimated_hours ? parseInt(form.estimated_hours, 10) : null,
      internal_cost: parseNumber(form.internal_cost),
      client_price: parseNumber(form.client_price),
      price_currency: form.price_currency || 'UF',
      price_breakdown: textToList(form.price_breakdown),
      monthly_maintenance: parseNumber(form.monthly_maintenance),
      payment_method: form.payment_method.trim() || null,
      total_duration: form.total_duration.trim() || null,
      offer_validity: form.offer_validity ? parseInt(form.offer_validity, 10) : 15,
      complexity: form.complexity || null,
      risks: form.risks.trim() || null,
      notes: form.notes.trim() || null,
    }

    try {
      let res: Response
      if (evaluation) {
        res = await fetch(
          `${base}/rest/v1/lead_evaluations?id=eq.${evaluation.id}`,
          { method: 'PATCH', headers: { ...restHeaders, Prefer: 'return=representation' }, body: JSON.stringify(payload) }
        )
      } else {
        res = await fetch(
          `${base}/rest/v1/lead_evaluations`,
          { method: 'POST', headers: { ...restHeaders, Prefer: 'return=representation' }, body: JSON.stringify({ ...payload, lead_id: leadId }) }
        )
      }
      if (!res.ok) {
        const body = await res.text()
        setError(`Error al guardar: ${body}`)
        return
      }
      const data = await res.json()
      if (data && data[0]) applyEvaluation(data[0] as Evaluation)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Error inesperado al guardar la ficha.')
    } finally {
      setSaving(false)
    }
  }

  // ── Verdict ───────────────────────────────────────────────────────────────────
  async function handleVerdict(verdict: VerdictValue) {
    if (!evaluation || settingVerdict || evaluation.verdict === verdict) return
    setSettingVerdict(true)
    setError(null)
    try {
      const res = await fetch(
        `${base}/rest/v1/lead_evaluations?id=eq.${evaluation.id}`,
        {
          method: 'PATCH',
          headers: { ...restHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({
            verdict,
            verdict_by: userId || null,
            verdict_at: new Date().toISOString(),
          }),
        }
      )
      if (!res.ok) {
        const body = await res.text()
        setError(`Error al guardar veredicto: ${body}`)
        return
      }
      const data = await res.json()
      if (data && data[0]) applyEvaluation(data[0] as Evaluation)

      // A 'viable' verdict advances the lead in the pipeline.
      if (verdict === 'viable') {
        await fetch(`${base}/rest/v1/leads?id=eq.${leadId}`, {
          method: 'PATCH',
          headers: { ...restHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ status: 'viable' }),
        })
        onLeadStatusChange?.('viable')
      }
    } catch {
      setError('Error inesperado al guardar el veredicto.')
    } finally {
      setSettingVerdict(false)
    }
  }

  // ── Ensure a proposal record exists so the lead shows up in /propuestas ────────
  // The PDF endpoint only renders the document; it does NOT create a tracked
  // proposal. Without this, the Propuestas page stays empty. Idempotent: only
  // creates a draft when the lead has no proposal yet.
  async function ensureProposalRecord(): Promise<boolean> {
    try {
      const listRes = await fetch(`${API_URL}/leads/${leadId}/proposals`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (listRes.ok) {
        const existing = await listRes.json()
        if (Array.isArray(existing) && existing.length > 0) return true
      }
      const createRes = await fetch(`${API_URL}/leads/${leadId}/proposal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      return createRes.ok
    } catch {
      return false
    }
  }

  // ── Download proposal PDF (via FastAPI — server-side render) ───────────────────
  async function handleDownloadPdf() {
    if (generatingPdf) return
    setGeneratingPdf(true)
    setPdfError(null)
    try {
      // Register the proposal first so it appears in the Propuestas list.
      const registered = await ensureProposalRecord()
      if (!registered) {
        setPdfError('La propuesta no se pudo registrar en el listado, pero igual se generó el PDF. Reintenta para que aparezca en Propuestas.')
      }
      const res = await fetch(`${API_URL}/leads/${leadId}/proposal/pdf`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        const body = await res.text()
        setPdfError(`No se pudo generar el PDF (${res.status}). ${body.slice(0, 120)}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch {
      setPdfError('No se pudo conectar con el servicio de propuestas.')
    } finally {
      setGeneratingPdf(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const cardStyle = { background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }
  const inputStyle: React.CSSProperties = {
    background: '#111111',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#F0F0F0',
  }
  const labelStyle: React.CSSProperties = { color: 'rgba(240,240,240,0.55)' }

  // Live margin preview (DB also computes it on save).
  const livePrice = parseNumber(form.client_price)
  const liveCost = parseNumber(form.internal_cost)
  const liveMargin = livePrice != null && liveCost != null ? livePrice - liveCost : evaluation?.margin ?? null
  const verdict = evaluation?.verdict ?? 'pending'

  if (loading) {
    return (
      <div className="rounded-xl border p-5" style={cardStyle}>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <span className="text-sm" style={{ color: 'rgba(240,240,240,0.4)' }}>Cargando ficha de evaluación...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border p-5" style={cardStyle}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(240,240,240,0.35)' }}>
          Ficha de evaluación técnico-económica
        </p>
        <span
          className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium"
          style={{ background: VERDICT_COLORS[verdict].bg, color: VERDICT_COLORS[verdict].text, border: `1px solid ${VERDICT_COLORS[verdict].border}` }}
        >
          {VERDICT_LABELS[verdict]}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Título del proyecto" full>
          <input type="text" value={form.project_title} onChange={(e) => set('project_title', e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none w-full focus:ring-1 focus:ring-[#4B9BF5]/40" style={inputStyle} />
        </Field>

        <Field label="Descripción / Objetivo" full>
          <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none w-full resize-y focus:ring-1 focus:ring-[#4B9BF5]/40" style={inputStyle} />
        </Field>

        <Field label="Funcionalidades / Alcance (una por línea)" full>
          <textarea rows={4} value={form.functionalities} onChange={(e) => set('functionalities', e.target.value)}
            placeholder={'Dashboard de métricas\nRegistro de retiros\nReportería automática'}
            className="rounded-lg px-3 py-2 text-sm outline-none w-full resize-y focus:ring-1 focus:ring-[#4B9BF5]/40" style={inputStyle} />
        </Field>

        <Field label="Stack tecnológico (uno por línea)">
          <textarea rows={4} value={form.stack} onChange={(e) => set('stack', e.target.value)}
            placeholder={'Next.js\nFastAPI\nSupabase'}
            className="rounded-lg px-3 py-2 text-sm outline-none w-full resize-y focus:ring-1 focus:ring-[#4B9BF5]/40" style={inputStyle} />
        </Field>

        <Field label="Fases de implementación (una por línea)">
          <textarea rows={4} value={form.phases} onChange={(e) => set('phases', e.target.value)}
            placeholder={'Descubrimiento - 1 semana\nDesarrollo - 4 semanas'}
            className="rounded-lg px-3 py-2 text-sm outline-none w-full resize-y focus:ring-1 focus:ring-[#4B9BF5]/40" style={inputStyle} />
        </Field>

        <Field label="Complejidad técnica">
          <select value={form.complexity} onChange={(e) => set('complexity', e.target.value as ComplexityValue | '')}
            className="rounded-lg px-3 py-2 text-sm outline-none w-full focus:ring-1 focus:ring-[#4B9BF5]/40" style={{ ...inputStyle, appearance: 'none' }}>
            <option value="" style={{ background: '#111' }}>—</option>
            <option value="low" style={{ background: '#111' }}>Baja</option>
            <option value="medium" style={{ background: '#111' }}>Media</option>
            <option value="high" style={{ background: '#111' }}>Alta</option>
          </select>
        </Field>

        <Field label="Horas estimadas">
          <input type="number" min="0" value={form.estimated_hours} onChange={(e) => set('estimated_hours', e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none w-full focus:ring-1 focus:ring-[#4B9BF5]/40" style={inputStyle} />
        </Field>

        <Field label="Moneda">
          <select value={form.price_currency} onChange={(e) => set('price_currency', e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none w-full focus:ring-1 focus:ring-[#4B9BF5]/40" style={{ ...inputStyle, appearance: 'none' }}>
            <option value="UF" style={{ background: '#111' }}>UF</option>
            <option value="USD" style={{ background: '#111' }}>USD</option>
            <option value="CLP" style={{ background: '#111' }}>CLP</option>
          </select>
        </Field>

        <Field label="Costo interno">
          <input type="text" value={form.internal_cost} onChange={(e) => set('internal_cost', e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none w-full focus:ring-1 focus:ring-[#4B9BF5]/40" style={inputStyle} />
        </Field>

        <Field label="Precio al cliente">
          <input type="text" value={form.client_price} onChange={(e) => set('client_price', e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none w-full focus:ring-1 focus:ring-[#4B9BF5]/40" style={inputStyle} />
        </Field>

        <Field label="Desglose de precio (uno por línea)" full>
          <textarea rows={3} value={form.price_breakdown} onChange={(e) => set('price_breakdown', e.target.value)}
            placeholder={'Desarrollo: 380 UF\nQA: 70 UF'}
            className="rounded-lg px-3 py-2 text-sm outline-none w-full resize-y focus:ring-1 focus:ring-[#4B9BF5]/40" style={inputStyle} />
        </Field>

        <Field label="Mantenimiento mensual">
          <input type="text" value={form.monthly_maintenance} onChange={(e) => set('monthly_maintenance', e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none w-full focus:ring-1 focus:ring-[#4B9BF5]/40" style={inputStyle} />
        </Field>

        <Field label="Duración total">
          <input type="text" value={form.total_duration} onChange={(e) => set('total_duration', e.target.value)}
            placeholder="Ej: 5 semanas" className="rounded-lg px-3 py-2 text-sm outline-none w-full focus:ring-1 focus:ring-[#4B9BF5]/40" style={inputStyle} />
        </Field>

        <Field label="Forma de pago">
          <input type="text" value={form.payment_method} onChange={(e) => set('payment_method', e.target.value)}
            placeholder="Ej: 50% anticipo, 50% al entregar" className="rounded-lg px-3 py-2 text-sm outline-none w-full focus:ring-1 focus:ring-[#4B9BF5]/40" style={inputStyle} />
        </Field>

        <Field label="Vigencia de la oferta (días)">
          <input type="number" min="1" value={form.offer_validity} onChange={(e) => set('offer_validity', e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none w-full focus:ring-1 focus:ring-[#4B9BF5]/40" style={inputStyle} />
        </Field>

        <Field label="Riesgos" full>
          <textarea rows={2} value={form.risks} onChange={(e) => set('risks', e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none w-full resize-y focus:ring-1 focus:ring-[#4B9BF5]/40" style={inputStyle} />
        </Field>

        <Field label="Notas de evaluación" full>
          <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none w-full resize-y focus:ring-1 focus:ring-[#4B9BF5]/40" style={inputStyle} />
        </Field>
      </div>

      {/* Margin */}
      <div className="mt-4 flex items-center justify-between rounded-lg px-4 py-3"
        style={{ background: 'rgba(75,155,245,0.06)', border: '1px solid rgba(75,155,245,0.15)' }}>
        <span className="text-xs" style={{ color: 'rgba(240,240,240,0.5)' }}>Margen estimado (precio − costo)</span>
        <span className="text-sm font-semibold tabular-nums"
          style={{ color: liveMargin != null && liveMargin < 0 ? '#f87171' : '#4ade80' }}>
          {formatMoney(liveMargin, form.price_currency)}
        </span>
      </div>

      {error && (
        <p className="text-xs rounded px-3 py-2 mt-3" style={{ color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)' }}>
          {error}
        </p>
      )}

      {/* Save row */}
      <div className="flex items-center justify-end gap-3 mt-4">
        {saved && <span className="text-xs" style={{ color: '#4ade80' }}>Guardado</span>}
        <button onClick={handleSave} disabled={saving}
          className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
          style={{ background: '#4B9BF5', color: '#fff' }}>
          {saving ? 'Guardando...' : 'Guardar ficha'}
        </button>
      </div>

      {/* Verdict + PDF actions (require a saved evaluation) */}
      <div className="mt-5 pt-5 flex flex-col gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-xs" style={{ color: 'rgba(240,240,240,0.4)' }}>
          Veredicto de viabilidad (aprobación de Héctor). Marcar “Viable” avanza el lead a la etapa <em>Viable</em>.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {(['viable', 'not_viable', 'pending'] as VerdictValue[]).map((v) => {
            const active = verdict === v
            const c = VERDICT_COLORS[v]
            return (
              <button key={v} onClick={() => handleVerdict(v)} disabled={!evaluation || settingVerdict}
                className="rounded-lg px-3.5 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
                style={{
                  background: active ? c.bg : 'rgba(255,255,255,0.04)',
                  color: active ? c.text : 'rgba(240,240,240,0.6)',
                  border: `1px solid ${active ? c.border : 'rgba(255,255,255,0.08)'}`,
                }}>
                {VERDICT_LABELS[v]}
              </button>
            )
          })}
          <div className="flex-1" />
          <button onClick={handleDownloadPdf} disabled={!evaluation || generatingPdf}
            className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(240,240,240,0.85)' }}>
            {generatingPdf && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
            {generatingPdf ? 'Generando...' : 'Generar propuesta PDF'}
          </button>
        </div>
        {!evaluation && (
          <p className="text-xs" style={{ color: 'rgba(240,240,240,0.3)' }}>
            Guarda la ficha primero para habilitar el veredicto y la generación de propuesta.
          </p>
        )}
        {pdfError && (
          <p className="text-xs rounded px-3 py-2" style={{ color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)' }}>
            {pdfError}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Field wrapper ──────────────────────────────────────────────────────────

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? 'sm:col-span-2' : ''}`}>
      <label className="text-xs" style={{ color: 'rgba(240,240,240,0.55)' }}>{label}</label>
      {children}
    </div>
  )
}
