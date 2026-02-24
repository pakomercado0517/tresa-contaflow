import { Router, type IRouter } from "express";
import { body, param, query } from "express-validator";
import {
  listDiscountCodes,
  createDiscountCode,
  activateDiscountCode,
  deactivateDiscountCode,
} from "../controllers/discount.controller.js";
import { authenticateAdmin } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";

const router: IRouter = Router();

// Todas las rutas requieren permisos de administrador
router.use(authenticateAdmin);

// GET /api/discounts - Listar códigos de descuento
router.get(
  "/",
  [
    query("active")
      .optional()
      .isBoolean()
      .withMessage("active debe ser true o false"),
    query("code")
      .optional()
      .isString()
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage("code debe ser un string válido"),
  ],
  validateRequest,
  listDiscountCodes
);

// POST /api/discounts - Crear código de descuento
router.post(
  "/",
  [
    body("code").isString().trim().isLength({ min: 3, max: 50 }),
    body("duration")
      .isIn(["once", "repeating", "forever"])
      .withMessage("duration debe ser once, repeating o forever"),
    body("durationInMonths")
      .optional()
      .isInt({ min: 1 })
      .withMessage("durationInMonths debe ser un entero positivo"),
    body("percentOff")
      .optional()
      .isFloat({ gt: 0, lt: 100.01 })
      .withMessage("percentOff debe ser mayor a 0 y menor o igual a 100"),
    body("amountOff")
      .optional()
      .isFloat({ gt: 0 })
      .withMessage("amountOff debe ser mayor a 0"),
    body("currency")
      .optional()
      .isString()
      .isLength({ min: 3, max: 3 })
      .withMessage("currency debe ser un código ISO de 3 letras"),
    body("maxRedemptions")
      .optional()
      .isInt({ min: 1 })
      .withMessage("maxRedemptions debe ser un entero positivo"),
    body("expiresAt")
      .optional()
      .isISO8601()
      .withMessage("expiresAt debe ser una fecha ISO válida"),
    body("metadata")
      .optional()
      .isObject()
      .withMessage("metadata debe ser un objeto"),
    body("active")
      .optional()
      .isBoolean()
      .withMessage("active debe ser booleano"),
    body("trialDays")
      .optional()
      .isInt({ min: 0 })
      .withMessage("trialDays debe ser un entero mayor o igual a 0"),
    body().custom((value, { req }) => {
      const payload = req.body as { percentOff?: number; amountOff?: number };
      const hasPercent = typeof payload.percentOff === "number";
      const hasAmount = typeof payload.amountOff === "number";

      if ((hasPercent && hasAmount) || (!hasPercent && !hasAmount)) {
        throw new Error("Debes proporcionar percentOff o amountOff (solo uno)");
      }

      return true;
    }),
    body().custom((value, { req }) => {
      const payload = req.body as { duration?: string; durationInMonths?: number };
      if (payload.duration === "repeating" && typeof payload.durationInMonths !== "number") {
        throw new Error("durationInMonths es requerido cuando duration es repeating");
      }
      return true;
    }),
    body().custom((value, { req }) => {
      const payload = req.body as { amountOff?: number; currency?: string };
      if (typeof payload.amountOff === "number" && !payload.currency) {
        throw new Error("currency es requerido cuando amountOff está presente");
      }
      return true;
    }),
  ],
  validateRequest,
  createDiscountCode
);

// PATCH /api/discounts/:id/activate
router.patch(
  "/:id/activate",
  [param("id").isUUID().withMessage("id debe ser un UUID válido")],
  validateRequest,
  activateDiscountCode
);

// PATCH /api/discounts/:id/deactivate
router.patch(
  "/:id/deactivate",
  [param("id").isUUID().withMessage("id debe ser un UUID válido")],
  validateRequest,
  deactivateDiscountCode
);

export default router;
