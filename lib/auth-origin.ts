import type { NextRequest } from 'next/server';

/** 0.0.0.0 → localhost (dev 서버 --hostname 0.0.0.0 과 브라우저 localhost 불일치 방지) */
export function normalizeDevHost(host: string): string {
  return host.replace(/^0\.0\.0\.0(?=:|$)/, 'localhost');
}

export function getBrowserOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin.replace('://0.0.0.0:', '://localhost:');
}

export function getOriginFromRequest(request: NextRequest | Request): string {
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (envOrigin) return envOrigin;

  const req = request as NextRequest;
  const rawHost =
    req.headers?.get('x-forwarded-host')?.split(',')[0]?.trim() ??
    req.headers?.get('host') ??
    new URL(request.url).host;

  const host = normalizeDevHost(rawHost);
  const forwardedProto = req.headers?.get('x-forwarded-proto');
  const protocol =
    forwardedProto ??
    (process.env.NODE_ENV === 'development' || host.startsWith('localhost') || host.startsWith('127.'))
      ? 'http'
      : 'https';

  return `${protocol}://${host}`;
}
