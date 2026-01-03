import Stripe from "stripe";

/**
 * Servicio base de Stripe
 * Inicializa el cliente de Stripe con la API key
 */
export class StripeService {
  private stripe: Stripe;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      throw new Error(
        "STRIPE_SECRET_KEY no está definida en las variables de entorno"
      );
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: "2024-12-18.acacia", // Usar la versión más reciente estable
      typescript: true,
    });
  }

  /**
   * Obtiene la instancia de Stripe
   */
  getClient(): Stripe {
    return this.stripe;
  }

  /**
   * Obtiene el webhook secret desde las variables de entorno
   * @param required Si es false, retorna null en lugar de lanzar error (útil para desarrollo)
   */
  getWebhookSecret(required: boolean = true): string | null {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      if (required) {
        throw new Error(
          "STRIPE_WEBHOOK_SECRET no está definida en las variables de entorno"
        );
      }
      return null;
    }

    return webhookSecret;
  }

  /**
   * Obtiene el Price ID de un plan desde las variables de entorno
   */
  getPriceId(plan: "BASIC" | "PRO"): string {
    const envVar =
      plan === "BASIC" ? "STRIPE_PRICE_ID_BASIC" : "STRIPE_PRICE_ID_PRO";
    const priceId = process.env[envVar];

    if (!priceId) {
      throw new Error(
        `${envVar} no está definida en las variables de entorno`
      );
    }

    return priceId;
  }
}

// Instancia singleton del servicio
let stripeServiceInstance: StripeService | null = null;

/**
 * Obtiene la instancia singleton del servicio de Stripe
 */
export function getStripeService(): StripeService {
  if (!stripeServiceInstance) {
    stripeServiceInstance = new StripeService();
  }
  return stripeServiceInstance;
}

