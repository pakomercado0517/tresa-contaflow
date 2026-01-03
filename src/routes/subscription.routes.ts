import { Router } from "express";
import { body } from "express-validator";
import {
  createCheckoutSession,
  getSubscription,
  createPortalSession,
} from "../controllers/subscription.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// GET /api/subscription - Obtener suscripción actual
router.get("/", getSubscription);

// POST /api/subscription/create-checkout - Crear sesión de checkout
router.post(
  "/create-checkout",
  [
    body("plan")
      .isIn(["BASIC", "PRO"])
      .withMessage("El plan debe ser BASIC o PRO"),
  ],
  validateRequest,
  createCheckoutSession
);

// POST /api/subscription/create-portal-session - Crear sesión del Customer Portal
router.post("/create-portal-session", createPortalSession);

export default router;

