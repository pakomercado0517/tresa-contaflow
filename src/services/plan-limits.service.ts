import { SubscriptionService } from "./subscription.service.js";
import { PLAN_LIMITS, type Plan, type PlanLimits } from "../constants/plans.constants.js";
import { Profile, Invoice, AccruedExpense, PublicReportToken } from "../database/models/index.js";
import { Op as OpLimits } from "sequelize";
import SatSearchLog from "../database/models/SatSearchLog.model.js";
import { Op } from "sequelize";

/**
 * Servicio para validar límites de planes
 */
export class PlanLimitsService {
  private subscriptionService: SubscriptionService;

  constructor() {
    this.subscriptionService = new SubscriptionService();
  }

  /**
   * Obtiene los límites del plan actual del usuario
   */
  async getUserLimits(userId: string): Promise<PlanLimits> {
    const plan = await this.subscriptionService.getUserPlan(userId);
    return PLAN_LIMITS[plan];
  }

  /**
   * Obtiene el plan actual del usuario
   */
  async getUserPlan(userId: string): Promise<Plan> {
    return await this.subscriptionService.getUserPlan(userId);
  }

  /**
   * Valida si el usuario puede crear un nuevo perfil
   */
  async canCreateProfile(userId: string): Promise<{
    allowed: boolean;
    reason?: string;
    currentCount: number;
    limit: number | null;
  }> {
    const limits = await this.getUserLimits(userId);

    // Si no hay límite (ilimitado)
    if (limits.profiles === null) {
      return {
        allowed: true,
        currentCount: 0,
        limit: null,
      };
    }

    // Contar perfiles existentes
    const profileCount = await Profile.count({
      where: { user_id: userId },
    });

    if (profileCount >= limits.profiles) {
      return {
        allowed: false,
        reason: `Has alcanzado el límite de ${limits.profiles} perfil(es) para tu plan. Upgrade tu plan para crear más perfiles.`,
        currentCount: profileCount,
        limit: limits.profiles,
      };
    }

    return {
      allowed: true,
      currentCount: profileCount,
      limit: limits.profiles,
    };
  }

  /**
   * Valida si el usuario puede crear una nueva factura este mes
   */
  async canCreateInvoice(
    userId: string,
    profileId: string
  ): Promise<{
    allowed: boolean;
    reason?: string;
    currentCount: number;
    limit: number | null;
  }> {
    const limits = await this.getUserLimits(userId);

    // Si no hay límite (ilimitado)
    if (limits.invoicesPerMonth === null) {
      return {
        allowed: true,
        currentCount: 0,
        limit: null,
      };
    }

    // Obtener mes y año actual
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();

    // Contar facturas del mes actual para este perfil
    const invoiceCount = await Invoice.count({
      where: {
        profile_id: profileId,
        mes: currentMonth,
        año: currentYear,
      },
    });

    if (invoiceCount >= limits.invoicesPerMonth) {
      return {
        allowed: false,
        reason: `Has alcanzado el límite de ${limits.invoicesPerMonth} facturas por mes para tu plan. Upgrade tu plan para subir más facturas.`,
        currentCount: invoiceCount,
        limit: limits.invoicesPerMonth,
      };
    }

    return {
      allowed: true,
      currentCount: invoiceCount,
      limit: limits.invoicesPerMonth,
    };
  }

  /**
   * Valida si el usuario puede crear un nuevo gasto este mes
   */
  async canCreateExpense(
    userId: string,
    profileId: string
  ): Promise<{
    allowed: boolean;
    reason?: string;
    currentCount: number;
    limit: number | null;
  }> {
    const limits = await this.getUserLimits(userId);

    // Si no hay límite (ilimitado)
    if (limits.expensesPerMonth === null) {
      return {
        allowed: true,
        currentCount: 0,
        limit: null,
      };
    }

    // Obtener mes y año actual
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();

    // Contar gastos del mes actual para este perfil
    const expenseCount = await AccruedExpense.count({
      where: {
        profile_id: profileId,
        mes: currentMonth,
        año: currentYear,
      },
    });

    if (expenseCount >= limits.expensesPerMonth) {
      return {
        allowed: false,
        reason: `Has alcanzado el límite de ${limits.expensesPerMonth} gastos por mes para tu plan. Upgrade tu plan para agregar más gastos.`,
        currentCount: expenseCount,
        limit: limits.expensesPerMonth,
      };
    }

    return {
      allowed: true,
      currentCount: expenseCount,
      limit: limits.expensesPerMonth,
    };
  }

  /**
   * Valida si el usuario puede exportar PDF
   */
  async canExportPDF(userId: string): Promise<boolean> {
    const limits = await this.getUserLimits(userId);
    return limits.exportPDF;
  }

  /**
   * Valida si el usuario puede exportar Excel
   */
  async canExportExcel(userId: string): Promise<boolean> {
    const limits = await this.getUserLimits(userId);
    return limits.exportExcel;
  }

  /**
   * Valida si el usuario tiene acceso a la API
   */
  async hasAPIAccess(userId: string): Promise<boolean> {
    const limits = await this.getUserLimits(userId);
    return limits.apiAccess;
  }

