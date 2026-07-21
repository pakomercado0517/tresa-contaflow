import { Router, type IRouter } from 'express';
import { param, query } from 'express-validator';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import {
  getPaymentComplements,
  getPaymentComplementById,
} from '../controllers/payment-complement.controller.js';

const router: IRouter = Router();

router.use(authenticateToken);

const listValidation = [
  query('profile_id').optional().isUUID().withMessage('profile_id debe ser un UUID válido'),
  query('role')
    .optional()
    .isIn(['INGRESO', 'EGRESO'])
    .withMessage('role debe ser INGRESO o EGRESO'),
  query('mes').optional().isInt({ min: 1, max: 12 }).withMessage('mes debe estar entre 1 y 12'),
  query('año').optional().isInt({ min: 2000, max: 2100 }).withMessage('año debe ser válido'),
  query('page').optional().isInt({ min: 1 }).withMessage('page debe ser >= 1'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit debe estar entre 1 y 100'),
  query().custom((_, { req }) => {
    const queryParams = req.query ?? {};

    const hasMes = queryParams.mes !== undefined && queryParams.mes !== '';
    const hasAño = queryParams.año !== undefined && queryParams.año !== '';

    if (hasMes && !hasAño) throw new Error('año es requerido cuando se filtra por mes');

    return true;
  }),
];

const idParamValidation = [
  param('id').isUUID().isString().withMessage('id debe ser un UUID válido'),
  query('profile_id').optional().isUUID().withMessage('profile_id debe ser un UUID válido'),
];

router.get('/', listValidation, validateRequest, getPaymentComplements);
router.get('/:id', idParamValidation, validateRequest, getPaymentComplementById);

export default router;
