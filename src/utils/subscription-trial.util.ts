import { PLAN_TRIAL_DAYS } from "../constants/plans.constants.js";

/**
 * Resuelve los días de trial para una sesión de checkout.
 * Precedencia: si el usuario no es elegible, no hay trial; si hay cupón con trialDays definido, se usa; si no, el trial por defecto del plan.
 * Solo se considera "trial aplicable" cuando el resultado es > 0 (0 = sin trial).
 *
 * @param isEligibleForTrial - Si el usuario es elegible para periodo de prueba
 * @param plan - Plan (BASIC o PRO)
 * @param promotionTrialDays - Días de trial del cupón aplicado (null/undefined = usar default del plan)
 * @returns Número de días de trial, o undefined si no aplica trial
 */
export function resolveTrialDaysForCheckout(
  isEligibleForTrial: boolean,
  plan: "BASIC" | "PRO",
  promotionTrialDays: number | null | undefined
): number | undefined {
  if (!isEligibleForTrial) {
    return undefined;
  }
  const days =
    promotionTrialDays !== null && promotionTrialDays !== undefined
      ? promotionTrialDays
      : PLAN_TRIAL_DAYS[plan];
  return days > 0 ? days : undefined;
}
