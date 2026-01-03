import { Router } from "express";
import { parseXML } from "../controllers/invoice.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { validateInvoiceLimit } from "../middlewares/plan-limits.middleware.js";

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Ruta para parsear XML (pruebas)
// Nota: validateInvoiceLimit valida antes de crear la factura en BD
// Por ahora, parseXML solo parsea y valida, no guarda en BD
// Cuando implementemos guardar en BD, agregar validateInvoiceLimit aquí
router.post("/parse", parseXML);

export default router;

