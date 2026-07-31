import { Router, type IRouter } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { query } from 'express-validator';
import {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  uploadExpense,
  getMetrics,
} from '../controllers/expense.controller.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { validateExpenseLimit } from '../middlewares/plan-limits.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';

const router: IRouter = Router();

router.use(authenticateToken);

const xmlUploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiadas solicitudes para procesar XML. Intenta nuevamente en unos minutos.',
  keyGenerator: (req) => {
    const userId = (req as { userId?: string }).userId;
    const ip = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
    return userId || ipKeyGenerator(ip);
  },
  skip: (req) => req.method === 'OPTIONS',
});

const metricsValidation = [
  query('profileId').optional().isUUID().withMessage('profileId debe ser un UUID válido'),
  query('mes')
    .notEmpty()
    .withMessage('mes es requerido')
    .isInt({ min: 1, max: 12 })
    .withMessage('El mes debe ser un número entero entre 1 y 12'),
  query('año')
    .notEmpty()
    .withMessage('año es requerido')
    .isInt({ min: 2000, max: 2100 })
    .withMessage('El año debe ser un número entero válido (ej.2026)'),
];

/** @deprecated Use GET /api/metrics — mantiene formato legacy con headers Deprecation */
router.get('/metrics', metricsValidation, validateRequest, getMetrics);
router.get('/', getExpenses);
router.post('/', validateExpenseLimit, createExpense);
router.post('/upload', xmlUploadLimiter, validateExpenseLimit, uploadExpense);
router.get('/:id', getExpenseById);
router.put('/:id', updateExpense);
router.delete('/:id', deleteExpense);

export default router;
