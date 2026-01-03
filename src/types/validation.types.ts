/**
 * Tipos para validaciones fiscales
 */

export interface EstadoValidacionCFDI {
  rfcVerificado: boolean;
  regimenFiscalVerificado: boolean;
  uuidDuplicado: boolean;
  advertencias: string[];
  errores: string[];
  valido: boolean;
}

export interface EstadoValidacionGasto {
  rfcVerificado: boolean;
  regimenFiscalVerificado: boolean;
  uuidDuplicado: boolean;
  advertencias: string[];
  errores: string[];
  valido: boolean;
}

export interface ValidacionesConfig {
  validarRFCIngresos?: boolean;
  validarRFCGastos?: boolean;
  validarRegimenFiscal?: boolean;
  validarUUIDDuplicado?: boolean;
  bloquearSiRFCNoCoincide?: boolean;
  bloquearSiRegimenNoCoincide?: boolean;
}

