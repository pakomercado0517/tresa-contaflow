import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware.js";
import { PluginService } from "../services/plugin.service.js";
import { Profile } from "../database/models/index.js";

/**
 * GET /api/plugins - Lista todos los plugins con enabled según la suscripción del usuario actual.
 */
export async function getPlugins(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const pluginService = new PluginService();
    const plugins = await pluginService.getPluginsWithEnabledForUser(userId);
    res.json({ plugins });
  } catch (error) {
    console.error("Error al listar plugins:", error);
    res.status(500).json({ error: "Error al obtener la lista de plugins" });
  }
}

/**
 * GET /api/profiles/:id/plugins - Lista plugins habilitados para un perfil (el perfil debe pertenecer al usuario).
 */
export async function getProfilePlugins(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const profileId = req.params.id;
    const profile = await Profile.findOne({
      where: { id: profileId, user_id: userId },
    });
    if (!profile) {
      res.status(404).json({ error: "Perfil no encontrado" });
      return;
    }

    const pluginService = new PluginService();
    const plugins = await pluginService.getPluginsWithEnabledForUser(profile.user_id);
    res.json({ plugins });
  } catch (error) {
    console.error("Error al listar plugins del perfil:", error);
    res.status(500).json({ error: "Error al obtener los plugins del perfil" });
  }
}
