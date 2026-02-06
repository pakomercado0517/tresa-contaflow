import { Router, type IRouter } from "express";
import { body, param, query } from "express-validator";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import {
  getManualIncomes,
  getManualIncomeById,
  createManualIncome,
  updateManualIncome,
} from "../controllers/manual-incomes.controller.js";

const router: IRouter = Router();

router.use(authenticateToken);

const createManualIncomeValidation = [
  body("profile_id").isUUID().withMessage("profile_id debe ser un UUID válido"),
  body("period_id").isUUID().withMessage("period_id debe ser un UUID válido"),
  body("concept").isString().trim().notEmpty().withMessage("concept es requerido"),
  body("subtotal").isFloat({ min: 0 }).withMessage("subtotal debe ser un número >= 0"),
  body("iva_amount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("iva_amount debe ser un número >= 0"),
  body("fecha").notEmpty().withMessage("fecha es requerida"),
  body("notes").optional().isString(),
];

const updateManualIncomeValidation = [
  param("id").isUUID().withMessage("id debe ser un UUID válido"),
  body("concept").optional().isString().trim().notEmpty().withMessage("concept no puede estar vacío"),
  body("subtotal").optional().isFloat({ min: 0 }).withMessage("subtotal debe ser >= 0"),
  body("iva_amount").optional().isFloat({ min: 0 }).withMessage("iva_amount debe ser >= 0"),
  body("is_paid").optional().isBoolean().withMessage("is_paid debe ser true o false"),
  body("payment_date")
    .optional({ values: "null" })
    .custom((value) => value === null || value === "" || !isNaN(new Date(value).getTime()))
    .withMessage("payment_date debe ser una fecha válida o null"),
  body("notes").optional().isString(),
];

const listManualIncomesValidation = [
  query("period_id")
    .notEmpty()
    .withMessage("period_id es requerido")
    .isUUID()
    .withMessage("period_id debe ser un UUID válido"),
];

const manualIncomeIdParam = [param("id").isUUID().withMessage("id debe ser un UUID válido")];

router.get("/", listManualIncomesValidation, validateRequest, getManualIncomes);
router.get("/:id", manualIncomeIdParam, validateRequest, getManualIncomeById);
router.post("/", createManualIncomeValidation, validateRequest, createManualIncome);
router.put("/:id", updateManualIncomeValidation, validateRequest, updateManualIncome);

export default router;
