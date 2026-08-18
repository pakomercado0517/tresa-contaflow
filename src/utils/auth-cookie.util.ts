import type { CookieOptions, Response } from 'express';
import type {
  AccessTokenForCookie,
  AuthCookieKind,
  AuthCookieName,
  AuthTokensForCookies,
} from '../types/auth.types.js';

export const ACCESS_TOKEN_COOKIE: AuthCookieName = 'accessToken';
export const REFRESH_TOKEN_COOKIE: AuthCookieName = 'refreshToken';

const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000; // 15m — alineado con jwt.util
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7d — alineado con jwt.util

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Opciones de cookie de auth: HttpOnly, Path=/, SameSite=Lax, sin Domain
 * (para que el rewrite de Next las asocie al origen del frontend).
 */
export function getAuthCookieOptions(kind: AuthCookieKind): CookieOptions {
  return {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: isProduction(),
    maxAge: kind === 'access' ? ACCESS_TOKEN_MAX_AGE_MS : REFRESH_TOKEN_MAX_AGE_MS,
  };
}

function getClearCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: isProduction(),
  };
}

export function setAuthCookies(res: Response, tokens: AuthTokensForCookies): void {
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, getAuthCookieOptions('access'));
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, getAuthCookieOptions('refresh'));
}

/** Actualiza solo la cookie de access (p. ej. tras /refresh). */
export function setAccessTokenCookie(res: Response, tokens: AccessTokenForCookie): void {
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, getAuthCookieOptions('access'));
}

export function clearAuthCookies(res: Response): void {
  const options = getClearCookieOptions();
  res.clearCookie(ACCESS_TOKEN_COOKIE, options);
  res.clearCookie(REFRESH_TOKEN_COOKIE, options);
}
