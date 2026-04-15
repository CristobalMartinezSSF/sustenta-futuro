'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError('Credenciales incorrectas. Verifica tu correo y contraseña.')
      setLoading(false)
      return
    }

    window.location.href = '/'
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
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
            Panel de administración
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-xl border p-8"
          style={{
            background: '#0a0a0a',
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <h1 className="text-white text-lg font-medium mb-6">
            Iniciar sesión
          </h1>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-sm"
                style={{ color: 'rgba(240,240,240,0.6)' }}
              >
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg px-3.5 py-2.5 text-sm text-white outline-none transition-colors focus:ring-1 focus:ring-[#4B9BF5]/50"
                style={{
                  background: '#111111',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                placeholder="admin@sustentafuturo.cl"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-sm"
                style={{ color: 'rgba(240,240,240,0.6)' }}
              >
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg px-3.5 py-2.5 text-sm text-white outline-none transition-colors focus:ring-1 focus:ring-[#4B9BF5]/50"
                style={{
                  background: '#111111',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                placeholder="••••••••"
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
              style={{
                background: '#4B9BF5',
                color: '#ffffff',
              }}
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
