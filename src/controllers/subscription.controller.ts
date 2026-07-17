import { type Response, type Request } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import type Stripe from 'stripe';
import { getStripeService } from '../services/stripe.service.js';
import {
  PLAN_PRICES,
  PLAN_PRICES_ANNUAL,
  PLAN_LIMITS,
  PLAN_TRIAL_DAYS,
  type Plan,
} from '../constants/plans.constants.js';
import { SubscriptionService } from '../services/subscription.service.js';
import { PlanLimitsService } from '../services/plan-limits.service.js';
import { User } from '../database/models/index.js';
import { resolveTrialDaysForCheckout } from '../utils/subscription-trial.util.js';
import { getPromotionCodeForCheckoutService } from '../services/discount.service.js';

/**
 * Crea una sesión de checkout de Stripe para suscribirse a un plan
 */
export async function createCheckoutSession(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const { plan, promotionCode, billing } = req.body as {
      plan?: string;
      promotionCode?: string;
      billing?: string;
    };

    // Validar que el plan sea válido
    if (!plan || !['BASIC', 'PRO'].includes(plan)) {
      res.status(400).json({
        error: 'Plan inválido',
        message: 'El plan debe ser BASIC o PRO',
        allowedPlans: ['BASIC', 'PRO'],
      });
      return;
    }

    // El plan FREE no requiere checkout
    if (plan === 'FREE') {
      res.status(400).json({
        error: 'Plan inválido',
        message: 'El plan FREE no requiere suscripción',
      });
      return;
    }

    // Verificar si ya tiene una suscripción activa
    const subscriptionService = new SubscriptionService();
    const existingSubscription = await subscriptionService.getActiveSubscription(userId);

    if (existingSubscription && existingSubscription.plan === plan) {
      res.status(400).json({
        error: 'Ya tienes este plan activo',
        message: `Ya estás suscrito al plan ${plan}`,
      });
      return;
    }

    // Obtener servicio de Stripe
    const stripeService = getStripeService();
    const stripe = stripeService.getClient();

    // Obtener Price ID del plan (respeta billing: 'monthly' | 'annual')
    const billingMode = billing === 'annual' ? 'annual' : 'monthly';
    const priceId = stripeService.getPriceId(plan as 'BASIC' | 'PRO', billingMode);

    // Obtener URLs de éxito y cancelación desde variables de entorno o usar defaults
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const successUrl = `${frontendUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${frontendUrl}/subscription/cancel`;

    // Obtener email del usuario para pre-llenar el checkout
    const user = await User.findByPk(userId);
    const customerEmail = user?.email || undefined;

    const stripeCustomerId = existingSubscription?.stripe_customer_id || undefined;

    const normalizedPromotionCode = promotionCode?.trim().toUpperCase();
    let promotionCodeId: string | null = null;
    let promotionTrialDays: number | null = null;

    if (normalizedPromotionCode) {
      const promotion = await getPromotionCodeForCheckoutService(normalizedPromotionCode);

      if (!promotion) {
        res.status(400).json({
          error: 'Código de descuento inválido',
          message: 'El código de descuento no es válido, ya expiró o no está activo',
        });
        return;
      }

      promotionCodeId = promotion.promotionCodeId;
      promotionTrialDays = promotion.trialDays;
    }

    const metadata: Record<string, string> = {
      userId: userId,
      plan: plan,
      billing: billing === 'annual' ? 'annual' : 'monthly',
    };

    if (normalizedPromotionCode && promotionCodeId) {
      metadata.promotionCode = normalizedPromotionCode;
      metadata.promotionCodeId = promotionCodeId;
    }

    // Verificar si el usuario es elegible para periodo de prueba
    const isEligibleForTrial = await subscriptionService.isEligibleForTrial(userId);
    const trialDays = resolveTrialDaysForCheckout(
      isEligibleForTrial,
      plan as 'BASIC' | 'PRO',
      promotionTrialDays
    );

    // Preparar subscription_data con trial si aplica
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata,
    };

    if (trialDays !== undefined) {
      subscriptionData.trial_period_days = trialDays;
    }

    // Preparar parámetros del checkout session
    // Stripe solo permite uno: customer O customer_email, no ambos
    const checkoutParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      subscription_data: subscriptionData,
    };

    if (promotionCodeId) {
      checkoutParams.discounts = [{ promotion_code: promotionCodeId }];
    }

    // Si ya tiene un customer en Stripe, usar customer (reutilizar)
    // Si no, usar customer_email para pre-llenar el email
    if (stripeCustomerId) {
      checkoutParams.customer = stripeCustomerId;
    } else if (customerEmail) {
      checkoutParams.customer_email = customerEmail;
    }

    // Crear checkout session
    const session = await stripe.checkout.sessions.create(checkoutParams);

    res.json({
      sessionId: session.id,
      url: session.url,
      message: 'Checkout session creada exitosamente',
    });
  } catch (error) {
    console.error('Error al crear checkout session:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Error al crear checkout session',
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: 'Error desconocido al crear checkout session' });
  }
}

