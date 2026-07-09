import { Router, type IRouter } from "express";
import { param, query } from "express-validator";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { metricsQueryValidation } from "../middlewares/metrics-query.validation.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import {
  getMetricsByMonthYear,
  getMetricsByPeriodId,
} from "../controllers/metrics.controller.js";

const router: IRouter = Router();

router.use(authenticateToken);

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

router.get("/", metricsQueryValidation, validateRequest, getMetricsByMonthYear);
router.get("/:period_id", periodIdParam, validateRequest, getMetricsByPeriodId);

export default router;
