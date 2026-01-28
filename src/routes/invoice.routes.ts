import { Router, type IRouter } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { parseXML, uploadInvoice, getInvoices, getInvoiceById, deleteInvoice, getMetrics } from "../controllers/invoice.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { validateInvoiceLimit } from "../middlewares/plan-limits.middleware.js";

const router: IRouter = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Per-user limiter for XML parsing/uploading (prevents bursts, avoids proxy/IP issues).
const xmlUploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 300, // 300 requests / 5min por usuario (parse + upload)
  standardHeaders: true,
  legacyHeaders: false,
  message: "Demasiadas solicitudes para procesar XML. Intenta nuevamente en unos minutos.",
  keyGenerator: (req) => {
    const userId = (req as any).userId as string | undefined;
    const ip = req.ip ?? req.socket.remoteAddress ?? "0.0.0.0";
    return userId || ipKeyGenerator(ip);
  },
  skip: (req) => req.method === "OPTIONS",
});

// Ruta para parsear XML (pruebas - no guarda en BD)
router.post("/parse", xmlUploadLimiter, parseXML);

// Ruta para subir y guardar facturas/gastos en BD
router.post("/upload", xmlUploadLimiter, validateInvoiceLimit, uploadInvoice);

// CRUD de facturas
router.get("/metrics", getMetrics);
router.get("/", getInvoices);
router.get("/:id", getInvoiceById);
router.delete("/:id", deleteInvoice);

export default router;
