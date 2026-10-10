export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'strict';
  maxAge: number;
  path: '/';
}

export function buildAuthCookieOptions(maxAge: number): AuthCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge,
    path: '/',
  };
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (header === undefined || header.length === 0) {
    return {};
  }

  const jar: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 1) {
      continue;
    }
    const name = pair.slice(0, separator).trim();
    if (name.length === 0) {
      continue;
    }
    const raw = pair.slice(separator + 1).trim();
    try {
      jar[name] = decodeURIComponent(raw);
    } catch {
      jar[name] = raw;
    }
  }
  return jar;
}
