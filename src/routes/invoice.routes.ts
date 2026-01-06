import { Router } from "express";
import { parseXML, uploadInvoice, getInvoices, getInvoiceById, deleteInvoice, getMetrics } from "../controllers/invoice.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { validateInvoiceLimit } from "../middlewares/plan-limits.middleware.js";

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Ruta para parsear XML (pruebas - no guarda en BD)
router.post("/parse", parseXML);

// Ruta para subir y guardar facturas/gastos en BD
router.post("/upload", validateInvoiceLimit, uploadInvoice);

// CRUD de facturas
router.get("/metrics", getMetrics);
router.get("/", getInvoices);
router.get("/:id", getInvoiceById);
router.delete("/:id", deleteInvoice);

export default router;

