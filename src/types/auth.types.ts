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

export interface GetCurrentUserResponse {
  user: CurrentUserDto;
}

export interface RegisterUserResponse {
  user: UserAttributes; //Usamos la interfaz del modelo User
  verificationToken: string;
}

export interface LoginUserResponse {
  message: string;
  accessToken: string;
  refreshToken: string;
  user: UserAttributes;
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
