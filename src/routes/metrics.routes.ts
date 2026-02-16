import { Router, type IRouter } from "express";
import { param, query } from "express-validator";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import {
  getMetricsByMonthYear,
  getMetricsByPeriodId,
} from "../controllers/metrics.controller.js";

const router: IRouter = Router();

router.use(authenticateToken);

const monthYearValidation = [
  query("mes")
    .notEmpty()
    .withMessage("mes es requerido")
    .isInt({ min: 1, max: 12 })
    .withMessage("mes debe ser entre 1 y 12"),
  query("año")
    .notEmpty()
    .withMessage("año es requerido")
    .isInt({ min: 2000, max: 2100 })
    .withMessage("año debe ser un año válido"),
  query("profile_id").optional().isUUID().withMessage("profile_id debe ser un UUID válido"),
  query("regimen_fiscal")
    .optional()
    .isString()
    .matches(/^\d{3}$/)
    .withMessage("regimen_fiscal debe ser una clave SAT de 3 dígitos (ej: 601, 606, 626)"),
];

const periodIdParam = [
  param("period_id")
    .notEmpty()
    .withMessage("period_id es requerido")
    .isUUID()
    .withMessage("period_id debe ser un UUID válido"),
  query("regimen_fiscal")
    .optional()
    .isString()
    .matches(/^\d{3}$/)
    .withMessage("regimen_fiscal debe ser una clave SAT de 3 dígitos (ej: 601, 606, 626)"),
];

router.get("/", monthYearValidation, validateRequest, getMetricsByMonthYear);
router.get("/:period_id", periodIdParam, validateRequest, getMetricsByPeriodId);

export default router;
