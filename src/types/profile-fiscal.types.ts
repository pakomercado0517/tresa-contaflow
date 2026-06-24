/**
 * Configuración fiscal por perfil y ejercicio (pagos provisionales, coeficientes, saldos)
 */

export interface ProfileFiscalSettingsAttributes {
  id: string;
  profile_id: string;
  ejercicio: number;
  coeficiente_utilidad: number | null;
  coeficiente_utilidad_ejercicio_anterior: number | null;
  isr_pagos_provisionales_acum: number;
  saldo_a_favor_isr: number;
  saldo_a_favor_iva: number;
  perdidas_fiscales_pendientes: number;
  ptu_pagada_acum: number;
  created_at: Date;
  updated_at: Date;
}

export interface ProfileFiscalSettingsResponse {
  id: string;
  profile_id: string;
  ejercicio: number;
  coeficiente_utilidad: number | null;
  coeficiente_utilidad_ejercicio_anterior: number | null;
  isr_pagos_provisionales_acum: number;
  saldo_a_favor_isr: number;
  saldo_a_favor_iva: number;
  perdidas_fiscales_pendientes: number;
  ptu_pagada_acum: number;
  created_at: string;
  updated_at: string;
}

/** Valores numéricos usados por el motor de estimación (sin metadatos de BD) */
export interface ProfileFiscalSettingsSnapshot {
  coeficiente_utilidad: number | null;
  coeficiente_utilidad_ejercicio_anterior: number | null;
  isr_pagos_provisionales_acum: number;
  saldo_a_favor_isr: number;
  saldo_a_favor_iva: number;
  perdidas_fiscales_pendientes: number;
  ptu_pagada_acum: number;
}

export interface UpsertProfileFiscalSettingsBody {
  ejercicio: number;
  coeficiente_utilidad?: number | null;
  coeficiente_utilidad_ejercicio_anterior?: number | null;
  isr_pagos_provisionales_acum?: number;
  saldo_a_favor_isr?: number;
  saldo_a_favor_iva?: number;
  perdidas_fiscales_pendientes?: number;
  ptu_pagada_acum?: number;
}

export const EMPTY_FISCAL_SETTINGS_SNAPSHOT: ProfileFiscalSettingsSnapshot = {
  coeficiente_utilidad: null,
  coeficiente_utilidad_ejercicio_anterior: null,
  isr_pagos_provisionales_acum: 0,
  saldo_a_favor_isr: 0,
  saldo_a_favor_iva: 0,
  perdidas_fiscales_pendientes: 0,
  ptu_pagada_acum: 0,
};
