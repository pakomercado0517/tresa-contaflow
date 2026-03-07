import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import { cleanDatabase, closeDatabase } from "./helpers/test-db";
import { createTestUser } from "./helpers/test-helpers";
import {
  Profile,
  Period,
  Invoice,
  AccruedExpense,
  ManualIncome,
  PaymentComplement,
  ProfilePaymentComplement,
  PaymentComplementItem,
  Payroll,
} from "../database/models/index";
import { MetricsService } from "../services/metrics.service";

describe("MetricsService", () => {
  let userId: string;
  let profileId: string;
  let periodId: string;
  let metricsService: MetricsService;

  beforeAll(async () => {
    await cleanDatabase();
    const user = await createTestUser("metrics@example.com");
    userId = user.id;
    const profile = await Profile.create({
      user_id: userId,
      nombre: "Empresa Métricas",
      rfc: "MET123456ABC",
      tipo_persona: "MORAL",
      regimenes_fiscales: ["601"],
    });
    profileId = profile.id;
    const period = await Period.create({
      profile_id: profileId,
      start_date: new Date("2024-12-01"),
      end_date: new Date("2024-12-31"),
      name: "Diciembre 2024",
    });
    periodId = period.id;
    metricsService = new MetricsService();
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeDatabase();
  });

  async function cleanMetricsData(): Promise<void> {
    await Payroll.destroy({ where: { profile_id: profileId } });
    await ManualIncome.destroy({ where: { profile_id: profileId } });
    await PaymentComplementItem.destroy({ where: { profile_id: profileId } });
    await ProfilePaymentComplement.destroy({ where: { profile_id: profileId } });
    await PaymentComplement.destroy({ where: {} });
    await AccruedExpense.destroy({ where: { profile_id: profileId } });
    await Invoice.destroy({ where: { profile_id: profileId } });
  }

  describe("calculateIngresosCobrados (PUE + PPD con complementos)", () => {
    beforeEach(cleanMetricsData);

    it("suma subtotal de facturas PUE del período", async () => {
      await Invoice.create({
        profile_id: profileId,
        uuid: `PUE-${Date.now()}-1`,
        fecha: new Date("2024-12-10"),
        mes: 12,
        año: 2024,
        total: 1160,
        subtotal: 1000,
        iva: 160,
        iva_amount: 160,
        tipo: "PUE",
        rfc_emisor: "MET123456ABC",
        nombre_emisor: "Empresa",
        rfc_receptor: "CLI",
        nombre_receptor: "Cliente",
        pagos: [],
        validacion: {},
      });
      const result = await metricsService.calculateIngresosCobrados(profileId, periodId);
      expect(result).toBe(1000);
    });

    it("suma PUE + complementos PPD con fecha_pago en el período", async () => {
      await Invoice.create({
        profile_id: profileId,
        uuid: `PUE-${Date.now()}-1`,
        fecha: new Date("2024-12-05"),
        mes: 12,
        año: 2024,
        total: 1160,
        subtotal: 1000,
        iva: 160,
        iva_amount: 160,
        tipo: "PUE",
        rfc_emisor: "MET123456ABC",
        nombre_emisor: "Empresa",
        rfc_receptor: "CLI",
        nombre_receptor: "Cliente",
        pagos: [],
        validacion: {},
      });
      const ppdUuid = `PPD-${Date.now()}-1`;
      await Invoice.create({
        profile_id: profileId,
        uuid: ppdUuid,
        fecha: new Date("2024-12-15"),
        mes: 12,
        año: 2024,
        total: 2320,
        subtotal: 2000,
        iva: 320,
        iva_amount: 320,
        tipo: "PPD",
        rfc_emisor: "MET123456ABC",
        nombre_emisor: "Empresa",
        rfc_receptor: "CLI",
        nombre_receptor: "Cliente",
        pagos: [],
        validacion: {},
      });
      const complement = await PaymentComplement.create({
        uuid: `COMP-${Date.now()}`,
        fecha_emision: new Date("2024-12-20"),
        rfc_emisor: "MET123456ABC",
        rfc_receptor: "CLI",
        complemento_data: {},
      });
      await ProfilePaymentComplement.create({
        profile_id: profileId,
        complement_id: complement.id,
        role: "INGRESO",
      });
      await PaymentComplementItem.create({
        complement_id: complement.id,
        profile_id: profileId,
        factura_uuid: ppdUuid,
        fecha_pago: new Date("2024-12-20"),
        forma_pago: "03",
        moneda_pago: "MXN",
        tipo_cambio_pago: 1,
        monto_pago: 1000,
        num_operacion: null,
        moneda_dr: "MXN",
        tipo_cambio_dr: 1,
        metodo_pago_dr: "PPD",
        num_parcialidad: 1,
        imp_saldo_ant: 2000,
        imp_pagado: 1000,
        imp_saldo_insoluto: 1000,
      });
      const result = await metricsService.calculateIngresosCobrados(profileId, periodId);
      expect(result).toBe(2000);
    });
  });

  describe("calculateEgresosPagados (solo is_paid: true)", () => {
    beforeEach(cleanMetricsData);

    it("suma subtotal solo de gastos con is_paid true en el período", async () => {
      await AccruedExpense.create({
        profile_id: profileId,
        tipo_origen: "MANUAL",
        fecha: new Date("2024-12-10"),
        mes: 12,
        año: 2024,
        total: 116,
        subtotal: 100,
        iva: 16,
        iva_amount: 16,
        is_paid: true,
        concepto: "Gasto pagado",
        categoria: "Servicios",
      });
      await AccruedExpense.create({
        profile_id: profileId,
        tipo_origen: "MANUAL",
        fecha: new Date("2024-12-15"),
        mes: 12,
        año: 2024,
        total: 232,
        subtotal: 200,
        iva: 32,
        iva_amount: 32,
        is_paid: false,
        concepto: "Gasto no pagado",
        categoria: "Otros",
      });
      const result = await metricsService.calculateEgresosPagados(profileId, periodId);
      expect(result).toBe(100);
    });
  });

  describe("calculateIngresosDevengados (facturas + manual_incomes)", () => {
    beforeEach(cleanMetricsData);

    it("suma subtotal de facturas del período + manual_incomes del período", async () => {
      await Invoice.create({
        profile_id: profileId,
        uuid: `INV-${Date.now()}`,
        fecha: new Date("2024-12-10"),
        mes: 12,
        año: 2024,
        total: 1160,
        subtotal: 1000,
        iva: 160,
        iva_amount: 160,
        tipo: "PUE",
        rfc_emisor: "MET123456ABC",
        nombre_emisor: "Empresa",
        rfc_receptor: "CLI",
        nombre_receptor: "Cliente",
        pagos: [],
        validacion: {},
      });
      await ManualIncome.create({
        profile_id: profileId,
        period_id: periodId,
        concept: "Ingreso manual",
        subtotal: 500,
        fecha: new Date("2024-12-15"),
      });
      const result = await metricsService.calculateIngresosDevengados(profileId, periodId);
      expect(result).toBe(1500);
    });
  });

  describe("calculateIVATrasladado (cobrado vs devengado)", () => {
    beforeEach(cleanMetricsData);

    it("cobrado: IVA PUE + prorrateado PPD; devengado: todas facturas + manual_incomes", async () => {
      await Invoice.create({
        profile_id: profileId,
        uuid: `PUE-IVA-${Date.now()}`,
        fecha: new Date("2024-12-10"),
        mes: 12,
        año: 2024,
        total: 1160,
        subtotal: 1000,
        iva: 160,
        iva_amount: 160,
        tipo: "PUE",
        rfc_emisor: "MET123456ABC",
        nombre_emisor: "Empresa",
        rfc_receptor: "CLI",
        nombre_receptor: "Cliente",
        pagos: [],
        validacion: {},
      });
      const ppdUuid = `PPD-IVA-${Date.now()}`;
      await Invoice.create({
        profile_id: profileId,
        uuid: ppdUuid,
        fecha: new Date("2024-12-15"),
        mes: 12,
        año: 2024,
        total: 1160,
        subtotal: 1000,
        iva: 160,
        iva_amount: 160,
        tipo: "PPD",
        rfc_emisor: "MET123456ABC",
        nombre_emisor: "Empresa",
        rfc_receptor: "CLI",
        nombre_receptor: "Cliente",
        pagos: [],
        validacion: {},
      });
      const complement = await PaymentComplement.create({
        uuid: `COMP-IVA-${Date.now()}`,
        fecha_emision: new Date("2024-12-20"),
        rfc_emisor: "MET123456ABC",
        rfc_receptor: "CLI",
        complemento_data: {},
      });
      await ProfilePaymentComplement.create({
        profile_id: profileId,
        complement_id: complement.id,
        role: "INGRESO",
      });
      await PaymentComplementItem.create({
        complement_id: complement.id,
        profile_id: profileId,
        factura_uuid: ppdUuid,
        fecha_pago: new Date("2024-12-20"),
        forma_pago: "03",
        moneda_pago: "MXN",
        tipo_cambio_pago: 1,
        monto_pago: 580,
        num_operacion: null,
        moneda_dr: "MXN",
        tipo_cambio_dr: 1,
        metodo_pago_dr: "PPD",
        num_parcialidad: 1,
        imp_saldo_ant: 1160,
        imp_pagado: 580,
        imp_saldo_insoluto: 580,
      });
      await ManualIncome.create({
        profile_id: profileId,
        period_id: periodId,
        concept: "Manual con IVA",
        subtotal: 200,
        iva_amount: 32,
        fecha: new Date("2024-12-15"),
      });
      const result = await metricsService.calculateIVATrasladado(profileId, periodId);
      expect(result.devengado).toBe(352);
      expect(result.cobrado).toBeGreaterThanOrEqual(160);
      expect(result.cobrado).toBeLessThanOrEqual(352);
    });
  });

  describe("calculateRetenciones (con y sin)", () => {
    beforeEach(cleanMetricsData);

    it("retenciones con IVA e ISR en facturas", async () => {
      await Invoice.create({
        profile_id: profileId,
        uuid: `RET-${Date.now()}-1`,
        fecha: new Date("2024-12-10"),
        mes: 12,
        año: 2024,
        total: 1000,
        subtotal: 862.07,
        iva: 137.93,
        iva_amount: 137.93,
        retencion_iva_amount: 50,
        retencion_isr_amount: 100,
        tipo: "PUE",
        rfc_emisor: "MET123456ABC",
        nombre_emisor: "Empresa",
        rfc_receptor: "CLI",
        nombre_receptor: "Cliente",
        pagos: [],
        validacion: {},
      });
      const result = await metricsService.calculateRetenciones(profileId, periodId);
      expect(result.iva_cobrado).toBe(50);
      expect(result.iva_devengado).toBe(50);
      expect(result.isr_cobrado).toBe(100);
      expect(result.isr_devengado).toBe(100);
    });

    it("retenciones devengado incluye PPD; cobrado prorrateado si PPD parcial", async () => {
      await Invoice.create({
        profile_id: profileId,
        uuid: `RET-PUE-${Date.now()}`,
        fecha: new Date("2024-12-05"),
        mes: 12,
        año: 2024,
        total: 1000,
        subtotal: 862.07,
        iva: 137.93,
        iva_amount: 137.93,
        retencion_iva_amount: 20,
        retencion_isr_amount: 40,
        tipo: "PUE",
        rfc_emisor: "MET123456ABC",
        nombre_emisor: "Empresa",
        rfc_receptor: "CLI",
        nombre_receptor: "Cliente",
        pagos: [],
        validacion: {},
      });
      const ppdUuid = `RET-PPD-${Date.now()}`;
      await Invoice.create({
        profile_id: profileId,
        uuid: ppdUuid,
        fecha: new Date("2024-12-15"),
        mes: 12,
        año: 2024,
        total: 1000,
        subtotal: 862.07,
        iva: 137.93,
        iva_amount: 137.93,
        retencion_iva_amount: 30,
        retencion_isr_amount: 60,
        tipo: "PPD",
        rfc_emisor: "MET123456ABC",
        nombre_emisor: "Empresa",
        rfc_receptor: "CLI",
        nombre_receptor: "Cliente",
        pagos: [],
        validacion: {},
      });
      const complement = await PaymentComplement.create({
        uuid: `COMP-RET-${Date.now()}`,
        fecha_emision: new Date("2024-12-20"),
        rfc_emisor: "MET123456ABC",
        rfc_receptor: "CLI",
        complemento_data: {},
      });
      await ProfilePaymentComplement.create({
        profile_id: profileId,
        complement_id: complement.id,
        role: "INGRESO",
      });
      await PaymentComplementItem.create({
        complement_id: complement.id,
        profile_id: profileId,
        factura_uuid: ppdUuid,
        fecha_pago: new Date("2024-12-20"),
        forma_pago: "03",
        moneda_pago: "MXN",
        tipo_cambio_pago: 1,
        monto_pago: 500,
        num_operacion: null,
        moneda_dr: "MXN",
        tipo_cambio_dr: 1,
        metodo_pago_dr: "PPD",
        num_parcialidad: 1,
        imp_saldo_ant: 1000,
        imp_pagado: 500,
        imp_saldo_insoluto: 500,
      });
      const result = await metricsService.calculateRetenciones(profileId, periodId);
      expect(result.iva_devengado).toBe(50);
      expect(result.isr_devengado).toBe(100);
      expect(result.iva_cobrado).toBe(35);
      expect(result.isr_cobrado).toBe(70);
    });
  });

  describe("calculatePPDPorCobrar (sin complementos completos)", () => {
    beforeEach(cleanMetricsData);

    it("suma pendiente (subtotal+iva) prorrateado para PPD no cobrados completamente", async () => {
      const ppdUuid = `PPD-PEND-${Date.now()}`;
      await Invoice.create({
        profile_id: profileId,
        uuid: ppdUuid,
        fecha: new Date("2024-12-15"),
        mes: 12,
        año: 2024,
        total: 1000,
        subtotal: 862.07,
        iva: 137.93,
        iva_amount: 137.93,
        tipo: "PPD",
        rfc_emisor: "MET123456ABC",
        nombre_emisor: "Empresa",
        rfc_receptor: "CLI",
        nombre_receptor: "Cliente",
        pagos: [],
        validacion: {},
      });
      const complement = await PaymentComplement.create({
        uuid: `COMP-PEND-${Date.now()}`,
        fecha_emision: new Date("2024-12-20"),
        rfc_emisor: "MET123456ABC",
        rfc_receptor: "CLI",
        complemento_data: {},
      });
      await ProfilePaymentComplement.create({
        profile_id: profileId,
        complement_id: complement.id,
        role: "INGRESO",
      });
      await PaymentComplementItem.create({
        complement_id: complement.id,
        profile_id: profileId,
        factura_uuid: ppdUuid,
        fecha_pago: new Date("2024-12-20"),
        forma_pago: "03",
        moneda_pago: "MXN",
        tipo_cambio_pago: 1,
        monto_pago: 400,
        num_operacion: null,
        moneda_dr: "MXN",
        tipo_cambio_dr: 1,
        metodo_pago_dr: "PPD",
        num_parcialidad: 1,
        imp_saldo_ant: 1000,
        imp_pagado: 400,
        imp_saldo_insoluto: 600,
      });
      const result = await metricsService.calculatePPDPorCobrar(profileId, periodId);
      expect(result).toBe(600);
    });
  });

  describe("getMetrics (integración: período completo)", () => {
    beforeEach(cleanMetricsData);

    it("retorna estructura completa con flujo, devengado, impuestos y pendientes", async () => {
      await Invoice.create({
        profile_id: profileId,
        uuid: `INT-PUE-${Date.now()}`,
        fecha: new Date("2024-12-10"),
        mes: 12,
        año: 2024,
        total: 1160,
        subtotal: 1000,
        iva: 160,
        iva_amount: 160,
        retencion_iva_amount: 10,
        retencion_isr_amount: 20,
        tipo: "PUE",
        rfc_emisor: "MET123456ABC",
        nombre_emisor: "Empresa",
        rfc_receptor: "CLI",
        nombre_receptor: "Cliente",
        pagos: [],
        validacion: {},
      });
      await AccruedExpense.create({
        profile_id: profileId,
        tipo_origen: "MANUAL",
        fecha: new Date("2024-12-12"),
        mes: 12,
        año: 2024,
        total: 116,
        subtotal: 100,
        iva: 16,
        iva_amount: 16,
        is_paid: true,
        concepto: "Gasto",
        categoria: "Servicios",
      });
      await ManualIncome.create({
        profile_id: profileId,
        period_id: periodId,
        concept: "Manual",
        subtotal: 300,
        iva_amount: 48,
        fecha: new Date("2024-12-15"),
      });
      const result = await metricsService.getMetrics(profileId, periodId);
      expect(result).not.toBeNull();
      expect(result!.period.id).toBe(periodId);
      expect(result!.period.start).toBeDefined();
      expect(result!.period.end).toBeDefined();
      expect(result!.flujo).toHaveProperty("ingresos_cobrados");
      expect(result!.flujo).toHaveProperty("egresos_pagados");
      expect(result!.flujo).toHaveProperty("flujo_neto");
      expect(result!.devengado).toHaveProperty("ingresos_devengados");
      expect(result!.devengado).toHaveProperty("egresos_devengados");
      expect(result!.devengado).toHaveProperty("resultado_devengado");
      expect(result!.impuestos).toHaveProperty("iva_trasladado");
      expect(result!.impuestos).toHaveProperty("iva_acreditable");
      expect(result!.impuestos).toHaveProperty("retenciones_iva");
      expect(result!.impuestos).toHaveProperty("retenciones_isr");
      expect(result!.pendientes).toHaveProperty("por_cobrar");
      expect(result!.pendientes).toHaveProperty("por_pagar");
      expect(result!.nomina).toHaveProperty("total_pagada");
      expect(result!.nomina).toHaveProperty("percepciones");
      expect(result!.nomina).toHaveProperty("deducciones");
      expect(result!.nomina).toHaveProperty("cantidad_empleados");
      expect(result!.flujo.ingresos_cobrados).toBe(1000);
      expect(result!.flujo.egresos_pagados).toBe(100);
      expect(result!.flujo.flujo_neto).toBe(900);
      expect(result!.devengado.ingresos_devengados).toBe(1300);
      expect(result!.devengado.egresos_devengados).toBe(100);
      expect(result!.devengado.resultado_devengado).toBe(1200);
    });

    it("retorna null si el período no existe o no pertenece al perfil", async () => {
      const fakePeriodId = "00000000-0000-0000-0000-000000000000";
      const result = await metricsService.getMetrics(profileId, fakePeriodId);
      expect(result).toBeNull();
    });
  });

  describe("métricas incluyen nómina pagada", () => {
    beforeEach(cleanMetricsData);

    it("getMetrics incluye nomina con total_pagada, percepciones, deducciones y cantidad_empleados", async () => {
      await Payroll.create({
        profile_id: profileId,
        period_id: periodId,
        uuid: `NOM-${Date.now()}-1`,
        employee_rfc: "EMP001",
        fecha_pago: new Date("2024-12-10"),
        percepciones_total: 10000,
        deducciones_total: 1500,
        neto_pagado: 8500,
      });
      await Payroll.create({
        profile_id: profileId,
        period_id: periodId,
        uuid: `NOM-${Date.now()}-2`,
        employee_rfc: "EMP002",
        fecha_pago: new Date("2024-12-15"),
        percepciones_total: 12000,
        deducciones_total: 2000,
        neto_pagado: 10000,
      });
      await Payroll.create({
        profile_id: profileId,
        period_id: periodId,
        uuid: `NOM-${Date.now()}-3`,
        employee_rfc: "EMP001",
        fecha_pago: new Date("2024-12-20"),
        percepciones_total: 8000,
        deducciones_total: 1000,
        neto_pagado: 7000,
      });

      const result = await metricsService.getMetrics(profileId, periodId);
      expect(result).not.toBeNull();
      expect(result!.nomina.total_pagada).toBe(25500);
      expect(result!.nomina.percepciones).toBe(30000);
      expect(result!.nomina.deducciones).toBe(4500);
      expect(result!.nomina.cantidad_empleados).toBe(2);
    });
  });
});
