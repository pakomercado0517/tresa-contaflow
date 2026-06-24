import { describe, it, expect } from 'vitest';
import { calculateIvaMonthly } from '../../lib/tax-estimate/iva-monthly.js';
import { createEmptyMetrics } from './fixtures.js';

describe('calculateIvaMonthly', () => {
  it('calcula IVA neto a pagar como causado menos acreditable y retenido', () => {
    const metrics = createEmptyMetrics({
      impuestos: {
        iva_trasladado: { cobrado: 9600, devengado: 9600 },
        iva_acreditable: { pagado: 3200, devengado: 3200 },
        retenciones_iva: { cobrado: 400, devengado: 400 },
        retenciones_isr: { cobrado: 0, devengado: 0 },
      },
    });

    const result = calculateIvaMonthly(metrics);

    expect(result.iva_trasladado_cobrado).toBe(9600);
    expect(result.iva_acreditable_pagado).toBe(3200);
    expect(result.iva_retenido).toBe(400);
    expect(result.iva_neto_a_pagar).toBe(6000);
    expect(result.saldo_a_favor).toBe(0);
  });

  it('genera saldo a favor cuando acreditable supera causado', () => {
    const metrics = createEmptyMetrics({
      impuestos: {
        iva_trasladado: { cobrado: 1000, devengado: 1000 },
        iva_acreditable: { pagado: 1500, devengado: 1500 },
        retenciones_iva: { cobrado: 0, devengado: 0 },
        retenciones_isr: { cobrado: 0, devengado: 0 },
      },
    });

    const result = calculateIvaMonthly(metrics);

    expect(result.iva_neto_a_pagar).toBe(0);
    expect(result.saldo_a_favor).toBe(500);
  });
});
