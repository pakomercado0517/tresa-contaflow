import { Router } from "express";
import { getExpenses, getExpenseById, createExpense, updateExpense, deleteExpense, uploadExpense } from "../controllers/expense.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { validateExpenseLimit } from "../middlewares/plan-limits.middleware.js";

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// CRUD de gastos
router.get("/", getExpenses);
router.post("/", validateExpenseLimit, createExpense);
router.post("/upload", validateExpenseLimit, uploadExpense);
router.get("/:id", getExpenseById);
router.put("/:id", updateExpense);
router.delete("/:id", deleteExpense);

export default router;

