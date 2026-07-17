import { type Request, type Response } from 'express';
import Stripe from 'stripe';
import { getStripeService } from '../services/stripe.service.js';
import { Subscription, PaymentEvent, User } from '../database/models/index.js';
import type { Plan } from '../constants/plans.constants.js';
import { PLAN_PRICES } from '../constants/plans.constants.js';
import { recordRedemptionByPromotionCodeIdService } from '../services/discount.service.js';

/**
 * Endpoint para recibir webhooks de Stripe
 * IMPORTANTE: Este endpoint NO debe usar el middleware de autenticación
 * Stripe usa su propia firma para autenticar los webhooks
 */
export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const sig = req.headers['stripe-signature'];

  if (!sig || typeof sig !== 'string') {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  try {
    const stripeService = getStripeService();
    const stripe = stripeService.getClient();
    const webhookSecret = stripeService.getWebhookSecret(false);

    // Si no hay webhook secret, retornar error (o permitir en desarrollo)
    if (!webhookSecret) {
      console.warn('STRIPE_WEBHOOK_SECRET no configurado, ignorando webhook');
      res.status(200).json({ received: true, warning: 'Webhook secret not configured' });
      return;
    }

    // Verificar y construir el evento
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Error verificando webhook:', err);
      res
        .status(400)
        .json({ error: `Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}` });
      return;
    }

    // Registrar el evento en la BD (para auditoría)
    await PaymentEvent.create({
      stripe_event_id: event.id,
      stripe_event_type: event.type,
      event_data: event.data.object as unknown as Record<string, unknown>,
      processed_at: new Date(),
    });

    // Manejar diferentes tipos de eventos
    switch (event.type) {
      case 'checkout.session.completed':
        try {
          await handleCheckoutSessionCompleted(event);
        } catch (error) {
          console.error('Error en handleCheckoutSessionCompleted:', error);
          throw error; // Re-lanzar para que se capture en el catch general
        }
        break;

      case 'customer.subscription.updated':
        try {
          await handleSubscriptionUpdated(event);
        } catch (error) {
          console.error('Error en handleSubscriptionUpdated:', error);
          throw error;
        }
        break;

      case 'customer.subscription.deleted':
        try {
          await handleSubscriptionDeleted(event);
        } catch (error) {
          console.error('Error en handleSubscriptionDeleted:', error);
          throw error;
        }
        break;

      case 'invoice.payment_succeeded':
        try {
          await handleInvoicePaymentSucceeded(event);
        } catch (error) {
          console.error('Error en handleInvoicePaymentSucceeded:', error);
          throw error;
        }
        break;

      case 'invoice.payment_failed':
        try {
          await handleInvoicePaymentFailed(event);
        } catch (error) {
          console.error('Error en handleInvoicePaymentFailed:', error);
          throw error;
        }
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Retornar respuesta exitosa a Stripe
    res.json({ received: true });
  } catch (error) {
    console.error('Error procesando webhook:', error);
    res.status(500).json({ error: 'Error processing webhook' });
  }
}

/**
 * Maneja el evento checkout.session.completed
 * Se ejecuta cuando un usuario completa el pago exitosamente
 */
