/**
 * Tests Fase 6.7: plugins - subscription con plugin, middleware, endpoint GET /api/plugins.
 */
import { describe, it, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../server";
import { cleanDatabase, closeDatabase } from "./helpers/test-db";
import {
  createTestUser,
  generateTestTokens,
  expectSuccess,
  expectError,
} from "./helpers/test-helpers";
import {
  Plugin,
  Subscription,
  SubscriptionPlugin,
  Profile,
  Period,
} from "../database/models/index";
import { PluginService } from "../services/plugin.service";
import { SubscriptionService } from "../services/subscription.service";

/** Crea o obtiene el plugin por nombre (para tests que dependen del catálogo). */
async function ensurePlugin(
  name: string,
  display_name: string,
  is_available: boolean = true
): Promise<Plugin> {
  const [plugin] = await Plugin.findOrCreate({
    where: { name },
    defaults: { display_name, description: null, is_available },
  });
  return plugin;
}

describe("Plugins - Subscription y middleware", () => {
  let userWithPluginId: string;
  let userWithPluginToken: string;
  let userWithoutPluginId: string;
  let userWithoutPluginToken: string;
  let profileWithPluginId: string;
  let subscriptionId: string;
  let pluginPayrollId: string;

  beforeAll(async () => {
    await cleanDatabase();

    await ensurePlugin("payroll", "Procesamiento de Nómina", true);
    await ensurePlugin("credit_notes", "Notas de Crédito", false);
    const payrollPlugin = await Plugin.findOne({ where: { name: "payroll" } });
    expect(payrollPlugin).not.toBeNull();
    pluginPayrollId = payrollPlugin!.id;

    const userWith = await createTestUser("plugins-with@example.com");
    userWithPluginId = userWith.id;
    userWithPluginToken = generateTestTokens(userWithPluginId, "plugins-with@example.com").accessToken;

    const profileWith = await Profile.create({
      user_id: userWithPluginId,
      nombre: "Perfil Con Plugin",
      rfc: "PCP123456ABC",
      tipo_persona: "MORAL",
      regimenes_fiscales: ["601"],
      validaciones_habilitadas: {},
    });
    profileWithPluginId = profileWith.id;

    const sub = await Subscription.create({
      user_id: userWithPluginId,
      plan: "BASIC",
      plan_price: 300,
      status: "ACTIVE",
      current_period_start: new Date(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancel_at_period_end: false,
    });
    subscriptionId = sub.id;

    await SubscriptionPlugin.create({
      subscription_id: subscriptionId,
      plugin_id: pluginPayrollId,
      enabled: true,
    });

    const userWithout = await createTestUser("plugins-without@example.com");
    userWithoutPluginId = userWithout.id;
    userWithoutPluginToken = generateTestTokens(
      userWithoutPluginId,
      "plugins-without@example.com"
    ).accessToken;
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeDatabase();
  });

  describe("Crear subscription con plugin 'payroll' habilitado", () => {
    it("hasPluginForUser retorna true para usuario con suscripción activa y plugin payroll", async () => {
      const service = new SubscriptionService();
      const result = await service.hasPluginForUser(userWithPluginId, "payroll");
      expect(result).toBe(true);
    });

    it("hasPluginForUser retorna false para usuario sin suscripción activa", async () => {
      const service = new SubscriptionService();
      const result = await service.hasPluginForUser(userWithoutPluginId, "payroll");
      expect(result).toBe(false);
    });

    it("hasPlugin retorna true para perfil cuyo usuario tiene plugin payroll", async () => {
      const service = new SubscriptionService();
      const result = await service.hasPlugin(profileWithPluginId, "payroll");
      expect(result).toBe(true);
    });
  });

  describe("Middleware checkPlugin('payroll')", () => {
    it("permite acceso a GET /api/payrolls cuando el usuario tiene plugin payroll", async () => {
      const res = await request(app)
        .get("/api/payrolls")
        .set("Authorization", `Bearer ${userWithPluginToken}`);
      expectSuccess(res, 200);
      expect(res.body).toHaveProperty("data");
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("bloquea acceso con 403 a GET /api/payrolls cuando el usuario no tiene plugin payroll", async () => {
      const res = await request(app)
        .get("/api/payrolls")
        .set("Authorization", `Bearer ${userWithoutPluginToken}`);
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty("error", "Plugin no disponible");
      expect(res.body).toHaveProperty("message");
      expect(String(res.body.message)).toContain("payroll");
    });
  });

  describe("GET /api/plugins", () => {
    it("retorna lista de plugins con enabled true para payroll cuando el usuario tiene suscripción con plugin", async () => {
      const res = await request(app)
        .get("/api/plugins")
        .set("Authorization", `Bearer ${userWithPluginToken}`);
      expectSuccess(res, 200);
      expect(res.body).toHaveProperty("plugins");
      expect(Array.isArray(res.body.plugins)).toBe(true);
      const payroll = res.body.plugins.find((p: { name: string }) => p.name === "payroll");
      expect(payroll).toBeDefined();
      expect(payroll).toHaveProperty("display_name");
      expect(payroll.enabled).toBe(true);
      const creditNotes = res.body.plugins.find((p: { name: string }) => p.name === "credit_notes");
      expect(creditNotes).toBeDefined();
      expect(creditNotes.enabled).toBe(false);
    });

    it("retorna lista de plugins con enabled false cuando el usuario no tiene suscripción activa", async () => {
      const res = await request(app)
        .get("/api/plugins")
        .set("Authorization", `Bearer ${userWithoutPluginToken}`);
      expectSuccess(res, 200);
      expect(res.body).toHaveProperty("plugins");
      const payroll = res.body.plugins.find((p: { name: string }) => p.name === "payroll");
      expect(payroll).toBeDefined();
      expect(payroll.enabled).toBe(false);
    });
  });

  describe("GET /api/profiles/:id/plugins", () => {
    it("retorna plugins del perfil cuando el perfil pertenece al usuario", async () => {
      const res = await request(app)
        .get(`/api/profiles/${profileWithPluginId}/plugins`)
        .set("Authorization", `Bearer ${userWithPluginToken}`);
      expectSuccess(res, 200);
      expect(res.body).toHaveProperty("plugins");
      const payroll = res.body.plugins.find((p: { name: string }) => p.name === "payroll");
      expect(payroll).toBeDefined();
      expect(payroll.enabled).toBe(true);
    });

    it("retorna 404 cuando el perfil no existe o no pertenece al usuario", async () => {
      const fakeId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
      const res = await request(app)
        .get(`/api/profiles/${fakeId}/plugins`)
        .set("Authorization", `Bearer ${userWithPluginToken}`);
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error", "Perfil no encontrado");
    });
  });

  describe("PluginService.getPluginsWithEnabledForUser", () => {
    it("incluye enabled true para plugin payroll cuando la suscripción lo tiene", async () => {
      const service = new PluginService();
      const plugins = await service.getPluginsWithEnabledForUser(userWithPluginId);
      expect(plugins.length).toBeGreaterThanOrEqual(1);
      const payroll = plugins.find((p) => p.name === "payroll");
      expect(payroll).toBeDefined();
      expect(payroll!.enabled).toBe(true);
    });

    it("incluye enabled false para todos cuando no hay suscripción activa", async () => {
      const service = new PluginService();
      const plugins = await service.getPluginsWithEnabledForUser(userWithoutPluginId);
      expect(plugins.length).toBeGreaterThanOrEqual(1);
      const payroll = plugins.find((p) => p.name === "payroll");
      expect(payroll).toBeDefined();
      expect(payroll!.enabled).toBe(false);
    });
  });
});
