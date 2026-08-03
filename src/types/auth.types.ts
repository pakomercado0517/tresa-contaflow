import type User from '../database/models/User.model.js';
import type { UserAttributes } from '../database/models/User.model.js';

export interface CurrentUserDto {
  id: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
  telefono: string | null;
  email_verified: boolean;
  tour_version: string | null;
  tour_completed_at: Date | null;
  logo_url: string | null;
  nombre_comercial: string | null;
}

export interface RegisterUserDto {
  id: string;
  email: string;
  password: string;
  password_hash: string | null;
  firebase_uid: string | null;
  nombre: string | null;
  apellido: string | null;
  telefono: string | null;
  email_verified: boolean;
  email_verification_token: string | null;
  email_verification_expires: Date | null;
}

export interface GetCurrentUserResponse {
  user: CurrentUserDto;
}

/**
 * Usuario sin campos sensibles, apto para exponer en respuestas de la API.
 * Omite el hash de contraseña y los tokens de verificación/reset.
 */
export type SafeUser = Omit<
  UserAttributes,
  | 'password_hash'
  | 'email_verification_token'
  | 'email_verification_expires'
  | 'password_reset_token'
  | 'password_reset_expires'
>;

export interface RegisterUserResponse {
  message: string;
  user: SafeUser;
}

export interface LoginUserResponse {
  message: string;
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
}

export interface LoginUserWithGoogleResponse extends LoginUserResponse {
  idToken: string;
}

export interface UpdateProfileDto {
  nombre: string | null;
  apellido: string | null;
  telefono: string | null;
  nombre_comercial: string | null;
  logo_url: string | null;
}
