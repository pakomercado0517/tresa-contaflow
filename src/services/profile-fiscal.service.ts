import { Profile, ProfileFiscalSettings } from '../database/models/index.js';
import type {
  ProfileFiscalSettingsResponse,
  ProfileFiscalSettingsSnapshot,
  UpsertProfileFiscalSettingsBody,
} from '../types/profile-fiscal.types.js';
import { EMPTY_FISCAL_SETTINGS_SNAPSHOT as EMPTY_SNAPSHOT } from '../types/profile-fiscal.types.js';

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toFiscalSettingsSnapshot(
  row: ProfileFiscalSettings | null
): ProfileFiscalSettingsSnapshot {
  if (!row) {
    return { ...EMPTY_SNAPSHOT };
  }
  return {
    coeficiente_utilidad: toNullableNumber(row.coeficiente_utilidad),
    coeficiente_utilidad_ejercicio_anterior: toNullableNumber(
      row.coeficiente_utilidad_ejercicio_anterior
    ),
    isr_pagos_provisionales_acum: toNumber(row.isr_pagos_provisionales_acum),
    saldo_a_favor_isr: toNumber(row.saldo_a_favor_isr),
    saldo_a_favor_iva: toNumber(row.saldo_a_favor_iva),
    perdidas_fiscales_pendientes: toNumber(row.perdidas_fiscales_pendientes),
    ptu_pagada_acum: toNumber(row.ptu_pagada_acum),
  };
}

function toResponse(row: ProfileFiscalSettings): ProfileFiscalSettingsResponse {
  return {
    id: row.id,
    profile_id: row.profile_id,
    ejercicio: row.ejercicio,
    coeficiente_utilidad: toNullableNumber(row.coeficiente_utilidad),
    coeficiente_utilidad_ejercicio_anterior: toNullableNumber(
      row.coeficiente_utilidad_ejercicio_anterior
    ),
    isr_pagos_provisionales_acum: toNumber(row.isr_pagos_provisionales_acum),
    saldo_a_favor_isr: toNumber(row.saldo_a_favor_isr),
    saldo_a_favor_iva: toNumber(row.saldo_a_favor_iva),
    perdidas_fiscales_pendientes: toNumber(row.perdidas_fiscales_pendientes),
    ptu_pagada_acum: toNumber(row.ptu_pagada_acum),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function assertProfileOwnership(
  profileId: string,
  userId: string
): Promise<Profile | null> {
  return Profile.findOne({
    where: { id: profileId, user_id: userId },
    attributes: ['id'],
  });
}

export async function getFiscalSettings(
  profileId: string,
  ejercicio: number
): Promise<ProfileFiscalSettingsResponse | null> {
  const row = await ProfileFiscalSettings.findOne({
    where: { profile_id: profileId, ejercicio },
  });
  return row ? toResponse(row) : null;
}

export async function loadFiscalSettingsSnapshot(
  profileId: string,
  ejercicio: number
): Promise<ProfileFiscalSettingsSnapshot> {
  const row = await ProfileFiscalSettings.findOne({
    where: { profile_id: profileId, ejercicio },
  });
  return toFiscalSettingsSnapshot(row);
}

export async function upsertFiscalSettings(
  profileId: string,
  body: UpsertProfileFiscalSettingsBody
): Promise<ProfileFiscalSettingsResponse> {
  const existing = await ProfileFiscalSettings.findOne({
    where: { profile_id: profileId, ejercicio: body.ejercicio },
  });

  const payload = {
      coeficiente_utilidad:
        body.coeficiente_utilidad !== undefined
          ? body.coeficiente_utilidad
          : (existing?.coeficiente_utilidad ?? null),
      coeficiente_utilidad_ejercicio_anterior:
        body.coeficiente_utilidad_ejercicio_anterior !== undefined
          ? body.coeficiente_utilidad_ejercicio_anterior
          : (existing?.coeficiente_utilidad_ejercicio_anterior ?? null),
      isr_pagos_provisionales_acum:
        body.isr_pagos_provisionales_acum ??
        (existing ? toNumber(existing.isr_pagos_provisionales_acum) : 0),
      saldo_a_favor_isr:
        body.saldo_a_favor_isr ?? (existing ? toNumber(existing.saldo_a_favor_isr) : 0),
      saldo_a_favor_iva:
        body.saldo_a_favor_iva ?? (existing ? toNumber(existing.saldo_a_favor_iva) : 0),
      perdidas_fiscales_pendientes:
        body.perdidas_fiscales_pendientes ??
        (existing ? toNumber(existing.perdidas_fiscales_pendientes) : 0),
      ptu_pagada_acum:
        body.ptu_pagada_acum ?? (existing ? toNumber(existing.ptu_pagada_acum) : 0),
    };

  if (existing) {
    await existing.update(payload);
    return toResponse(existing);
  }

  const created = await ProfileFiscalSettings.create({
    profile_id: profileId,
    ejercicio: body.ejercicio,
    ...payload,
  });
  return toResponse(created);
}
