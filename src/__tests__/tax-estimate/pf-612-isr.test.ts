import { describe, it, expect } from 'vitest';
import { calculatePf612Isr } from '../../lib/tax-estimate/pf-612-isr.js';
import { createEmptyMetrics } from './fixtures.js';
import { EMPTY_FISCAL_SETTINGS_SNAPSHOT } from '../../types/profile-fiscal.types.js';

describe('calculatePf612Isr', () => {
  it('aplica tarifa progresiva y resta retenciones y provisionales YTD', () => {
    const ytd = createEmptyMetrics({
      flujo: {
        ingresos_cobrados: 100_000,
        egresos_pagados: 20_000,
        flujo_neto: 80_000,
        ingresos_cobrados_sin_conciliar: 0,
        egresos_pagados_sin_conciliar: 0,
      },
      impuestos: {
        iva_trasladado: { cobrado: 0, devengado: 0 },
        iva_acreditable: { pagado: 0, devengado: 0 },
        retenciones_iva: { cobrado: 0, devengado: 0 },
        retenciones_isr: { cobrado: 5_000, devengado: 0 },
      },
    });
    const { isr, ratesMissing } = calculatePf612Isr({
      ytdMetrics: ytd,
      ejercicio: 2026,
      mes: 6,
      fiscalSettings: {
        ...EMPTY_FISCAL_SETTINGS_SNAPSHOT,
        isr_pagos_provisionales_acum: 2_000,
      },
    });
    expect(ratesMissing).toBe(false);
    expect(isr!.base_gravable).toBe(80_000);
    expect(isr!.isr_causado).toBeGreaterThan(0);
    expect(isr!.menos_retenciones).toBe(5_000);
    expect(isr!.menos_pagos_provisionales_anteriores).toBe(2_000);
    expect(isr!.isr_neto_a_pagar).toBeCloseTo(
      Math.max(0, isr!.isr_causado - 5_000 - 2_000),
      2
    );
  });
});
