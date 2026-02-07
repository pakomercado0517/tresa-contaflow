import { type Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware.js";
import { SATCatalogService } from "../services/sat-catalog.service.js";
import { PlanLimitsService } from "../services/plan-limits.service.js";
import SatSearchLog from "../database/models/SatSearchLog.model.js";
import SatRegimenFiscal from "../database/models/SatRegimenFiscal.model.js";
import type { SATProductServiceSearchParams } from "../types/sat.types.js";

const satCatalogService = new SATCatalogService();
const planLimitsService = new PlanLimitsService();

/**
 * Calcula mes y año actual
 */
function getCurrentMonthYear(): { mes: number; año: number } {
  const now = new Date();
  return {
    mes: now.getMonth() + 1,
    año: now.getFullYear(),
  };
}

/**
 * Busca productos/servicios del SAT
 * GET /api/sat/search?query=texto&limit=50&offset=0
 */
export async function searchSATCatalog(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const {
      query,
      incluir_iva_trasladado,
      incluir_ieps_trasladado,
      limit,
      offset,
    } = req.query;

    const searchParams: SATProductServiceSearchParams = {
      ...(query && typeof query === "string" ? { query } : {}),
      ...(incluir_iva_trasladado && typeof incluir_iva_trasladado === "string"
        ? { incluir_iva_trasladado }
        : {}),
      ...(incluir_ieps_trasladado && typeof incluir_ieps_trasladado === "string"
        ? { incluir_ieps_trasladado }
        : {}),
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    };

    // Validar límites
    if (searchParams.limit && (searchParams.limit < 1 || searchParams.limit > 100)) {
      res.status(400).json({
        error: "El límite debe estar entre 1 y 100",
      });
      return;
    }

    if (searchParams.offset && searchParams.offset < 0) {
      res.status(400).json({
        error: "El offset debe ser mayor o igual a 0",
      });
      return;
    }

    // Determinar si es búsqueda IA o básica
    // Si tiene parámetro useAI=true, es IA; si no, es básica
    const useAI = req.query.useAI === "true" || req.query.useAI === "1";
    const searchType: "basic" | "ai_search" = useAI ? "ai_search" : "basic";

    // Si es búsqueda IA, validar límite antes de continuar
    if (searchType === "ai_search") {
      const canSearch = await planLimitsService.canUseAISearch(userId);
      if (!canSearch.allowed) {
        res.status(403).json({
          error: "Límite de plan alcanzado",
          message: canSearch.reason,
          limit: canSearch.limit,
          currentCount: canSearch.currentCount,
          remaining: canSearch.remaining,
        });
        return;
      }
    }

    // Obtener información del plan
    const planInfo = await planLimitsService.getSATPlanInfo(userId);

    // Aplicar límite de resultados según plan
    const results = await satCatalogService.search(
      searchParams,
      planInfo.maxResults
    );

    // Registrar búsqueda en logs (solo si es IA)
    if (searchType === "ai_search") {
      const { mes, año } = getCurrentMonthYear();
      try {
        await SatSearchLog.create({
          user_id: userId,
          search_type: "ai_search",
          query: searchParams.query || null,
          results_count: results.items.length,
          mes,
          año,
        });
      } catch (logError) {
        console.error("Error al registrar búsqueda en logs:", logError);
        // No fallar la request si el log falla
      }
    }

    // Incluir información del plan en la respuesta
    res.json({
      ...results,
      planInfo: {
        maxResults: planInfo.maxResults,
        aiSearchesRemaining: planInfo.aiSearchesRemaining,
        aiSearchesLimit: planInfo.aiSearchesLimit,
        aiSearchesUsed: planInfo.aiSearchesUsed,
        hasAIExplanations: planInfo.hasAIExplanations,
        hasHistory: planInfo.hasHistory,
        hasFavorites: planInfo.hasFavorites,
        hasAlerts: planInfo.hasAlerts,
        hasLearning: planInfo.hasLearning,
        hasAdvancedRanking: planInfo.hasAdvancedRanking,
      },
    });
  } catch (error) {
    console.error("Error al buscar en catálogo SAT:", error);

    if (error instanceof Error) {
      res.status(500).json({
        error: "Error al buscar en catálogo SAT",
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      error: "Error desconocido al buscar en catálogo SAT",
    });
  }
}

/**
 * Obtiene un producto/servicio por su clave
 * GET /api/sat/:id
 */
export async function getSATProductById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { id } = req.params;

    if (!id || typeof id !== "string") {
      res.status(400).json({ error: "ID de producto requerido" });
      return;
    }

    const product = await satCatalogService.getById(id);

    if (!product) {
      res.status(404).json({ error: "Producto/servicio no encontrado" });
      return;
    }

    res.json(product);
  } catch (error) {
    console.error("Error al obtener producto SAT:", error);

    if (error instanceof Error) {
      res.status(500).json({
        error: "Error al obtener producto SAT",
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      error: "Error desconocido al obtener producto SAT",
    });
  }
}

