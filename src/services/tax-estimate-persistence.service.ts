import TaxEstimate from '../database/models/TaxEstimate.model.js';
import type {
  PersistTaxEstimateOptions,
  TaxEstimateSnapshotRecord,
} from '../types/tax-estimate-persistence.types.js';
import type { TaxEstimateResult, TipoPersonaFiscal } from '../types/tax-estimate.types.js';

export class TaxEstimatePersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaxEstimatePersistenceError';
  }
}

function isTipoPersonaFiscal(value: unknown): value is TipoPersonaFiscal {
  return value === 'FISICA' || value === 'MORAL';
}

function assertValidPayload(result: TaxEstimateResult): TaxEstimateResult {
  if (
    typeof result.regimen !== 'string' ||
    !isTipoPersonaFiscal(result.tipo_persona) ||
    typeof result.ejercicio !== 'number' ||
    typeof result.mes !== 'number' ||
    result.mes < 1 ||
    result.mes > 12 ||
    typeof result.supported !== 'boolean' ||
    typeof result.disclaimer !== 'string' ||
    typeof result.iva !== 'object' ||
    result.iva === null ||
    !Array.isArray(result.alerts)
  ) {
    throw new TaxEstimatePersistenceError('Payload de estimación fiscal inválido');
  }
  return result;
}

function toSnapshotRecord(row: TaxEstimate): TaxEstimateSnapshotRecord {
  const payload = assertValidPayload(row.payload as TaxEstimateResult);
  return {
    id: row.id,
    profile_id: row.profile_id,
    regimen: row.regimen,
    ejercicio: row.ejercicio,
    mes: row.mes,
    tipo_persona: row.tipo_persona,
    period_id: row.period_id,
    payload,
    computed_at: row.computed_at.toISOString(),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function upsertTaxEstimateSnapshot(
  profileId: string,
  regimen: string,
  result: TaxEstimateResult,
  options: PersistTaxEstimateOptions = {}
): Promise<TaxEstimateSnapshotRecord> {
  const payload = assertValidPayload(result);
  const now = new Date();
  const periodId = options.periodId ?? null;

  const existing = await TaxEstimate.findOne({
    where: {
      profile_id: profileId,
      regimen,
      ejercicio: payload.ejercicio,
      mes: payload.mes,
    },
  });

  if (existing) {
    await existing.update({
      tipo_persona: payload.tipo_persona,
      period_id: periodId,
      payload,
      computed_at: now,
    });
    return toSnapshotRecord(existing);
  }

  const created = await TaxEstimate.create({
    profile_id: profileId,
    regimen,
    ejercicio: payload.ejercicio,
    mes: payload.mes,
    tipo_persona: payload.tipo_persona,
    period_id: periodId,
    payload,
    computed_at: now,
  });
  return toSnapshotRecord(created);
}

export async function listTaxEstimateHistory(
  profileId: string,
  ejercicio: number,
  regimen?: string
): Promise<TaxEstimateSnapshotRecord[]> {
  const rows = await TaxEstimate.findAll({
    where: {
      profile_id: profileId,
      ejercicio,
      ...(regimen !== undefined ? { regimen } : {}),
    },
    order: [['mes', 'ASC']],
  });
  return rows.map((row) => toSnapshotRecord(row));
}

export async function persistEstimatesFromList(
  profileId: string,
  estimates: Array<{ regimen: string; tax_estimate: TaxEstimateResult | null }>,
  options: PersistTaxEstimateOptions = {}
): Promise<number> {
  let count = 0;
  for (const item of estimates) {
    if (item.tax_estimate === null) {
      continue;
    }
    await upsertTaxEstimateSnapshot(profileId, item.regimen, item.tax_estimate, options);
    count += 1;
  }
  return count;
}
