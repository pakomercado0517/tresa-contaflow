/**
 * Tipos para el módulo de descarga masiva SAT (Web Service oficial).
 */

export interface RegisterFielDto {
  profile_id: string;
  certificate_base64: string;
  private_key_base64: string;
  password: string;
}

export interface SatDescargaSyncStatus {
  profile_id: string;
  last_sync_at: string | null;
  sync_enabled: boolean;
  has_credentials: boolean;
}

export interface SatDescargaSyncResult {
  profile_id: string;
  synced: number;
  errors: string[];
}