/**
 * Búsqueda por similitud (útil para IA)
 * GET /api/sat/similarity?query=texto&limit=20
 */
export async function searchBySimilarity(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { query, limit } = req.query;

    if (!query || typeof query !== "string" || query.trim() === "") {
      res.status(400).json({ error: "Query de búsqueda requerido" });
      return;
    }

    const limitNum = limit ? parseInt(limit as string, 10) : 20;

    if (limitNum < 1 || limitNum > 50) {
      res.status(400).json({
        error: "El límite debe estar entre 1 y 50",
      });
      return;
    }

    // Obtener información del plan
    const planInfo = await planLimitsService.getSATPlanInfo(userId);

    // Aplicar límite de resultados según plan
    const results = await satCatalogService.searchBySimilarity(
      query.trim(),
      limitNum,
      planInfo.maxResults
    );

    // Registrar búsqueda IA en logs
    const { mes, año } = getCurrentMonthYear();
    try {
      await SatSearchLog.create({
        user_id: userId,
        search_type: "ai_similarity",
        query: query.trim(),
        results_count: results.length,
        mes,
        año,
      });
    } catch (logError) {
      console.error("Error al registrar búsqueda en logs:", logError);
      // No fallar la request si el log falla
    }

    // Incluir información del plan en la respuesta
    res.json({
      items: results,
      total: results.length,
      planInfo: {
        maxResults: planInfo.maxResults,
        aiSearchesRemaining: planInfo.aiSearchesRemaining !== null
          ? Math.max(0, (planInfo.aiSearchesRemaining || 0) - 1)
          : null,
        aiSearchesLimit: planInfo.aiSearchesLimit,
        aiSearchesUsed: planInfo.aiSearchesUsed + 1,
        hasAIExplanations: planInfo.hasAIExplanations,
        hasHistory: planInfo.hasHistory,
        hasFavorites: planInfo.hasFavorites,
        hasAlerts: planInfo.hasAlerts,
        hasLearning: planInfo.hasLearning,
        hasAdvancedRanking: planInfo.hasAdvancedRanking,
      },
    });
  } catch (error) {
    console.error("Error en búsqueda por similitud:", error);

    if (error instanceof Error) {
      res.status(500).json({
        error: "Error en búsqueda por similitud",
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      error: "Error desconocido en búsqueda por similitud",
    });
  }
}

/**
 * Obtiene sugerencias para autocompletado
 * GET /api/sat/suggestions?q=texto&limit=10
 */
