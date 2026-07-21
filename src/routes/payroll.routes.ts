import { Router, type IRouter } from 'express';
import { body, param, query } from 'express-validator';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { checkPlugin } from '../middlewares/check-plugin.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import {
  uploadPayroll,
  getPayrolls,
  getPayrollById,
  deletePayroll,
} from '../controllers/payroll.controller.js';
import { normalizeXmlFile } from '../middlewares/xml-file.middleware.js';

const router: IRouter = Router();

router.use(authenticateToken);
router.use(checkPlugin('payroll'));

const uploadPayrollValidation = [
  body('profile_id').isUUID().withMessage('profile_id debe ser un UUID válido'),
  body('period_id').isUUID().withMessage('period_id debe ser un UUID válido'),
];

const listPayrollsValidation = [
  query('period_id').optional().isUUID().withMessage('period_id debe ser un UUID válido'),
  query('profile_id').optional().isUUID().withMessage('profile_id debe ser un UUID válido'),
];

const payrollIdParam = [param('id').isUUID().withMessage('id debe ser un UUID válido')];

router.post('/upload', uploadPayrollValidation, validateRequest, normalizeXmlFile, uploadPayroll);
router.get('/', listPayrollsValidation, validateRequest, getPayrolls);
router.get('/:id', payrollIdParam, validateRequest, getPayrollById);
router.delete('/:id', payrollIdParam, validateRequest, deletePayroll);

export default router;
