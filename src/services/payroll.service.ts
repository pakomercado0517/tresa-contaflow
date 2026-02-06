import { Payroll, Profile, Period } from "../database/models/index.js";
import { parsePayroll } from "../parsers/payroll.parser.js";
import { SubscriptionService } from "./subscription.service.js";

/**
 * Sube un XML de nómina: valida plugin (vía suscripción), parsea y guarda en payrolls.
 *
 * @param profile_id - UUID del perfil (debe pertenecer al usuario y tener plugin nómina en su suscripción)
 * @param period_id - UUID del período (debe pertenecer al perfil)
 * @param xmlBuffer - Contenido del archivo XML
 * @returns Payroll creado
 */
export async function uploadPayrollXML(
  profile_id: string,
  period_id: string,
  xmlBuffer: Buffer
): Promise<Payroll> {
  const profile = await Profile.findByPk(profile_id);
  if (!profile) {
    throw new Error("Perfil no encontrado");
  }

  const subscriptionService = new SubscriptionService();
  const hasAccess = await subscriptionService.hasPlugin(profile_id, "payroll");
  if (!hasAccess) {
    throw new Error("El perfil no tiene habilitado el plugin de nómina");
  }

  const period = await Period.findOne({
    where: { id: period_id, profile_id },
  });
  if (!period) {
    throw new Error("Período no encontrado o no pertenece al perfil");
  }

  const data = parsePayroll(xmlBuffer);

  const existing = await Payroll.findOne({
    where: { profile_id, uuid: data.uuid },
  });
  if (existing) {
    throw new Error(`Ya existe una nómina con el mismo UUID (CFDI) en este perfil`);
  }

  const payroll = await Payroll.create({
    profile_id,
    period_id,
    uuid: data.uuid,
    employee_rfc: data.receptor.rfc,
    fecha_pago: data.fecha_pago,
    percepciones_total: data.percepciones_total,
    deducciones_total: data.deducciones_total,
    neto_pagado: data.neto_pagado,
    xml_path: null,
  });

  return payroll;
}
