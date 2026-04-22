'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ---- Texture section definitions ----

const TEXTURE_TARGETS = [
  { id: 'navbar',        label: 'Barra superior (Navbar)' },
  { id: 'hero',          label: 'Hero' },
  { id: 'sincon',        label: 'Antes / Después' },
  { id: 'producto',      label: 'Servicios (Globe)' },
  { id: 'proceso',       label: 'Cómo Trabajamos' },
  { id: 'testimonios',   label: 'Testimonios' },
  { id: 'diferenciadores', label: 'Por qué Elegirnos' },
  { id: 'nosotros',      label: 'Quiénes Somos' },
  { id: 'legal',         label: 'Cumplimiento Legal' },
  { id: 'faq',           label: 'FAQ' },
  { id: 'contacto',      label: 'Contacto' },
]

// Per-element color targets for each section
const ELEMENT_TARGETS: Record<string, Array<{ key: string; label: string }>> = {
  navbar: [
    { key: 'brand_color',         label: 'Nombre empresa (SUSTENTA FUTURO)' },
    { key: 'links_color',         label: 'Links de navegación (Nosotros, Proceso)' },
    { key: 'cta_color',           label: 'Botón Conversemos' },
  ],
  hero: [
    { key: 'h1_color',            label: 'Título — "Potencia tu operación."' },
    { key: 'gradient_color',      label: 'Subtítulo — "Libera tu talento."' },
    { key: 'p_color',             label: 'Párrafo de descripción' },
    { key: 'badge_color',         label: 'Badge (Sustenta Futuro)' },
    { key: 'cta_primary_color',   label: 'Botón Conversemos' },
    { key: 'cta_secondary_color', label: 'Botón Explorar' },
  ],
  sincon: [
    { key: 'label_color',  label: 'Label (Antes / Después)' },
    { key: 'title_color',  label: 'Título' },
    { key: 'sub_color',    label: 'Párrafo introductorio' },
    { key: 'sin_color',    label: 'Columna "Sin Sustenta Futuro"' },
    { key: 'con_color',    label: 'Columna "Con Sustenta Futuro"' },
  ],
  producto: [
    { key: 'label_color',  label: 'Label (Nuestros Servicios)' },
    { key: 'title_color',  label: 'Título' },
    { key: 'sub_color',    label: 'Subtítulo' },
    { key: 'cards_color',  label: 'Tarjetas de servicios' },
  ],
  proceso: [
    { key: 'label_color',  label: 'Label (Cómo trabajamos)' },
    { key: 'title_color',  label: 'Título' },
    { key: 'sub_color',    label: 'Subtítulo' },
    { key: 'steps_color',  label: 'Pasos (Diagnóstico, Diseño, etc.)' },
  ],
  testimonios: [
    { key: 'label_color',  label: 'Label (Clientes)' },
    { key: 'title_color',  label: 'Título' },
    { key: 'sub_color',    label: 'Subtítulo' },
    { key: 'cards_color',  label: 'Tarjetas de testimonios' },
  ],
  diferenciadores: [
    { key: 'label_color',  label: 'Label (Por qué elegirnos)' },
    { key: 'title_color',  label: 'Título' },
    { key: 'sub_color',    label: 'Subtítulo' },
    { key: 'items_color',  label: 'Items de diferenciadores' },
  ],
  nosotros: [
    { key: 'label_color',      label: 'Label (Quiénes somos)' },
    { key: 'title_color',      label: 'Título (h2)' },
    { key: 'paragraphs_color', label: 'Párrafos' },
    { key: 'name_color',       label: 'Nombre del fundador' },
  ],
  legal: [
    { key: 'label_color',  label: 'Label (Cumplimiento Legal)' },
    { key: 'title_color',  label: 'Título' },
    { key: 'sub_color',    label: 'Subtítulo' },
    { key: 'cards_color',  label: 'Tarjetas legales' },
  ],
  faq: [
    { key: 'label_color',     label: 'Label (Preguntas frecuentes)' },
    { key: 'title_color',     label: 'Título' },
    { key: 'questions_color', label: 'Preguntas' },
    { key: 'answers_color',   label: 'Respuestas' },
  ],
  contacto: [
    { key: 'label_color',       label: 'Label (Contacto)' },
    { key: 'title_color',       label: 'Título' },
    { key: 'sub_color',         label: 'Subtítulo' },
    { key: 'benefits_color',    label: 'Lista de beneficios (checks)' },
    { key: 'form_title_color',  label: 'Título del formulario' },
    { key: 'form_labels_color', label: 'Labels del formulario' },
  ],
}


