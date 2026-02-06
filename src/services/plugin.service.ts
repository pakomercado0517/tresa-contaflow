import { Plugin, SubscriptionPlugin } from "../database/models/index.js";
import { SubscriptionService } from "./subscription.service.js";
import type { PluginListItem } from "../types/plugin.types.js";

/**
 * Servicio para consultar el catálogo de plugins y su estado por usuario/perfil.
 */
export class PluginService {
  /**
   * Lista todos los plugins con el flag `enabled` según la suscripción activa del usuario.
   * @param userId ID del usuario
   * @returns Lista de plugins con name, display_name y enabled
   */
  async getPluginsWithEnabledForUser(userId: string): Promise<PluginListItem[]> {
    const subscriptionService = new SubscriptionService();
    const subscription = await subscriptionService.getActiveSubscription(userId);

    const plugins = await Plugin.findAll({
      order: [["name", "ASC"]],
      attributes: ["id", "name", "display_name"],
    });

    if (!subscription) {
      return plugins.map((p) => ({
        name: p.name,
        display_name: p.display_name,
        enabled: false,
      }));
    }

    const links = await SubscriptionPlugin.findAll({
      where: { subscription_id: subscription.id, enabled: true },
      attributes: ["plugin_id"],
    });
    const enabledPluginIds = new Set(links.map((l) => l.plugin_id));

    return plugins.map((p) => ({
      name: p.name,
      display_name: p.display_name,
      enabled: enabledPluginIds.has(p.id),
    }));
  }
}
