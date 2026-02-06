import { type Response, type NextFunction } from "express";
import type { AuthRequest } from "./auth.middleware.js";
import { SubscriptionService } from "../services/subscription.service.js";

/**
 * Middleware que verifica que el usuario autenticado tenga el plugin habilitado en su suscripción activa.
 * Debe usarse después de authenticateToken (req.userId debe existir).
 *
 * @param pluginName Nombre del plugin (ej. 'payroll', 'credit_notes')
 * @returns Middleware que responde 403 si no tiene suscripción activa o el plugin no está habilitado
 */
export function checkPlugin(pluginName: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const subscriptionService = new SubscriptionService();
    try {
      const hasAccess = await subscriptionService.hasPluginForUser(userId, pluginName);
      if (!hasAccess) {
        res.status(403).json({
          error: "Plugin no disponible",
          message: `No tienes acceso al plugin "${pluginName}". Verifica tu suscripción.`,
        });
        return;
      }
      next();
    } catch (error) {
      console.error("Error al verificar plugin:", error);
      res.status(500).json({ error: "Error al verificar acceso al plugin" });
    }
  };
}
