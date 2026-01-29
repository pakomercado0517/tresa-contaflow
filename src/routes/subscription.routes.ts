import { Router, type IRouter } from "express";
import { body } from "express-validator";
import {
  createCheckoutSession,
  getSubscription,
  createPortalSession,
  assignFreeSubscription,
  getAvailablePlans,
  getPublicPlans,
} from "../controllers/subscription.controller.js";
import { authenticateToken, authenticateAdmin } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";

const router: IRouter = Router();

// ============================================
// Rutas PÚBLICAS (sin autenticación)
// ============================================

// GET /api/subscription/public-plans - Obtener todos los planes disponibles (SIN autenticación)
router.get("/public-plans", getPublicPlans);

// ============================================
// Rutas PROTEGIDAS (requieren autenticación)
// ============================================

// Todas las rutas siguientes requieren autenticación
router.use(authenticateToken);

// GET /api/subscription - Obtener suscripción actual
router.get("/", getSubscription);

// GET /api/subscription/plans - Obtener todos los planes disponibles
router.get("/plans", getAvailablePlans);

// POST /api/subscription/create-checkout - Crear sesión de checkout
router.post(
  "/create-checkout",
  [
    body("plan")
      .isIn(["BASIC", "PRO"])
      .withMessage("El plan debe ser BASIC o PRO"),
    body("promotionCode")
      .optional()
      .isString()
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage("promotionCode debe ser un string válido"),
  ],
  validateRequest,
  createCheckoutSession
);

// POST /api/subscription/create-portal-session - Crear sesión del Customer Portal
router.post("/create-portal-session", createPortalSession);

// POST /api/subscription/assign-free - Asignar suscripción gratis (solo admin)
router.post(
  "/assign-free",
  authenticateAdmin,
  [
    body("userId")
      .isUUID()
      .withMessage("El userId debe ser un UUID válido"),
    body("plan")
      .isIn(["FREE", "BASIC", "PRO", "ENTERPRISE"])
      .withMessage("El plan debe ser FREE, BASIC, PRO o ENTERPRISE"),
  ],
  validateRequest,
  assignFreeSubscription
);

export default router;

