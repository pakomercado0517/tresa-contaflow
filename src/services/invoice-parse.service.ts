import { AccruedExpense, Invoice } from '../database/models/index.js';
import Profile from '../database/models/Profile.model.js';
import { AppError } from '../utils/AppError.js';
import { parseInvoice } from '../parsers/invoice.parser.js';
import { FiscalValidationService } from './fiscal-validation.service.js';
import { PaymentMatchingService } from './payment-matching.service.js';
import { invalidateProfileCache } from './cache.service.js';
import type {
  EstadoValidacionCFDI,
  EstadoValidacionGasto,
  ValidacionesConfig,
} from '../types/validation.types.js';
import type { MatchingResult } from '../types/matching.types.js';
import type { ParsedXmlResponse } from '../types/parser.types.js';
import type { CFDI } from '../types/cfdi.types.js';
import { UniqueConstraintError } from 'sequelize';
import { calcularEstadoPagoFactura, calcularEstadoPagoGasto } from './payment-status.service.js';
import {
  applyPaymentsToExpense,
  applyPaymentsToInvoice,
  saveComplemento,
} from './payment-complement.service.js';

const validationService = new FiscalValidationService();
const matchingService = new PaymentMatchingService();

type ParsedCfdi = ReturnType<typeof parseInvoice>;

/**
 * Valida un CFDI de complemento de pago y, si es válido, busca sus matches.
 */
async function resolveComplementoPago(
  cfdi: ParsedCfdi,
  profileId: string,
  profileRfc: string
): Promise<{ validacion: EstadoValidacionCFDI; matching: MatchingResult | null }> {
  const complemento = await validationService.validateComplementoPago(cfdi, profileId, profileRfc);

  const validacion: EstadoValidacionCFDI = {
    rfcVerificado: complemento.rfcVerificado,
    regimenFiscalVerificado: true,
    uuidDuplicado: complemento.uuidDuplicado,
    advertencias: complemento.advertencias,
    errores: complemento.errores,
    valido: complemento.valido,
  };

  // Guard: si la validación no pasó, no tiene sentido buscar matches
  if (!validacion.valido) {
    return { validacion, matching: null };
  }
  const matching = await matchingService.buscarMatchesComplemento(cfdi, profileId);
  return { validacion, matching };
}

/**
 * Determina la validación fiscal de una factura normal según el perfil actúe
 * como emisor (ingreso) o receptor (gasto).
 */
async function resolveFacturaValidacion(
  cfdi: ParsedCfdi,
  profile: Profile,
  validacionesConfig: ValidacionesConfig
): Promise<EstadoValidacionCFDI | EstadoValidacionGasto> {
  // Guard: el perfil es el emisor -> factura de ingreso
  if (cfdi.rfcEmisor === profile.rfc) {
    return validationService.validateFacturaIngreso(
      cfdi,
      profile.id,
      profile.rfc,
      profile.regimenes_fiscales,
      validacionesConfig
    );
  }

  // Guard: el perfil es el receptor -> gasto
  if (cfdi.rfcReceptor === profile.rfc) {
    return validationService.validateGasto(
      cfdi,
      profile.id,
      profile.rfc,
      profile.regimenes_fiscales,
      validacionesConfig
    );
  }

  // El CFDI no corresponde al perfil ni como emisor ni como receptor
  return {
    rfcVerificado: false,
    regimenFiscalVerificado: false,
    uuidDuplicado: false,
    advertencias: [],
    errores: [`El CFDI no corresponde al perfil ${profile.rfc} ni como emisor ni como receptor.`],
    valido: false,
  };
}

const normalizeXmlBuffer = (fileData: Buffer) => {
  return Buffer.isBuffer(fileData) ? fileData : Buffer.from(fileData as ArrayBuffer);
};

function getPrimaryValidationError(validacion: EstadoValidacionCFDI | EstadoValidacionGasto) {
  return validacion.errores.length > 0 ? validacion.errores[0] : null;
}

async function saveInvoice(
  cfdi: CFDI,
  profileId: string,
  validacion: EstadoValidacionCFDI
): Promise<Invoice> {
  const invoice = await Invoice.create({
    profile_id: profileId,
    uuid: cfdi.uuid,
    fecha: cfdi.fecha,
    mes: cfdi.mes,
    año: cfdi.año,
    total: cfdi.total,
    subtotal: cfdi.subtotal,
    iva: cfdi.iva,
    iva_amount: cfdi.iva_amount ?? cfdi.iva,
    retencion_iva_amount: cfdi.retencion_iva_amount ?? 0,
    retencion_isr_amount: cfdi.retencion_isr_amount ?? 0,
    tipo: cfdi.tipo,
    rfc_emisor: cfdi.rfcEmisor,
    nombre_emisor: cfdi.nombreEmisor,
    regimen_fiscal_emisor: cfdi.regimenFiscalEmisor || null,
    rfc_receptor: cfdi.rfcReceptor,
    nombre_receptor: cfdi.nombreReceptor,
    regimen_fiscal_receptor: cfdi.regimenFiscalReceptor || null,
    concepto: cfdi.concepto || null,
    pagos: cfdi.pagos || [],
    complemento_pago: cfdi.complementoPago || null,
    validacion,
  });

  await invalidateProfileCache(profileId);
  return invoice;
}

