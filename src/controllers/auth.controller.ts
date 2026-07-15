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
import { getCurrentUserCached, registerUser, loginUser } from '../services/auth-user.service.js';
import { invalidateUserAuthCache } from '../services/cache.service.js';
import {
  isRefreshTokenRevoked,
  revokeAccessToken,
  revokeRefreshToken,
} from '../services/token-revoke.service.js';
import { validationResult } from 'express-validator';

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

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
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
export async function loginGoogle(req: Request, res: Response): Promise<void> {
  try {
    const { idToken } = req.body;

    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({
        error: 'Token requerido',
        message: 'El idToken de Firebase es obligatorio',
      });
      return;
    }

    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch (firebaseError) {
      console.error('Error al verificar token de Firebase:', firebaseError);
      res.status(401).json({
        error: 'Token inválido',
        message: 'El token de Google no es válido o ha expirado. Intenta iniciar sesión de nuevo.',
      });
      return;
    }

    const email = decoded.email?.trim().toLowerCase();
    if (!email) {
      res.status(400).json({
        error: 'Email no disponible',
        message: 'No se pudo obtener el email de la cuenta de Google.',
      });
      return;
    }

    let user;
    try {
      user = await User.findOne({ where: { email } });
    } catch (dbError) {
      console.error('Error al buscar usuario:', dbError);
      res.status(500).json({
        error: 'Error de base de datos',
        message: 'No se pudo verificar la cuenta. Por favor intenta nuevamente.',
      });
      return;
    }

    if (user) {
      const updateData: {
        firebase_uid: string;
        email_verified: boolean;
        nombre?: string | null;
      } = {
        firebase_uid: decoded.uid,
        email_verified: true,
      };
      if (user.nombre == null || user.nombre.trim() === '') {
        updateData.nombre = decoded.name?.trim() || null;
      }
      try {
        await user.update(updateData);
      } catch (updateError) {
        console.error('Error al actualizar usuario:', updateError);
        res.status(500).json({
          error: 'Error al actualizar cuenta',
          message: 'No se pudo completar el inicio de sesión. Por favor intenta nuevamente.',
        });
        return;
      }
    } else {
      try {
        user = await User.create({
          email,
          password_hash: null,
          firebase_uid: decoded.uid,
          nombre: decoded.name?.trim() || null,
          apellido: null,
          telefono: null,
          email_verified: true,
        });
      } catch (createError: unknown) {
        console.error('Error al crear usuario:', createError);
        const err = createError as { name?: string };
        if (err.name === 'SequelizeUniqueConstraintError') {
          res.status(409).json({
            error: 'El email ya está registrado',
            message: 'Este correo ya está en uso.',
          });
          return;
        }
        res.status(500).json({
          error: 'Error al crear cuenta',
          message: 'No se pudo completar el registro. Por favor intenta nuevamente.',
        });
        return;
      }

      try {
        await Subscription.create({
          user_id: user.id,
          plan: 'FREE',
          plan_price: 0,
          status: 'ACTIVE',
        });
      } catch (subError: unknown) {
        console.error('Error al crear suscripción:', subError);
        try {
          await user.destroy();
        } catch (deleteError) {
          console.error('Error al eliminar usuario huérfano:', deleteError);
        }
        res.status(500).json({
          error: 'Error al completar registro',
          message: 'No se pudo completar el registro. Por favor intenta nuevamente.',
        });
        return;
      }
    }

    const tokenPayload = { userId: user.id, email: user.email };
    let accessToken: string;
    let refreshToken: string;
    try {
      accessToken = generateAccessToken(tokenPayload);
      refreshToken = generateRefreshToken(tokenPayload);
    } catch (tokenError) {
      console.error('Error al generar tokens:', tokenError);
      res.status(500).json({
        error: 'Error al generar tokens',
        message: 'No se pudieron generar los tokens de acceso. Por favor intenta nuevamente.',
      });
      return;
    }

    res.json({
      message: 'Login exitoso',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        telefono: user.telefono,
        email_verified: user.email_verified,
      },
    });
  } catch (error) {
    console.error('Error inesperado en login Google:', error);
    if (error instanceof Error) {
      res.status(500).json({
        error: 'Error al iniciar sesión',
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

export async function logout(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token inválido o expirado',
      });
      return;
    }

    const { refreshToken } = req.body as { refreshToken?: unknown };
    if (!refreshToken || typeof refreshToken !== 'string') {
      res.status(400).json({
        error: 'Refresh token requerido',
        message: 'El refresh token es obligatorio',
      });
      return;
    }

    let refreshPayload;
    try {
      refreshPayload = verifyRefreshToken(refreshToken);
    } catch (tokenError: unknown) {
      const err = tokenError as { name?: string };
      if (err.name === 'TokenExpiredError') {
        res.status(401).json({
          error: 'Refresh token expirado',
          message: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.',
        });
        return;
      }
      res.status(401).json({
        error: 'Refresh token inválido',
        message: 'El token de renovación no es válido.',
      });
      return;
    }

    if (refreshPayload.userId !== userId) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'El refresh token no corresponde a la sesión actual',
      });
      return;
    }

    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.split(' ')[1];

    if (accessToken) {
      await revokeAccessToken(accessToken, userId);
    }
    await revokeRefreshToken(refreshToken, userId);

    res.json({ message: 'Logout exitoso' });
  } catch (error) {
    console.error('Error inesperado en logout:', error);
    res.status(500).json({
      error: 'Error al cerrar sesión',
      message: 'Ocurrió un error inesperado. Por favor intenta nuevamente.',
    });
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== 'string') {
      res.status(400).json({
        error: 'Refresh token requerido',
        message: 'El refresh token es obligatorio',
      });
      return;
    }

    // Verificar refresh token
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (tokenError: any) {
      console.error('Error al verificar refresh token:', tokenError);

      // Manejar errores específicos de JWT
      if (tokenError.name === 'TokenExpiredError') {
        res.status(401).json({
          error: 'Refresh token expirado',
          message: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.',
        });
        return;
      }

      if (tokenError.name === 'JsonWebTokenError' || tokenError.name === 'NotBeforeError') {
        res.status(401).json({
          error: 'Refresh token inválido',
          message: 'El token de renovación no es válido. Por favor inicia sesión nuevamente.',
        });
        return;
      }

      res.status(401).json({
        error: 'Error al verificar token',
        message: 'No se pudo verificar el token. Por favor inicia sesión nuevamente.',
      });
      return;
    }

    if (await isRefreshTokenRevoked(refreshToken)) {
      res.status(401).json({
        error: 'Refresh token inválido',
        message: 'La sesión fue cerrada. Por favor inicia sesión nuevamente.',
      });
      return;
    }

    // Generar nuevo access token
    let accessToken: string;
    try {
      accessToken = generateAccessToken({
        userId: payload.userId,
        email: payload.email,
      });
    } catch (tokenError) {
      console.error('Error al generar access token:', tokenError);
      res.status(500).json({
        error: 'Error al generar token',
        message: 'No se pudo generar el nuevo token de acceso. Por favor intenta nuevamente.',
      });
      return;
    }

    res.json({
      accessToken,
    });
  } catch (error) {
    console.error('Error inesperado en refresh:', error);

    // Error no manejado previamente
    if (error instanceof Error) {
      res.status(500).json({
        error: 'Error al renovar token',
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

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      res.status(400).json({
        error: 'Token de verificación requerido',
        message: 'El token de verificación es obligatorio',
      });
      return;
    }

    // Hashear el token recibido para comparar
    const hashedToken = hashVerificationToken(token);

    // Buscar usuario con este token
    let user;
    try {
      user = await User.findOne({
        where: {
          email_verification_token: hashedToken,
        },
      });
    } catch (dbError) {
      console.error('Error al buscar usuario:', dbError);
      res.status(500).json({
        error: 'Error de base de datos',
        message: 'No se pudo verificar el token. Por favor intenta nuevamente.',
      });
      return;
    }

    if (!user) {
      res.status(400).json({
        error: 'Token de verificación inválido',
        message:
          'El token proporcionado no es válido. Puedes solicitar un nuevo email de verificación.',
      });
      return;
    }

    // Verificar si el token expiró
    if (!user.email_verification_expires || user.email_verification_expires < new Date()) {
      res.status(400).json({
        error: 'El token de verificación ha expirado',
        message: 'El token ha expirado. Puedes solicitar un nuevo email de verificación.',
      });
      return;
    }

    // Verificar si ya está verificado
    if (user.email_verified) {
      res.status(400).json({
        error: 'El email ya está verificado',
        message: 'Este email ya fue verificado anteriormente.',
      });
      return;
    }

    // Marcar como verificado y limpiar token
    try {
      await user.update({
        email_verified: true,
        email_verification_token: null,
        email_verification_expires: null,
      });
    } catch (updateError) {
      console.error('Error al actualizar usuario:', updateError);
      res.status(500).json({
        error: 'Error al verificar email',
        message: 'No se pudo completar la verificación. Por favor intenta nuevamente.',
      });
      return;
    }

    await invalidateUserAuthCache(user.id);

    res.json({
      message: 'Email verificado correctamente',
    });
  } catch (error) {
    console.error('Error inesperado en verificación de email:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Error al verificar email',
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

export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({
        error: 'Usuario no autenticado',
        message: 'Debes iniciar sesión para actualizar tu perfil',
      });
      return;
    }

    const { nombre, apellido, telefono, logo_url, nombre_comercial } = req.body;

    // Validar que al menos un campo esté presente
    const hasAny =
      nombre !== undefined ||
      apellido !== undefined ||
      telefono !== undefined ||
      logo_url !== undefined ||
      nombre_comercial !== undefined;
    if (!hasAny) {
      res.status(400).json({
        error: 'Datos requeridos',
        message:
          'Debes proporcionar al menos un campo para actualizar (nombre, apellido, telefono, logo_url o nombre_comercial)',
      });
      return;
    }

    // Validar tipos de datos
    if (nombre !== undefined && typeof nombre !== 'string') {
      res.status(400).json({
        error: 'Nombre inválido',
        message: 'El nombre debe ser una cadena de texto',
      });
      return;
    }

    if (apellido !== undefined && typeof apellido !== 'string') {
      res.status(400).json({
        error: 'Apellido inválido',
        message: 'El apellido debe ser una cadena de texto',
      });
      return;
    }

    if (telefono !== undefined && typeof telefono !== 'string') {
      res.status(400).json({
        error: 'Teléfono inválido',
        message: 'El teléfono debe ser una cadena de texto',
      });
      return;
    }

    if (logo_url !== undefined && typeof logo_url !== 'string') {
      res.status(400).json({
        error: 'Logo URL inválido',
        message: 'El logo_url debe ser una URL válida',
      });
      return;
    }

    if (nombre_comercial !== undefined && typeof nombre_comercial !== 'string') {
      res.status(400).json({
        error: 'Nombre comercial inválido',
        message: 'El nombre comercial debe ser una cadena de texto',
      });
      return;
    }

    // Buscar usuario
    let user;
    try {
      user = await User.findByPk(userId);
    } catch (dbError) {
      console.error('Error al buscar usuario:', dbError);
      res.status(500).json({
        error: 'Error de base de datos',
        message: 'No se pudo encontrar el usuario. Por favor intenta nuevamente.',
      });
      return;
    }

    if (!user) {
      res.status(404).json({
        error: 'Usuario no encontrado',
        message: 'El usuario no existe',
      });
      return;
    }

    // Preparar datos para actualizar (solo los campos que están definidos)
    const updateData: {
      nombre?: string | null;
      apellido?: string | null;
      telefono?: string | null;
      logo_url?: string | null;
      nombre_comercial?: string | null;
    } = {};

    if (nombre !== undefined) {
      updateData.nombre = nombre.trim() || null;
    }

    if (apellido !== undefined) {
      updateData.apellido = apellido.trim() || null;
    }

    if (telefono !== undefined) {
      updateData.telefono = telefono.trim() || null;
    }

    if (logo_url !== undefined) {
      updateData.logo_url = logo_url.trim() || null;
    }

    if (nombre_comercial !== undefined) {
      updateData.nombre_comercial = nombre_comercial.trim() || null;
    }

    // Actualizar usuario
    try {
      await user.update(updateData);
    } catch (updateError) {
      console.error('Error al actualizar usuario:', updateError);
      res.status(500).json({
        error: 'Error al actualizar perfil',
        message: 'No se pudo actualizar el perfil. Por favor intenta nuevamente.',
      });
      return;
    }

    // Recargar usuario actualizado
    await user.reload();

    await invalidateUserAuthCache(userId);

    res.json({
      message: 'Perfil actualizado correctamente',
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        telefono: user.telefono,
        email_verified: user.email_verified,
        logo_url: user.logo_url,
        nombre_comercial: user.nombre_comercial,
      },
    });
  } catch (error) {
    console.error('Error inesperado al actualizar perfil:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Error al actualizar perfil',
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

/**
 * Obtiene los datos del usuario autenticado actual
 */
export async function getCurrentUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token inválido o expirado',
      });
      return;
    }

    // Buscar usuario
    let result;
    try {
      result = await getCurrentUserCached(userId);
    } catch (dbError) {
      console.error('Error al buscar usuario:', dbError);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Error al obtener el usuario',
      });
      return;
    }

    if (!result) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token inválido o expirado',
      });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Error inesperado al obtener usuario:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Error al obtener el usuario',
      });
      return;
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al obtener el usuario',
    });
  }
}

