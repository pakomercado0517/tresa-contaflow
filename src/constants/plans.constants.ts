/**
 * Constantes de planes y límites
 */

export type Plan = "FREE" | "BASIC" | "PRO" | "ENTERPRISE";

export interface PlanLimits {
  profiles: number | null; // null = ilimitado
  invoicesPerMonth: number | null; // null = ilimitado
  expensesPerMonth: number | null; // null = ilimitado
  exportPDF: boolean;
  exportExcel: boolean;
  reports: "basic" | "complete" | "advanced";
  support: "none" | "email" | "priority";
  apiAccess: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    profiles: 1,
    invoicesPerMonth: 50,
    expensesPerMonth: 50,
    exportPDF: false,
    exportExcel: false,
    reports: "basic",
    support: "none",
    apiAccess: false,
  },
  BASIC: {
    profiles: 3,
    invoicesPerMonth: 500,
    expensesPerMonth: 500,
    exportPDF: true,
    exportExcel: false,
    reports: "complete",
    support: "email",
    apiAccess: false,
  },
  PRO: {
    profiles: 10,
    invoicesPerMonth: null, // ilimitado
    expensesPerMonth: null, // ilimitado
    exportPDF: true,
    exportExcel: true,
    reports: "advanced",
    support: "priority",
    apiAccess: true,
  },
  ENTERPRISE: {
    profiles: null, // ilimitado
    invoicesPerMonth: null, // ilimitado
    expensesPerMonth: null, // ilimitado
    exportPDF: true,
    exportExcel: true,
    reports: "advanced",
    support: "priority",
    apiAccess: true,
  },
};

/**
 * Precios de los planes (en MXN)
 * Estos precios deben coincidir con los configurados en Stripe
 */
export const PLAN_PRICES: Record<Plan, number> = {
  FREE: 0,
  BASIC: 29,
  PRO: 79,
  ENTERPRISE: 0, // Custom pricing
};

