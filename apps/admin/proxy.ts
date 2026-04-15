import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Auth is handled client-side via Supabase browser client.
// RLS policies on Supabase protect data server-side regardless.
export async function proxy(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
