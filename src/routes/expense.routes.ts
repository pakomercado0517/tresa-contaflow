import { Router, type IRouter } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { getExpenses, getExpenseById, createExpense, updateExpense, deleteExpense, uploadExpense } from "../controllers/expense.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { validateExpenseLimit } from "../middlewares/plan-limits.middleware.js";

const router: IRouter = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Per-user limiter for XML upload (expense alias -> invoices/upload logic)
const xmlUploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Demasiadas solicitudes para procesar XML. Intenta nuevamente en unos minutos.",
  keyGenerator: (req) => {
    const userId = (req as any).userId as string | undefined;
    const ip = req.ip ?? req.socket.remoteAddress ?? "0.0.0.0";
    return userId || ipKeyGenerator(ip);
  },
  skip: (req) => req.method === "OPTIONS",
});

// CRUD de gastos
router.get("/", getExpenses);
router.post("/", validateExpenseLimit, createExpense);
router.post("/upload", xmlUploadLimiter, validateExpenseLimit, uploadExpense);
router.get("/:id", getExpenseById);
router.put("/:id", updateExpense);
router.delete("/:id", deleteExpense);

export default router;
