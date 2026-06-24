import { describe, it, expect } from 'vitest';
import { resolveCoeficienteUtilidad } from '../../lib/tax-estimate/resolve-coeficiente-utilidad.js';
import { EMPTY_FISCAL_SETTINGS_SNAPSHOT } from '../../types/profile-fiscal.types.js';

describe('resolveCoeficienteUtilidad', () => {
  it('usa coeficiente del ejercicio anterior en enero', () => {
    const result = resolveCoeficienteUtilidad(1, {
      ...EMPTY_FISCAL_SETTINGS_SNAPSHOT,
      coeficiente_utilidad: 0.5,
      coeficiente_utilidad_ejercicio_anterior: 0.3,
    });
    expect(result.coeficiente).toBe(0.3);
  });

  it('exige coeficiente en marzo si falta', () => {
    const result = resolveCoeficienteUtilidad(3, {
      ...EMPTY_FISCAL_SETTINGS_SNAPSHOT,
      coeficiente_utilidad: null,
    });
    expect(result.coeficiente).toBeNull();
    expect(result.alerts.some((a) => a.code === 'E_COEFICIENTE_UTILIDAD_FALTANTE')).toBe(true);
  });
});
