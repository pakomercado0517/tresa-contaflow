import { type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { User, Subscription } from '../database/models/index.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.util.js';
import { generateVerificationToken, hashVerificationToken } from '../utils/verification.util.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email.service.js';
import { verifyFirebaseIdToken } from '../utils/firebase.util.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import {
  getCurrentUserCached,
  registerUser,
  loginUser,
  loginUserWithGoogle,
  logoutUser,
  refreshAccessToken,
  verifyEmail,
  updateProfileService,
  getCurrentUserSevice,
  requestPasswordResetService,
  resetPasswordService,
  completeTourService,
} from '../services/auth-user.service.js';
import { invalidateUserAuthCache } from '../services/cache.service.js';
import {
  isRefreshTokenRevoked,
  revokeAccessToken,
  revokeRefreshToken,
} from '../services/token-revoke.service.js';
import { validationResult } from 'express-validator';
import { AppError } from '../utils/AppError.js';
import type { UpdateProfileDto } from '../types/auth.types.js';

export const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  !errors.isEmpty() ? res.status(400).json({ errors: errors.array() }) : next();
};

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    //Llamamos al servicio de registro de usuario
    const { user, verificationToken } = await registerUser(req.body);

    //Intentamos enviar el email ( sin que bloquee el flujo principal)
    sendVerificationEmail(user.email, verificationToken, user.nombre).catch((err) =>
      console.error('Error al enviar email de verificación:', err)
    );

    res.status(201).json({
      message:
        'Usuario registado correctamente. Se ha enviado un email de verificación, revisa tu bandeja de entrada.',
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        telefono: user.telefono,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const loginData = await loginUser(req.body);
    res.status(200).json(loginData);
  } catch (error) {
    next(error);
  }
}

/**
 * Login con Google: verifica el ID token de Firebase, busca o crea usuario por email,
 * emite JWT propios (mismo contrato que POST /login).
 */
export async function loginGoogle(req: Request, res: Response, next: NextFunction) {
  try {
    const { idToken } = req.body;

    if (!idToken) throw new AppError('Token requerido', 400);

    const loginData = await loginUserWithGoogle(idToken);

    res.status(200).json({ ...loginData });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    const { refreshToken } = req.body;
    const accessToken = req.headers.authorization?.split(' ')[1];

    if (!userId) throw new AppError('Usuario no autenticado', 401);
    if (!refreshToken || typeof refreshToken !== 'string')
      throw new AppError('Refresh token requerido', 400);

    const result = await logoutUser(userId, refreshToken, accessToken || '');
    res.status(200).json({ result });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError('Refresh token es requerido', 400);
    const result = await refreshAccessToken(refreshToken);
    res.status(200).json({ ...result });
  } catch (error) {
    next(error);
  }
}

export async function verifyEmailController(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.body;
    if (!token) throw new AppError('Token de verificación es requerido', 400);

    const result = await verifyEmail(token);
    res.status(200).json({ ...result });
  } catch (error) {
    next(error);
  }
}

export async function resendVerificationEmail(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;

    // Validación
    if (!email || typeof email !== 'string') {
      res.status(400).json({
        error: 'Email requerido',
        message: 'El email es obligatorio',
      });
      return;
    }

    // Buscar usuario
    let user;
    try {
      user = await User.findOne({
        where: { email: email.toLowerCase().trim() },
      });
    } catch (dbError) {
      console.error('Error al buscar usuario:', dbError);
      res.status(500).json({
        error: 'Error de base de datos',
        message: 'No se pudo buscar el usuario. Por favor intenta nuevamente.',
      });
      return;
    }

    // No revelar si el usuario existe o no (seguridad)
    // Pero en este caso, es útil saberlo, así que retornamos un mensaje genérico
    if (!user) {
      // Por seguridad, no revelamos si el email existe o no
      res.status(200).json({
        message:
          'Si el email está registrado y no está verificado, se enviará un nuevo email de verificación.',
      });
      return;
    }

    // Verificar si ya está verificado
    if (user.email_verified) {
      res.status(400).json({
        error: 'Email ya verificado',
        message: 'Este email ya fue verificado. Puedes iniciar sesión normalmente.',
      });
      return;
    }

    // Generar nuevo token de verificación
    const verificationToken = generateVerificationToken();
    const hashedToken = hashVerificationToken(verificationToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Expira en 24 horas

    // Actualizar token en la BD
    try {
      await user.update({
        email_verification_token: hashedToken,
        email_verification_expires: expiresAt,
      });
    } catch (updateError) {
      console.error('Error al actualizar token de verificación:', updateError);
      res.status(500).json({
        error: 'Error al generar token',
        message: 'No se pudo generar el nuevo token. Por favor intenta nuevamente.',
      });
      return;
    }

    // Enviar email de verificación
    try {
      await sendVerificationEmail(user.email, verificationToken, user.nombre);
    } catch (emailError) {
      console.error('Error al enviar email de verificación:', emailError);
      res.status(500).json({
        error: 'Error al enviar email',
        message:
          'No se pudo enviar el email de verificación. Por favor intenta nuevamente más tarde.',
      });
      return;
    }

    res.status(200).json({
      message:
        'Email de verificación reenviado correctamente. Por favor revisa tu bandeja de entrada.',
    });
  } catch (error) {
    console.error('Error inesperado al reenviar email de verificación:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Error al reenviar email',
        message: 'Ocurrió un error inesperado. Por favor intenta nuevamente.',
      });
      return;
    }

    res.status(500).json({
      error: 'Error desconocido',
      message: 'Ocurrió un error inesperado. Por favor intenta nuevamente.',
    });
  }
}

export async function updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);
    const result = await updateProfileService(userId, req.body as UpdateProfileDto);

    res.status(200).json({ ...result });
  } catch (error) {
    next(error);
  }
}

/**
 * Obtiene los datos del usuario autenticado actual
 */
export async function getCurrentUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);

    const result = await getCurrentUserSevice(userId);
    res.status(200).json({ ...result });
  } catch (error) {
    next(error);
  }
}

/**
 * Solicita el restablecimiento de contraseña
 * Envía un email con el token de reset
 */
export async function requestPasswordReset(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;
    const result = await requestPasswordResetService(email);
    res.status(200).json({ ...result });
  } catch (error) {
    next(error);
  }
}

/**
 * Restablece la contraseña usando el token
 */
export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, password } = req.body;

    const result = await resetPasswordService(token, password);

    res.status(200).json({ ...result });
  } catch (error) {
    next(error);
  }
}

/**
 * Marca el tour como completado para el usuario autenticado
 */
export async function completeTour(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    const { tourVersion } = req.body;

    const result = await completeTourService(userId!, tourVersion);
    res.status(200).json({ ...result });
  } catch (error) {
    next(error);
  }
}
