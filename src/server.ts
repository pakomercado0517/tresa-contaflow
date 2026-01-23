import express from "express";
import morgan from "morgan";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Application, Request, Response, NextFunction } from "express";
import fileUpload from "express-fileupload";
import authRoutes from "./routes/auth.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import invoiceRoutes from "./routes/invoice.routes.js";
import expenseRoutes from "./routes/expense.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import discountRoutes from "./routes/discount.routes.js";
import satRoutes from "./routes/sat.routes.js";
import { logger } from "./utils/logger.util.js";

dotenv.config();

const app: Application = express();

// Security: Helmet para headers de seguridad HTTP
app.use(helmet());

// CORS: Configurar según entorno
const corsOptions = {
  origin: process.env.FRONTEND_URL || process.env.APP_URL || (process.env.NODE_ENV === "production" ? false : "http://localhost:3000"),
  credentials: true,
  optionsSuccessStatus: 200,
};

// En producción, si no hay FRONTEND_URL o APP_URL, deshabilitar CORS (más seguro)
if (process.env.NODE_ENV === "production" && !process.env.FRONTEND_URL && !process.env.APP_URL) {
  logger.warn("FRONTEND_URL o APP_URL no configurado en producción. CORS deshabilitado.");
}

app.use(cors(corsOptions));

// Logging: Diferente formato según entorno
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Rate Limiting: Protección contra ataques de fuerza bruta
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: process.env.NODE_ENV === "production" ? 100 : 1000, // Límite más estricto en producción
  message: "Demasiadas solicitudes desde esta IP, por favor intenta nuevamente más tarde.",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", limiter);

// Rate limiting más estricto para endpoints de autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Solo 5 intentos por 15 minutos
  message: "Demasiados intentos de autenticación, por favor intenta nuevamente más tarde.",
  skipSuccessfulRequests: true, // No contar requests exitosos
});

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/request-password-reset", authLimiter);

// Middleware para webhooks de Stripe (debe estar ANTES de express.json())
// Stripe necesita el body raw para verificar la firma
app.use(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  (req: Request, res: Response, next: NextFunction) => {
    next();
  }
);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB máximo
  abortOnLimit: true,
}));

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/", (req: Request, res: Response) =>
  res.send({ message: "Bienvenido a la API de Tresa ContaFlow" })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/discounts", discountRoutes);
app.use("/api/sat", satRoutes);
app.use("/api/webhooks", webhookRoutes);

// Middleware de manejo de errores centralizado (debe ir al final, después de todas las rutas)
app.use((err: Error, req: Request, res: Response, next: NextFunction): void => {
  // Log del error con contexto de la request
  logger.error(
    {
      err,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    },
    "Error no manejado en la aplicación"
  );

  // No exponer detalles del error en producción
  const isDevelopment = process.env.NODE_ENV !== "production";

  res.status(500).json({
    error: "Error interno del servidor",
    message: isDevelopment ? err.message : "Ocurrió un error inesperado. Por favor intenta nuevamente más tarde.",
    ...(isDevelopment && { stack: err.stack }),
  });
});

// Manejo de rutas no encontradas (404)
app.use((req: Request, res: Response): void => {
  res.status(404).json({
    error: "Ruta no encontrada",
    message: `La ruta ${req.method} ${req.path} no existe`,
  });
});

export default app;