/**
 * Obtiene la información de la suscripción actual del usuario
 */
export async function getSubscription(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const subscriptionService = new SubscriptionService();
    const limitsService = new PlanLimitsService();
    const subscription = await subscriptionService.getActiveSubscription(userId);

    // Obtener el plan actual (FREE si no tiene suscripción)
    const currentPlan = subscription?.plan || 'FREE';

    // Obtener los límites del plan
    const limits = await limitsService.getUserLimits(userId);

    if (!subscription) {
      // Si no tiene suscripción activa, retornar plan FREE con límites
      res.json({
        plan: 'FREE',
        status: 'ACTIVE',
        planPrice: PLAN_PRICES.FREE,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        limits: {
          profiles: limits.profiles,
          invoicesPerMonth: limits.invoicesPerMonth,
          expensesPerMonth: limits.expensesPerMonth,
          exportPDF: limits.exportPDF,
          exportExcel: limits.exportExcel,
          reports: limits.reports,
          support: limits.support,
          apiAccess: limits.apiAccess,
        },
      });
      return;
    }

    res.json({
      plan: subscription.plan,
      status: subscription.status,
      planPrice: Number(subscription.plan_price),
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      stripeCustomerId: subscription.stripe_customer_id,
      stripeSubscriptionId: subscription.stripe_subscription_id,
      limits: {
        profiles: limits.profiles,
        invoicesPerMonth: limits.invoicesPerMonth,
        expensesPerMonth: limits.expensesPerMonth,
        exportPDF: limits.exportPDF,
        exportExcel: limits.exportExcel,
        reports: limits.reports,
        support: limits.support,
        apiAccess: limits.apiAccess,
      },
    });
  } catch (error) {
    console.error('Error al obtener suscripción:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Error al obtener suscripción',
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: 'Error desconocido al obtener suscripción' });
  }
}

/**
 * Crea una sesión del Customer Portal de Stripe
 * Permite a los usuarios gestionar su suscripción, métodos de pago y facturas
 */
export async function createPortalSession(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    // Verificar que el usuario tenga una suscripción activa con Stripe
    const subscriptionService = new SubscriptionService();
    const subscription = await subscriptionService.getActiveSubscription(userId);

    if (!subscription || !subscription.stripe_customer_id) {
      res.status(400).json({
        error: 'No hay suscripción activa',
        message: 'Debes tener una suscripción activa para acceder al portal de clientes',
      });
      return;
    }

    // Obtener servicio de Stripe
    const stripeService = getStripeService();
    const stripe = stripeService.getClient();

    // Obtener URL de retorno desde variables de entorno o usar default
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const returnUrl = `${frontendUrl}/dashboard/setup?tab=subscription`;

    // Crear sesión del portal
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: returnUrl,
    });

    res.json({
      url: portalSession.url,
      message: 'Sesión del portal creada exitosamente',
    });
  } catch (error) {
    console.error('Error al crear sesión del portal:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Error al crear sesión del portal',
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: 'Error desconocido al crear sesión del portal' });
  }
}

/**
 * Asigna una suscripción gratis a un usuario (solo para administradores)
 * Permite asignar cualquier plan (FREE, BASIC, PRO, ENTERPRISE) sin pago
 */
