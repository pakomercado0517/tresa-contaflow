import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../utils/AppError.js';

vi.mock('../database/models/index.js', () => ({
  User: {
    findOne: vi.fn(),
    findByPk: vi.fn(),
    create: vi.fn(),
  },
  Subscription: {
    create: vi.fn(),
  },
}));

vi.mock('../database/config.js', () => ({
  sequelize: {
    transaction: vi.fn(),
  },
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

vi.mock('../utils/verification.util.js', () => ({
  generateVerificationToken: vi.fn(() => 'plain-token'),
  hashVerificationToken: vi.fn((token: string) => `hashed-${token}`),
}));

vi.mock('../utils/jwt.util.js', () => ({
  generateAccessToken: vi.fn(() => 'access-token'),
  generateRefreshToken: vi.fn(() => 'refresh-token'),
  verifyRefreshToken: vi.fn(),
}));

vi.mock('../utils/firebase.util.js', () => ({
  verifyFirebaseIdToken: vi.fn(),
}));

vi.mock('../services/token-revoke.service.js', () => ({
  revokeAccessToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  isRefreshTokenRevoked: vi.fn(),
}));

vi.mock('../services/email.service.js', () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('../services/cache.service.js', () => ({
  authMeKey: (userId: string) => `contafy:auth:me:${userId}`,
  getAuthMeTtlSeconds: () => 300,
  getJson: vi.fn(),
  setJsonForAuthUser: vi.fn(),
  invalidateUserAuthCache: vi.fn(),
}));

import bcrypt from 'bcrypt';
import { User, Subscription } from '../database/models/index.js';
import { sequelize } from '../database/config.js';
import { verifyRefreshToken } from '../utils/jwt.util.js';
import { isRefreshTokenRevoked } from '../services/token-revoke.service.js';
import { verifyFirebaseIdToken } from '../utils/firebase.util.js';
import { sendVerificationEmail } from '../services/email.service.js';
import {
  registerUser,
  loginUser,
  loginUserWithGoogle,
  logoutUser,
  refreshAccessToken,
  verifyEmail,
  resendVerificationEmailService,
  updateProfileService,
  getCurrentUserService,
  requestPasswordResetService,
  resetPasswordService,
  completeTourService,
} from '../services/auth-user.service.js';

/**
 * Ejecuta la promesa esperando que rechace, y devuelve el error capturado.
 */
async function catchError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    return error as AppError;
  }
  throw new Error('Se esperaba que la promesa fuera rechazada, pero se resolvió');
}

const futureDate = new Date(Date.now() + 60 * 60 * 1000);
const pastDate = new Date(Date.now() - 60 * 60 * 1000);

describe('auth-user.service (rutas de error con AppError)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registerUser', () => {
    it('lanza AppError 409 si el email ya está registrado', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ id: 'existing' } as never);

      const error = await catchError(
        registerUser({ email: 'a@b.com', password: 'password123' } as never)
      );

      expect(error).toBeInstanceOf(AppError);
      expect(error.status).toBe(409);
      expect(User.create).not.toHaveBeenCalled();
    });

    it('crea usuario y suscripción, hace commit y retorna el usuario', async () => {
      const commit = vi.fn();
      const rollback = vi.fn();
      vi.mocked(User.findOne).mockResolvedValue(null);
      vi.mocked(sequelize.transaction).mockResolvedValue({ commit, rollback } as never);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never);
      const newUser = {
        id: 'u1',
        email: 'a@b.com',
        nombre: 'Ana',
        get: () => ({ id: 'u1', email: 'a@b.com' }),
      };
      vi.mocked(User.create).mockResolvedValue(newUser as never);
      vi.mocked(Subscription.create).mockResolvedValue({} as never);
      vi.mocked(sendVerificationEmail).mockResolvedValue(undefined as never);

      const result = await registerUser({
        email: 'a@b.com',
        password: 'password123',
        nombre: 'Ana',
      } as never);

      expect(commit).toHaveBeenCalledTimes(1);
      expect(rollback).not.toHaveBeenCalled();
      expect(Subscription.create).toHaveBeenCalled();
      expect(result.user).toEqual({ id: 'u1', email: 'a@b.com' });
    });
  });

  describe('loginUser', () => {
    it('lanza AppError 401 si el usuario no existe (anti-enumeration)', async () => {
      vi.mocked(User.findOne).mockResolvedValue(null);

      const error = await catchError(
        loginUser({ email: 'a@b.com', password: 'password123' } as never)
      );

      expect(error.status).toBe(401);
    });

    it('lanza AppError 401 si la cuenta se registró con Google (sin password_hash)', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ id: 'u1', password_hash: null } as never);

      const error = await catchError(
        loginUser({ email: 'a@b.com', password: 'password123' } as never)
      );

      expect(error.status).toBe(401);
    });

    it('lanza AppError 401 si la contraseña es inválida', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ id: 'u1', password_hash: 'hash' } as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      const error = await catchError(
        loginUser({ email: 'a@b.com', password: 'wrong' } as never)
      );

      expect(error.status).toBe(401);
    });

    it('retorna tokens cuando las credenciales son válidas', async () => {
      vi.mocked(User.findOne).mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        password_hash: 'hash',
        get: () => ({ id: 'u1', email: 'a@b.com' }),
      } as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await loginUser({ email: 'a@b.com', password: 'password123' } as never);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.message).toBe('Login exitoso');
    });
  });

  describe('loginUserWithGoogle', () => {
    it('lanza AppError 400 si Firebase no devuelve email', async () => {
      vi.mocked(verifyFirebaseIdToken).mockResolvedValue({ uid: 'x', email: undefined } as never);

      const error = await catchError(loginUserWithGoogle('id-token'));

      expect(error.status).toBe(400);
    });
  });

  describe('logoutUser', () => {
    it('lanza AppError 401 si el refresh token es inválido', async () => {
      vi.mocked(verifyRefreshToken).mockImplementation(() => {
        throw new Error('invalid');
      });

      const error = await catchError(logoutUser('u1', 'refresh', 'access'));

      expect(error.status).toBe(401);
    });

    it('lanza AppError 403 si el refresh token no corresponde al usuario', async () => {
      vi.mocked(verifyRefreshToken).mockReturnValue({ userId: 'otro', email: 'x@y.com' } as never);

      const error = await catchError(logoutUser('u1', 'refresh', 'access'));

      expect(error.status).toBe(403);
    });

    it('retorna mensaje de éxito cuando el token es válido', async () => {
      vi.mocked(verifyRefreshToken).mockReturnValue({ userId: 'u1', email: 'x@y.com' } as never);

      const result = await logoutUser('u1', 'refresh', 'access');

      expect(result).toEqual({ message: 'Logout exitoso' });
    });
  });

  describe('refreshAccessToken', () => {
    it('lanza AppError 401 si el token es inválido (verifyRefreshToken lanza)', async () => {
      vi.mocked(verifyRefreshToken).mockImplementation(() => {
        throw new Error('invalid signature');
      });

      const error = await catchError(refreshAccessToken('refresh'));

      expect(error.status).toBe(401);
    });

    it('lanza AppError 401 si el token está revocado (deny-list)', async () => {
      vi.mocked(verifyRefreshToken).mockReturnValue({ userId: 'u1', email: 'x@y.com' } as never);
      vi.mocked(isRefreshTokenRevoked).mockResolvedValue(true);

      const error = await catchError(refreshAccessToken('refresh'));

      expect(error.status).toBe(401);
    });

    it('retorna un nuevo access token cuando el refresh es válido y no está revocado', async () => {
      vi.mocked(verifyRefreshToken).mockReturnValue({ userId: 'u1', email: 'x@y.com' } as never);
      vi.mocked(isRefreshTokenRevoked).mockResolvedValue(false);

      const result = await refreshAccessToken('refresh');

      expect(result.accessToken).toBe('access-token');
    });
  });

  describe('verifyEmail', () => {
    it('lanza AppError 400 si el token no existe', async () => {
      vi.mocked(User.findOne).mockResolvedValue(null);

      const error = await catchError(verifyEmail('token'));

      expect(error.status).toBe(400);
    });

    it('lanza AppError 400 si el email ya está verificado', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ email_verified: true } as never);

      const error = await catchError(verifyEmail('token'));

      expect(error.status).toBe(400);
    });

    it('lanza AppError 400 si el token expiró', async () => {
      vi.mocked(User.findOne).mockResolvedValue({
        email_verified: false,
        email_verification_expires: pastDate,
      } as never);

      const error = await catchError(verifyEmail('token'));

      expect(error.status).toBe(400);
    });

    it('verifica el email correctamente cuando el token es válido', async () => {
      const update = vi.fn();
      vi.mocked(User.findOne).mockResolvedValue({
        id: 'u1',
        email_verified: false,
        email_verification_expires: futureDate,
        update,
      } as never);

      const result = await verifyEmail('token');

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ email_verified: true })
      );
      expect(result).toEqual({ message: 'Email verificado correctamente' });
    });
  });

  describe('resendVerificationEmailService', () => {
    it('lanza AppError 404 si el email no está registrado', async () => {
      vi.mocked(User.findOne).mockResolvedValue(null);

      const error = await catchError(resendVerificationEmailService('a@b.com'));

      expect(error.status).toBe(404);
    });

    it('lanza AppError 400 si el email ya está verificado', async () => {
      vi.mocked(User.findOne).mockResolvedValue({ email_verified: true } as never);

      const error = await catchError(resendVerificationEmailService('a@b.com'));

      expect(error.status).toBe(400);
    });
  });

  describe('updateProfileService', () => {
    it('lanza AppError 404 si el usuario no existe', async () => {
      vi.mocked(User.findByPk).mockResolvedValue(null);

      const error = await catchError(updateProfileService('u1', {} as never));

      expect(error.status).toBe(404);
    });
  });

  describe('getCurrentUserService', () => {
    it('lanza AppError 404 si el usuario no existe', async () => {
      vi.mocked(User.findByPk).mockResolvedValue(null);

      const error = await catchError(getCurrentUserService('u1'));

      expect(error.status).toBe(404);
    });
  });

  describe('requestPasswordResetService', () => {
    it('no revela si el email existe y retorna mensaje genérico', async () => {
      vi.mocked(User.findOne).mockResolvedValue(null);

      const result = await requestPasswordResetService('a@b.com');

      expect(result.message).toContain('Si el email está registrado');
    });
  });

  describe('resetPasswordService', () => {
    it('lanza AppError 400 si el token no existe', async () => {
      vi.mocked(User.findOne).mockResolvedValue(null);

      const error = await catchError(resetPasswordService('token', 'password123'));

      expect(error.status).toBe(400);
    });

    it('lanza AppError 400 si el token expiró', async () => {
      vi.mocked(User.findOne).mockResolvedValue({
        id: 'u1',
        password_reset_expires: pastDate,
      } as never);

      const error = await catchError(resetPasswordService('token', 'password123'));

      expect(error.status).toBe(400);
    });

    it('restablece la contraseña cuando el token es válido', async () => {
      const update = vi.fn();
      vi.mocked(User.findOne).mockResolvedValue({
        id: 'u1',
        password_reset_expires: futureDate,
        update,
      } as never);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never);

      const result = await resetPasswordService('token', 'password123');

      expect(update).toHaveBeenCalled();
      expect(result).toEqual({ message: 'Contraseña restablecida correctamente' });
    });
  });

  describe('completeTourService', () => {
    it('lanza AppError 404 si el usuario no existe', async () => {
      vi.mocked(User.findByPk).mockResolvedValue(null);

      const error = await catchError(completeTourService('u1', 'v1'));

      expect(error.status).toBe(404);
    });
  });
});
