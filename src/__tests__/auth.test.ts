import request from "supertest";
import app from "../server";
import { cleanDatabase, closeDatabase } from "./helpers/test-db";
import { createTestUser, generateTestTokens, expectSuccess, expectError } from "./helpers/test-helpers";
import { User } from "../database/models/index";
import { resetRedisClientForTests, setRedisClientForTests } from "../lib/redis.client.js";

function createInMemoryRedis(): {
  get: (key: string) => Promise<string | null>;
  setex: (key: string, ttl: number, value: string) => Promise<string>;
} {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    setex: async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return "OK";
    },
  };
}

describe("Auth API", () => {
  beforeAll(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeDatabase();
    resetRedisClientForTests();
  });

  describe("POST /api/auth/register", () => {
    it("debe registrar un nuevo usuario exitosamente", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "newuser@example.com",
          password: "password123",
        });

      expectSuccess(response, 201);
      expect(response.body).toHaveProperty("user");
      expect(response.body.user).toHaveProperty("id");
      expect(response.body.user).toHaveProperty("email", "newuser@example.com");
      expect(response.body.user).not.toHaveProperty("password_hash");
    });

    it("debe rechazar registro con email duplicado", async () => {
      await createTestUser("duplicate@example.com");

      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "duplicate@example.com",
          password: "password123",
        });

      expectError(response, 409); // 409 Conflict para email duplicado
    });

    it("debe rechazar registro con email inválido", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "invalid-email",
          password: "password123",
        });

      expectError(response, 400);
    });

    it("debe rechazar registro con password muy corto", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "shortpass@example.com",
          password: "123",
        });

      expectError(response, 400);
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      await cleanDatabase();
      await createTestUser("login@example.com", "password123");
    });

    it("debe hacer login exitosamente con credenciales válidas", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "login@example.com",
          password: "password123",
        });

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("refreshToken");
      expect(response.body).toHaveProperty("user");
    });

    it("debe rechazar login con email incorrecto", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "wrong@example.com",
          password: "password123",
        });

      expectError(response, 401);
    });

    it("debe rechazar login con password incorrecto", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "login@example.com",
          password: "wrongpassword",
        });

      expectError(response, 401);
    });
  });

  describe("POST /api/auth/refresh", () => {
    let userId: string;
    let refreshToken: string;

    beforeEach(async () => {
      await cleanDatabase();
      const user = await createTestUser("refresh@example.com");
      userId = user.id;
      const tokens = generateTestTokens(userId, "refresh@example.com");
      refreshToken = tokens.refreshToken;
    });

    it("debe renovar access token con refresh token válido", async () => {
      const response = await request(app)
        .post("/api/auth/refresh")
        .send({
          refreshToken,
        });

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("accessToken");
      expect(response.body.accessToken).not.toBe(refreshToken);
    });

    it("debe rechazar refresh token inválido", async () => {
      const response = await request(app)
        .post("/api/auth/refresh")
        .send({
          refreshToken: "invalid-token",
        });

      expectError(response, 401);
    });
  });

  describe("POST /api/auth/logout", () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      await cleanDatabase();
      resetRedisClientForTests();
      setRedisClientForTests(createInMemoryRedis() as never);
      const user = await createTestUser("logout@example.com");
      const tokens = generateTestTokens(user.id, "logout@example.com");
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
    });

    afterEach(() => {
      resetRedisClientForTests();
    });

    it("debe hacer logout exitosamente con access y refresh token", async () => {
      const response = await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ refreshToken });

      expectSuccess(response, 200);
      expect(response.body).toHaveProperty("message");
    });

    it("debe rechazar logout sin access token", async () => {
      const response = await request(app)
        .post("/api/auth/logout")
        .send({ refreshToken });

      expectError(response, 401);
    });

    it("debe rechazar logout sin refreshToken en body", async () => {
      const response = await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .send();

      expectError(response, 400);
    });

    it("debe rechazar refresh tras logout", async () => {
      await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ refreshToken });

      const response = await request(app)
        .post("/api/auth/refresh")
        .send({ refreshToken });

      expectError(response, 401);
    });

    it("debe rechazar rutas autenticadas con access revocado", async () => {
      await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ refreshToken });

      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${accessToken}`);

      expectError(response, 403);
    });
  });
});

