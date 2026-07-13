import { User } from '../database/models/index.js';
import {
  authMeKey,
  getAuthMeTtlSeconds,
  getJson,
  setJsonForAuthUser,
} from './cache.service.js';
import type { CurrentUserDto, GetCurrentUserResponse } from '../types/auth.types.js';

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
