import { Router } from "express";
import { handleStripeWebhook } from "../controllers/webhook.controller.js";

const router = Router();

/**
 * Endpoint para recibir webhooks de Stripe
 * IMPORTANTE: Este endpoint NO usa el middleware de autenticación
 * Stripe autentica usando la firma del webhook (stripe-signature header)
 */
router.post(
  "/stripe",
  // Express.raw() middleware para obtener el body raw (necesario para verificar la firma)
  // Esto debe configurarse en server.ts para esta ruta específica
  handleStripeWebhook
);

export default router;

