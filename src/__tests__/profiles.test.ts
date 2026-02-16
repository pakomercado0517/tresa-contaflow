import request from "supertest";
import app from "../server";
import { cleanDatabase, closeDatabase } from "./helpers/test-db";
import { createTestUser, generateTestTokens, expectSuccess, expectError } from "./helpers/test-helpers";
import { Profile, Subscription } from "../database/models/index";
import { SUPPORT_EMAIL, ERROR_CODE_RFC_IN_USE } from "../constants/support.constants";

describe("Profiles API", () => {
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    await cleanDatabase();
    const user = await createTestUser("profiles@example.com");
    userId = user.id;
    // Plan BASIC para poder crear varios perfiles (duplicate RFC test necesita 2 intentos)
    await Subscription.create({ user_id: userId, plan: "BASIC" });
    const tokens = generateTestTokens(userId, "profiles@example.com");
    accessToken = tokens.accessToken;
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeDatabase();
  });

  describe("POST /api/profiles", () => {
    it("debe crear un perfil exitosamente", async () => {
      const response = await request(app)
        .post("/api/profiles")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          nombre: "Mi Empresa S.A. de C.V.",
          rfc: "XAXX010101AA0", // RFC genérico que cumple regex (homoclave AA0)
          tipo_persona: "MORAL",
          regimenes_fiscales: ["601"],
        });

      expectSuccess(response, 201);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("id");
      expect(response.body.data).toHaveProperty("rfc", "XAXX010101AA0");
      expect(response.body.data).toHaveProperty("nombre", "Mi Empresa S.A. de C.V.");
    });

    it("debe rechazar perfil con RFC duplicado para el mismo usuario", async () => {
      const response = await request(app)
        .post("/api/profiles")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          nombre: "Otra Empresa",
          rfc: "XAXX010101AA0", // Mismo RFC genérico del test anterior
          tipo_persona: "MORAL",
          regimenes_fiscales: ["601"],
        });

      expectError(response, 409);
      expect(response.body).toHaveProperty("message");
      expect(response.body.message).toContain(SUPPORT_EMAIL);
      expect(response.body).toHaveProperty("code", ERROR_CODE_RFC_IN_USE);
    });

    it("debe rechazar perfil con RFC ya usado por otro usuario", async () => {
      // XAXX010101AA0 ya existe (creado en el primer test de este describe)
      const otherUser = await createTestUser("rfc-conflict@example.com");
      const otherTokens = generateTestTokens(otherUser.id, "rfc-conflict@example.com");

      const response = await request(app)
        .post("/api/profiles")
        .set("Authorization", `Bearer ${otherTokens.accessToken}`)
        .send({
          nombre: "Empresa del Cliente",
          rfc: "XAXX010101AA0", // Mismo RFC que el usuario profiles@example.com
          tipo_persona: "MORAL",
          regimenes_fiscales: ["601"],
        });

      expectError(response, 409);
      expect(response.body).toHaveProperty("error", "Este RFC ya está en uso");
      expect(response.body).toHaveProperty("message");
      expect(response.body.message).toContain(SUPPORT_EMAIL);
      expect(response.body).toHaveProperty("code", ERROR_CODE_RFC_IN_USE);
    });

    it("debe rechazar perfil sin RFC", async () => {
      const response = await request(app)
        .post("/api/profiles")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          nombre: "Empresa sin RFC",
          tipo_persona: "MORAL",
        });

      expectError(response, 400);
    });
  });

  describe("GET /api/profiles", () => {
    it("debe listar todos los perfiles del usuario", async () => {
      const response = await request(app)
        .get("/api/profiles")
        .set("Authorization", `Bearer ${accessToken}`);

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("data");
      expect(response.body).toHaveProperty("count");
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.count).toBeGreaterThan(0);
    });

    it("debe rechazar acceso sin token", async () => {
      const response = await request(app)
        .get("/api/profiles");

      expectError(response, 401);
    });
  });

  describe("GET /api/profiles/:id", () => {
    let profileId: string;

    beforeEach(async () => {
      const profile = await Profile.create({
        user_id: userId,
        nombre: "Perfil de Prueba",
        rfc: `TEST${Date.now()}`,
        tipo_persona: "MORAL",
      });
      profileId = profile.id;
    });

    it("debe obtener un perfil específico", async () => {
      const response = await request(app)
        .get(`/api/profiles/${profileId}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("id", profileId);
    });

    it("debe rechazar acceso a perfil de otro usuario", async () => {
      // Crear otro usuario y su perfil
      const otherUser = await createTestUser("other@example.com");
      const otherTokens = generateTestTokens(otherUser.id);
      const otherProfile = await Profile.create({
        user_id: otherUser.id,
        nombre: "Otro Perfil",
        rfc: `OTHER${Date.now()}`,
        tipo_persona: "MORAL",
      });

      const response = await request(app)
        .get(`/api/profiles/${otherProfile.id}`)
        .set("Authorization", `Bearer ${accessToken}`); // Token del primer usuario

      expectError(response, 404);
    });
  });

  describe("PUT /api/profiles/:id", () => {
    let profileId: string;

    beforeEach(async () => {
      const profile = await Profile.create({
        user_id: userId,
        nombre: "Perfil para Actualizar",
        rfc: `UPDATE${Date.now()}`,
        tipo_persona: "MORAL",
      });
      profileId = profile.id;
    });

    it("debe actualizar un perfil exitosamente", async () => {
      const response = await request(app)
        .put(`/api/profiles/${profileId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          nombre: "Perfil Actualizado",
          regimenes_fiscales: ["603"],
        });

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("nombre", "Perfil Actualizado");
    });
  });

  describe("DELETE /api/profiles/:id", () => {
    let profileId: string;

    beforeEach(async () => {
      const profile = await Profile.create({
        user_id: userId,
        nombre: "Perfil para Eliminar",
        rfc: `DELETE${Date.now()}`,
        tipo_persona: "MORAL",
      });
      profileId = profile.id;
    });

    it("debe eliminar un perfil exitosamente", async () => {
      const response = await request(app)
        .delete(`/api/profiles/${profileId}`)
        .set("Authorization", `Bearer ${accessToken}`);

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("message");

      // Verificar que el perfil fue eliminado
      const deletedProfile = await Profile.findByPk(profileId);
      expect(deletedProfile).toBeNull();
    });
  });
});

