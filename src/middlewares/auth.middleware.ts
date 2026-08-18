import { type Response, type NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.util.js';
import { isAccessTokenRevoked } from '../services/token-revoke.service.js';
import { ACCESS_TOKEN_COOKIE } from '../utils/auth-cookie.util.js';
import type { Request } from 'express';
import type { FileArray, UploadedFile } from 'express-fileupload';

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
  files?: FileArray | null | undefined;
  xmlFile?: UploadedFile | undefined;
  xmlBuffer?: Buffer;
}

/**
 * Access token: cookie `accessToken` primero, luego `Authorization: Bearer`.
 */
function extractAccessToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return undefined;
  }

  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer' && parts[1]) {
    return parts[1];
  }

  return undefined;
}

export async function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractAccessToken(req);

    if (!token) {
      res.status(401).json({ error: 'Token de acceso requerido' });
      return;
    }

    const payload = verifyAccessToken(token);

    if (await isAccessTokenRevoked(token)) {
      res.status(403).json({ error: 'Token inválido o expirado' });
      return;
    }

    req.userId = payload.userId;
    req.userEmail = payload.email;

    next();
  } catch (error) {
    res.status(403).json({ error: 'Token inválido o expirado' });
  }
}

/**
 * Middleware para verificar que el usuario autenticado es un administrador
 * Verifica que el email del usuario esté en la variable de entorno ADMIN_EMAILS
 * Formato: ADMIN_EMAILS=email1@example.com,email2@example.com
 */
export async function authenticateAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractAccessToken(req);

    if (!token) {
      res.status(401).json({ error: 'Token de acceso requerido' });
      return;
    }

    const payload = verifyAccessToken(token);

    if (await isAccessTokenRevoked(token)) {
      res.status(403).json({ error: 'Token inválido o expirado' });
      return;
    }

    const userEmail = payload.email;

    if (!userEmail) {
      res.status(403).json({ error: 'Email no encontrado en el token' });
      return;
    }

    const adminEmailsEnv = process.env.ADMIN_EMAILS;

    if (!adminEmailsEnv) {
      res.status(500).json({ error: 'Configuración de administradores no encontrada' });
      return;
    }

    const adminEmails = adminEmailsEnv.split(',').map((email) => email.trim().toLowerCase());

    if (!adminEmails.includes(userEmail.toLowerCase())) {
      res.status(403).json({ error: 'Acceso denegado: se requieren permisos de administrador' });
      return;
    }

    req.userId = payload.userId;
    req.userEmail = payload.email;

    next();
  } catch (error) {
    res.status(403).json({ error: 'Token inválido o expirado' });
  }
}
