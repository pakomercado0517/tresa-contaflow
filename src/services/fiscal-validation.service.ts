import type { CFDI } from "../types/cfdi.types.js";
import type { EstadoValidacionCFDI, EstadoValidacionGasto, ValidacionesConfig } from "../types/validation.types.js";
import { compareRFCs, isValidRFCFormat, normalizeRFC } from "../utils/rfc.util.js";
import { Invoice, Expense, PaymentComplement } from "../database/models/index.js";

/**
 * Servicio para validaciones fiscales
 */
export class FiscalValidationService {
  /**
   * Valida una factura (ingreso) contra un perfil
   */
  async validateFacturaIngreso(
    cfdi: CFDI,
    profileId: string,
    profileRFC: string,
    profileRegimenFiscal: string | null,
    validacionesHabilitadas: ValidacionesConfig
  ): Promise<EstadoValidacionCFDI> {
    const estado: EstadoValidacionCFDI = {
      rfcVerificado: false,
      regimenFiscalVerificado: false,
      uuidDuplicado: false,
      advertencias: [],
      errores: [],
      valido: true,
    };

    // Validar formato de RFC del emisor
    if (!isValidRFCFormat(cfdi.rfcEmisor)) {
      estado.errores.push(`El RFC del emisor (${cfdi.rfcEmisor}) no tiene un formato válido`);
      estado.valido = false;
      return estado;
    }

    // Validar formato de RFC del perfil
    if (!isValidRFCFormat(profileRFC)) {
      estado.errores.push(`El RFC del perfil (${profileRFC}) no tiene un formato válido`);
      estado.valido = false;
      return estado;
    }

    // Validar RFC del emisor contra el RFC del perfil
    if (validacionesHabilitadas.validarRFCIngresos !== false) {
      const rfcCoincide = compareRFCs(cfdi.rfcEmisor, profileRFC);

      if (!rfcCoincide) {
        const mensaje = `El RFC del emisor (${cfdi.rfcEmisor}) no coincide con el RFC del perfil (${profileRFC})`;
        
        if (validacionesHabilitadas.bloquearSiRFCNoCoincide) {
          estado.errores.push(mensaje);
          estado.valido = false;
          return estado;
        } else {
          estado.advertencias.push(mensaje);
        }
      } else {
        estado.rfcVerificado = true;

        // Validar régimen fiscal si está habilitado
        if (validacionesHabilitadas.validarRegimenFiscal !== false && profileRegimenFiscal) {
          if (cfdi.regimenFiscalEmisor !== profileRegimenFiscal) {
            const mensaje = `El régimen fiscal de la factura (${cfdi.regimenFiscalEmisor}) no coincide con el régimen fiscal del perfil (${profileRegimenFiscal}). Esto puede afectar los cálculos fiscales.`;
            
            if (validacionesHabilitadas.bloquearSiRegimenNoCoincide) {
              estado.errores.push(mensaje);
              estado.valido = false;
              return estado;
            } else {
              estado.advertencias.push(mensaje);
            }
          } else {
            estado.regimenFiscalVerificado = true;
          }
        }
      }
    }

    // Validar UUID duplicado
    if (validacionesHabilitadas.validarUUIDDuplicado !== false) {
      const uuidDuplicado = await this.checkUUIDDuplicado(cfdi.uuid, profileId, "invoice");
      estado.uuidDuplicado = uuidDuplicado;
      
      if (uuidDuplicado) {
        estado.errores.push(`El UUID (${cfdi.uuid}) ya existe en el sistema`);
        estado.valido = false;
        return estado;
      }
    }

    return estado;
  }

