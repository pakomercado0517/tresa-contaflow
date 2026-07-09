import { query } from "express-validator";
import {
  compareMonthYear,
  enumerateMonthYears,
  MAX_METRICS_RANGE_MONTHS,
} from "../lib/metrics-range.js";

function isQueryPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function parseQueryInt(value: unknown): number | undefined {
  if (typeof value !== "string" || value === "") {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function assertMonth(name: string, value: number | undefined): void {
  if (value === undefined) {
    throw new Error(`${name} es requerido`);
  }
  if (value < 1 || value > 12) {
    throw new Error(`${name} debe ser entre 1 y 12`);
  }
}

function assertYear(name: string, value: number | undefined): void {
  if (value === undefined) {
    throw new Error(`${name} es requerido`);
  }
  if (value < 2000 || value > 2100) {
    throw new Error(`${name} debe ser un año válido`);
  }
}

export const metricsQueryValidation = [
  query("profile_id").optional().isUUID().withMessage("profile_id debe ser un UUID válido"),
  query("regimen_fiscal")
    .optional()
    .isString()
    .matches(/^\d{3}$/)
    .withMessage("regimen_fiscal debe ser una clave SAT de 3 dígitos (ej: 601, 606, 626)"),
  query().custom((_, { req }) => {
    const q = req.query ?? {};

    const rangeKeys = ["mes_desde", "año_desde", "mes_hasta", "año_hasta"] as const;
    const hasAnyRange = rangeKeys.some((key) => isQueryPresent(q[key]));
    const hasMes = isQueryPresent(q.mes);
    const hasAño = isQueryPresent(q.año);

    if (hasAnyRange) {
      if (hasMes || hasAño) {
        throw new Error(
          "No combines mes/año con mes_desde, año_desde, mes_hasta y año_hasta en la misma petición"
        );
      }

      for (const key of rangeKeys) {
        if (!isQueryPresent(q[key])) {
          throw new Error(
            "mes_desde, año_desde, mes_hasta y año_hasta son requeridos para consultar un rango"
          );
        }
      }

      const mesDesde = parseQueryInt(q.mes_desde);
      const añoDesde = parseQueryInt(q.año_desde);
      const mesHasta = parseQueryInt(q.mes_hasta);
      const añoHasta = parseQueryInt(q.año_hasta);

      assertMonth("mes_desde", mesDesde);
      assertYear("año_desde", añoDesde);
      assertMonth("mes_hasta", mesHasta);
      assertYear("año_hasta", añoHasta);

      if (
        compareMonthYear(
          { mes: mesDesde!, año: añoDesde! },
          { mes: mesHasta!, año: añoHasta! }
        ) > 0
      ) {
        throw new Error("El inicio del rango no puede ser posterior al fin del rango");
      }

      const monthCount = enumerateMonthYears(
        mesDesde!,
        añoDesde!,
        mesHasta!,
        añoHasta!
      ).length;
      if (monthCount > MAX_METRICS_RANGE_MONTHS) {
        throw new Error(`El rango no puede exceder ${MAX_METRICS_RANGE_MONTHS} meses`);
      }

      return true;
    }

    if (!hasMes) {
      throw new Error("mes es requerido");
    }
    if (!hasAño) {
      throw new Error("año es requerido");
    }

    const mes = parseQueryInt(q.mes);
    const año = parseQueryInt(q.año);
    assertMonth("mes", mes);
    assertYear("año", año);

    return true;
  }),
];
