import { type Request, type Response, type NextFunction } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import {
  registerUser,
  loginUser,
  loginUserWithGoogle,
  logoutUser,
  refreshAccessToken,
  verifyEmail,
  updateProfileService,
  requestPasswordResetService,
  resetPasswordService,
  completeTourService,
  resendVerificationEmailService,
  getCurrentUserService,
} from '../services/auth-user.service.js';
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
    const result = await registerUser(req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await loginUser(req.body);
    res.status(200).json(result);
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

    const result = await loginUserWithGoogle(idToken);

    res.status(200).json(result);
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
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError('Refresh token es requerido', 400);
    const result = await refreshAccessToken(refreshToken);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function verifyEmailController(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.body;
    if (!token) throw new AppError('Token de verificación es requerido', 400);

    const result = await verifyEmail(token);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function resendVerificationEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;
    const result = await resendVerificationEmailService(email);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Usuario no autenticado', 401);
    const result = await updateProfileService(userId, req.body as UpdateProfileDto);

    res.status(200).json(result);
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

    const result = await getCurrentUserService(userId);
    res.status(200).json(result);
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
    res.status(200).json(result);
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

    res.status(200).json(result);
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
    if (!userId) throw new AppError('Usuario no autenticado', 401);
    const { tour_version } = req.body;

    const result = await completeTourService(userId, tour_version);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