async function handleCheckoutSessionCompleted(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;

  if (session.mode !== 'subscription') {
    console.log('Checkout session no es una suscripción, ignorando');
    return;
  }

  const userId = session.metadata?.userId;
  const planFromMetadata = session.metadata?.plan as Plan | undefined;

  if (!userId) {
    console.error('No se encontró userId en metadata del checkout session');
    return;
  }

  // Obtener la suscripción de Stripe
  const subscriptionId = session.subscription as string;
  if (!subscriptionId) {
    console.error('No se encontró subscription ID en checkout session');
    return;
  }

  const stripeService = getStripeService();
  const stripe = stripeService.getClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Determinar el plan desde metadata o desde el price ID
  const plan = planFromMetadata || getPlanFromPriceId(subscription.items.data[0]?.price.id);

  if (!plan) {
    console.error('No se pudo determinar el plan');
    return;
  }

  // Buscar suscripción existente por stripe_subscription_id primero
  let existingSubscription = await Subscription.findOne({
    where: { stripe_subscription_id: subscription.id },
  });

  // Si no existe por stripe_subscription_id, buscar por user_id y status ACTIVE
  if (!existingSubscription) {
    existingSubscription = await Subscription.findOne({
      where: { user_id: userId, status: 'ACTIVE' },
    });
  }

  // Obtener el precio real de Stripe (en lugar de usar PLAN_PRICES hardcodeado)
  const actualPrice = getPriceFromStripeSubscription(subscription);

  // Validar y convertir fechas de período (pueden ser undefined en algunos casos)
  const currentPeriodStart = (subscription as any).current_period_start
    ? new Date(((subscription as any).current_period_start as number) * 1000)
    : null;
  const currentPeriodEnd = (subscription as any).current_period_end
    ? new Date(((subscription as any).current_period_end as number) * 1000)
    : null;

  const subscriptionData = {
    user_id: userId,
    stripe_customer_id: subscription.customer as string,
    stripe_subscription_id: subscription.id,
    plan: plan,
    plan_price: actualPrice,
    status: mapStripeStatusToDbStatus(subscription.status),
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: subscription.cancel_at_period_end || false,
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
  };

  if (existingSubscription) {
    // Si la suscripción existente es FREE y estamos creando una de pago, cancelar la FREE
    if (existingSubscription.plan === 'FREE' && plan !== 'FREE') {
      await existingSubscription.update({ status: 'CANCELLED' });
      // Crear nueva suscripción de pago
      await Subscription.create(subscriptionData);
      console.log(
        `Suscripción FREE cancelada y nueva suscripción ${plan} creada para usuario ${userId}`
      );
    } else {
      // Actualizar suscripción existente
      await existingSubscription.update(subscriptionData);
      console.log(`Suscripción actualizada para usuario ${userId}, plan: ${plan}`);
    }
  } else {
    // Crear nueva suscripción
    await Subscription.create(subscriptionData);
    console.log(`Nueva suscripción creada para usuario ${userId}, plan: ${plan}`);
  }

  // Si la suscripción tiene status TRIALING, marcar que el usuario ya usó su trial
  if (subscriptionData.status === 'TRIALING') {
    const user = await User.findByPk(userId);
    if (user && !user.trial_used) {
      await user.update({ trial_used: true });
      console.log(`Usuario ${userId} marcado como trial_used`);
    }
  }

  const promotionCodeId = session.metadata?.promotionCodeId;
  if (promotionCodeId) {
    await recordRedemptionByPromotionCodeIdService(promotionCodeId);
  }
}

/**
 * Maneja el evento customer.subscription.updated
 * Se ejecuta cuando una suscripción se actualiza (cambio de plan, renovación, etc.)
 */
async function handleSubscriptionUpdated(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;

  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error('No se encontró userId en metadata de la suscripción');
    return;
  }

  // Determinar el plan desde metadata o desde el price ID
  const plan =
    (subscription.metadata?.plan as Plan | undefined) ||
    getPlanFromPriceId(subscription.items.data[0]?.price.id);

  if (!plan) {
    console.error('No se pudo determinar el plan');
    return;
  }

  // Buscar la suscripción en la BD
  const dbSubscription = await Subscription.findOne({
    where: { stripe_subscription_id: subscription.id },
  });

  if (!dbSubscription) {
    console.error(
      `No se encontró suscripción en BD con stripe_subscription_id: ${subscription.id}`
    );
    return;
  }

  // Obtener el precio real de Stripe (en lugar de usar PLAN_PRICES hardcodeado)
  const actualPrice = getPriceFromStripeSubscription(subscription);

  // Actualizar la suscripción
  await dbSubscription.update({
    plan: plan,
    plan_price: actualPrice,
    status: mapStripeStatusToDbStatus(subscription.status),
    current_period_start: (subscription as any).current_period_start
      ? new Date(((subscription as any).current_period_start as number) * 1000)
      : dbSubscription.current_period_start,
    current_period_end: (subscription as any).current_period_end
      ? new Date(((subscription as any).current_period_end as number) * 1000)
      : dbSubscription.current_period_end,
    cancel_at_period_end: subscription.cancel_at_period_end || false,
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
  });

  console.log(`Suscripción actualizada para usuario ${userId}, plan: ${plan}`);
}

/**
 * Maneja el evento customer.subscription.deleted
 * Se ejecuta cuando una suscripción es cancelada
 */