  /**
   * Valida un gasto contra un perfil
   */
  async validateGasto(
    cfdi: CFDI,
    profileId: string,
    profileRFC: string,
    profileRegimenFiscal: string | null,
    validacionesHabilitadas: ValidacionesConfig
  ): Promise<EstadoValidacionGasto> {
    const estado: EstadoValidacionGasto = {
      rfcVerificado: false,
      regimenFiscalVerificado: false,
      uuidDuplicado: false,
      advertencias: [],
      errores: [],
      valido: true,
    };

    // Validar formato de RFC del receptor (en gastos, el receptor es el cliente)
    if (!isValidRFCFormat(cfdi.rfcReceptor)) {
      estado.errores.push(`El RFC del receptor (${cfdi.rfcReceptor}) no tiene un formato válido`);
      estado.valido = false;
      return estado;
    }

    // Validar formato de RFC del perfil
    if (!isValidRFCFormat(profileRFC)) {
      estado.errores.push(`El RFC del perfil (${profileRFC}) no tiene un formato válido`);
      estado.valido = false;
      return estado;
    }

    // Validar RFC del receptor contra el RFC del perfil
    if (validacionesHabilitadas.validarRFCGastos !== false) {
      const rfcCoincide = compareRFCs(cfdi.rfcReceptor, profileRFC);

      if (!rfcCoincide) {
        const mensaje = `El RFC del receptor (${cfdi.rfcReceptor}) no coincide con el RFC del perfil (${profileRFC})`;
        
        if (validacionesHabilitadas.bloquearSiRFCNoCoincide) {
          estado.errores.push(mensaje);
          estado.valido = false;
          return estado;
        } else {
          estado.advertencias.push(mensaje);
        }
      } else {
        estado.rfcVerificado = true;

        // Validar régimen fiscal si está habilitado
        if (validacionesHabilitadas.validarRegimenFiscal !== false && profileRegimenFiscal) {
          if (cfdi.regimenFiscalReceptor !== profileRegimenFiscal) {
            const mensaje = `El régimen fiscal del gasto (${cfdi.regimenFiscalReceptor}) no coincide con el régimen fiscal del perfil (${profileRegimenFiscal}). Esto puede afectar los cálculos fiscales.`;
            
            if (validacionesHabilitadas.bloquearSiRegimenNoCoincide) {
              estado.errores.push(mensaje);
              estado.valido = false;
              return estado;
            } else {
              estado.advertencias.push(mensaje);
            }
          } else {
            estado.regimenFiscalVerificado = true;
          }
        }
      }
    }

    // Validar UUID duplicado (solo si tiene UUID)
    if (cfdi.uuid && validacionesHabilitadas.validarUUIDDuplicado !== false) {
      const uuidDuplicado = await this.checkUUIDDuplicado(cfdi.uuid, profileId, "expense");
      estado.uuidDuplicado = uuidDuplicado;
      
      if (uuidDuplicado) {
        estado.errores.push(`El UUID (${cfdi.uuid}) ya existe en el sistema`);
        estado.valido = false;
        return estado;
      }
    }

    return estado;
  }

  /**
   * Verifica si un UUID ya existe en la base de datos
   * @param uuid UUID a verificar
   * @param profileId ID del perfil
   * @param tipo Tipo de registro a verificar ("invoice", "expense", o "both" para verificar en ambas)
   */
  async checkUUIDDuplicado(
    uuid: string,
    profileId: string,
    tipo: "invoice" | "expense" | "complement" | "both" = "both"
  ): Promise<boolean> {
    try {
      if (tipo === "both") {
        // Verificar en facturas, gastos y complementos
        const existingInvoice = await Invoice.findOne({
          where: { uuid, profile_id: profileId },
        });
        const existingExpense = await Expense.findOne({
          where: { uuid, profile_id: profileId },
        });
        const existingComplement = await PaymentComplement.findOne({
          where: { uuid, profile_id: profileId },
        });
        return !!(existingInvoice || existingExpense || existingComplement);
      } else if (tipo === "invoice") {
        const existing = await Invoice.findOne({
          where: { uuid, profile_id: profileId },
        });
        return !!existing;
      } else if (tipo === "complement") {
        const existing = await PaymentComplement.findOne({
          where: { uuid, profile_id: profileId },
        });
        return !!existing;
      } else {
        const existing = await Expense.findOne({
          where: { uuid, profile_id: profileId },
        });
        return !!existing;
      }
    } catch (error) {
      console.error("Error al verificar UUID duplicado:", error);
      // En caso de error, asumimos que no está duplicado para no bloquear
      return false;
    }
  }
}

