/**
 * Utilidades para validación y comparación de RFCs
 */

/**
 * Valida el formato de un RFC mexicano
 * @param rfc RFC a validar
 * @returns true si el formato es válido, false en caso contrario
 */
export function isValidRFCFormat(rfc: string): boolean {
  if (!rfc || typeof rfc !== "string") {
    return false;
  }

  // Formato RFC:
  // - Persona Física: 4 letras + 6 dígitos + 3 caracteres alfanuméricos (homoclave)
  // - Persona Moral: 3 letras + 6 dígitos + 3 caracteres alfanuméricos (homoclave)
  // Regex: ^[A-Z&Ñ]{3,4}\d{6}[A-V1-9][A-Z1-9][0-9A]$
  const rfcRegex = /^[A-Z&Ñ]{3,4}\d{6}[A-V1-9][A-Z1-9][0-9A]$/;
  
  return rfcRegex.test(rfc.toUpperCase());
}

/**
 * Compara dos RFCs sin importar mayúsculas/minúsculas
 * @param rfc1 Primer RFC
 * @param rfc2 Segundo RFC
 * @returns true si los RFCs son iguales, false en caso contrario
 */
export function compareRFCs(rfc1: string, rfc2: string): boolean {
  if (!rfc1 || !rfc2) {
    return false;
  }
  
  return rfc1.toUpperCase().trim() === rfc2.toUpperCase().trim();
}

/**
 * Normaliza un RFC (mayúsculas, sin espacios)
 * @param rfc RFC a normalizar
 * @returns RFC normalizado
 */
export function normalizeRFC(rfc: string): string {
  if (!rfc) {
    return "";
  }
  
  return rfc.toUpperCase().trim();
}