async function handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;

  // Buscar la suscripción en la BD
  const dbSubscription = await Subscription.findOne({
    where: { stripe_subscription_id: subscription.id },
  });

  if (!dbSubscription) {
    console.error(
      `No se encontró suscripción en BD con stripe_subscription_id: ${subscription.id}`
    );
    return;
  }

  // Marcar como cancelada y downgrade a FREE
  await dbSubscription.update({
    status: 'CANCELLED',
    canceled_at: new Date(),
    cancel_at_period_end: false,
  });

  // Crear nueva suscripción FREE
  await Subscription.create({
    user_id: dbSubscription.user_id,
    plan: 'FREE',
    plan_price: PLAN_PRICES.FREE,
    status: 'ACTIVE',
  });

  console.log(`Suscripción cancelada para usuario ${dbSubscription.user_id}, downgrade a FREE`);
}

/**
 * Maneja el evento invoice.payment_succeeded
 * Se ejecuta cuando un pago mensual es exitoso
 */
async function handleInvoicePaymentSucceeded(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  // @ts-expect-error - Stripe types issue with subscription property
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) {
    return;
  }

  const stripeService = getStripeService();
  const stripe = stripeService.getClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Buscar la suscripción en la BD
  const dbSubscription = await Subscription.findOne({
    where: { stripe_subscription_id: subscription.id },
  });

  if (!dbSubscription) {
    return;
  }

  // Actualizar fechas del período actual
  await dbSubscription.update({
    current_period_start: new Date((subscription as any).current_period_start * 1000),
    current_period_end: new Date((subscription as any).current_period_end * 1000),
    status: 'ACTIVE', // Asegurar que está activa si el pago fue exitoso
  });

  console.log(`Pago exitoso para suscripción ${subscription.id}`);
}

/**
 * Maneja el evento invoice.payment_failed
 * Se ejecuta cuando un pago falla
 */
async function handleInvoicePaymentFailed(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  // @ts-expect-error - Stripe types issue with subscription property
  const subscriptionId = invoice.subscription as string;

  if (!subscriptionId) {
    return;
  }

  const stripeService = getStripeService();
  const stripe = stripeService.getClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Buscar la suscripción en la BD
  const dbSubscription = await Subscription.findOne({
    where: { stripe_subscription_id: subscription.id },
  });

  if (!dbSubscription) {
    return;
  }

  // Actualizar estado a PAST_DUE
  await dbSubscription.update({
    status: 'PAST_DUE',
  });

  console.log(`Pago fallido para suscripción ${subscription.id}`);
}

/**
 * Mapea el status de Stripe al status de la BD
 */
function mapStripeStatusToDbStatus(
  stripeStatus: string
): 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PAST_DUE' | 'UNPAID' | 'TRIALING' {
  const statusMap: Record<
    string,
    'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PAST_DUE' | 'UNPAID' | 'TRIALING'
  > = {
    active: 'ACTIVE',
    canceled: 'CANCELLED',
    incomplete: 'UNPAID',
    incomplete_expired: 'EXPIRED',
    past_due: 'PAST_DUE',
    trialing: 'TRIALING',
    unpaid: 'UNPAID',
    paused: 'CANCELLED',
  };

  return statusMap[stripeStatus] || 'ACTIVE';
}

/**
 * Obtiene el plan desde un Price ID de Stripe
 */
function getPlanFromPriceId(priceId: string | undefined): Plan | null {
  if (!priceId) {
    return null;
  }

  const stripeService = getStripeService();
  const plans: Array<'BASIC' | 'PRO' | 'ENTERPRISE'> = ['BASIC', 'PRO', 'ENTERPRISE'];

  for (const p of plans) {
    try {
      const monthly = stripeService.getPriceId(p, 'monthly');
      if (priceId === monthly) return p as Plan;
    } catch (err) {
      // ignore if env var not present
    }

    try {
      const annual = stripeService.getPriceId(p, 'annual');
      if (priceId === annual) return p as Plan;
    } catch (err) {
      // ignore if env var not present
    }
  }

  return null;
}

/**
 * Obtiene el precio real de una suscripción de Stripe
 * El precio viene en la menor unidad (centavos para MXN), así que dividimos por 100
 */
function getPriceFromStripeSubscription(subscription: Stripe.Subscription): number {
  const priceItem = subscription.items.data[0];
  if (!priceItem?.price?.unit_amount) {
    // Si no hay precio, retornar 0 (no debería pasar, pero por seguridad)
    return 0;
  }

  // unit_amount está en la menor unidad de la moneda (centavos para MXN)
  // Dividimos por 100 para obtener el precio en la unidad normal
  return priceItem.price.unit_amount / 100;
}
