import { Subscription, User, Profile, Plugin, SubscriptionPlugin } from "../database/models/index.js";
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
   * Verifica si un usuario es elegible para periodo de prueba
   * Reglas:
   * - Si el usuario viene de FREE (por primera vez) → elegible
   * - Si el usuario ya tuvo un plan de pago (BASIC, PRO, ENTERPRISE) y canceló → NO elegible
   * - Si el usuario ya usó su trial (trial_used = true) → NO elegible
   */
  async isEligibleForTrial(userId: string): Promise<boolean> {
    // Verificar si el usuario ya usó su trial
    const user = await User.findByPk(userId);
    if (!user) {
      return false;
    }

    if (user.trial_used) {
      return false;
    }

    // Verificar si el usuario alguna vez tuvo un plan de pago (no FREE)
    const paidSubscription = await Subscription.findOne({
      where: {
        user_id: userId,
        plan: {
          [Op.in]: ["BASIC", "PRO", "ENTERPRISE"],
        },
      },
      order: [["created_at", "DESC"]],
    });

    // Si nunca tuvo un plan de pago, es elegible para trial
    // Si tuvo un plan de pago, no es elegible (incluso si canceló)
    return paidSubscription === null;
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

  /**
   * Verifica si la suscripción activa del usuario tiene el plugin habilitado.
   * @param userId ID del usuario
   * @param pluginName Nombre del plugin (ej. 'payroll', 'credit_notes')
   * @returns true si el usuario tiene suscripción activa con el plugin habilitado
   */
  async hasPluginForUser(userId: string, pluginName: string): Promise<boolean> {
    const subscription = await this.getActiveSubscription(userId);
    if (!subscription) {
      return false;
    }
    const plugin = await Plugin.findOne({
      where: { name: pluginName, is_available: true },
    });
    if (!plugin) {
      return false;
    }
    const link = await SubscriptionPlugin.findOne({
      where: {
        subscription_id: subscription.id,
        plugin_id: plugin.id,
        enabled: true,
      },
    });
    return link !== null;
  }

  /**
   * Verifica si el perfil pertenece a un usuario con suscripción que tiene el plugin habilitado.
   * @param profileId ID del perfil
   * @param pluginName Nombre del plugin (ej. 'payroll', 'credit_notes')
   * @returns true si el perfil existe y su usuario tiene el plugin en su suscripción activa
   */
  async hasPlugin(profileId: string, pluginName: string): Promise<boolean> {
    const profile = await Profile.findByPk(profileId);
    if (!profile) {
      return false;
    }
    return this.hasPluginForUser(profile.user_id, pluginName);
  }
}

