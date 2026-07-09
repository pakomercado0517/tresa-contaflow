import { describe, it, expect } from "vitest";
import {
  compareMonthYear,
  enumerateMonthYears,
  MAX_METRICS_RANGE_MONTHS,
} from "../lib/metrics-range";

describe("metrics-range", () => {
  it("enumerateMonthYears incluye meses en un mismo año", () => {
    const items = enumerateMonthYears(1, 2026, 3, 2026);
    expect(items).toEqual([
      { mes: 1, año: 2026 },
      { mes: 2, año: 2026 },
      { mes: 3, año: 2026 },
    ]);
  });

  it("enumerateMonthYears cruza años", () => {
    const items = enumerateMonthYears(11, 2025, 2, 2026);
    expect(items).toEqual([
      { mes: 11, año: 2025 },
      { mes: 12, año: 2025 },
      { mes: 1, año: 2026 },
      { mes: 2, año: 2026 },
    ]);
  });

  it("compareMonthYear ordena cronológicamente", () => {
    expect(compareMonthYear({ mes: 1, año: 2026 }, { mes: 2, año: 2026 })).toBeLessThan(0);
    expect(compareMonthYear({ mes: 12, año: 2025 }, { mes: 1, año: 2026 })).toBeLessThan(0);
  });

  it("MAX_METRICS_RANGE_MONTHS es 24", () => {
    expect(MAX_METRICS_RANGE_MONTHS).toBe(24);
  });
});
