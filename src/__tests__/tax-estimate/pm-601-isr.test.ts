import { describe, it, expect } from 'vitest';
import { calculatePm601Isr } from '../../lib/tax-estimate/pm-601-isr.js';
import { createEmptyMetrics } from './fixtures.js';
import { EMPTY_FISCAL_SETTINGS_SNAPSHOT } from '../../types/profile-fiscal.types.js';

describe('calculatePm601Isr', () => {
  it('aplica coeficiente y tasa 30% sobre ingresos devengados', () => {
    const ytd = createEmptyMetrics({
      devengado: {
        ingresos_devengados: 1_000_000,
        egresos_devengados: 0,
        resultado_devengado: 1_000_000,
      },
    });
    const { isr } = calculatePm601Isr({
      ytdMetrics: ytd,
      ejercicio: 2026,
      mes: 6,
      fiscalSettings: {
        ...EMPTY_FISCAL_SETTINGS_SNAPSHOT,
        coeficiente_utilidad: 0.1,
      },
    });
    expect(isr!.base_gravable).toBe(100_000);
    expect(isr!.isr_causado).toBe(30_000);
  });
});
