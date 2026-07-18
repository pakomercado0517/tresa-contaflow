import { type Response, type NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.util.js';
import { isAccessTokenRevoked } from '../services/token-revoke.service.js';
import type { Request } from 'express';
import type { FileArray, UploadedFile } from 'express-fileupload';

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
  files?: FileArray | null | undefined;
  xmlFile?: UploadedFile | undefined;
}

export async function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

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
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

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
