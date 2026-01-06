import { SubscriptionService } from "./subscription.service.js";
import { PLAN_LIMITS, type Plan, type PlanLimits } from "../constants/plans.constants.js";
import { Profile, Invoice, Expense } from "../database/models/index.js";
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
    const expenseCount = await Expense.count({
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
}

