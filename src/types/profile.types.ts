/**
 * Tipos para Profile y operaciones de congelación
 */

import type { Plan } from '../constants/plans.constants.js';

export type FrozenReason = 'plan_limit' | 'user_suspension' | 'payment_issue';

export interface ProfileResponse {
  id: string;
  user_id: string;
  nombre: string;
  rfc: string;
  tipo_persona: 'FISICA' | 'MORAL';
  regimenes_fiscales: string[];
  validaciones_habilitadas: Record<string, unknown>;
  frozen: boolean;
  frozen_reason: FrozenReason | null;
  frozen_at: string | null; // ISO 8601 string
  created_at: string;
  updated_at: string;
}

export interface FreezeOthersRequest {
  preserveProfileId: string; // UUID
  targetPlan?: Plan; // Plan objetivo tras downgrade (opcional)
}

export interface FreezeOthersResponse {
  message: string;
  frozen: ProfileResponse[]; // Perfiles que fueron congelados
  active: ProfileResponse; // Perfil que fue preservado
  count: {
    frozen: number;
    total: number;
  };
}

export interface ProfileServiceError {
  code: string;
  message: string;
  statusCode: number;
}
