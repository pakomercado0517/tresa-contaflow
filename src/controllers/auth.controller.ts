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
import { AppError } from '../utils/AppError.js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  clearAuthCookies,
  setAccessTokenCookie,
  setAuthCookies,
} from '../utils/auth-cookie.util.js';
import type { UpdateProfileDto } from '../types/auth.types.js';

function resolveRefreshToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) {
    return fromCookie;
  }

  const fromBody = req.body?.refreshToken;
  if (typeof fromBody === 'string' && fromBody.length > 0) {
    return fromBody;
  }

  return undefined;
}

function resolveAccessToken(req: Request): string {
  const fromCookie = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) {
    return fromCookie;
  }

  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer' && parts[1]) {
      return parts[1];
    }
  }

  return '';
}

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
    setAuthCookies(res, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
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

    setAuthCookies(res, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function logout(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    const refreshToken = resolveRefreshToken(req);
    const accessToken = resolveAccessToken(req);

    if (!userId) throw new AppError('Usuario no autenticado', 401);
    if (!refreshToken) throw new AppError('Refresh token requerido', 400);

    const result = await logoutUser(userId, refreshToken, accessToken);
    clearAuthCookies(res);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken = resolveRefreshToken(req);
    if (!refreshToken) throw new AppError('Refresh token es requerido', 400);

    const result = await refreshAccessToken(refreshToken);
    setAccessTokenCookie(res, { accessToken: result.accessToken });
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
