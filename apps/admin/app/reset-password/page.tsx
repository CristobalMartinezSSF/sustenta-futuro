'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  // 'checking' → parsing the recovery link · 'ready' → valid session · 'invalid'
  const [phase, setPhase] = useState<'checking' | 'ready' | 'invalid'>('checking')

  useEffect(() => {
    const supabase = createClient()

    // supabase-js (implicit flow) auto-parses the recovery token from the URL
    // hash and fires PASSWORD_RECOVERY once the session is established.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setPhase('ready')
    })

    // The event may fire before we subscribe; also probe the current session.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPhase('ready')
    })

    // If nothing established a session, the link is missing/expired.
    const timer = setTimeout(() => {
      setPhase((p) => (p === 'checking' ? 'invalid' : p))
    }, 2500)

    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateError) {
      setError('No se pudo actualizar la contraseña. El enlace pudo expirar; solicítalo de nuevo.')
      return
    }
    setDone(true)
    await supabase.auth.signOut()
    setTimeout(() => router.push('/login'), 2000)
  }

  const inputStyle = {
    background: '#111111',
    border: '1px solid rgba(255,255,255,0.08)',
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Sustenta Futuro" style={{ height: '40px', width: 'auto' }} />
            <span
              className="text-white text-xl font-semibold tracking-tight"
              style={{ fontFamily: 'var(--font-montserrat)' }}
            >
              Sustenta Futuro
            </span>
          </div>
          <p className="text-sm" style={{ color: 'rgba(240,240,240,0.4)' }}>
            Restablecer contraseña
          </p>
        </div>

        <div
          className="rounded-xl border p-8"
          style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          {phase === 'checking' && (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            </div>
          )}

          {phase === 'invalid' && (
            <div className="flex flex-col gap-4 text-center">
              <p className="text-sm" style={{ color: 'rgba(240,240,240,0.6)' }}>
                El enlace de recuperación es inválido o expiró. Solicita uno nuevo desde el inicio de sesión.
              </p>
              <button
                onClick={() => router.push('/login')}
                className="w-full rounded-lg py-2.5 text-sm font-medium transition-opacity hover:opacity-85"
                style={{ background: '#4B9BF5', color: '#ffffff' }}
              >
                Volver al login
              </button>
            </div>
          )}

          {phase === 'ready' && !done && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <h1 className="text-white text-lg font-medium mb-2">Nueva contraseña</h1>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-sm" style={{ color: 'rgba(240,240,240,0.6)' }}>
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm text-white outline-none transition-colors focus:ring-1 focus:ring-[#4B9BF5]/50"
                  style={inputStyle}
                  placeholder="Min. 8 caracteres"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="confirm" className="text-sm" style={{ color: 'rgba(240,240,240,0.6)' }}>
                  Confirmar contraseña
                </label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm text-white outline-none transition-colors focus:ring-1 focus:ring-[#4B9BF5]/50"
                  style={inputStyle}
                  placeholder="Repite la contraseña"
                />
              </div>

              {error && (
                <p
                  className="text-sm rounded-lg px-3.5 py-2.5"
                  style={{
                    color: '#f87171',
                    background: 'rgba(248,113,113,0.08)',
                    border: '1px solid rgba(248,113,113,0.15)',
                  }}
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 w-full rounded-lg py-2.5 text-sm font-medium transition-opacity disabled:opacity-50"
                style={{ background: '#4B9BF5', color: '#ffffff' }}
              >
                {loading ? 'Guardando...' : 'Guardar contraseña'}
              </button>
            </form>
          )}

          {done && (
            <div className="flex flex-col gap-4 text-center">
              <p
                className="text-sm rounded-lg px-3.5 py-2.5"
                style={{
                  color: '#5CB85C',
                  background: 'rgba(92,184,92,0.08)',
                  border: '1px solid rgba(92,184,92,0.15)',
                }}
              >
                Contraseña actualizada. Redirigiendo al inicio de sesión...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
