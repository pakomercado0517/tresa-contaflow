import { Op, type WhereOptions } from "sequelize";
import SatProductService from "../database/models/SatProductService.model.js";
import type {
  SATProductServiceSearchParams,
  SATProductServiceSearchResponse,
  SATProductServiceAttributes,
} from "../types/sat.types.js";

/**
 * Servicio para búsqueda y consulta del catálogo de productos y servicios del SAT
 */
export class SATCatalogService {
  /**
   * Busca productos/servicios del SAT según los parámetros proporcionados
   * @param params - Parámetros de búsqueda
   * @param maxResults - Límite máximo de resultados según el plan (opcional)
   */
  async search(
    params: SATProductServiceSearchParams,
    maxResults?: number | null
  ): Promise<SATProductServiceSearchResponse> {
    const {
      query,
      incluir_iva_trasladado,
      incluir_ieps_trasladado,
      limit = 50,
      offset = 0,
    } = params;

    const whereClause: WhereOptions<SATProductServiceAttributes> = {};

    // Búsqueda por texto (descripción o palabras similares)
    if (query && query.trim() !== "") {
      const searchTerm = query.trim();
      const searchConditions: Array<WhereOptions<SATProductServiceAttributes>> = [
        {
          descripcion: {
            [Op.iLike]: `%${searchTerm}%`,
          },
        },
        {
          palabras_similares: {
            [Op.iLike]: `%${searchTerm}%`,
          },
        },
      ];

      // Búsqueda por clave exacta si el query parece ser una clave
      if (/^\d+$/.test(searchTerm)) {
        searchConditions.push({
          id: searchTerm,
        });
      }

      whereClause[Op.or as keyof WhereOptions<SATProductServiceAttributes>] = searchConditions as any;
    }

    // Filtro por IVA trasladado
    if (incluir_iva_trasladado) {
      whereClause.incluir_iva_trasladado = incluir_iva_trasladado;
    }

    // Filtro por IEPS trasladado
    if (incluir_ieps_trasladado) {
      whereClause.incluir_ieps_trasladado = incluir_ieps_trasladado;
    }

    // Filtrar solo productos vigentes (fecha_fin_vigencia es null o futura)
    // Combinar con condiciones existentes usando Op.and
    const baseConditions = { ...whereClause };
    whereClause[Op.and as keyof WhereOptions<SATProductServiceAttributes>] = [
      baseConditions,
      {
        [Op.or]: [
          {
            fecha_fin_vigencia: null,
          },
          {
            fecha_fin_vigencia: {
              [Op.gte]: new Date(),
            },
          },
        ],
      },
    ] as any;

    // Aplicar límite de resultados según plan
    const effectiveLimit = maxResults !== null && maxResults !== undefined
      ? Math.min(limit, maxResults, 100)
      : Math.min(limit, 100);

    // Ejecutar búsqueda con conteo total
    const [items, total] = await Promise.all([
      SatProductService.findAll({
        where: whereClause,
        limit: effectiveLimit,
        offset,
        order: [
          // Priorizar coincidencias exactas en descripción
          query && SatProductService.sequelize
            ? [
                SatProductService.sequelize.literal(
                  `CASE WHEN descripcion ILIKE '${query}%' THEN 1 ELSE 2 END`
                ),
                "ASC",
              ]
            : ["descripcion", "ASC"],
          ["id", "ASC"],
        ],
      }),
      SatProductService.count({
        where: whereClause,
      }),
    ]);

    // Aplicar límite de resultados después de la consulta si es necesario
    let finalItems = items.map((item) => item.toJSON() as SATProductServiceAttributes);
    if (maxResults !== null && maxResults !== undefined && finalItems.length > maxResults) {
      finalItems = finalItems.slice(0, maxResults);
    }

    return {
      items: finalItems,
      total: Math.min(total, maxResults !== null && maxResults !== undefined ? maxResults : total),
      limit: effectiveLimit,
      offset,
    };
  }

  /**
   * Obtiene un producto/servicio por su clave (id)
   */
  async getById(id: string): Promise<SATProductServiceAttributes | null> {
    const item = await SatProductService.findByPk(id);
    return item ? (item.toJSON() as SATProductServiceAttributes) : null;
  }

