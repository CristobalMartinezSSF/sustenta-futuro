'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function PropuestasPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        const supabase = createClient()
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (!user || userError) { window.location.href = '/login'; return }
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError || !refreshData.session) { window.location.href = '/login'; return }
        const { data: roleData } = await supabase.rpc('get_my_role')
        if (roleData === 'admin') setIsAdmin(true)
        setAuthChecked(true)
      } catch {
        window.location.href = '/login'
      }
    }
    init()
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (!authChecked) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#000000' }}>
      <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
    </div>
  )

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
          <span className="text-sm font-medium" style={{ color: '#4B9BF5' }}>Propuestas</span>
          <button onClick={() => router.push('/proyectos')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Proyectos</button>
          {isAdmin && <button onClick={() => router.push('/usuarios')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Usuarios</button>}
          {isAdmin && <button onClick={() => router.push('/configuracion')} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Config. Landing</button>}
          <button onClick={handleLogout} className="text-sm transition-opacity hover:opacity-70" style={{ color: 'rgba(240,240,240,0.5)' }}>Cerrar sesión</button>
        </div>
      </header>

      {/* Main */}
      <main className="px-6 py-8 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Propuestas</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(240,240,240,0.4)' }}>
            Propuestas formales generadas desde leads
          </p>
        </div>

        <div
          className="rounded-xl border p-16 flex flex-col items-center justify-center text-center"
          style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <p className="text-4xl mb-4" style={{ color: 'rgba(255,255,255,0.08)' }}>📄</p>
          <h2 className="text-white font-medium mb-2">Próximamente</h2>
          <p className="text-sm max-w-xs" style={{ color: 'rgba(240,240,240,0.35)' }}>
            Esta sección mostrará las propuestas formales generadas a partir de leads,
            con estados: en revisión, enviada, aprobada y rechazada.
          </p>
        </div>
      </main>
    </div>
  )
}
