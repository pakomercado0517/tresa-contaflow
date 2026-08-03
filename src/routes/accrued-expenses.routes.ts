import { Router, type IRouter } from 'express';
import { body, param, query } from 'express-validator';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import {
  getAccruedExpenses,
  getAccruedExpenseById,
  createAccruedExpense,
  updateAccruedExpense,
  deleteAccruedExpense,
} from '../controllers/accrued-expenses.controller.js';

const router: IRouter = Router();

router.use(authenticateToken);

const createValidation = [
  body('profile_id').isUUID().withMessage('profile_id debe ser un UUID válido'),
  body('period_id').isUUID().withMessage('period_id debe ser un UUID válido'),
  body('concept').isString().trim().notEmpty().withMessage('concept es requerido'),
  body('subtotal').isFloat({ min: 0 }).withMessage('subtotal debe ser un número >= 0'),
  body('iva')
    .isFloat({ min: 0 })
    .withMessage('iva (porcentaje) es requerido y debe ser un número >= 0'),
  body('fecha').notEmpty().withMessage('fecha es requerida'),
  body('type')
    .equals('manual')
    .withMessage("type debe ser 'manual' para gastos devengados manuales"),
  body('categoria').optional().isString(),
];

const updateValidation = [
  param('id').isUUID().withMessage('id debe ser un UUID válido'),
  body('concept')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('concept no puede estar vacío'),
  body('subtotal').optional().isFloat({ min: 0 }).withMessage('subtotal debe ser >= 0'),
  body('iva')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('iva (porcentaje) debe ser un número >= 0'),
  body('is_paid').optional().isBoolean().withMessage('is_paid debe ser true o false'),
  body('payment_date')
    .optional({ values: 'null' })
    .custom((value) => value === null || value === '' || !isNaN(new Date(value).getTime()))
    .withMessage('payment_date debe ser una fecha válida o null'),
  body('categoria').optional().isString(),
];

const listValidation = [
  query('period_id')
    .notEmpty()
    .withMessage('period_id es requerido')
    .isUUID()
    .withMessage('period_id debe ser un UUID válido'),
  query('type').equals('manual').withMessage("type debe ser 'manual'"),
];

const idParam = [param('id').isUUID().withMessage('id debe ser un UUID válido')];

router.get('/', listValidation, validateRequest, getAccruedExpenses);
router.get('/:id', idParam, validateRequest, getAccruedExpenseById);
router.post('/', createValidation, validateRequest, createAccruedExpense);
router.put('/:id', updateValidation, validateRequest, updateAccruedExpense);
router.delete('/:id', idParam, validateRequest, deleteAccruedExpense);

export default router;
