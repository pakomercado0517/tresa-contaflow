import { describe, it, expect } from 'vitest';
import { applyPfProgressiveTariff } from '../../lib/tax-estimate/pf-progressive-tariff.js';

describe('applyPfProgressiveTariff', () => {
  it('calcula ISR en tramo 1.92% para base baja', () => {
    const result = applyPfProgressiveTariff(500, 2026, 1);
    expect(result).not.toBeNull();
    expect(result!.isrCausado).toBeCloseTo(9.6, 2);
  });

  it('retorna null si no hay tarifa para el ejercicio', () => {
    expect(applyPfProgressiveTariff(1000, 2020, 1)).toBeNull();
  });
});
