import { Router, type IRouter } from 'express';
import { param, query } from 'express-validator';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import {
  getTaxEstimatesByMonthYear,
  getTaxEstimatesByPeriodId,
  getTaxEstimateHistory,
} from '../controllers/tax-estimate.controller.js';

const router: IRouter = Router();

router.use(authenticateToken);

const monthYearValidation = [
  query('profile_id')
    .notEmpty()
    .withMessage('profile_id es requerido')
    .isUUID()
    .withMessage('profile_id debe ser un UUID válido'),
  query('mes')
    .notEmpty()
    .withMessage('mes es requerido')
    .isInt({ min: 1, max: 12 })
    .withMessage('mes debe ser entre 1 y 12'),
  query('año')
    .notEmpty()
    .withMessage('año es requerido')
    .isInt({ min: 2000, max: 2100 })
    .withMessage('año debe ser un año válido'),
  query('regimen_fiscal')
    .optional()
    .isString()
    .matches(/^\d{3}$/)
    .withMessage('regimen_fiscal debe ser una clave SAT de 3 dígitos (ej: 601, 626)'),
  query('persist')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('persist debe ser true o false'),
];

const periodIdParam = [
  param('period_id')
    .notEmpty()
    .withMessage('period_id es requerido')
    .isUUID()
    .withMessage('period_id debe ser un UUID válido'),
  query('regimen_fiscal')
    .optional()
    .isString()
    .matches(/^\d{3}$/)
    .withMessage('regimen_fiscal debe ser una clave SAT de 3 dígitos (ej: 601, 626)'),
  query('persist')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('persist debe ser true o false'),
];

const historyValidation = [
  query('profile_id')
    .notEmpty()
    .withMessage('profile_id es requerido')
    .isUUID()
    .withMessage('profile_id debe ser un UUID válido'),
  query('ejercicio')
    .notEmpty()
    .withMessage('ejercicio es requerido')
    .isInt({ min: 2000, max: 2100 })
    .withMessage('ejercicio debe ser un año válido'),
  query('regimen_fiscal')
    .optional()
    .isString()
    .matches(/^\d{3}$/)
    .withMessage('regimen_fiscal debe ser una clave SAT de 3 dígitos (ej: 601, 626)'),
];

router.get('/history', historyValidation, validateRequest, getTaxEstimateHistory);
router.get('/', monthYearValidation, validateRequest, getTaxEstimatesByMonthYear);
router.get('/period/:period_id', periodIdParam, validateRequest, getTaxEstimatesByPeriodId);

export default router;
