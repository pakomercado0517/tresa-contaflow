import { Router, type IRouter } from 'express';
import { body, param } from 'express-validator';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { validateSatDownloadAccess } from '../middlewares/plan-limits.middleware.js';
import { register, trigger, getStatus } from '../controllers/sat-descarga.controller.js';

const router: IRouter = Router();

router.use(authenticateToken);
router.use(validateSatDownloadAccess);

const registerValidation = [
  body('profile_id')
    .notEmpty()
    .withMessage('profile_id es requerido')
    .isUUID()
    .withMessage('profile_id debe ser un UUID válido'),
  body('certificate_base64')
    .notEmpty()
    .withMessage('certificate_base64 es requerido')
    .isString()
    .withMessage('certificate_base64 debe ser una cadena (contenido del .cer en Base64)'),
  body('private_key_base64')
    .notEmpty()
    .withMessage('private_key_base64 es requerido')
    .isString()
    .withMessage('private_key_base64 debe ser una cadena (contenido del .key en Base64)'),
  body('password')
    .notEmpty()
    .withMessage('password es requerido')
    .isString()
    .withMessage('password debe ser la contraseña de la llave privada'),
];

const profileIdParam = [
  param('profile_id')
    .notEmpty()
    .withMessage('profile_id es requerido')
    .isUUID()
    .withMessage('profile_id debe ser un UUID válido'),
];

router.post('/register', registerValidation, validateRequest, register);
router.post('/trigger/:profile_id', profileIdParam, validateRequest, trigger);
router.get('/status/:profile_id', profileIdParam, validateRequest, getStatus);

export default router;