/**
 * Solicita el restablecimiento de contraseña
 * Envía un email con el token de reset
 */
export async function requestPasswordReset(req: Request, res: Response): Promise<void> {
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

    // Por seguridad, no revelamos si el email existe o no
    // Siempre retornamos éxito para evitar enumeración de emails
    if (!user) {
      res.status(200).json({
        message:
          'Si el email está registrado, se enviará un correo con las instrucciones para restablecer tu contraseña.',
      });
      return;
    }

    // Generar token de reset
    const resetToken = generateVerificationToken();
    const hashedToken = hashVerificationToken(resetToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Expira en 1 hora

    // Actualizar token en la BD
    try {
      await user.update({
        password_reset_token: hashedToken,
        password_reset_expires: expiresAt,
      });
    } catch (updateError) {
      console.error('Error al actualizar token de reset:', updateError);
      res.status(500).json({
        error: 'Error al generar token',
        message: 'No se pudo generar el token de restablecimiento. Por favor intenta nuevamente.',
      });
      return;
    }

    // Enviar email de reset
    try {
      await sendPasswordResetEmail(user.email, resetToken, user.nombre);
    } catch (emailError) {
      console.error('Error al enviar email de reset:', emailError);
      res.status(500).json({
        error: 'Error al enviar email',
        message:
          'No se pudo enviar el email de restablecimiento. Por favor intenta nuevamente más tarde.',
      });
      return;
    }

    res.status(200).json({
      message:
        'Si el email está registrado, se enviará un correo con las instrucciones para restablecer tu contraseña.',
    });
  } catch (error) {
    console.error('Error inesperado al solicitar reset de contraseña:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Error al solicitar reset',
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

/**
 * Restablece la contraseña usando el token
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { token, password } = req.body;

    // Validación
    if (!token || typeof token !== 'string') {
      res.status(400).json({
        error: 'Token requerido',
        message: 'El token de restablecimiento es obligatorio',
      });
      return;
    }

    if (!password || typeof password !== 'string') {
      res.status(400).json({
        error: 'Contraseña requerida',
        message: 'La nueva contraseña es obligatoria',
      });
      return;
    }

    // Validar longitud de contraseña
    if (password.length < 8) {
      res.status(400).json({
        error: 'Contraseña inválida',
        message: 'La contraseña debe tener al menos 8 caracteres',
      });
      return;
    }

    // Hashear el token recibido para comparar
    const hashedToken = hashVerificationToken(token);

    // Buscar usuario con este token
    let user;
    try {
      user = await User.findOne({
        where: {
          password_reset_token: hashedToken,
        },
      });
    } catch (dbError) {
      console.error('Error al buscar usuario:', dbError);
      res.status(500).json({
        error: 'Error de base de datos',
        message: 'No se pudo verificar el token. Por favor intenta nuevamente.',
      });
      return;
    }

    if (!user) {
      res.status(400).json({
        error: 'Token inválido',
        message: 'El token proporcionado no es válido o ha expirado.',
      });
      return;
    }

    // Verificar si el token expiró
    if (!user.password_reset_expires || user.password_reset_expires < new Date()) {
      res.status(400).json({
        error: 'El token ha expirado',
        message: 'El token de restablecimiento ha expirado. Por favor solicita uno nuevo.',
      });
      return;
    }

    // Hashear nueva contraseña
    let passwordHash: string;
    try {
      passwordHash = await bcrypt.hash(password, 10);
    } catch (hashError) {
      console.error('Error al hashear contraseña:', hashError);
      res.status(500).json({
        error: 'Error al procesar contraseña',
        message: 'No se pudo procesar la nueva contraseña. Por favor intenta nuevamente.',
      });
      return;
    }

    // Actualizar contraseña y limpiar token
    try {
      await user.update({
        password_hash: passwordHash,
        password_reset_token: null,
        password_reset_expires: null,
      });
    } catch (updateError) {
      console.error('Error al actualizar contraseña:', updateError);
      res.status(500).json({
        error: 'Error al restablecer contraseña',
        message: 'No se pudo restablecer la contraseña. Por favor intenta nuevamente.',
      });
      return;
    }

    res.json({
      message:
        'Contraseña restablecida correctamente. Ya puedes iniciar sesión con tu nueva contraseña.',
    });
  } catch (error) {
    console.error('Error inesperado al restablecer contraseña:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Error al restablecer contraseña',
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

/**
 * Marca el tour como completado para el usuario autenticado
 */
export async function completeTour(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token inválido o expirado',
      });
      return;
    }

    const { tour_version } = req.body;

    // Validación
    if (!tour_version || typeof tour_version !== 'string' || tour_version.trim().length === 0) {
      res.status(400).json({
        error: 'Tour version requerida',
        message: 'El campo tour_version es obligatorio y debe ser una cadena de texto válida',
      });
      return;
    }

    // Validar longitud máxima (50 caracteres)
    if (tour_version.length > 50) {
      res.status(400).json({
        error: 'Tour version inválida',
        message: 'El campo tour_version no puede exceder 50 caracteres',
      });
      return;
    }

    // Buscar usuario
    let user;
    try {
      user = await User.findByPk(userId);
    } catch (dbError) {
      console.error('Error al buscar usuario:', dbError);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Error al obtener el usuario',
      });
      return;
    }

    if (!user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Usuario no encontrado',
      });
      return;
    }

    // Actualizar tour completado
    try {
      await user.update({
        tour_version: tour_version.trim(),
        tour_completed_at: new Date(),
      });
    } catch (updateError) {
      console.error('Error al actualizar tour:', updateError);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Error al actualizar el estado del tour',
      });
      return;
    }

    await invalidateUserAuthCache(userId);

    res.json({
      message: 'Tour marcado como completado exitosamente',
      data: {
        tour_version: user.tour_version,
        tour_completed_at: user.tour_completed_at,
      },
    });
  } catch (error) {
    console.error('Error inesperado al completar tour:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Error al completar el tour',
      });
      return;
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Error al completar el tour',
    });
  }
}
