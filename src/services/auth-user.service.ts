import { Subscription, User } from '../database/models/index.js';
import { authMeKey, getAuthMeTtlSeconds, getJson, setJsonForAuthUser } from './cache.service.js';
import type {
  CurrentUserDto,
  GetCurrentUserResponse,
  LoginUserResponse,
  RegisterUserResponse,
} from '../types/auth.types.js';
import { sequelize } from '../database/config.js';
import bcrypt from 'bcrypt';
import { generateVerificationToken } from '../utils/verification.util.js';
import { AppError } from '../utils/AppError.js';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.util.js';

function mapUserToDto(user: User): CurrentUserDto {
  return {
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    apellido: user.apellido,
    telefono: user.telefono,
    email_verified: user.email_verified,
    tour_version: user.tour_version,
    tour_completed_at: user.tour_completed_at,
    logo_url: user.logo_url,
    nombre_comercial: user.nombre_comercial,
  };
}

function rehydrateCurrentUserResponse(cached: GetCurrentUserResponse): GetCurrentUserResponse {
  const tourCompleted = cached.user.tour_completed_at;
  return {
    user: {
      ...cached.user,
      tour_completed_at:
        tourCompleted != null && typeof tourCompleted === 'string'
          ? new Date(tourCompleted)
          : tourCompleted,
    },
  };
}

async function fetchCurrentUserFromDb(userId: string): Promise<GetCurrentUserResponse | null> {
  const user = await User.findByPk(userId);
  if (!user) {
    return null;
  }
  return { user: mapUserToDto(user) };
}

/**
 * Obtiene el usuario autenticado con cache-aside (GET /api/auth/me).
 */
export async function getCurrentUserCached(userId: string): Promise<GetCurrentUserResponse | null> {
  const cacheKey = authMeKey(userId);
  const cached = await getJson<GetCurrentUserResponse>(cacheKey, {
    userId,
    domain: 'auth',
  });

  if (cached) {
    return rehydrateCurrentUserResponse(cached);
  }

  const response = await fetchCurrentUserFromDb(userId);
  if (!response) {
    return null;
  }

  await setJsonForAuthUser(cacheKey, response, userId, getAuthMeTtlSeconds());
  return response;
}

export async function registerUser(user: User): Promise<RegisterUserResponse> {
  const { email, password, nombre, apellido, telefono } = user;

  const transaction = await sequelize.transaction();
  const existingUser = await User.findOne({ where: { email: email.toLowerCase().trim() } });
  if (existingUser)
    throw new AppError('El email ya está registrado, por favor intenta con otro email.', 409);

  //Preparación de datos
  const passwordHash = await bcrypt.hash(password ? password.trim() : '', 10);
  const verificationToken = generateVerificationToken();

  try {
    const newUser = await User.create(
      {
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        nombre: nombre ? nombre.trim() : null,
        apellido: apellido ? apellido.trim() : null,
        telefono: telefono ? telefono.trim() : null,
        email_verified: false,
        email_verification_token: verificationToken,
        email_verification_expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      { transaction }
    );
    await Subscription.create(
      {
        user_id: newUser.id,
        plan: 'FREE',
        status: 'ACTIVE',
      },
      { transaction }
    );
    await transaction.commit();
    return {
      user: newUser.get({ plain: true }),
      verificationToken,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function loginUser(userDto: User): Promise<LoginUserResponse> {
  const { email, password } = userDto;

  const findUser = await User.findOne({ where: { email: email.toLowerCase().trim() } });

  if (!findUser)
    throw new AppError('Credenciales inválidas, por favor verifica tus credenciales.', 404);
  if (!findUser.password_hash)
    throw new AppError('Esta cuenta se registró con Google. Inicia sesión con Google.', 401);

  const passwordValid = await bcrypt.compare(
    password ? password.trim() : '',
    findUser.password_hash ? findUser.password_hash.trim() : ''
  );
  if (!passwordValid)
    throw new AppError('Credenciales inválidas, por favor verifica tus credenciales.', 401);

  const tokenPayload = {
    userId: findUser.id,
    email: findUser.email,
  };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  return {
    message: 'Login exitoso',
    accessToken,
    refreshToken,
    user: findUser.get({ plain: true }),
  };
}
