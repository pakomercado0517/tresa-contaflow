import type { Response } from "supertest";
import { User } from "../../database/models/index";
import bcrypt from "bcrypt";
import { generateAccessToken, generateRefreshToken } from "../../utils/jwt.util";

/**
 * Crea un usuario de prueba
 */
export async function createTestUser(
  email: string = "test@example.com",
  password: string = "password123",
  emailVerified: boolean = true
): Promise<User> {
  const passwordHash = await bcrypt.hash(password, 10);
  
  return await User.create({
    email,
    password_hash: passwordHash,
    email_verified: emailVerified,
  });
}

/**
 * Genera tokens JWT para un usuario
 */
export function generateTestTokens(userId: string, email: string = "test@example.com"): { accessToken: string; refreshToken: string } {
  const tokens = {
    accessToken: generateAccessToken({ userId, email }),
    refreshToken: generateRefreshToken({ userId, email }),
  };
  return tokens;
}

/**
 * Extrae el cuerpo de la respuesta y valida el status
 */
export function expectStatus(response: Response, status: number): void {
  expect(response.status).toBe(status);
}

/**
 * Valida que la respuesta tenga un error
 */
export function expectError(response: Response, status: number = 400): void {
  expectStatus(response, status);
  expect(response.body).toHaveProperty("error");
}

/**
 * Valida que la respuesta sea exitosa
 */
export function expectSuccess(response: Response, status: number = 200): void {
  expectStatus(response, status);
  expect(response.body).not.toHaveProperty("error");
}