export async function assignFreeSubscription(req: AuthRequest, res: Response): Promise<void> {
  try {
    const adminUserId = req.userId;
    if (!adminUserId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const { userId, plan } = req.body;

    // Validar que se proporcionen los campos requeridos
    if (!userId || typeof userId !== 'string') {
      res.status(400).json({
        error: 'userId requerido',
        message: 'Debes proporcionar el userId del usuario al que se asignará la suscripción',
      });
      return;
    }

    if (!plan || typeof plan !== 'string') {
      res.status(400).json({
        error: 'plan requerido',
        message: 'Debes proporcionar el plan a asignar (FREE, BASIC, PRO, ENTERPRISE)',
      });
      return;
    }

    // Validar que el plan sea válido
    const validPlans = ['FREE', 'BASIC', 'PRO', 'ENTERPRISE'];
    if (!validPlans.includes(plan)) {
      res.status(400).json({
        error: 'Plan inválido',
        message: `El plan debe ser uno de: ${validPlans.join(', ')}`,
        allowedPlans: validPlans,
      });
      return;
    }

    // Verificar que el usuario existe
    const targetUser = await User.findByPk(userId);
    if (!targetUser) {
      res.status(404).json({
        error: 'Usuario no encontrado',
        message: `No se encontró un usuario con el ID: ${userId}`,
      });
      return;
    }

    // Obtener precio del plan desde las constantes
    const planPrice = PLAN_PRICES[plan as Plan];

    // Asignar suscripción usando el servicio
    const subscriptionService = new SubscriptionService();
    const subscription = await subscriptionService.assignSubscription(
      userId,
      plan as Plan,
      planPrice
    );

    res.json({
      message: `Suscripción ${plan} asignada exitosamente`,
      subscription: {
        id: subscription.id,
        userId: subscription.user_id,
        plan: subscription.plan,
        planPrice: Number(subscription.plan_price),
        status: subscription.status,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
      user: {
        id: targetUser.id,
        email: targetUser.email,
        nombre: targetUser.nombre,
        apellido: targetUser.apellido,
      },
    });
  } catch (error) {
    console.error('Error al asignar suscripción gratis:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Error al asignar suscripción',
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: 'Error desconocido al asignar suscripción' });
  }
}

/**
 * Función auxiliar para construir datos de planes
 * Utilizada por getAvailablePlans y getPublicPlans
 */
function buildPlansData(isAnnual: boolean) {
  const plans: Plan[] = ['FREE', 'BASIC', 'PRO', 'ENTERPRISE'];
  return plans.map((plan) => {
    const limits = PLAN_LIMITS[plan];
    const monthlyPrice = PLAN_PRICES[plan];

    // Usar precios anuales fijos cuando se solicite billing=annual
    let price: number;
    let originalPrice: number | null = null;

    if (isAnnual && monthlyPrice > 0) {
      // Precio anual fijo (definido en PLAN_PRICES_ANNUAL)
      price = PLAN_PRICES_ANNUAL[plan];
      // Mostrar precio original sin descuento (12 * mensual) para referencia en UI
      originalPrice = monthlyPrice * 12;
    } else {
      price = monthlyPrice;
    }

    return {
      id: plan,
      name: plan,
      price: Math.round(price * 100) / 100, // Redondear a 2 decimales
      originalPrice: originalPrice ? Math.round(originalPrice * 100) / 100 : null,
      billing: isAnnual ? 'annual' : 'monthly',
      limits: {
        profiles: limits.profiles,
        invoicesPerMonth: limits.invoicesPerMonth,
        expensesPerMonth: limits.expensesPerMonth,
        exportPDF: limits.exportPDF,
        exportExcel: limits.exportExcel,
        reports: limits.reports,
        support: limits.support,
        apiAccess: limits.apiAccess,
        // Límites del catálogo SAT
        satBasicSearchesPerMonth: limits.satBasicSearchesPerMonth,
        satAISearchesPerMonth: limits.satAISearchesPerMonth,
        satMaxResults: limits.satMaxResults,
        satHasAIExplanations: limits.satHasAIExplanations,
        satHasHistory: limits.satHasHistory,
        satHasFavorites: limits.satHasFavorites,
        satHasAlerts: limits.satHasAlerts,
        satHasLearning: limits.satHasLearning,
        satHasAdvancedRanking: limits.satHasAdvancedRanking,
      },
      trialDays: PLAN_TRIAL_DAYS[plan as 'BASIC' | 'PRO'] || null,
    };
  });
}

/**
 * Endpoint público para obtener información de todos los planes
 * NO requiere autenticación - útil para mostrar planes en página de inicio
 */
export async function getPublicPlans(req: Request, res: Response): Promise<void> {
  try {
    const billing = (req.query.billing as string) || 'monthly';
    const isAnnual = billing === 'annual';

    const plansData = buildPlansData(isAnnual);

    res.json({
      plans: plansData,
      billing: isAnnual ? 'annual' : 'monthly',
    });
  } catch (error) {
    console.error('Error al obtener planes públicos:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Error al obtener planes',
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: 'Error desconocido al obtener planes' });
  }
}

/**
 * Obtiene información de todos los planes disponibles
 * Requiere autenticación - para usuarios autenticados
 */
export async function getAvailablePlans(req: AuthRequest, res: Response): Promise<void> {
  try {
    const billing = (req.query.billing as string) || 'monthly';
    const isAnnual = billing === 'annual';

    const plansData = buildPlansData(isAnnual);

    res.json({
      plans: plansData,
      billing: isAnnual ? 'annual' : 'monthly',
    });
  } catch (error) {
    console.error('Error al obtener planes disponibles:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Error al obtener planes disponibles',
        message: error.message,
      });
      return;
    }

    res.status(500).json({ error: 'Error desconocido al obtener planes disponibles' });
  }
}
