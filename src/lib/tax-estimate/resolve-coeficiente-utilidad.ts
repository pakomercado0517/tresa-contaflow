import type { ProfileFiscalSettingsSnapshot } from '../../types/profile-fiscal.types.js';
import type { TaxEstimateAlert } from '../../types/tax-estimate.types.js';
import { TAX_ALERT_CODES } from '../../constants/tax-estimate.constants.js';

export interface ResolveCoeficienteResult {
  coeficiente: number | null;
  alerts: TaxEstimateAlert[];
}

export function resolveCoeficienteUtilidad(
  mes: number,
  fiscalSettings: ProfileFiscalSettingsSnapshot
): ResolveCoeficienteResult {
  const alerts: TaxEstimateAlert[] = [];

  if (mes <= 2) {
    const prev = fiscalSettings.coeficiente_utilidad_ejercicio_anterior;
    if (prev != null) {
      return { coeficiente: prev, alerts };
    }
    const current = fiscalSettings.coeficiente_utilidad;
    if (current != null) {
      alerts.push({
        code: TAX_ALERT_CODES.COEFICIENTE_ENE_FEB_DEFAULT,
        severity: 'warning',
        message:
          'Enero y febrero usan el coeficiente del ejercicio actual por no estar configurado el del ejercicio anterior.',
      });
      return { coeficiente: current, alerts };
    }
    alerts.push({
      code: TAX_ALERT_CODES.COEFICIENTE_UTILIDAD_FALTANTE,
      severity: 'warning',
      message: 'Configure el coeficiente de utilidad para estimar ISR en régimen 601.',
    });
    return { coeficiente: null, alerts };
  }

  const current = fiscalSettings.coeficiente_utilidad;
  if (current == null) {
    alerts.push({
      code: TAX_ALERT_CODES.COEFICIENTE_UTILIDAD_FALTANTE,
      severity: 'warning',
      message: 'Configure el coeficiente de utilidad para estimar ISR en régimen 601.',
    });
    return { coeficiente: null, alerts };
  }

  return { coeficiente: current, alerts };
}
