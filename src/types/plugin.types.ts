/**
 * Elemento de la lista de plugins (catalogo o habilitados por perfil/suscripción).
 */
export interface PluginListItem {
  name: string;
  display_name: string;
  enabled: boolean;
}

/**
 * Respuesta de GET /api/plugins y GET /api/profiles/:id/plugins.
 */
export interface PluginsResponse {
  plugins: PluginListItem[];
}
