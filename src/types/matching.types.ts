/**
 * Tipos para matching de complementos de pago
 */

export interface MatchResult {
  uuid: string; // UUID de la factura PPD
  encontrada: boolean;
  coincidencia: boolean;
  factura?: {
    id: string;
    uuid: string;
    total: number;
    tipo: string;
    fecha: Date;
  };
  mensaje?: string;
  errores?: string[];
  advertencias?: string[];
}

export interface MatchingResult {
  complementoUUID: string;
  matches: MatchResult[];
  totalMatches: number;
  matchesValidos: number;
  matchesInvalidos: number;
}

