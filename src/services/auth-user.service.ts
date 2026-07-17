import { Subscription, User } from '../database/models/index.js';
import {
  authMeKey,
  getAuthMeTtlSeconds,
  getJson,
  invalidateUserAuthCache,
  setJsonForAuthUser,
} from './cache.service.js';
import type {
  CurrentUserDto,
  GetCurrentUserResponse,
  LoginUserResponse,
  RegisterUserResponse,
  SafeUser,
  UpdateProfileDto,
} from '../types/auth.types.js';
import { sequelize } from '../database/config.js';
import bcrypt from 'bcrypt';
import { generateVerificationToken, hashVerificationToken } from '../utils/verification.util.js';
import { AppError } from '../utils/AppError.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.util.js';
import { verifyFirebaseIdToken } from '../utils/firebase.util.js';
import {
  revokeAccessToken,
  revokeRefreshToken,
  isRefreshTokenRevoked,
} from './token-revoke.service.js';
import { sendPasswordResetEmail, sendVerificationEmail } from './email.service.js';

/**
 * Elimina los campos sensibles del usuario antes de exponerlo en una respuesta.
 */
function sanitizeUser(user: User): SafeUser {
  const plain = user.get({ plain: true }) as unknown as Record<string, unknown>;
  delete plain.password_hash;
  delete plain.email_verification_token;
  delete plain.email_verification_expires;
  delete plain.password_reset_token;
  delete plain.password_reset_expires;
  return plain as unknown as SafeUser;
}

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

  const existingUser = await User.findOne({ where: { email: email.toLowerCase().trim() } });
  if (existingUser)
    throw new AppError('El email ya está registrado, por favor intenta con otro email.', 409);

  //Preparación de datos
  const transaction = await sequelize.transaction();
  let newUser: User;
  let verificationToken: string;

  try {
    const passwordHash = await bcrypt.hash(password ? password.trim() : '', 10);
    verificationToken = generateVerificationToken();
    const hashedToken = hashVerificationToken(verificationToken);
    newUser = await User.create(
      {
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        nombre: nombre ? nombre.trim() : null,
        apellido: apellido ? apellido.trim() : null,
        telefono: telefono ? telefono.trim() : null,
        email_verified: false,
        email_verification_token: hashedToken,
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
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
  await sendVerificationEmail(newUser.email, verificationToken, newUser.nombre).catch((err) => {
    throw new AppError(
      `Error al enviar el email de verificación, por favor intenta nuevamente: ${err.message}`,
      500
    );
  });

  return {
    message:
      'Usuario registrado correctamente. Se ha enviado un email de verificación, revisa tu bandeja de entrada.',
    user: sanitizeUser(newUser),
  };
}

export async function loginUser(userDto: User): Promise<LoginUserResponse> {
  const { email, password } = userDto;

  const findUser = await User.findOne({ where: { email: email.toLowerCase().trim() } });

  if (!findUser)
    throw new AppError('Credenciales inválidas, por favor verifica tus credenciales.', 401);
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
    user: sanitizeUser(findUser),
  };
}

export async function loginUserWithGoogle(idToken: string): Promise<LoginUserResponse> {
  const decoded = await verifyFirebaseIdToken(idToken);
  const email = decoded.email?.trim().toLowerCase();
  if (!email) throw new AppError('No se pudo obtener el email de Google', 400);

  let googleUser = await User.findOne({ where: { email } });
  if (googleUser) {
    const updateData: Partial<User> = { firebase_uid: decoded.uid, email_verified: true };
    if (!googleUser.nombre) updateData.nombre = decoded.name ? decoded.name.trim() : null;
    await googleUser.update(updateData);
  } else {
    const transaction = await sequelize.transaction();
    try {
      googleUser = await User.create(
        {
          email,
          password_hash: null,
          firebase_uid: decoded.uid,
          nombre: decoded.name?.trim() || null,
          email_verified: true,
        },
        { transaction }
      );

      await Subscription.create(
        {
          user_id: googleUser.id,
          plan: 'FREE',
          status: 'ACTIVE',
        },
        { transaction }
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
  const tokenPayload = { userId: googleUser?.id, email: googleUser?.email };
  return {
    message: 'Login exitoso',
    accessToken: generateAccessToken(tokenPayload),
    refreshToken: generateRefreshToken(tokenPayload),
    user: sanitizeUser(googleUser),
  };
}

export async function logoutUser(userId: string, refreshToken: string, accessToken: string) {
  let refreshPayload;

  try {
    refreshPayload = verifyRefreshToken(refreshToken);
  } catch (error: any) {
    throw new AppError(
      error.name === 'Token ExpiredError'
        ? 'Tu sesión ha expirado'
        : 'El token de renovación no es válido',
      401
    );
  }

  if (refreshPayload.userId !== userId)
    throw new AppError('El refresh token no corresponde a este usuario', 403);

  if (accessToken) await revokeAccessToken(accessToken, userId);

  await revokeRefreshToken(refreshToken, userId);

  return { message: 'Logout exitoso' };
}

export async function refreshAccessToken(refreshToken: string) {
  let payload: ReturnType<typeof verifyRefreshToken>;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (error) {
    throw new AppError(
      error instanceof Error && error.name === 'TokenExpiredError'
        ? 'Tu sesión ha expirado'
        : 'El token de renovación no es válido',
      401
    );
  }

  //Rechazamos tokens revocados (por ejemplo, tras un logout)
  if (await isRefreshTokenRevoked(refreshToken))
    throw new AppError('El token de renovación ha sido revocado', 401);

  const accessToken = generateAccessToken({
    userId: payload.userId,
    email: payload.email,
  });
  return { message: 'Token actualizado', accessToken };
}

export async function verifyEmail(token: string) {
  const hashedToken = hashVerificationToken(token);
  const user = await User.findOne({ where: { email_verification_token: hashedToken } });
  if (!user)
    throw new AppError(
      'Token de verificación no válido, puedes solicitar un nuevo email de verificación',
      400
    );
  if (user.email_verified) throw new AppError('El email ya está verificado', 400);
  if (user.email_verification_expires && user.email_verification_expires < new Date())
    throw new AppError('El token de verificación ha expirado', 400);
  await user.update({
    email_verified: true,
    email_verification_token: null,
    email_verification_expires: null,
  });

  await invalidateUserAuthCache(user.id);
  return { message: 'Email verificado correctamente' };
}

export async function resendVerificationEmailService(email: string) {
  const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });
  if (!user) throw new AppError('El email no está registrado', 404);
  if (user.email_verified) throw new AppError('El email ya está verificado', 400);

  const verificationToken = generateVerificationToken();
  const hashedToken = hashVerificationToken(verificationToken);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); //Expira en 24 horas

  await user.update({
    email_verification_token: hashedToken,
    email_verification_expires: expiresAt,
  });

  await sendVerificationEmail(user.email, verificationToken, user.nombre);

  return {
    message:
      'Email de verificación reenviado correctamente. Por favor revisa tu bandeja de entrada.',
  };
}

export async function updateProfileService(userId: string, profile: UpdateProfileDto) {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError('Usuario no encontrado', 404);
  await user.update(profile);

  await user.reload();

  await invalidateUserAuthCache(userId);

  return {
    message: 'Perfil actualizado correctamente',
    user: sanitizeUser(user),
  };
}

export async function getCurrentUserService(userId: string): Promise<GetCurrentUserResponse> {
  const user = await getCurrentUserCached(userId);

  if (!user) throw new AppError('Usuario no encontrado', 404);
  return user;
}

export async function requestPasswordResetService(email: string) {
  const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });
  //Por seguridad, no revelamos si el email existe o no
  if (!user)
    return {
      message: 'Si el email está registrado, se enviará el email de restablecimiento de contraseña',
    };
  const resetToken = generateVerificationToken();
  const hashedToken = hashVerificationToken(resetToken);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1); //Expira en 1 hora

  await user.update({
    password_reset_token: hashedToken,
    password_reset_expires: expiresAt,
  });

  //Enviamos el email de restablecimiento de contraseña
  await sendPasswordResetEmail(user.email, resetToken, user.nombre);

  return {
    message:
      'Si el email está registrado, se enviará un correo con las instrucciones para restablecer tu contraseña',
  };
}

export async function resetPasswordService(token: string, password: string) {
  const hashedToken = hashVerificationToken(token);
  const user = await User.findOne({ where: { password_reset_token: hashedToken } });
  if (!user)
    throw new AppError('No se pudo verificar el token, por favor solicita un nuevo token.', 400);

  if (!user.password_reset_expires || user.password_reset_expires < new Date())
    throw new AppError('El token ha expirado, por favor solicita un nuevo token.', 400);

  const passwordHash = await bcrypt.hash(password, 10);

  await user.update({
    password_hash: passwordHash,
    password_reset_token: null,
    password_reset_expires: null,
  });

  await invalidateUserAuthCache(user.id);
  return {
    message: 'Contraseña restablecida correctamente',
  };
}

export async function completeTourService(userId: string, tourVersion: string) {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError('Usuario no encontrado', 404);

  await user.update({
    tour_version: tourVersion,
    tour_completed_at: new Date(),
  });

  await invalidateUserAuthCache(userId);

  return {
    message: 'Tour marcado completado exitosamente',
  };
}