  /**
   * Valida si el usuario puede realizar una búsqueda con IA
   */
  async canUseAISearch(userId: string): Promise<{
    allowed: boolean;
    reason?: string;
    currentCount: number;
    limit: number | null;
    remaining: number | null;
  }> {
    const limits = await this.getUserLimits(userId);

    // Si no hay límite (ilimitado)
    if (limits.satAISearchesPerMonth === null) {
      return {
        allowed: true,
        currentCount: 0,
        limit: null,
        remaining: null,
      };
    }

    // Obtener mes y año actual
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();

    // Contar búsquedas IA del mes actual
    const aiSearchCount = await SatSearchLog.count({
      where: {
        user_id: userId,
        search_type: {
          [Op.in]: ["ai_similarity", "ai_search"],
        },
        mes: currentMonth,
        año: currentYear,
      },
    });

    if (aiSearchCount >= limits.satAISearchesPerMonth) {
      return {
        allowed: false,
        reason: `Has alcanzado el límite de ${limits.satAISearchesPerMonth} búsquedas con IA este mes. Upgrade tu plan para más búsquedas.`,
        currentCount: aiSearchCount,
        limit: limits.satAISearchesPerMonth,
        remaining: 0,
      };
    }

    return {
      allowed: true,
      currentCount: aiSearchCount,
      limit: limits.satAISearchesPerMonth,
      remaining: limits.satAISearchesPerMonth - aiSearchCount,
    };
  }

  /**
   * Obtiene información del plan SAT del usuario
   */
  async getSATPlanInfo(userId: string): Promise<{
    maxResults: number | null;
    aiSearchesLimit: number | null;
    aiSearchesRemaining: number | null;
    aiSearchesUsed: number;
    hasAIExplanations: boolean;
    hasHistory: boolean;
    hasFavorites: boolean;
    hasAlerts: boolean;
    hasLearning: boolean;
    hasAdvancedRanking: boolean;
  }> {
    const limits = await this.getUserLimits(userId);

    // Obtener mes y año actual
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Contar búsquedas IA del mes actual
    const aiSearchCount = await SatSearchLog.count({
      where: {
        user_id: userId,
        search_type: {
          [Op.in]: ["ai_similarity", "ai_search"],
        },
        mes: currentMonth,
        año: currentYear,
      },
    });

    const remaining =
      limits.satAISearchesPerMonth !== null
        ? Math.max(0, limits.satAISearchesPerMonth - aiSearchCount)
        : null;

    return {
      maxResults: limits.satMaxResults,
      aiSearchesLimit: limits.satAISearchesPerMonth,
      aiSearchesRemaining: remaining,
      aiSearchesUsed: aiSearchCount,
      hasAIExplanations: limits.satHasAIExplanations,
      hasHistory: limits.satHasHistory,
      hasFavorites: limits.satHasFavorites,
      hasAlerts: limits.satHasAlerts,
      hasLearning: limits.satHasLearning,
      hasAdvancedRanking: limits.satHasAdvancedRanking,
    };
  }

  /**
   * Valida si el usuario puede usar reportes públicos compartibles
   */
  async canUsePublicReports(userId: string): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    const limits = await this.getUserLimits(userId);
    if (!limits.publicReports) {
      return {
        allowed: false,
        reason: 'Los reportes públicos no están disponibles en tu plan. Actualiza a BASIC o superior.',
      };
    }
    return { allowed: true };
  }

  /**
   * Valida si el usuario puede generar un nuevo token de reporte público
   * (no supera el límite de tokens activos simultáneos de su plan)
   */
  async canCreatePublicReportToken(userId: string): Promise<{
    allowed: boolean;
    reason?: string;
    currentCount: number;
    limit: number | null;
  }> {
    const limits = await this.getUserLimits(userId);

    if (limits.publicReportTokensActive === null) {
      return { allowed: true, currentCount: 0, limit: null };
    }

    const activeCount = await PublicReportToken.count({
      where: {
        user_id: userId,
        is_active: true,
        expires_at: { [OpLimits.gt]: new Date() },
      },
    });

    if (activeCount >= limits.publicReportTokensActive) {
      return {
        allowed: false,
        reason: `Has alcanzado el límite de ${limits.publicReportTokensActive} reportes públicos activos para tu plan. Revoca uno existente para crear uno nuevo.`,
        currentCount: activeCount,
        limit: limits.publicReportTokensActive,
      };
    }

    return { allowed: true, currentCount: activeCount, limit: limits.publicReportTokensActive };
  }

  /**
   * Valida si el usuario puede usar la descarga masiva SAT (FIEL)
   */
  async canUseSatDownload(userId: string): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    const limits = await this.getUserLimits(userId);
    if (!limits.satDownload) {
      return {
        allowed: false,
        reason: 'La descarga masiva SAT no está disponible en tu plan. Actualiza a PRO o superior.',
      };
    }
    return { allowed: true };
  }

  /**
   * Obtiene el número de búsquedas IA restantes del mes
   */
  async getRemainingAISearches(userId: string): Promise<number | null> {
    const limits = await this.getUserLimits(userId);

    if (limits.satAISearchesPerMonth === null) {
      return null; // Ilimitado
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const aiSearchCount = await SatSearchLog.count({
      where: {
        user_id: userId,
        search_type: {
          [Op.in]: ["ai_similarity", "ai_search"],
        },
        mes: currentMonth,
        año: currentYear,
      },
    });

    return Math.max(0, limits.satAISearchesPerMonth - aiSearchCount);
  }
}

