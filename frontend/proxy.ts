// ami-assessment/frontend/proxy.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'

export function proxy(request: NextRequest) {
  const backendPath = request.nextUrl.pathname.replace(/^\/api/, '')
  const target = new URL(backendPath + request.nextUrl.search, BACKEND_URL)
  return NextResponse.rewrite(target)
}

export const config = {
  matcher: '/api/:path*',
}
