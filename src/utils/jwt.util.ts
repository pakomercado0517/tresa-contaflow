import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET no está definida en las variables de entorno');
}

if (!process.env.JWT_REFRESH_SECRET) {
  throw new Error('JWT_REFRESH_SECRET no está definida en las variables de entorno');
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

interface TokenPayload {
  userId: string;
  email: string;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '15m',
  });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload;
}

/** Hash estable del token para claves de deny-list (no guardar el JWT en Redis). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Segundos restantes hasta `exp` del JWT.
 * Retorna null si el token no tiene exp o ya expiró.
 */
export function getTokenTtlSeconds(token: string): number | null {
  const decoded = jwt.decode(token);
  if (decoded === null || typeof decoded === 'string' || typeof decoded.exp !== 'number') {
    return null;
  }

  const remaining = decoded.exp - Math.floor(Date.now() / 1000);
  if (remaining <= 0) {
    return null;
  }

  return remaining;
}

export function generateAuthTokens(payload: TokenPayload) {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return {
    accessToken,
    refreshToken,
  };
}
