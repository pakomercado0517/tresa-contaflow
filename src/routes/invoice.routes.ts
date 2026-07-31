import { Router, type IRouter } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import {
  parseXML,
  uploadInvoice,
  getInvoices,
  getInvoiceById,
  deleteInvoice,
  getMetrics,
} from '../controllers/invoice.controller.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { validateInvoiceLimit } from '../middlewares/plan-limits.middleware.js';
import { body, param, query } from 'express-validator';
import { validateRequest } from '../middlewares/validate.middleware.js';
import { normalizeXmlFile } from '../middlewares/xml-file.middleware.js';

const router: IRouter = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Per-user limiter for XML parsing/uploading (prevents bursts, avoids proxy/IP issues).
const xmlUploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 300, // 300 requests / 5min por usuario (parse + upload)
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiadas solicitudes para procesar XML. Intenta nuevamente en unos minutos.',
  keyGenerator: (req) => {
    const userId = (req as any).userId as string | undefined;
    const ip = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
    return userId || ipKeyGenerator(ip);
  },
  skip: (req) => req.method === 'OPTIONS',
});

const validateProfileId = [
  body('profileId').isUUID().withMessage('profileId debe ser un UUID válido.'),
];
const validateId = [param('id').isUUID().withMessage('id debe ser un UUID válido.')];
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

const invoiceListValidation = [
  query('profileId').optional().isUUID().withMessage('profileId debe ser un UUID válido'),
  query('mes')
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage('El mes debe ser un número entero entre 1 y 12'),
  query('año')
    .optional()
    .isInt({ min: 2000, max: 2100 })
    .withMessage('El año debe ser un número entero válido (ej.2026)'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('El número de página debe ser un número entero mayor a 0'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('El número de elementos por página debe estar entre 1 y 100 elementos'),
  query('tipo')
    .optional()
    .isIn(['PUE', 'PPD', 'COMPLEMENTO_PAGO'])
    .withMessage('El tipo de factura debe ser PUE, PPD o COMPLEMENTO_PAGO'),
  query('regimen_fiscal')
    .optional()
    .matches(/^\d{3}$/)
    .withMessage('El régimen fiscal debe tener 3 dígitos'),
  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('La búsqueda debe tener 1 y 100 caracteres'),
];

// Ruta para parsear XML (pruebas - no guarda en BD)
router.post(
  '/parse',
  xmlUploadLimiter,
  validateProfileId,
  validateRequest,
  normalizeXmlFile,
  parseXML
);

// Ruta para subir y guardar facturas/gastos en BD
router.post(
  '/upload',
  xmlUploadLimiter,
  validateProfileId,
  validateRequest,
  normalizeXmlFile,
  validateInvoiceLimit,
  uploadInvoice
);

// CRUD de facturas
/** @deprecated Use GET /api/metrics — mantiene formato legacy con headers Deprecation */
router.get('/metrics', metricsValidation, validateRequest, getMetrics);
router.get('/', invoiceListValidation, validateRequest, getInvoices);
router.get('/:id', validateId, validateRequest, getInvoiceById);
router.delete('/:id', validateId, validateRequest, deleteInvoice);

export default router;