async function saveExpense(
  cfdi: CFDI,
  profileId: string,
  validacion: EstadoValidacionGasto
): Promise<AccruedExpense> {
  const isPUE = cfdi.tipo === 'PUE';

  const expense = await AccruedExpense.create({
    profile_id: profileId,
    tipo_origen: 'XML',
    fecha: cfdi.fecha,
    mes: cfdi.mes,
    año: cfdi.año,
    total: cfdi.total,
    subtotal: cfdi.subtotal,
    iva: cfdi.iva,
    iva_amount: cfdi.iva_amount ?? cfdi.iva,
    retencion_iva_amount: cfdi.retencion_iva_amount ?? 0,
    retencion_isr_amount: cfdi.retencion_isr_amount ?? 0,
    is_paid: isPUE,
    payment_date: isPUE ? cfdi.fecha : null,
    concepto: cfdi.concepto || null,
    categoria: null,
    uuid: cfdi.uuid,
    tipo: cfdi.tipo,
    rfc_emisor: cfdi.rfcEmisor,
    nombre_emisor: cfdi.nombreEmisor,
    regimen_fiscal_emisor: cfdi.regimenFiscalEmisor || null,
    rfc_receptor: cfdi.rfcReceptor,
    nombre_receptor: cfdi.nombreReceptor,
    regimen_fiscal_receptor: cfdi.regimenFiscalReceptor || null,
    pagos: cfdi.pagos || [],
    complemento_pago: cfdi.complementoPago || null,
    validacion,
  });

  await invalidateProfileCache(profileId);
  return expense;
}

export const invoiceParseXmlForProfile = async (
  userId: string,
  profileId: string,
  fileData: Buffer
): Promise<ParsedXmlResponse> => {
  const profile = await Profile.findOne({ where: { id: profileId, user_id: userId } });
  if (!profile) throw new AppError('Perfil no encontrado', 404);

  const xmlBuffer = normalizeXmlBuffer(fileData);

  const cfdi = parseInvoice(xmlBuffer);
  const validacionesConfig = (profile.validaciones_habilitadas || {}) as ValidacionesConfig;

  let validacion: EstadoValidacionCFDI;
  let matching: MatchingResult | null = null;

  if (cfdi.tipo === 'COMPLEMENTO_PAGO') {
    const resultado = await resolveComplementoPago(cfdi, profileId, profile.rfc);
    validacion = resultado.validacion;
    matching = resultado.matching;
  } else {
    validacion = await resolveFacturaValidacion(cfdi, profile, validacionesConfig);
  }

  return {
    message: 'XML parseado exitosamente',
    data: cfdi,
    validacion,
    matching,
    profile: {
      id: profile.id,
      nombre: profile.nombre,
      rfc: profile.rfc,
      regimenes_fiscales: profile.regimenes_fiscales,
    },
  };
};

export const uploadInvoiceService = async (userId: string, profileId: string, fileData: Buffer) => {
  const profile = await Profile.findOne({ where: { id: profileId, user_id: userId } });
  if (!profile) throw new AppError('Perfil no encontrado', 404);

  const xmlBuffer = normalizeXmlBuffer(fileData);
  const cfdi = parseInvoice(xmlBuffer);
  const validacionesConfig = (profile.validaciones_habilitadas || {}) as ValidacionesConfig;
  let validacion: EstadoValidacionCFDI | EstadoValidacionGasto;
  let matching: MatchingResult | null = null;

  if (cfdi.tipo === 'COMPLEMENTO_PAGO') {
    const resultado = await resolveComplementoPago(cfdi, profileId, profile.rfc);
    validacion = resultado.validacion;
    matching = resultado.matching;

    if (!validacion.valido) {
      throw new AppError(
        getPrimaryValidationError(validacion) || 'El complemento de pago no es válido',
        400
      );
    }

    try {
      const savedComplement = await saveComplemento(cfdi, profileId, profile.rfc);

      return {
        message: 'Complemento de pago procesado exitosamente',
        data: cfdi,
        validacion,
        matching,
        saved: true,
        complementId: savedComplement.id,
      };
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new AppError(`El UUID ${cfdi.uuid} ya fue procesado anteriormente`, 409);
      }
      throw error;
    }
  }

  const isInvoice = cfdi.rfcEmisor === profile.rfc;
  const isExpense = cfdi.rfcReceptor === profile.rfc;

  validacion = await resolveFacturaValidacion(cfdi, profile, validacionesConfig);

  if (!validacion.valido) {
    throw new AppError(
      getPrimaryValidationError(validacion) || 'El CFDI no pasó las validaciones fiscales',
      400
    );
  }

  try {
    let savedRecord: Invoice | AccruedExpense;

    if (isInvoice) {
      savedRecord = await saveInvoice(cfdi, profileId, validacion as EstadoValidacionCFDI);
    } else if (isExpense) {
      savedRecord = await saveExpense(cfdi, profileId, validacion as EstadoValidacionGasto);
    } else {
      throw new AppError('No se pudo determinar el tipo de CFDI', 400);
    }

    if (savedRecord instanceof Invoice && savedRecord.tipo === 'PPD') {
      await applyPaymentsToInvoice(savedRecord, profileId);
    } else if (savedRecord instanceof AccruedExpense && savedRecord.tipo === 'PPD') {
      await applyPaymentsToExpense(savedRecord, profileId);
    }

    const estadoPago =
      savedRecord instanceof Invoice
        ? await calcularEstadoPagoFactura(savedRecord, profileId)
        : await calcularEstadoPagoGasto(savedRecord, profileId);

    return {
      message: isInvoice ? 'Factura guardada exitosamente' : 'Gasto guardado exitosamente',
      data: savedRecord,
      estadoPago,
      validacion,
      tipo: isInvoice ? 'factura' : 'gasto',
    };
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      const field = error.errors[0]?.path || 'campo';
      const value = error.errors[0]?.value || 'valor';
      throw new AppError(`El ${field} (${value}) ya fue procesado anteriormente`, 409);
    }

    if (
      error instanceof Error &&
      (error.message.includes('duplicate key') || error.message.includes('unique constraint'))
    ) {
      throw new AppError('Este UUID ya fue procesado anteriormente', 409);
    }

    throw error;
  }
};