  /**
   * Búsqueda avanzada con similitud de texto (requiere extensión pg_trgm)
   * Útil para búsquedas con IA o búsquedas semánticas
   * @param query - Texto de búsqueda
   * @param limit - Límite de resultados
   * @param maxResults - Límite máximo según el plan (opcional)
   */
  async searchBySimilarity(
    query: string,
    limit: number = 20,
    maxResults?: number | null
  ): Promise<SATProductServiceAttributes[]> {
    if (!query || query.trim() === "") {
      return [];
    }

    const searchTerm = query.trim();

    // Aplicar límite de resultados según plan
    const effectiveLimit = maxResults !== null && maxResults !== undefined
      ? Math.min(limit, maxResults, 50)
      : Math.min(limit, 50);

    // Usar búsqueda de similitud de PostgreSQL (pg_trgm)
    if (!SatProductService.sequelize) {
      throw new Error("Sequelize instance not available");
    }

    const items = await SatProductService.findAll({
      where: {
        [Op.or]: [
          SatProductService.sequelize.literal(
            `descripcion % '${searchTerm}'`
          ),
          SatProductService.sequelize.literal(
            `palabras_similares % '${searchTerm}'`
          ),
        ],
      },
      limit: effectiveLimit,
      order: [
        // Ordenar por similitud (mayor similitud primero)
        [
          SatProductService.sequelize.literal(
            `similarity(descripcion, '${searchTerm}')`
          ),
          "DESC",
        ],
      ],
    });

    let finalItems = items.map(
      (item) => item.toJSON() as SATProductServiceAttributes
    );

    // Aplicar límite después de la consulta si es necesario
    if (maxResults !== null && maxResults !== undefined && finalItems.length > maxResults) {
      finalItems = finalItems.slice(0, maxResults);
    }

    return finalItems;
  }

  /**
   * Obtiene sugerencias de búsqueda basadas en un término parcial
   * Útil para autocompletado
   * @param partialQuery - Término parcial de búsqueda
   * @param limit - Límite de sugerencias
   * @param maxResults - Límite máximo según el plan (opcional)
   */
  async getSuggestions(
    partialQuery: string,
    limit: number = 10,
    maxResults?: number | null
  ): Promise<SATProductServiceAttributes[]> {
    if (!partialQuery || partialQuery.trim() === "") {
      return [];
    }

    const searchTerm = partialQuery.trim().toLowerCase();

    // Aplicar límite de resultados según plan
    const effectiveLimit = maxResults !== null && maxResults !== undefined
      ? Math.min(limit, maxResults, 20)
      : Math.min(limit, 20);

    const items = await SatProductService.findAll({
      where: {
        [Op.or]: [
          {
            descripcion: {
              [Op.iLike]: `${searchTerm}%`,
            },
          },
          {
            id: {
              [Op.like]: `${searchTerm}%`,
            },
          },
        ],
      },
      limit: effectiveLimit,
      order: [
        // Priorizar coincidencias en descripción
        ["descripcion", "ASC"],
        ["id", "ASC"],
      ],
    });

    let finalItems = items.map(
      (item) => item.toJSON() as SATProductServiceAttributes
    );

    // Aplicar límite después de la consulta si es necesario
    if (maxResults !== null && maxResults !== undefined && finalItems.length > maxResults) {
      finalItems = finalItems.slice(0, maxResults);
    }

    return finalItems;
  }

  /**
   * Obtiene estadísticas del catálogo
   */
  async getStats(): Promise<{
    total: number;
    withIva: number;
    withIeps: number;
    active: number;
  }> {
    const [total, withIva, withIeps, active] = await Promise.all([
      SatProductService.count(),
      SatProductService.count({
        where: {
          incluir_iva_trasladado: {
            [Op.in]: ["Sí", "Opcional"],
          },
        },
      }),
      SatProductService.count({
        where: {
          incluir_ieps_trasladado: {
            [Op.in]: ["Sí", "Opcional"],
          },
        },
      }),
      SatProductService.count({
        where: {
          [Op.or]: [
            { fecha_fin_vigencia: null },
            { fecha_fin_vigencia: { [Op.gte]: new Date() } },
          ],
        },
      }),
    ]);

    return {
      total,
      withIva,
      withIeps,
      active,
    };
  }
}
