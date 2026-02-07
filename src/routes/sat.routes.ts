import { Router, type IRouter } from "express";
import {
  searchSATCatalog,
  getSATProductById,
  searchBySimilarity,
  getSuggestions,
  getCatalogStats,
  getRegimenesFiscales,
} from "../controllers/sat.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { validateSATSearchLimit } from "../middlewares/plan-limits.middleware.js";

const router: IRouter = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Búsqueda principal (puede ser básica o IA según parámetro useAI)
router.get("/search", searchSATCatalog);

// Búsqueda por similitud (para IA) - requiere validación de límite
router.get("/similarity", validateSATSearchLimit, searchBySimilarity);

// Sugerencias para autocompletado (búsqueda básica, no cuenta como IA)
router.get("/suggestions", getSuggestions);

// Estadísticas del catálogo
router.get("/stats", getCatalogStats);

// Catálogo de regímenes fiscales (para perfiles). Opcional: ?tipo_persona=FISICA|MORAL
router.get("/regimenes-fiscales", getRegimenesFiscales);

// Obtener producto por ID (búsqueda directa, no cuenta como IA)
router.get("/:id", getSATProductById);

export default router;
