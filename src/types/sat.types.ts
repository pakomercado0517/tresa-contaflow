/**
 * Tipos relacionados con el catálogo de productos y servicios del SAT
 */

export interface SATProductServiceJSON {
  id: string;
  descripcion: string;
  incluirIVATrasladado: string;
  incluirIEPSTrasladado: string;
  complementoQueDebeIncluir: string;
  fechaInicioVigencia: string; // Formato: "DD-MM-YYYY"
  fechaFinVigencia: string; // Puede estar vacío
  estimuloFranjaFronteriza: string;
  palabrasSimilares: string; // Puede estar vacío
}

export interface SATProductServiceAttributes {
  id: string;
  descripcion: string;
  incluir_iva_trasladado: string;
  incluir_ieps_trasladado: string;
  complemento_que_debe_incluir: string | null;
  fecha_inicio_vigencia: Date;
  fecha_fin_vigencia: Date | null;
  estimulo_franja_fronteriza: string;
  palabras_similares: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SATProductServiceCreationAttributes
  extends Omit<
      SATProductServiceAttributes,
      "created_at" | "updated_at" | "fecha_fin_vigencia" | "complemento_que_debe_incluir" | "palabras_similares"
    >,
    Partial<
      Pick<
        SATProductServiceAttributes,
        "fecha_fin_vigencia" | "complemento_que_debe_incluir" | "palabras_similares"
      >
    > {}

export interface SATProductServiceSearchParams {
  query?: string;
  incluir_iva_trasladado?: string;
  incluir_ieps_trasladado?: string;
  limit?: number;
  offset?: number;
}

export interface SATProductServiceSearchResponse {
  items: SATProductServiceAttributes[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Catálogo SAT c_RegimenFiscal - Regímenes fiscales para perfiles (personas físicas/morales)
 */
export interface SatRegimenFiscalAttributes {
  clave: string;
  descripcion: string;
  aplica_persona_fisica: boolean;
  aplica_persona_moral: boolean;
  vigente: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SatRegimenFiscalCreationAttributes
  extends Omit<SatRegimenFiscalAttributes, 'created_at' | 'updated_at'> {}
