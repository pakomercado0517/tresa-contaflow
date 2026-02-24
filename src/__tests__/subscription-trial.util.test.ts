import { describe, it, expect } from "vitest";
import { resolveTrialDaysForCheckout } from "../utils/subscription-trial.util";

describe("resolveTrialDaysForCheckout", () => {
  it("retorna undefined cuando el usuario no es elegible para trial", () => {
    expect(resolveTrialDaysForCheckout(false, "BASIC", null)).toBeUndefined();
    expect(resolveTrialDaysForCheckout(false, "PRO", 60)).toBeUndefined();
  });

  it("retorna trialDays del cupón cuando el usuario es elegible y el cupón tiene trialDays", () => {
    expect(resolveTrialDaysForCheckout(true, "BASIC", 60)).toBe(60);
    expect(resolveTrialDaysForCheckout(true, "PRO", 90)).toBe(90);
  });

  it("retorna trial por defecto del plan cuando el usuario es elegible y el cupón no tiene trialDays", () => {
    expect(resolveTrialDaysForCheckout(true, "BASIC", null)).toBe(30);
    expect(resolveTrialDaysForCheckout(true, "BASIC", undefined)).toBe(30);
    expect(resolveTrialDaysForCheckout(true, "PRO", null)).toBe(30);
  });

  it("retorna undefined cuando trialDays del cupón es 0 (sin trial)", () => {
    expect(resolveTrialDaysForCheckout(true, "BASIC", 0)).toBeUndefined();
    expect(resolveTrialDaysForCheckout(true, "PRO", 0)).toBeUndefined();
  });
});
