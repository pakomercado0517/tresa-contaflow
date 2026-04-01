/**
 * Constantes de planes y límites
 */

export type Plan = 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE';

export interface PlanLimits {
  profiles: number | null; // null = ilimitado
  invoicesPerMonth: number | null; // null = ilimitado (ya no se usa como límite real)
  expensesPerMonth: number | null; // null = ilimitado (ya no se usa como límite real)
  exportPDF: boolean;
  exportExcel: boolean;
  reports: 'basic' | 'complete' | 'advanced';
  support: 'none' | 'email' | 'priority' | 'dedicated';
  apiAccess: boolean;
  // Features de reportes y descarga
  publicReports: boolean; // Reportes públicos compartibles (link por token)
  publicReportTokensActive: number | null; // Máx. tokens activos simultáneos - null = ilimitado
  satDownload: boolean; // Descarga masiva SAT (FIEL / e.firma)
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
    invoicesPerMonth: null, // ilimitado
    expensesPerMonth: null, // ilimitado
    exportPDF: false,
    exportExcel: false,
    reports: 'basic',
    support: 'none',
    apiAccess: false,
    publicReports: false,
    publicReportTokensActive: 0,
    satDownload: false,
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
    profiles: 5,
    invoicesPerMonth: null, // ilimitado
    expensesPerMonth: null, // ilimitado
    exportPDF: true,
    exportExcel: false,
    reports: 'complete',
    support: 'email',
    apiAccess: false,
    publicReports: true,
    publicReportTokensActive: 10,
    satDownload: false,
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
    profiles: 20,
    invoicesPerMonth: null, // ilimitado
    expensesPerMonth: null, // ilimitado
    exportPDF: true,
    exportExcel: true,
    reports: 'advanced',
    support: 'priority',
    apiAccess: true,
    publicReports: true,
    publicReportTokensActive: 50,
    satDownload: true,
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
    invoicesPerMonth: null, // ilimitado
    expensesPerMonth: null, // ilimitado
    exportPDF: true,
    exportExcel: true,
    reports: 'advanced',
    support: 'dedicated',
    apiAccess: true,
    publicReports: true,
    publicReportTokensActive: null, // ilimitado
    satDownload: true,
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
  ENTERPRISE: 1500,
};

/**
 * Precios anuales fijos de los planes (en MXN)
 * Usados cuando se solicita `billing=annual` desde el frontend.
 * Deben coincidir con los Prices anuales en Stripe (STRIPE_PRICE_ID_*_ANNUAL).
 */
export const PLAN_PRICES_ANNUAL: Record<Plan, number> = {
  FREE: 0,
  BASIC: 3000,
  PRO: 8000,
  ENTERPRISE: 15000,
};

/**
 * Días de periodo de prueba por plan
 * Solo aplica a planes de pago (BASIC, PRO)
 */
export const PLAN_TRIAL_DAYS: Record<'BASIC' | 'PRO', number> = {
  BASIC: 30,
  PRO: 30,
};
