import { beforeAll, afterAll, vi } from "vitest";
import * as dotenv from "dotenv";

// Cargar variables de entorno ANTES de cualquier otra importación
// Primero intentar .env.test, luego .env
dotenv.config({ path: ".env.test" });
dotenv.config();

// Asegurar que DATABASE_URL esté definida para tests
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://localhost:5432/test";
}

// Asegurar que NODE_ENV sea 'test'
process.env.NODE_ENV = "test";

// Configuración global para tests
beforeAll(async () => {
  // Aquí puedes agregar setup global si es necesario
});

afterAll(async () => {
  // Cleanup global después de todos los tests
});
