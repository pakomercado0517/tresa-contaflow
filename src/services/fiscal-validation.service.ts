import type { CFDI } from "../types/cfdi.types.js";
import type { EstadoValidacionCFDI, EstadoValidacionGasto, EstadoValidacionComplemento, ValidacionesConfig } from "../types/validation.types.js";
import { compareRFCs, isValidRFCFormat, normalizeRFC } from "../utils/rfc.util.js";
import { Invoice, AccruedExpense, PaymentComplement, ProfilePaymentComplement } from "../database/models/index.js";
import { Op } from "sequelize";

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
    profileRegimenesFiscales: string[],
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

        // Si la validación de régimen está habilitada, el perfil debe tener al menos un régimen configurado
        if (validacionesHabilitadas.validarRegimenFiscal !== false) {
          if (profileRegimenesFiscales.length === 0) {
            estado.errores.push(
              "El perfil no tiene regímenes fiscales configurados. Configure al menos un régimen fiscal en el perfil para poder subir facturas de ingreso."
            );
            estado.valido = false;
            return estado;
          }

          // El régimen de la factura debe estar en la lista del perfil. Se bloquea si no coincide.
          const regimenIncluido = profileRegimenesFiscales.includes(cfdi.regimenFiscalEmisor ?? "");
          if (!regimenIncluido) {
            const mensaje = `El régimen fiscal de la factura (${cfdi.regimenFiscalEmisor ?? "no especificado"}) no está entre los regímenes del perfil (${profileRegimenesFiscales.join(", ")}). Configure el perfil con los regímenes correctos o agregue este régimen para poder subir la factura.`;
            estado.errores.push(mensaje);
            estado.valido = false;
            return estado;
          }
          estado.regimenFiscalVerificado = true;
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
    profileRegimenesFiscales: string[],
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

        // Si la validación de régimen está habilitada, el perfil debe tener al menos un régimen configurado
        if (validacionesHabilitadas.validarRegimenFiscal !== false) {
          if (profileRegimenesFiscales.length === 0) {
            estado.errores.push(
              "El perfil no tiene regímenes fiscales configurados. Configure al menos un régimen fiscal en el perfil para poder subir gastos."
            );
            estado.valido = false;
            return estado;
          }

          // El régimen del gasto debe estar en la lista del perfil. Se bloquea si no coincide.
          const regimenIncluido = profileRegimenesFiscales.includes(cfdi.regimenFiscalReceptor ?? "");
          if (!regimenIncluido) {
            const mensaje = `El régimen fiscal del gasto (${cfdi.regimenFiscalReceptor ?? "no especificado"}) no está entre los regímenes del perfil (${profileRegimenesFiscales.join(", ")}). Configure el perfil con los regímenes correctos o agregue este régimen para poder subir el gasto.`;
            estado.errores.push(mensaje);
            estado.valido = false;
            return estado;
          }
          estado.regimenFiscalVerificado = true;
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
   * Valida un complemento de pago contra un perfil
   * Valida UUID duplicado y RFC según el tipo de factura relacionada
   */
  async validateComplementoPago(
    cfdi: CFDI,
    profileId: string,
    profileRFC: string
  ): Promise<EstadoValidacionComplemento> {
    const estado: EstadoValidacionComplemento = {
      rfcVerificado: false,
      uuidDuplicado: false,
      advertencias: [],
      errores: [],
      valido: true,
    };

    if (!cfdi.complementoPago) {
      estado.errores.push("El CFDI no contiene un complemento de pago");
      estado.valido = false;
      return estado;
    }

    // 1. Validar UUID duplicado (global, sin profile_id)
    try {
      const uuidDuplicado = await this.checkUUIDDuplicado(cfdi.uuid, profileId, "complement");
      estado.uuidDuplicado = uuidDuplicado;
      
      if (uuidDuplicado) {
        estado.errores.push(`El complemento de pago con UUID ${cfdi.uuid} ya existe en el sistema`);
        estado.valido = false;
        return estado;
      }
    } catch (error) {
      console.error("Error al verificar UUID duplicado:", error);
      estado.errores.push(
        error instanceof Error 
          ? `Error al verificar UUID duplicado: ${error.message}`
          : "Error desconocido al verificar UUID duplicado"
      );
      estado.valido = false;
      return estado;
    }

    // 2. Validar RFC según el tipo de factura relacionada
    // Obtener todos los UUIDs de facturas relacionadas
    const facturasUUIDs: string[] = [];
    for (const pago of cfdi.complementoPago.pagos) {
      for (const facturaRel of pago.facturasRelacionadas) {
        if (facturaRel.uuid) {
          facturasUUIDs.push(facturaRel.uuid);
        }
      }
    }

    if (facturasUUIDs.length === 0) {
      // Si no hay facturas relacionadas en el XML, no podemos validar RFC
      estado.errores.push(
        "El complemento de pago no tiene facturas relacionadas. No se puede validar que corresponda al perfil."
      );
      estado.rfcVerificado = false;
      estado.valido = false;
      return estado;
    }

    // Buscar facturas en invoices y expenses
    const facturasInvoice = await Invoice.findAll({
      where: {
        uuid: { [Op.in]: facturasUUIDs },
        profile_id: profileId,
        tipo: "PPD",
      },
    });

    const facturasAccruedExpense = await AccruedExpense.findAll({
      where: {
        uuid: { [Op.in]: facturasUUIDs },
        profile_id: profileId,
        tipo: "PPD",
      },
    });

    // Validar RFC según el tipo de factura encontrada
    let rfcValido = false;
    const erroresRFC: string[] = [];

    // Si hay facturas de ingreso (invoices), el RFC del perfil debe coincidir con el RFC emisor del complemento
    // (quien emite el complemento = quien emitió la factura = el perfil)
    if (facturasInvoice.length > 0) {
      const rfcCoincide = compareRFCs(cfdi.rfcEmisor, profileRFC);
      if (rfcCoincide) {
        rfcValido = true;
      } else {
        erroresRFC.push(
          `El RFC del emisor del complemento (${cfdi.rfcEmisor}) no coincide con el RFC del perfil (${profileRFC}). ` +
          `El complemento está relacionado con ${facturasInvoice.length} factura(s) de ingreso donde el perfil es el emisor.`
        );
      }
    }

    // Si hay gastos (expenses), el RFC del perfil debe coincidir con el RFC receptor del complemento
    // (quien recibe el complemento = quien recibió el gasto = el perfil)
    if (facturasAccruedExpense.length > 0) {
      const rfcCoincide = compareRFCs(cfdi.rfcReceptor, profileRFC);
      if (rfcCoincide) {
        rfcValido = true;
      } else {
        erroresRFC.push(
          `El RFC del receptor del complemento (${cfdi.rfcReceptor}) no coincide con el RFC del perfil (${profileRFC}). ` +
          `El complemento está relacionado con ${facturasAccruedExpense.length} gasto(s) donde el perfil es el receptor.`
        );
      }
    }

    // Si hay ambos tipos, ambos RFCs deben coincidir
    // Para invoices: el perfil es el emisor del complemento (cfdi.rfcEmisor)
    // Para expenses: el perfil es el receptor del complemento (cfdi.rfcReceptor)
    if (facturasInvoice.length > 0 && facturasAccruedExpense.length > 0) {
      const rfcEmisorCoincide = compareRFCs(cfdi.rfcEmisor, profileRFC);
      const rfcReceptorCoincide = compareRFCs(cfdi.rfcReceptor, profileRFC);
      
      if (rfcEmisorCoincide && rfcReceptorCoincide) {
        rfcValido = true;
      } else {
        if (!rfcEmisorCoincide) {
          erroresRFC.push(
            `El RFC del emisor del complemento (${cfdi.rfcEmisor}) no coincide con el RFC del perfil (${profileRFC}). ` +
            `El complemento está relacionado con facturas de ingreso.`
          );
        }
        if (!rfcReceptorCoincide) {
          erroresRFC.push(
            `El RFC del receptor del complemento (${cfdi.rfcReceptor}) no coincide con el RFC del perfil (${profileRFC}). ` +
            `El complemento está relacionado con gastos.`
          );
        }
      }
    }

    // Si no se encontraron facturas relacionadas en la BD, validar RFC del complemento
    // para asegurar que corresponde al perfil correcto
    // Verificar que al menos uno de los RFCs del complemento coincida con el perfil
    // (puede ser emisor si es para invoices, o receptor si es para expenses)
    if (facturasInvoice.length === 0 && facturasAccruedExpense.length === 0) {
      const rfcEmisorCoincide = compareRFCs(cfdi.rfcEmisor, profileRFC);
      const rfcReceptorCoincide = compareRFCs(cfdi.rfcReceptor, profileRFC);
      
      if (!rfcEmisorCoincide && !rfcReceptorCoincide) {
        // Ningún RFC coincide, el complemento no corresponde a este perfil
        estado.errores.push(
          `El complemento de pago no corresponde al perfil ${profileRFC}. ` +
          `El RFC del emisor (${cfdi.rfcEmisor}) y el RFC del receptor (${cfdi.rfcReceptor}) ` +
          `no coinciden con el RFC del perfil. ` +
          `No se encontraron facturas relacionadas en la base de datos para los UUIDs: ${facturasUUIDs.join(", ")}. ` +
          `Por favor, selecciona el perfil correcto o sube primero las facturas relacionadas.`
        );
        estado.rfcVerificado = false;
        estado.valido = false;
      } else {
        // Al menos un RFC coincide, el complemento corresponde al perfil
        // Pero las facturas relacionadas aún no se han subido
        rfcValido = true;
        estado.rfcVerificado = true;
        estado.advertencias.push(
          `No se encontraron facturas relacionadas en la base de datos para los UUIDs: ${facturasUUIDs.join(", ")}. ` +
          `El complemento se guardará pero no se aplicará a ninguna factura hasta que se suban las facturas relacionadas.`
        );
      }
    }

    estado.rfcVerificado = rfcValido;
    if (erroresRFC.length > 0) {
      estado.errores.push(...erroresRFC);
      estado.valido = false;
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
        const existingInvoice = await Invoice.findOne({
          where: { uuid, profile_id: profileId },
        });
        const existingAccruedExpense = await AccruedExpense.findOne({
          where: { uuid, profile_id: profileId },
        });
        const existingLink = await ProfilePaymentComplement.findOne({
          where: { profile_id: profileId },
          include: [{
            model: PaymentComplement,
            as: "complement",
            where: { uuid },
            required: true,
          }],
        });
        return !!(existingInvoice || existingAccruedExpense || existingLink);
      } else if (tipo === "invoice") {
        const existing = await Invoice.findOne({
          where: { uuid, profile_id: profileId },
        });
        return !!existing;
      } else if (tipo === "complement") {
        const existing = await ProfilePaymentComplement.findOne({
          where: { profile_id: profileId },
          include: [{
            model: PaymentComplement,
            as: "complement",
            where: { uuid },
            required: true,
          }],
        });
        return !!existing;
      } else {
        const existing = await AccruedExpense.findOne({
          where: { uuid, profile_id: profileId },
        });
        return !!existing;
      }
    } catch (error) {
      console.error("Error al verificar UUID duplicado:", error);
      // Si hay un error de BD, es mejor lanzar el error para que se maneje apropiadamente
      // en lugar de asumir que no está duplicado (lo cual podría causar problemas)
      // Solo retornamos false si es un error que realmente indica que no está duplicado
      if (error instanceof Error) {
        // Si es un error de conexión o similar, lanzar el error
        // Si es un error que indica que no existe, retornar false
        throw new Error(`Error al verificar UUID duplicado: ${error.message}`);
      }
      throw error;
    }
  }
}

