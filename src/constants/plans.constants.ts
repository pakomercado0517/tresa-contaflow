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
  // Catálogo SAT - Búsquedas
  satBasicSearchesPerMonth: number | null; // Búsquedas básicas (sin IA) - null = ilimitado
  satAISearchesPerMonth: number | null; // Búsquedas con IA - null = ilimitado
  satMaxResults: number | null; // Máximo de resultados por búsqueda - null = ilimitado
  // Catálogo SAT - Features
  satHasAIExplanations: boolean; // Explicación de sugerencia
  satHasHistory: boolean; // Historial de búsquedas
  satHasFavorites: boolean; // Favoritos
  satHasAlerts: boolean; // Alertas fiscales
  satHasLearning: boolean; // Aprendizaje por RFC
  satHasAdvancedRanking: boolean; // Ranking avanzado
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    profiles: 1,
    invoicesPerMonth: 25,
    expensesPerMonth: 25,
    exportPDF: false,
    exportExcel: false,
    reports: "basic",
    support: "none",
    apiAccess: false,
    satBasicSearchesPerMonth: null, // Ilimitadas (búsqueda básica)
    satAISearchesPerMonth: 5, // 5 búsquedas IA/mes
    satMaxResults: 2, // Hasta 2 resultados
    satHasAIExplanations: false,
    satHasHistory: false,
    satHasFavorites: false,
    satHasAlerts: false,
    satHasLearning: false,
    satHasAdvancedRanking: false,
  },
  BASIC: {
    profiles: 3,
    invoicesPerMonth: 300,
    expensesPerMonth: 300,
    exportPDF: true,
    exportExcel: false,
    reports: "complete",
    support: "email",
    apiAccess: false,
    satBasicSearchesPerMonth: null, // Ilimitadas
    satAISearchesPerMonth: 100, // 100 búsquedas IA/mes
    satMaxResults: 5, // Top 5 resultados
    satHasAIExplanations: true,
    satHasHistory: true, // Historial básico
    satHasFavorites: false,
    satHasAlerts: false,
    satHasLearning: false,
    satHasAdvancedRanking: false,
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
    satBasicSearchesPerMonth: null, // Ilimitadas
    satAISearchesPerMonth: null, // IA ilimitada
    satMaxResults: null, // Sin límite
    satHasAIExplanations: true,
    satHasHistory: true,
    satHasFavorites: true,
    satHasAlerts: true,
    satHasLearning: true,
    satHasAdvancedRanking: true,
  },
  ENTERPRISE: {
    profiles: null, // ilimitado
    invoicesPerMonth: 5000, // 5000 archivos XML al mes
    expensesPerMonth: null, // ilimitado
    exportPDF: true,
    exportExcel: true,
    reports: "advanced",
    support: "priority",
    apiAccess: true,
    satBasicSearchesPerMonth: null, // Ilimitadas
    satAISearchesPerMonth: null, // IA ilimitada
    satMaxResults: null, // Sin límite
    satHasAIExplanations: true,
    satHasHistory: true,
    satHasFavorites: true,
    satHasAlerts: true,
    satHasLearning: true,
    satHasAdvancedRanking: true,
  },
};

/**
 * Precios de los planes (en MXN)
 * Estos precios deben coincidir con los configurados en Stripe
 */
export const PLAN_PRICES: Record<Plan, number> = {
  FREE: 0,
  BASIC: 300,
  PRO: 800,
  ENTERPRISE: 1200,
};

/**
 * Días de periodo de prueba por plan
 * Solo aplica a planes de pago (BASIC, PRO)
 */
export const PLAN_TRIAL_DAYS: Record<"BASIC" | "PRO", number> = {
  BASIC: 30,
  PRO: 30,
};

