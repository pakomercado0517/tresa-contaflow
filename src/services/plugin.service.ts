import { Plugin, Profile, SubscriptionPlugin } from '../database/models/index.js';
import { SubscriptionService } from './subscription.service.js';
import type { PluginListItem } from '../types/plugin.types.js';
import { AppError } from '../utils/AppError.js';

/**
 * Servicio para consultar el catálogo de plugins y su estado por usuario/perfil.
 */
/**
 * Lista todos los plugins con el flag `enabled` según la suscripción activa del usuario.
 * @param userId ID del usuario
 * @returns Lista de plugins con name, display_name y enabled
 */
const getPluginsWithEnabledForUser = async (userId: string): Promise<PluginListItem[]> => {
  const subscriptionService = new SubscriptionService();
  const subscription = await subscriptionService.getActiveSubscription(userId);

  const plugins = await Plugin.findAll({
    order: [['name', 'ASC']],
    attributes: ['id', 'name', 'display_name'],
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
    attributes: ['plugin_id'],
  });
  const enabledPluginIds = new Set(links.map((l) => l.plugin_id));

  return plugins.map((p) => ({
    name: p.name,
    display_name: p.display_name,
    enabled: enabledPluginIds.has(p.id),
  }));
};

export const getPluginsService = async (userId: string) => {
  const plugins = await getPluginsWithEnabledForUser(userId);
  return { plugins };
};

export const getProfilePluginsService = async (userId: string, profileId: string) => {
  const profile = await Profile.findOne({
    where: { id: profileId, user_id: userId },
  });
  if (!profile) throw new AppError('Perfil no encontrado ', 404);

  const plugins = await getPluginsWithEnabledForUser(profile.user_id);
  return { plugins };
};
