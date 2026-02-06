import { Router, type IRouter } from "express";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { getPlugins } from "../controllers/plugin.controller.js";

const router: IRouter = Router();

router.use(authenticateToken);

// GET /api/plugins - Listar todos los plugins (con enabled según suscripción del usuario)
router.get("/", getPlugins);

export default router;
