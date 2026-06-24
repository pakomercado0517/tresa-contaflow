import { Router, type IRouter } from 'express';
import { validateProfileLimit } from '../middlewares/plan-limits.middleware.js';
import { body, param, query } from 'express-validator';
import {
  getProfiles,
  getProfileById,
  createProfile,
  updateProfile,
  deleteProfile,
  freezeOtherProfiles,
  unfreezeProfile,
} from '../controllers/profile.controller.js';
import { getProfilePlugins } from '../controllers/plugin.controller.js';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import {
  getProfileFiscalSettings,
  putProfileFiscalSettings,
} from '../controllers/profile-fiscal.controller.js';

const router: IRouter = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Validaciones
const createProfileValidation = [
  body('nombre')
    .trim()
    .notEmpty()
    .withMessage('El nombre es requerido')
    .isLength({ min: 2, max: 255 })
    .withMessage('El nombre debe tener entre 2 y 255 caracteres'),
  body('rfc')
    .trim()
    .notEmpty()
    .withMessage('El RFC es requerido')
    .matches(/^[A-Z&Ñ]{3,4}\d{6}[A-V1-9][A-Z1-9][0-9A]$/i)
    .withMessage('Formato de RFC inválido'),
  body('tipo_persona')
    .isIn(['FISICA', 'MORAL'])
    .withMessage('El tipo de persona debe ser FISICA o MORAL'),
  body('regimenes_fiscales')
    .optional()
    .isArray()
    .withMessage('Los regímenes fiscales deben ser un arreglo'),
  body('regimenes_fiscales.*')
    .optional()
    .isString()
    .trim()
    .withMessage('Cada régimen fiscal debe ser una cadena (clave SAT)'),
  body('validaciones_habilitadas')
    .optional()
    .isObject()
    .withMessage('Las validaciones habilitadas deben ser un objeto'),
];

const updateProfileValidation = [
  param('id').isUUID().withMessage('ID de perfil inválido'),
  body('nombre')
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('El nombre debe tener entre 2 y 255 caracteres'),
  body('rfc')
    .optional()
    .trim()
    .matches(/^[A-Z&Ñ]{3,4}\d{6}[A-V1-9][A-Z1-9][0-9A]$/i)
    .withMessage('Formato de RFC inválido'),
  body('tipo_persona')
    .optional()
    .isIn(['FISICA', 'MORAL'])
    .withMessage('El tipo de persona debe ser FISICA o MORAL'),
  body('regimenes_fiscales')
    .optional()
    .isArray()
    .withMessage('Los regímenes fiscales deben ser un arreglo'),
  body('regimenes_fiscales.*')
    .optional()
    .isString()
    .trim()
    .withMessage('Cada régimen fiscal debe ser una cadena (clave SAT)'),
  body('validaciones_habilitadas')
    .optional()
    .isObject()
    .withMessage('Las validaciones habilitadas deben ser un objeto'),
];

const profileIdValidation = [param('id').isUUID().withMessage('ID de perfil inválido')];

const freezeOthersValidation = [
  body('preserveProfileId')
    .notEmpty()
    .withMessage("El campo 'preserveProfileId' es requerido")
    .isUUID()
    .withMessage("El 'preserveProfileId' debe ser un UUID válido"),
  body('targetPlan')
    .optional()
    .isIn(['FREE', 'BASIC', 'PRO', 'ENTERPRISE'])
    .withMessage("El 'targetPlan' debe ser FREE, BASIC, PRO o ENTERPRISE"),
];

const fiscalSettingsGetValidation = [
  param('id').isUUID().withMessage('ID de perfil inválido'),
  query('ejercicio')
    .notEmpty()
    .withMessage('ejercicio es requerido')
    .isInt({ min: 2000, max: 2100 })
    .withMessage('ejercicio debe ser un año válido'),
];

const fiscalSettingsPutValidation = [
  param('id').isUUID().withMessage('ID de perfil inválido'),
  body('ejercicio')
    .isInt({ min: 2000, max: 2100 })
    .withMessage('ejercicio es requerido y debe ser un año válido'),
  body('coeficiente_utilidad')
    .optional({ nullable: true })
    .isFloat({ min: 0, max: 1 })
    .withMessage('coeficiente_utilidad debe estar entre 0 y 1'),
  body('coeficiente_utilidad_ejercicio_anterior')
    .optional({ nullable: true })
    .isFloat({ min: 0, max: 1 })
    .withMessage('coeficiente_utilidad_ejercicio_anterior debe estar entre 0 y 1'),
  body('isr_pagos_provisionales_acum')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('isr_pagos_provisionales_acum debe ser >= 0'),
  body('saldo_a_favor_isr').optional().isFloat({ min: 0 }),
  body('saldo_a_favor_iva').optional().isFloat({ min: 0 }),
  body('perdidas_fiscales_pendientes').optional().isFloat({ min: 0 }),
  body('ptu_pagada_acum').optional().isFloat({ min: 0 }),
];

// Rutas
router.get('/', getProfiles);
router.get(
  '/:id/fiscal-settings',
  fiscalSettingsGetValidation,
  validateRequest,
  getProfileFiscalSettings
);
router.put(
  '/:id/fiscal-settings',
  fiscalSettingsPutValidation,
  validateRequest,
  putProfileFiscalSettings
);
router.get('/:id/plugins', profileIdValidation, validateRequest, getProfilePlugins);
router.get('/:id', profileIdValidation, validateRequest, getProfileById);
router.post('/', createProfileValidation, validateRequest, validateProfileLimit, createProfile);
router.put('/:id', updateProfileValidation, validateRequest, updateProfile);
router.delete('/:id', profileIdValidation, validateRequest, deleteProfile);

// Rutas de freeze/unfreeze
router.post('/freeze-others', freezeOthersValidation, validateRequest, freezeOtherProfiles);
router.put('/:id/unfreeze', profileIdValidation, validateRequest, unfreezeProfile);

export default router;
