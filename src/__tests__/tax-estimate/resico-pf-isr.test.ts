import { describe, it, expect } from 'vitest';
import { getResicoPfRate } from '../../constants/fiscal-rates/resico-pf-rates.2026.js';
import { calculateResicoPfIsr } from '../../lib/tax-estimate/resico-pf-isr.js';
import { buildTaxEstimate } from '../../lib/tax-estimate/index.js';
import { createEmptyMetrics } from './fixtures.js';
import { EMPTY_FISCAL_SETTINGS_SNAPSHOT } from '../../types/profile-fiscal.types.js';

describe('getResicoPfRate', () => {
  it('aplica 1.50% hasta 83,333.33', () => {
    expect(getResicoPfRate(60_000)).toEqual({ rate: 0.015, label: '1.50%' });
  });
});

describe('calculateResicoPfIsr', () => {
  it('calcula ISR causado y neto con retenciones', () => {
    const metrics = createEmptyMetrics({
      flujo: {
        ingresos_cobrados: 60_000,
        egresos_pagados: 0,
        flujo_neto: 60_000,
        ingresos_cobrados_sin_conciliar: 0,
        egresos_pagados_sin_conciliar: 0,
      },
      impuestos: {
        iva_trasladado: { cobrado: 0, devengado: 0 },
        iva_acreditable: { pagado: 0, devengado: 0 },
        retenciones_iva: { cobrado: 0, devengado: 0 },
        retenciones_isr: { cobrado: 750, devengado: 750 },
      },
    });

    const { isr } = calculateResicoPfIsr(metrics, 2026);

    expect(isr).not.toBeNull();
    expect(isr!.tasa_o_tarifa).toBe('1.50%');
    expect(isr!.isr_causado).toBe(900);
    expect(isr!.isr_neto_a_pagar).toBe(150);
  });
});

describe('buildTaxEstimate', () => {
  it('marca ISR no soportado para régimen 605 pero calcula IVA', () => {
    const metrics = createEmptyMetrics({
      impuestos: {
        iva_trasladado: { cobrado: 1600, devengado: 1600 },
        iva_acreditable: { pagado: 0, devengado: 0 },
        retenciones_iva: { cobrado: 0, devengado: 0 },
        retenciones_isr: { cobrado: 0, devengado: 0 },
      },
    });

    const result = buildTaxEstimate(metrics, {
      regimen: '605',
      tipoPersona: 'FISICA',
      ejercicio: 2026,
      mes: 6,
    });

    expect(result.supported).toBe(false);
    expect(result.isr).toBeNull();
    expect(result.iva.iva_neto_a_pagar).toBe(1600);
  });

  it('soporta 612 con YTD y settings', () => {
    const monthly = createEmptyMetrics();
    const ytd = createEmptyMetrics({
      flujo: {
        ingresos_cobrados: 100_000,
        egresos_pagados: 20_000,
        flujo_neto: 80_000,
        ingresos_cobrados_sin_conciliar: 0,
        egresos_pagados_sin_conciliar: 0,
      },
    });

    const result = buildTaxEstimate(
      monthly,
      { regimen: '612', tipoPersona: 'FISICA', ejercicio: 2026, mes: 1 },
      { ytdMetrics: ytd, fiscalSettings: EMPTY_FISCAL_SETTINGS_SNAPSHOT }
    );

    expect(result.supported).toBe(true);
    expect(result.isr).not.toBeNull();
    expect(result.isr!.base_gravable).toBe(80_000);
  });

  it('alerta ejercicio sin tarifas RESICO', () => {
    const metrics = createEmptyMetrics({
      flujo: {
        ingresos_cobrados: 10_000,
        egresos_pagados: 0,
        flujo_neto: 10_000,
        ingresos_cobrados_sin_conciliar: 0,
        egresos_pagados_sin_conciliar: 0,
      },
    });

    const result = buildTaxEstimate(metrics, {
      regimen: '626',
      tipoPersona: 'FISICA',
      ejercicio: 2020,
      mes: 1,
    });

    expect(result.supported).toBe(false);
    expect(result.alerts.some((a) => a.code === 'E_EJERCICIO_SIN_TARIFAS')).toBe(true);
  });
});
