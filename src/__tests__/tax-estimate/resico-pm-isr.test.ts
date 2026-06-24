import { describe, it, expect } from 'vitest';
import { calculateResicoPmIsr } from '../../lib/tax-estimate/resico-pm-isr.js';
import { buildTaxEstimate } from '../../lib/tax-estimate/index.js';
import { createEmptyMetrics } from './fixtures.js';

function createYtdMetrics(ingresos: number, egresos: number, retencionesIsr: number = 0) {
  return createEmptyMetrics({
    flujo: {
      ingresos_cobrados: ingresos,
      egresos_pagados: egresos,
      flujo_neto: ingresos - egresos,
      ingresos_cobrados_sin_conciliar: 0,
      egresos_pagados_sin_conciliar: 0,
    },
    impuestos: {
      iva_trasladado: { cobrado: 0, devengado: 0 },
      iva_acreditable: { pagado: 0, devengado: 0 },
      retenciones_iva: { cobrado: 0, devengado: 0 },
      retenciones_isr: { cobrado: retencionesIsr, devengado: retencionesIsr },
    },
  });
}

describe('calculateResicoPmIsr', () => {
  it('aplica 30% sobre utilidad acumulada positiva', () => {
    const ytd = createYtdMetrics(1_000_000, 400_000);
    const { isr } = calculateResicoPmIsr({ ytdMetrics: ytd, ejercicio: 2026 });

    expect(isr).not.toBeNull();
    expect(isr!.base_gravable).toBe(600_000);
    expect(isr!.isr_causado).toBe(180_000);
    expect(isr!.tasa_o_tarifa).toBe('30%');
  });

  it('utilidad negativa deja ISR causado en cero', () => {
    const ytd = createYtdMetrics(100_000, 200_000);
    const { isr } = calculateResicoPmIsr({ ytdMetrics: ytd, ejercicio: 2026 });

    expect(isr!.base_gravable).toBe(0);
    expect(isr!.isr_causado).toBe(0);
  });

  it('resta retenciones ISR acumuladas del neto', () => {
    const ytd = createYtdMetrics(500_000, 100_000, 50_000);
    const { isr } = calculateResicoPmIsr({ ytdMetrics: ytd, ejercicio: 2026 });

    expect(isr!.isr_causado).toBe(120_000);
    expect(isr!.menos_retenciones).toBe(50_000);
    expect(isr!.isr_neto_a_pagar).toBe(70_000);
  });
});

describe('buildTaxEstimate RESICO PM', () => {
  it('soporta 626 + MORAL con métricas YTD y alerta depreciación', () => {
    const monthly = createEmptyMetrics();
    const ytd = createYtdMetrics(300_000, 50_000);

    const result = buildTaxEstimate(monthly, {
      regimen: '626',
      tipoPersona: 'MORAL',
      ejercicio: 2026,
      mes: 3,
    }, { ytdMetrics: ytd });

    expect(result.supported).toBe(true);
    expect(result.isr?.isr_causado).toBe(75_000);
    expect(result.alerts.some((a) => a.code === 'W_RESICO_PM_SIN_DEPRECIACION')).toBe(true);
  });

  it('sin YTD no soporta ISR para 626 + MORAL', () => {
    const monthly = createEmptyMetrics();
    const result = buildTaxEstimate(monthly, {
      regimen: '626',
      tipoPersona: 'MORAL',
      ejercicio: 2026,
      mes: 3,
    });

    expect(result.supported).toBe(false);
    expect(result.alerts.some((a) => a.code === 'W_SIN_METRICAS_ACUMULADAS')).toBe(true);
  });
});
