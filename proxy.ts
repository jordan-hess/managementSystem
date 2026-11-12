import { NextResponse, type NextRequest } from 'next/server'

// Public portfolio copy: the login page and auth gate have been removed.
// Every request passes straight through.
export function proxy(request: NextRequest) {
  return NextResponse.next({ request })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
