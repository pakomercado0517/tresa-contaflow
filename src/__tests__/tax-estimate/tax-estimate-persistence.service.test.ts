import { describe, it, expect, vi, beforeEach } from 'vitest';
import TaxEstimate from '../../database/models/TaxEstimate.model.js';
import type { TaxEstimateResult } from '../../types/tax-estimate.types.js';
import {
  listTaxEstimateHistory,
  upsertTaxEstimateSnapshot,
} from '../../services/tax-estimate-persistence.service.js';

vi.mock('../../database/models/TaxEstimate.model.js', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
    findAll: vi.fn(),
  },
}));

function sampleResult(overrides: Partial<TaxEstimateResult> = {}): TaxEstimateResult {
  return {
    regimen: '626',
    tipo_persona: 'FISICA',
    ejercicio: 2026,
    mes: 3,
    supported: true,
    disclaimer: 'Estimación informativa.',
    isr: {
      ingresos_base: 10_000,
      deducciones_aplicadas: 0,
      base_gravable: 10_000,
      tasa_o_tarifa: '1.00%',
      isr_causado: 100,
      menos_retenciones: 0,
      menos_pagos_provisionales_anteriores: 0,
      isr_neto_a_pagar: 100,
      saldo_a_favor: 0,
    },
    iva: {
      iva_trasladado_cobrado: 1600,
      iva_acreditable_pagado: 0,
      iva_retenido: 0,
      iva_neto_a_pagar: 1600,
      saldo_a_favor: 0,
    },
    alerts: [],
    ...overrides,
  };
}

describe('tax-estimate-persistence.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upsertTaxEstimateSnapshot crea fila nueva', async () => {
    vi.mocked(TaxEstimate.findOne).mockResolvedValue(null);
    const createdAt = new Date('2026-03-01T00:00:00.000Z');
    vi.mocked(TaxEstimate.create).mockResolvedValue({
      id: 'snap-1',
      profile_id: 'profile-1',
      regimen: '626',
      ejercicio: 2026,
      mes: 3,
      tipo_persona: 'FISICA',
      period_id: null,
      payload: sampleResult(),
      computed_at: createdAt,
      created_at: createdAt,
      updated_at: createdAt,
    } as never);

    const record = await upsertTaxEstimateSnapshot('profile-1', '626', sampleResult());
    expect(TaxEstimate.create).toHaveBeenCalled();
    expect(record.id).toBe('snap-1');
    expect(record.payload.mes).toBe(3);
  });

  it('upsertTaxEstimateSnapshot actualiza fila existente', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    vi.mocked(TaxEstimate.findOne).mockResolvedValue({
      id: 'snap-1',
      profile_id: 'profile-1',
      regimen: '626',
      ejercicio: 2026,
      mes: 3,
      tipo_persona: 'FISICA',
      period_id: null,
      payload: sampleResult(),
      computed_at: new Date('2026-03-01T00:00:00.000Z'),
      created_at: new Date('2026-03-01T00:00:00.000Z'),
      updated_at: new Date('2026-03-01T00:00:00.000Z'),
      update,
    } as never);

    await upsertTaxEstimateSnapshot('profile-1', '626', sampleResult({ mes: 3 }));
    expect(update).toHaveBeenCalled();
    expect(TaxEstimate.create).not.toHaveBeenCalled();
  });

  it('listTaxEstimateHistory ordena por mes', async () => {
    const base = new Date('2026-01-01T00:00:00.000Z');
    vi.mocked(TaxEstimate.findAll).mockResolvedValue([
      {
        id: 'a',
        profile_id: 'p1',
        regimen: '626',
        ejercicio: 2026,
        mes: 1,
        tipo_persona: 'FISICA',
        period_id: null,
        payload: sampleResult({ mes: 1 }),
        computed_at: base,
        created_at: base,
        updated_at: base,
      },
      {
        id: 'b',
        profile_id: 'p1',
        regimen: '626',
        ejercicio: 2026,
        mes: 2,
        tipo_persona: 'FISICA',
        period_id: null,
        payload: sampleResult({ mes: 2 }),
        computed_at: base,
        created_at: base,
        updated_at: base,
      },
    ] as never);

    const list = await listTaxEstimateHistory('p1', 2026, '626');
    expect(list).toHaveLength(2);
    expect(list[0]?.mes).toBe(1);
    expect(list[1]?.mes).toBe(2);
  });
});
