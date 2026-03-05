import { Router, type IRouter } from 'express';
import { body, param, query } from 'express-validator';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { generate, getByToken, revoke } from '../controllers/public-reports.controller.js';

const router: IRouter = Router();

const generateValidation = [
  body('profile_id')
    .notEmpty()
    .withMessage('profile_id es requerido')
    .isUUID()
    .withMessage('profile_id debe ser un UUID válido'),
  body('expires_in_days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('expires_in_days debe ser un número entre 1 y 365'),
  body('send_to_email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('send_to_email debe ser un email válido'),
];

const tokenParam = [
  param('token')
    .notEmpty()
    .withMessage('Token requerido')
    .isUUID()
    .withMessage('Token debe ser un UUID válido'),
];

const getByTokenValidation = [
  ...tokenParam,
  query('mes')
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage('mes debe ser un número entre 1 y 12'),
  query('año')
    .optional()
    .isInt({ min: 2000, max: 2100 })
    .withMessage('año debe ser un número entre 2000 y 2100'),
];

// Público: sin autenticación
router.get('/:token', getByTokenValidation, validateRequest, getByToken);

// Protegidas
router.post('/generate', authenticateToken, generateValidation, validateRequest, generate);
router.delete('/:token', authenticateToken, tokenParam, validateRequest, revoke);

export default router;
