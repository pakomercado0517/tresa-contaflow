import { Subscription } from "../database/models/index.js";
import type { Plan } from "../constants/plans.constants.js";
import { Op } from "sequelize";

/**
 * Servicio para gestionar suscripciones de usuarios
 */
export class SubscriptionService {
  /**
   * Obtiene la suscripción activa de un usuario
   * Incluye suscripciones con status ACTIVE o TRIALING
   */
  async getActiveSubscription(userId: string): Promise<Subscription | null> {
    const subscription = await Subscription.findOne({
      where: {
        user_id: userId,
        status: {
          [Op.in]: ["ACTIVE", "TRIALING"],
        },
      },
      order: [["created_at", "DESC"]], // Obtener la más reciente si hay múltiples
    });

    return subscription;
  }

  /**
   * Obtiene la suscripción de un usuario (activa o no)
   */
  async getUserSubscription(userId: string): Promise<Subscription | null> {
    const subscription = await Subscription.findOne({
      where: {
        user_id: userId,
      },
      order: [["created_at", "DESC"]],
    });

    return subscription;
  }

  /**
   * Obtiene el plan actual de un usuario
   * Si no tiene suscripción, retorna "FREE"
   */
  async getUserPlan(userId: string): Promise<Plan> {
    const subscription = await this.getActiveSubscription(userId);
    return (subscription?.plan as Plan) || "FREE";
  }

  /**
   * Verifica si un usuario tiene una suscripción activa
   * Incluye suscripciones con status ACTIVE o TRIALING
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    const subscription = await this.getActiveSubscription(userId);
    return subscription !== null && (subscription.status === "ACTIVE" || subscription.status === "TRIALING");
  }

  /**
   * Asigna una suscripción manualmente a un usuario (para uso administrativo)
   * Crea una nueva suscripción o actualiza la existente
   * @param userId ID del usuario
   * @param plan Plan a asignar (FREE, BASIC, PRO, ENTERPRISE)
   * @param planPrice Precio del plan (usualmente 0 para asignaciones manuales)
   * @param periodDays Días de validez de la suscripción (por defecto 36500, aproximadamente 100 años)
   */
  async assignSubscription(
    userId: string,
    plan: Plan,
    planPrice: number = 0,
    periodDays: number = 36500
  ): Promise<Subscription> {
    // Buscar suscripción activa existente
    const existingSubscription = await this.getActiveSubscription(userId);

    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + periodDays);

    if (existingSubscription) {
      // Actualizar suscripción existente
      await existingSubscription.update({
        plan,
        plan_price: planPrice,
        status: "ACTIVE",
        current_period_start: now,
        current_period_end: periodEnd,
        cancel_at_period_end: false,
        stripe_subscription_id: null, // No vinculada a Stripe
        stripe_customer_id: null, // No vinculada a Stripe
      });

      return existingSubscription;
    } else {
      // Crear nueva suscripción
      const subscription = await Subscription.create({
        user_id: userId,
        plan,
        plan_price: planPrice,
        status: "ACTIVE",
        current_period_start: now,
        current_period_end: periodEnd,
        cancel_at_period_end: false,
        stripe_subscription_id: null,
        stripe_customer_id: null,
      });

      return subscription;
    }
  }
}

