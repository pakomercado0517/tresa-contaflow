import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { Application, Request, Response, NextFunction } from 'express';
import fileUpload from 'express-fileupload';
import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import invoiceRoutes from './routes/invoice.routes.js';
import expenseRoutes from './routes/expense.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import discountRoutes from './routes/discount.routes.js';
import satRoutes from './routes/sat.routes.js';
import manualIncomesRoutes from './routes/manual-incomes.routes.js';
import accruedExpensesRoutes from './routes/accrued-expenses.routes.js';
import metricsRoutes from './routes/metrics.routes.js';
import payrollRoutes from './routes/payroll.routes.js';
import paymentComplementRoutes from './routes/payment-complement.routes.js';
import pluginRoutes from './routes/plugin.routes.js';
import publicReportsRoutes from './routes/public-reports.routes.js';
import taxEstimateRoutes from './routes/tax-estimate.routes.js';
import internalRoutes from './routes/internal.routes.js';
import satDescargaRoutes from './routes/sat-descarga.routes.js';
import { logger } from './utils/logger.util.js';
import { errorHandler } from './middlewares/error.middleware.js';

dotenv.config();

const app: Application = express();

// Running behind Railway (reverse proxy). Trust X-Forwarded-* so req.ip is the real client.
// This prevents IP-based rate limiting from grouping many users under the proxy's internal IP.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security: Helmet para headers de seguridad HTTP
app.use(helmet());

// CORS: Configurar según entorno
const corsOptions = {
  origin:
    process.env.FRONTEND_URL ||
    process.env.APP_URL ||
    (process.env.NODE_ENV === 'production' ? false : 'http://localhost:3000'),
  credentials: true,
  optionsSuccessStatus: 200,
};

// En producción, si no hay FRONTEND_URL o APP_URL, deshabilitar CORS (más seguro)
if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL && !process.env.APP_URL) {
  logger.warn('FRONTEND_URL o APP_URL no configurado en producción. CORS deshabilitado.');
}

app.use(cors(corsOptions));

// Logging: Diferente formato según entorno
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Rate Limiting: Protección contra ataques de fuerza bruta
// En desarrollo: límites más bajos para facilitar pruebas
const apiRateLimitMax = parseInt(
  process.env.API_RATE_LIMIT_MAX || (process.env.NODE_ENV === 'production' ? '1000' : '2000'),
  10
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: Number.isFinite(apiRateLimitMax) ? apiRateLimitMax : 1000,
  message: 'Demasiadas solicitudes desde esta IP, por favor intenta nuevamente más tarde.',
  standardHeaders: true,
  legacyHeaders: false,
  // Browsers may send an OPTIONS preflight per request; don't count them.
  skip: (req: Request) => req.method === 'OPTIONS',
});

app.use('/api/', limiter);

// Rate limiting más estricto para endpoints de autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: process.env.NODE_ENV === 'production' ? 5 : 100, // 5 en producción, 100 en desarrollo para pruebas
  message: 'Demasiados intentos de autenticación, por favor intenta nuevamente más tarde.',
  skipSuccessfulRequests: true, // No contar requests exitosos
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/google', authLimiter);
app.use('/api/auth/request-password-reset', authLimiter);

// Middleware para webhooks de Stripe (debe estar ANTES de express.json())
// Stripe necesita el body raw para verificar la firma
app.use(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  (req: Request, res: Response, next: NextFunction) => {
    next();
  }
);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(
  fileUpload({
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB máximo
    abortOnLimit: true,
  })
);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.get('/', (req: Request, res: Response) =>
  res.send({ message: 'Bienvenido a la API de Tresa Contafy' })
);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/sat', satRoutes);
app.use('/api/manual-incomes', manualIncomesRoutes);
app.use('/api/accrued-expenses', accruedExpensesRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/tax-estimates', taxEstimateRoutes);
app.use('/api/payrolls', payrollRoutes);
app.use('/api/payment-complements', paymentComplementRoutes);
app.use('/api/plugins', pluginRoutes);
app.use('/api/public-reports', publicReportsRoutes);
app.use('/api/internal', internalRoutes);
app.use('/api/sat-descarga', satDescargaRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use(errorHandler);

// Middleware de manejo de errores centralizado (debe ir al final, después de todas las rutas)
app.use((err: Error, req: Request, res: Response, next: NextFunction): void => {
  // Log del error con contexto de la request
  logger.error(
    {
      err,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    },
    'Error no manejado en la aplicación'
  );

  // No exponer detalles del error en producción
  const isDevelopment = process.env.NODE_ENV !== 'production';

  res.status(500).json({
    error: 'Error interno del servidor',
    message: isDevelopment
      ? err.message
      : 'Ocurrió un error inesperado. Por favor intenta nuevamente más tarde.',
    ...(isDevelopment && { stack: err.stack }),
  });
});

// Manejo de rutas no encontradas (404)
app.use((req: Request, res: Response): void => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    message: `La ruta ${req.method} ${req.path} no existe`,
  });
});

export default app;