export async function getSuggestions(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const { q, limit } = req.query;

    if (!q || typeof q !== "string" || q.trim() === "") {
      res.status(400).json({ error: "Query de búsqueda requerido" });
      return;
    }

    const limitNum = limit ? parseInt(limit as string, 10) : 10;

    if (limitNum < 1 || limitNum > 20) {
      res.status(400).json({
        error: "El límite debe estar entre 1 y 20",
      });
      return;
    }

    // Obtener información del plan
    const planInfo = await planLimitsService.getSATPlanInfo(userId);

    // Aplicar límite de resultados según plan (sugerencias son básicas, no IA)
    const suggestions = await satCatalogService.getSuggestions(
      q.trim(),
      limitNum,
      planInfo.maxResults
    );

    res.json({
      suggestions,
      total: suggestions.length,
      planInfo: {
        maxResults: planInfo.maxResults,
        aiSearchesRemaining: planInfo.aiSearchesRemaining,
        aiSearchesLimit: planInfo.aiSearchesLimit,
        aiSearchesUsed: planInfo.aiSearchesUsed,
        hasAIExplanations: planInfo.hasAIExplanations,
        hasHistory: planInfo.hasHistory,
        hasFavorites: planInfo.hasFavorites,
        hasAlerts: planInfo.hasAlerts,
        hasLearning: planInfo.hasLearning,
        hasAdvancedRanking: planInfo.hasAdvancedRanking,
      },
    });
  } catch (error) {
    console.error("Error al obtener sugerencias:", error);

    if (error instanceof Error) {
      res.status(500).json({
        error: "Error al obtener sugerencias",
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      error: "Error desconocido al obtener sugerencias",
    });
  }
}

/**
 * Obtiene estadísticas del catálogo
 * GET /api/sat/stats
 */
export async function getCatalogStats(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const stats = await satCatalogService.getStats();
    const planInfo = await planLimitsService.getSATPlanInfo(userId);

    res.json({
      ...stats,
      planInfo: {
        maxResults: planInfo.maxResults,
        aiSearchesRemaining: planInfo.aiSearchesRemaining,
        aiSearchesLimit: planInfo.aiSearchesLimit,
        aiSearchesUsed: planInfo.aiSearchesUsed,
        hasAIExplanations: planInfo.hasAIExplanations,
        hasHistory: planInfo.hasHistory,
        hasFavorites: planInfo.hasFavorites,
        hasAlerts: planInfo.hasAlerts,
        hasLearning: planInfo.hasLearning,
        hasAdvancedRanking: planInfo.hasAdvancedRanking,
      },
    });
  } catch (error) {
    console.error("Error al obtener estadísticas del catálogo:", error);

    if (error instanceof Error) {
      res.status(500).json({
        error: "Error al obtener estadísticas",
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      error: "Error desconocido al obtener estadísticas",
    });
  }
}

/**
 * Lista el catálogo de regímenes fiscales del SAT para perfiles.
 * GET /api/sat/regimenes-fiscales?tipo_persona=MORAL
 * Opcional: tipo_persona=FISICA|MORAL filtra por aplicabilidad.
 */
export async function getRegimenesFiscales(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: "Usuario no autenticado" });
      return;
    }

    const tipoPersona = req.query.tipo_persona as string | undefined;

    const where: Record<string, unknown> = { vigente: true };
    if (tipoPersona === "FISICA") {
      where.aplica_persona_fisica = true;
    } else if (tipoPersona === "MORAL") {
      where.aplica_persona_moral = true;
    }

    const regimenes = await SatRegimenFiscal.findAll({
      where,
      order: [["clave", "ASC"]],
      attributes: ["clave", "descripcion", "aplica_persona_fisica", "aplica_persona_moral"],
    });

    res.json({
      data: regimenes.map((r) => ({
        clave: r.clave,
        descripcion: r.descripcion,
        aplica_persona_fisica: r.aplica_persona_fisica,
        aplica_persona_moral: r.aplica_persona_moral,
      })),
    });
  } catch (error) {
    console.error("Error al listar regímenes fiscales:", error);
    res.status(500).json({
      error: "Error al obtener regímenes fiscales",
      message: error instanceof Error ? error.message : "Error desconocido",
    });
  }
}
