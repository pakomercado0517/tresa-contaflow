import { Subscription } from "../database/models/index.js";
import type { Plan } from "../constants/plans.constants.js";

/**
 * Servicio para gestionar suscripciones de usuarios
 */
export class SubscriptionService {
  /**
   * Obtiene la suscripción activa de un usuario
   */
  async getActiveSubscription(userId: string): Promise<Subscription | null> {
    const subscription = await Subscription.findOne({
      where: {
        user_id: userId,
        status: "ACTIVE",
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
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    const subscription = await this.getActiveSubscription(userId);
    return subscription !== null && subscription.status === "ACTIVE";
  }
}