interface ConfigRow {
  section: string
  key: string
  value: string
}

type ConfigMap = Record<string, Record<string, string>>

// ---- Shared input styles ----

const INPUT_STYLE = {
  background: '#111111',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#F0F0F0',
}

const LABEL_STYLE = { color: 'rgba(240,240,240,0.6)' }

function Field({
  label,
  type = 'input',
  value,
  onChange,
  placeholder,
}: {
  label: string
  type?: 'input' | 'textarea'
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const shared =
    'rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#4B9BF5]/40 w-full'
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs" style={LABEL_STYLE}>
        {label}
      </label>
      {type === 'textarea' ? (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${shared} resize-none`}
          style={INPUT_STYLE}
          placeholder={placeholder}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={shared}
          style={INPUT_STYLE}
          placeholder={placeholder}
        />
      )}
    </div>
  )
}

function SectionCard({
  title,
  children,
  onSave,
  saving,
  saved,
}: {
  title: string
  children: React.ReactNode
  onSave: () => void
  saving: boolean
  saved: boolean
}) {
  return (
    <div
      className="rounded-xl border p-6"
      style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
          {title}
        </h2>
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-lg px-4 py-1.5 text-sm font-medium transition-opacity disabled:opacity-40 hover:opacity-85"
          style={{ background: '#4B9BF5', color: '#ffffff' }}
        >
          {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar'}
        </button>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  )
}

// ---- TextureSlot ----

function TextureSlot({
  label,
  url,
  uploading,
  onUpload,
  onClear,
}: {
  label: string
  url: string
  uploading: boolean
  onUpload: (file: File) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs" style={LABEL_STYLE}>{label}</span>
      <div className="flex gap-2 items-center">
        <div
          className="rounded-lg flex-1 flex items-center justify-center overflow-hidden"
          style={{
            width: '56px',
            height: '56px',
            minWidth: '56px',
            border: '1px solid rgba(255,255,255,0.08)',
            background: url ? 'transparent' : '#111',
            flexShrink: 0,
          }}
        >
          {url ? (
            <img src={url} alt={label} className="object-cover w-full h-full rounded-lg" />
          ) : (
            <span style={{ color: 'rgba(240,240,240,0.2)', fontSize: '10px' }}>vacío</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <input
            type="text"
            value={url}
            readOnly
            placeholder="Sin textura"
            className="rounded-lg px-3 py-1.5 text-xs outline-none w-full truncate"
            style={{ ...INPUT_STYLE, color: 'rgba(240,240,240,0.45)' }}
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="rounded-md px-2.5 py-1 text-xs transition-opacity hover:opacity-70 disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(240,240,240,0.7)' }}
            >
              {uploading ? 'Subiendo...' : 'Subir'}
            </button>
            {url && (
              <button
                type="button"
                onClick={onClear}
                className="rounded-md px-2.5 py-1 text-xs transition-opacity hover:opacity-70"
                style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)', color: '#f87171' }}
              >
                Quitar
              </button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }}
      />
    </div>
  )
}

// ---- ColorPicker ----

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs" style={LABEL_STYLE}>{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#ffffff'}
          onChange={(e) => onChange(e.target.value)}
          className="rounded cursor-pointer"
          style={{ width: '36px', height: '36px', padding: '2px', background: 'none', border: '1px solid rgba(255,255,255,0.08)' }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Sin color"
          className="rounded-lg px-3 py-2 text-xs outline-none flex-1"
          style={INPUT_STYLE}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="rounded-md px-2.5 py-1 text-xs transition-opacity hover:opacity-70"
            style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)', color: '#f87171', whiteSpace: 'nowrap' }}
          >
            Quitar
          </button>
        )}
      </div>
    </div>
  )
}

// ---- Main page ----

export default function ConfiguracionPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [config, setConfig] = useState<ConfigMap>({})
  const [loadError, setLoadError] = useState<string | null>(null)

  // Per-section save state
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})

  // Publish state
  const [publishing, setPublishing] = useState(false)
  const [publishStatus, setPublishStatus] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [lastDeploy, setLastDeploy] = useState<string | null>(null)

  // Image upload ref
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // Texture upload state: key = `${sectionId}_${mapType}`
  const [uploadingTexture, setUploadingTexture] = useState<Record<string, boolean>>({})
  const colorSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  async function saveElementColor(fullKey: string, color: string) {
    set('textures', fullKey, color)
    // Debounce — wait 600ms after last change before saving
    clearTimeout(colorSaveTimers.current[fullKey])
    colorSaveTimers.current[fullKey] = setTimeout(async () => {
      const supabase = createClient()
      await supabase
        .from('landing_config')
        .upsert([{ section: 'textures', key: fullKey, value: color }], { onConflict: 'section,key' })
    }, 600)
  }

  // ---- Auth + load ----

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

        const { data: refreshData, error: refreshError } =
          await supabase.auth.refreshSession()
        if (refreshError || !refreshData.session) {
          window.location.href = '/login'
          return
        }

        const { data: roleData } = await supabase.rpc('get_my_role')
        if (roleData !== 'admin') {
          window.location.href = '/'
          return
        }

        setAuthChecked(true)

        // Load config
        const { data, error } = await supabase
          .from('landing_config')
          .select('*')

        if (error) {
          setLoadError(`Error al cargar configuracion: ${error.message}`)
        } else if (data) {
          const map: ConfigMap = {}
          for (const row of data as ConfigRow[]) {
            if (!map[row.section]) map[row.section] = {}
            map[row.section][row.key] = row.value ?? ''
          }
          setConfig(map)
        }
      } catch {
        window.location.href = '/login'
      }
    }

    init()

    // Restore last deploy from localStorage
    const stored = localStorage.getItem('sf_last_deploy')
    if (stored) setLastDeploy(stored)
  }, [])

  // ---- Helpers ----

  function get(section: string, key: string): string {
    return config[section]?.[key] ?? ''
  }

  function set(section: string, key: string, value: string) {
    setConfig((prev) => ({
      ...prev,
      [section]: { ...(prev[section] ?? {}), [key]: value },
    }))
  }

  async function saveSection(section: string, keys: string[]) {
    setSaving((p) => ({ ...p, [section]: true }))
    setSaved((p) => ({ ...p, [section]: false }))
    try {
      const supabase = createClient()
      const rows = keys.map((key) => ({
        section,
        key,
        value: get(section, key),
      }))
      const { error } = await supabase
        .from('landing_config')
        .upsert(rows, { onConflict: 'section,key' })
      if (error) {
        alert(`Error al guardar: ${error.message}`)
      } else {
        setSaved((p) => ({ ...p, [section]: true }))
        setTimeout(
          () => setSaved((p) => ({ ...p, [section]: false })),
          2500
        )
      }
    } finally {
      setSaving((p) => ({ ...p, [section]: false }))
    }
  }

  async function handlePublish() {
    setPublishing(true)
    setPublishStatus(null)
    try {
      const res = await fetch('/api/publish', { method: 'POST' })
      const body = await res.json()
      if (!res.ok || body.error) {
        setPublishStatus({
          type: 'error',
          message: body.error ?? `Error ${res.status}`,
        })
      } else {
        const ts = body.publishedAt as string
        setLastDeploy(ts)
        localStorage.setItem('sf_last_deploy', ts)
        setPublishStatus({
          type: 'success',
          message: 'Publicado correctamente.',
        })
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error inesperado'
      setPublishStatus({ type: 'error', message: msg })
    } finally {
      setPublishing(false)
    }
  }

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() ?? 'jpg'
      const filename = `founder-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('landing-images')
        .upload(filename, file, { upsert: true })
      if (uploadError) {
        alert(`Error al subir imagen: ${uploadError.message}`)
        return
      }
      const { data: urlData } = supabase.storage
        .from('landing-images')
        .getPublicUrl(filename)
      if (urlData?.publicUrl) {
        set('nosotros', 'founder_photo_url', urlData.publicUrl)
      }
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function handleTextureUpload(sectionId: string, mapType: string, file: File) {
    const key = `${sectionId}_${mapType}`
    setUploadingTexture((p) => ({ ...p, [key]: true }))
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() ?? 'png'
      const filename = `texture-${sectionId}-${mapType}-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('landing-images')
        .upload(filename, file, { upsert: true })
      if (uploadError) {
        alert(`Error al subir textura: ${uploadError.message}`)
        return
      }
      const { data: urlData } = supabase.storage
        .from('landing-images')
        .getPublicUrl(filename)
      if (urlData?.publicUrl) {
        set('textures', key, urlData.publicUrl)
        // Persist immediately
        const supabase2 = createClient()
        await supabase2
          .from('landing_config')
          .upsert([{ section: 'textures', key, value: urlData.publicUrl }], { onConflict: 'section,key' })
      }
    } finally {
      setUploadingTexture((p) => ({ ...p, [key]: false }))
    }
  }

  async function clearTexture(sectionId: string, mapType: string) {
    const key = `${sectionId}_${mapType}`
    set('textures', key, '')
    const supabase = createClient()
    await supabase
      .from('landing_config')
      .upsert([{ section: 'textures', key, value: '' }], { onConflict: 'section,key' })
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  function formatDeploy(iso: string): string {
    try {
      const d = new Date(iso)
      return d.toLocaleString('es-CL', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    } catch {
      return iso
    }
  }

  // ---- Loading screen ----

  if (!authChecked) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: '#000000' }}
      >
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    )
  }

  // ---- Page ----

  return (
    <div className="min-h-screen" style={{ background: '#000000', color: '#F0F0F0' }}>
      {/* Nav */}
      <header
        className="border-b px-6 py-4 flex items-center justify-between"
        style={{ borderColor: 'rgba(255,255,255,0.08)', background: '#000000' }}
      >
        <div className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt="Sustenta Futuro"
            style={{ height: '28px', width: 'auto' }}
          />
          <span
            className="text-white font-semibold tracking-tight"
            style={{ fontFamily: 'var(--font-montserrat)' }}
          >
            Sustenta Futuro
          </span>
        </div>
        <div className="flex items-center gap-5">
          <button onClick={() => router.push('/')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Leads</button>
          <button onClick={() => router.push('/propuestas')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Propuestas</button>
          <button onClick={() => router.push('/proyectos')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Proyectos</button>
          <button onClick={() => router.push('/usuarios')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Usuarios</button>
          <span className="text-sm font-medium" style={{ color: '#4B9BF5' }}>Config. Landing</span>
          <button onClick={handleLogout} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Cerrar sesión</button>
        </div>
      </header>

      {/* Main */}
      <main className="px-6 py-8 max-w-3xl mx-auto">
        {/* Page header + publish */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">
              Configuracion de la Pagina
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>
              Edita el contenido del sitio web publico.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="rounded-lg px-5 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-40 hover:opacity-85 whitespace-nowrap"
              style={{ background: '#4B9BF5', color: '#ffffff' }}
            >
              {publishing ? 'Publicando...' : 'Publicar en la web'}
            </button>
            {lastDeploy && (
              <p className="text-xs" style={{ color: 'rgba(240,240,240,0.35)' }}>
                Ultimo deploy: {formatDeploy(lastDeploy)}
              </p>
            )}
          </div>
        </div>

        {/* Publish status banner */}
        {publishStatus && (
          <div
            className="rounded-lg px-4 py-3 text-sm mb-6"
            style={
              publishStatus.type === 'success'
                ? {
                    background: 'rgba(34,197,94,0.08)',
                    border: '1px solid rgba(34,197,94,0.2)',
                    color: '#4ade80',
                  }
                : {
                    background: 'rgba(248,113,113,0.08)',
                    border: '1px solid rgba(248,113,113,0.15)',
                    color: '#f87171',
                  }
            }
          >
            {publishStatus.message}
          </div>
        )}

        {/* Load error */}
        {loadError && (
          <div
            className="rounded-lg px-4 py-3 text-sm mb-6"
            style={{
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.15)',
              color: '#f87171',
            }}
          >
            {loadError}
          </div>
        )}

        <div className="flex flex-col gap-6">
          {/* ---- HERO ---- */}
          <SectionCard
            title="Hero"
            onSave={() => saveSection('hero', ['description'])}
            saving={!!saving['hero']}
            saved={!!saved['hero']}
          >
            <Field
              label="Descripcion del hero"
              type="textarea"
              value={get('hero', 'description')}
              onChange={(v) => set('hero', 'description', v)}
              placeholder="Automatizamos procesos para empresas..."
            />
          </SectionCard>

          {/* ---- METRICAS ---- */}
          <SectionCard
            title="Metricas"
            onSave={() =>
              saveSection('metrics', [
                'metric_1_label',
                'metric_2_label',
                'metric_3_label',
              ])
            }
            saving={!!saving['metrics']}
            saved={!!saved['metrics']}
          >
            <div className="grid grid-cols-1 gap-4">
              <Field
                label="Metrica 1 — descripcion (80% ahorro de tiempo)"
                value={get('metrics', 'metric_1_label')}
                onChange={(v) => set('metrics', 'metric_1_label', v)}
                placeholder="ahorro de tiempo en tareas repetitivas"
              />
              <Field
                label="Metrica 2 — descripcion (24/7)"
                value={get('metrics', 'metric_2_label')}
                onChange={(v) => set('metrics', 'metric_2_label', v)}
                placeholder="disponibilidad sin interrupciones"
              />
              <Field
                label="Metrica 3 — descripcion (100%)"
                value={get('metrics', 'metric_3_label')}
                onChange={(v) => set('metrics', 'metric_3_label', v)}
                placeholder="personalización y soporte técnico ágil"
              />
            </div>
          </SectionCard>

          {/* ---- QUIENES SOMOS ---- */}
          <SectionCard
            title="Quienes somos"
            onSave={() =>
              saveSection('nosotros', [
                'text_1',
                'text_2',
                'founder_name',
                'founder_photo_url',
              ])
            }
            saving={!!saving['nosotros']}
            saved={!!saved['nosotros']}
          >
            <Field
              label="Parrafo 1"
              type="textarea"
              value={get('nosotros', 'text_1')}
              onChange={(v) => set('nosotros', 'text_1', v)}
              placeholder="Somos una empresa..."
            />
            <Field
              label="Parrafo 2"
              type="textarea"
              value={get('nosotros', 'text_2')}
              onChange={(v) => set('nosotros', 'text_2', v)}
              placeholder="Nuestro equipo..."
            />
            <Field
              label="Nombre del fundador"
              value={get('nosotros', 'founder_name')}
              onChange={(v) => set('nosotros', 'founder_name', v)}
              placeholder="Juan Perez"
            />
            {/* Founder photo */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs" style={LABEL_STYLE}>
                URL de la foto del fundador
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={get('nosotros', 'founder_photo_url')}
                  onChange={(e) =>
                    set('nosotros', 'founder_photo_url', e.target.value)
                  }
                  className="rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[#4B9BF5]/40 flex-1"
                  style={INPUT_STYLE}
                  placeholder="https://..."
                />
                <button
                  type="button"
                  disabled={uploadingPhoto}
                  onClick={() => photoInputRef.current?.click()}
                  className="rounded-lg px-3 py-2 text-sm transition-opacity hover:opacity-70 disabled:opacity-40 whitespace-nowrap"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(240,240,240,0.7)',
                  }}
                >
                  {uploadingPhoto ? 'Subiendo...' : 'Subir foto'}
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handlePhotoUpload(file)
                  }}
                />
              </div>
              {get('nosotros', 'founder_photo_url') && (
                <img
                  src={get('nosotros', 'founder_photo_url')}
                  alt="Vista previa"
                  className="mt-1 rounded-lg object-cover"
                  style={{
                    width: '64px',
                    height: '64px',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                />
              )}
            </div>
          </SectionCard>

          {/* ---- TESTIMONIOS ---- */}
          <SectionCard
            title="Testimonios"
            onSave={() =>
              saveSection('testimonios', [
                'tc_1_text',
                'tc_1_name',
                'tc_1_role',
                'tc_2_text',
                'tc_2_name',
                'tc_2_role',
                'tc_3_text',
                'tc_3_name',
                'tc_3_role',
              ])
            }
            saving={!!saving['testimonios']}
            saved={!!saved['testimonios']}
          >
            {([1, 2, 3] as const).map((n) => (
              <div
                key={n}
                className="flex flex-col gap-3 pb-5"
                style={
                  n < 3
                    ? { borderBottom: '1px solid rgba(255,255,255,0.06)' }
                    : {}
                }
              >
                <p
                  className="text-xs font-medium uppercase tracking-wider"
                  style={{ color: 'rgba(240,240,240,0.35)' }}
                >
                  Testimonio {n}
                </p>
                <Field
                  label="Texto"
                  type="textarea"
                  value={get('testimonios', `tc_${n}_text`)}
                  onChange={(v) => set('testimonios', `tc_${n}_text`, v)}
                  placeholder="Excelente servicio..."
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="Nombre"
                    value={get('testimonios', `tc_${n}_name`)}
                    onChange={(v) => set('testimonios', `tc_${n}_name`, v)}
                    placeholder="Maria Lopez"
                  />
                  <Field
                    label="Cargo / empresa"
                    value={get('testimonios', `tc_${n}_role`)}
                    onChange={(v) => set('testimonios', `tc_${n}_role`, v)}
                    placeholder="Gerente, Empresa S.A."
                  />
                </div>
              </div>
            ))}
          </SectionCard>
          {/* ---- TEXTURAS ---- */}
          <div
            className="rounded-xl border p-6"
            style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <div className="mb-5">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                Texturas y colores de secciones
              </h2>
              <p className="text-xs mt-1" style={{ color: 'rgba(240,240,240,0.4)' }}>
                Asigna textura y color de texto a cada sección. Los cambios se guardan al instante.
              </p>
            </div>

            <div className="flex flex-col gap-6">
              {TEXTURE_TARGETS.map(({ id, label }) => (
                <div key={id} className="flex flex-col gap-3 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#4B9BF5' }}>{label}</p>
                  <TextureSlot
                    label="Textura de fondo"
                    url={get('textures', `${id}_base`)}
                    uploading={!!uploadingTexture[`${id}_base`]}
                    onUpload={(file) => handleTextureUpload(id, 'base', file)}
                    onClear={() => clearTexture(id, 'base')}
                  />
                  {(ELEMENT_TARGETS[id] ?? []).map(({ key, label: elemLabel }) => (
                    <ColorPicker
                      key={key}
                      label={elemLabel}
                      value={get('textures', `${id}_${key}`)}
                      onChange={(v) => saveElementColor(`${id}_${key}`, v)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
