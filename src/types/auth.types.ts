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
