import { type Request, type Response, type NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.util.js';

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({ error: 'Token de acceso requerido' });
      return;
    }

    const payload = verifyAccessToken(token);
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
export function authenticateAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    // Primero verificar que el usuario esté autenticado
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({ error: 'Token de acceso requerido' });
      return;
    }

    const payload = verifyAccessToken(token);
    const userEmail = payload.email;

    if (!userEmail) {
      res.status(403).json({ error: 'Email no encontrado en el token' });
      return;
    }

    // Obtener emails de admin desde variable de entorno
    const adminEmailsEnv = process.env.ADMIN_EMAILS;

    if (!adminEmailsEnv) {
      res.status(500).json({ error: 'Configuración de administradores no encontrada' });
      return;
    }

    // Convertir a array y limpiar espacios
    const adminEmails = adminEmailsEnv.split(',').map((email) => email.trim().toLowerCase());

    // Verificar si el email del usuario está en la lista de admins
    if (!adminEmails.includes(userEmail.toLowerCase())) {
      res.status(403).json({ error: 'Acceso denegado: se requieren permisos de administrador' });
      return;
    }

    // Si es admin, continuar
    req.userId = payload.userId;
    req.userEmail = payload.email;

    next();
  } catch (error) {
    res.status(403).json({ error: 'Token inválido o expirado' });
  }
}
