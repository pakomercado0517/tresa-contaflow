import request from "supertest";
import app from "../server.js";
import { cleanDatabase, closeDatabase } from "./helpers/test-db.js";
import { createTestUser, generateTestTokens, expectSuccess, expectError } from "./helpers/test-helpers.js";
import { Profile } from "../database/models/index.js";

describe("Profiles API", () => {
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    await cleanDatabase();
    const user = await createTestUser("profiles@example.com");
    userId = user.id;
    const tokens = generateTestTokens(userId);
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
          rfc: "MEM123456ABC",
          tipo_persona: "MORAL",
          regimen_fiscal: "601",
        });

      expectSuccess(response, 201);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("id");
      expect(response.body.data).toHaveProperty("rfc", "MEM123456ABC");
      expect(response.body.data).toHaveProperty("nombre", "Mi Empresa S.A. de C.V.");
    });

    it("debe rechazar perfil con RFC duplicado para el mismo usuario", async () => {
      const response = await request(app)
        .post("/api/profiles")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          nombre: "Otra Empresa",
          rfc: "MEM123456ABC", // Mismo RFC
          tipo_persona: "MORAL",
          regimen_fiscal: "601",
        });

      expectError(response, 400);
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
          regimen_fiscal: "603",
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

