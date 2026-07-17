import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.js';
import type { AuthRequest } from '../middlewares/auth.middleware.js';

vi.mock('../services/auth-user.service.js', () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  loginUserWithGoogle: vi.fn(),
  logoutUser: vi.fn(),
  refreshAccessToken: vi.fn(),
  verifyEmail: vi.fn(),
  updateProfileService: vi.fn(),
  requestPasswordResetService: vi.fn(),
  resetPasswordService: vi.fn(),
  completeTourService: vi.fn(),
  resendVerificationEmailService: vi.fn(),
  getCurrentUserService: vi.fn(),
}));

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
import {
  register,
  login,
  loginGoogle,
  logout,
  refresh,
  verifyEmailController,
  resendVerificationEmail,
  updateProfile,
  getCurrentUser,
  requestPasswordReset,
  resetPassword,
  completeTour,
} from '../controllers/auth.controller.js';

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res) as unknown as Response['status'];
  res.json = vi.fn().mockReturnValue(res) as unknown as Response['json'];
  return res as Response;
}

function mockReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
  } as AuthRequest;
}

const next: NextFunction = vi.fn();

/**
 * Extrae el error con el que se llamó a next() y valida que sea un AppError
 * con el status esperado.
 */
function expectNextAppError(status: number): AppError {
  expect(next).toHaveBeenCalledTimes(1);
  const error = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).status).toBe(status);
  return error as AppError;
}

describe('auth.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('responde 201 con el resultado del servicio', async () => {
      const result = { message: 'ok', user: { id: 'u1' } };
      vi.mocked(registerUser).mockResolvedValue(result as never);
      const req = mockReq({ body: { email: 'a@b.com', password: 'password123' } });
      const res = mockRes();

      await register(req as Request, res, next);

      expect(registerUser).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('El email ya está registrado', 409);
      vi.mocked(registerUser).mockRejectedValue(error);
      const res = mockRes();

      await register(mockReq() as Request, res, next);

      expect(res.status).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('login', () => {
    it('responde 200 con el resultado del servicio', async () => {
      const result = { message: 'Login exitoso', accessToken: 'a', refreshToken: 'r' };
      vi.mocked(loginUser).mockResolvedValue(result as never);
      const req = mockReq({ body: { email: 'a@b.com', password: 'password123' } });
      const res = mockRes();

      await login(req as Request, res, next);

      expect(loginUser).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Credenciales inválidas', 401);
      vi.mocked(loginUser).mockRejectedValue(error);
      const res = mockRes();

      await login(mockReq() as Request, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('loginGoogle', () => {
    it('lanza AppError 400 cuando falta idToken (sin llamar al servicio)', async () => {
      const res = mockRes();

      await loginGoogle(mockReq({ body: {} }) as Request, res, next);

      expectNextAppError(400);
      expect(loginUserWithGoogle).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('responde 200 con el resultado del servicio', async () => {
      const result = { message: 'Login exitoso', accessToken: 'a', refreshToken: 'r' };
      vi.mocked(loginUserWithGoogle).mockResolvedValue(result as never);
      const req = mockReq({ body: { idToken: 'firebase-token' } });
      const res = mockRes();

      await loginGoogle(req as Request, res, next);

      expect(loginUserWithGoogle).toHaveBeenCalledWith('firebase-token');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new Error('Firebase caído');
      vi.mocked(loginUserWithGoogle).mockRejectedValue(error);
      const res = mockRes();

      await loginGoogle(mockReq({ body: { idToken: 'x' } }) as Request, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('logout', () => {
    it('lanza AppError 401 cuando no hay userId', async () => {
      const res = mockRes();

      await logout(mockReq({ body: { refreshToken: 'r' } }), res, next);

      expectNextAppError(401);
      expect(logoutUser).not.toHaveBeenCalled();
    });

    it('lanza AppError 400 cuando falta refreshToken', async () => {
      const res = mockRes();

      await logout(mockReq({ userId: 'u1', body: {} }), res, next);

      expectNextAppError(400);
      expect(logoutUser).not.toHaveBeenCalled();
    });

    it('responde 200 y pasa el access token del header al servicio', async () => {
      const result = { message: 'Logout exitoso' };
      vi.mocked(logoutUser).mockResolvedValue(result as never);
      const req = mockReq({
        userId: 'u1',
        body: { refreshToken: 'r' },
        headers: { authorization: 'Bearer access-token' },
      });
      const res = mockRes();

      await logout(req, res, next);

      expect(logoutUser).toHaveBeenCalledWith('u1', 'r', 'access-token');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Token inválido', 401);
      vi.mocked(logoutUser).mockRejectedValue(error);
      const req = mockReq({ userId: 'u1', body: { refreshToken: 'r' } });
      const res = mockRes();

      await logout(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('refresh', () => {
    it('lanza AppError 400 cuando falta refreshToken', async () => {
      const res = mockRes();

      await refresh(mockReq({ body: {} }) as Request, res, next);

      expectNextAppError(400);
      expect(refreshAccessToken).not.toHaveBeenCalled();
    });

    it('responde 200 con el nuevo access token', async () => {
      const result = { message: 'Token actualizado', accessToken: 'nuevo' };
      vi.mocked(refreshAccessToken).mockResolvedValue(result as never);
      const res = mockRes();

      await refresh(mockReq({ body: { refreshToken: 'r' } }) as Request, res, next);

      expect(refreshAccessToken).toHaveBeenCalledWith('r');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('El token de renovación no es válido', 401);
      vi.mocked(refreshAccessToken).mockRejectedValue(error);
      const res = mockRes();

      await refresh(mockReq({ body: { refreshToken: 'r' } }) as Request, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('verifyEmailController', () => {
    it('lanza AppError 400 cuando falta el token', async () => {
      const res = mockRes();

      await verifyEmailController(mockReq({ body: {} }) as Request, res, next);

      expectNextAppError(400);
      expect(verifyEmail).not.toHaveBeenCalled();
    });

    it('responde 200 cuando el email se verifica', async () => {
      const result = { message: 'Email verificado correctamente' };
      vi.mocked(verifyEmail).mockResolvedValue(result as never);
      const res = mockRes();

      await verifyEmailController(mockReq({ body: { token: 't' } }) as Request, res, next);

      expect(verifyEmail).toHaveBeenCalledWith('t');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Token de verificación no válido', 400);
      vi.mocked(verifyEmail).mockRejectedValue(error);
      const res = mockRes();

      await verifyEmailController(mockReq({ body: { token: 't' } }) as Request, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('resendVerificationEmail', () => {
    it('responde 200 con el resultado del servicio', async () => {
      const result = { message: 'Email de verificación reenviado correctamente' };
      vi.mocked(resendVerificationEmailService).mockResolvedValue(result as never);
      const res = mockRes();

      await resendVerificationEmail(
        mockReq({ body: { email: 'a@b.com' } }) as Request,
        res,
        next
      );

      expect(resendVerificationEmailService).toHaveBeenCalledWith('a@b.com');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('El email no está registrado', 404);
      vi.mocked(resendVerificationEmailService).mockRejectedValue(error);
      const res = mockRes();

      await resendVerificationEmail(mockReq({ body: { email: 'a@b.com' } }) as Request, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updateProfile', () => {
    it('lanza AppError 401 cuando no hay userId', async () => {
      const res = mockRes();

      await updateProfile(mockReq({ body: { nombre: 'Ana' } }), res, next);

      expectNextAppError(401);
      expect(updateProfileService).not.toHaveBeenCalled();
    });

    it('responde 200 con el perfil actualizado', async () => {
      const result = { message: 'Perfil actualizado correctamente', user: { id: 'u1' } };
      vi.mocked(updateProfileService).mockResolvedValue(result as never);
      const req = mockReq({ userId: 'u1', body: { nombre: 'Ana' } });
      const res = mockRes();

      await updateProfile(req, res, next);

      expect(updateProfileService).toHaveBeenCalledWith('u1', req.body);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Usuario no encontrado', 404);
      vi.mocked(updateProfileService).mockRejectedValue(error);
      const res = mockRes();

      await updateProfile(mockReq({ userId: 'u1', body: {} }), res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getCurrentUser', () => {
    it('lanza AppError 401 cuando no hay userId', async () => {
      const res = mockRes();

      await getCurrentUser(mockReq(), res, next);

      expectNextAppError(401);
      expect(getCurrentUserService).not.toHaveBeenCalled();
    });

    it('responde 200 con el usuario actual', async () => {
      const result = { user: { id: 'u1', email: 'a@b.com' } };
      vi.mocked(getCurrentUserService).mockResolvedValue(result as never);
      const res = mockRes();

      await getCurrentUser(mockReq({ userId: 'u1' }), res, next);

      expect(getCurrentUserService).toHaveBeenCalledWith('u1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Usuario no encontrado', 404);
      vi.mocked(getCurrentUserService).mockRejectedValue(error);
      const res = mockRes();

      await getCurrentUser(mockReq({ userId: 'u1' }), res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('requestPasswordReset', () => {
    it('responde 200 con el resultado del servicio', async () => {
      const result = { message: 'Si el email está registrado, se enviará un correo' };
      vi.mocked(requestPasswordResetService).mockResolvedValue(result as never);
      const res = mockRes();

      await requestPasswordReset(mockReq({ body: { email: 'a@b.com' } }) as Request, res, next);

      expect(requestPasswordResetService).toHaveBeenCalledWith('a@b.com');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new Error('DB caída');
      vi.mocked(requestPasswordResetService).mockRejectedValue(error);
      const res = mockRes();

      await requestPasswordReset(mockReq({ body: { email: 'a@b.com' } }) as Request, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('resetPassword', () => {
    it('responde 200 con el resultado del servicio', async () => {
      const result = { message: 'Contraseña restablecida correctamente' };
      vi.mocked(resetPasswordService).mockResolvedValue(result as never);
      const res = mockRes();

      await resetPassword(
        mockReq({ body: { token: 't', password: 'password123' } }) as Request,
        res,
        next
      );

      expect(resetPasswordService).toHaveBeenCalledWith('t', 'password123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('El token ha expirado', 400);
      vi.mocked(resetPasswordService).mockRejectedValue(error);
      const res = mockRes();

      await resetPassword(mockReq({ body: { token: 't', password: 'password123' } }) as Request, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('completeTour', () => {
    it('lanza AppError 401 cuando no hay userId', async () => {
      const res = mockRes();

      await completeTour(mockReq({ body: { tour_version: 'v1' } }), res, next);

      expectNextAppError(401);
      expect(completeTourService).not.toHaveBeenCalled();
    });

    it('responde 200 con el resultado del servicio', async () => {
      const result = { message: 'Tour marcado completado exitosamente' };
      vi.mocked(completeTourService).mockResolvedValue(result as never);
      const req = mockReq({ userId: 'u1', body: { tour_version: 'v1' } });
      const res = mockRes();

      await completeTour(req, res, next);

      expect(completeTourService).toHaveBeenCalledWith('u1', 'v1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('delega el error al middleware con next(error)', async () => {
      const error = new AppError('Usuario no encontrado', 404);
      vi.mocked(completeTourService).mockRejectedValue(error);
      const res = mockRes();

      await completeTour(mockReq({ userId: 'u1', body: { tour_version: 'v1' } }), res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
