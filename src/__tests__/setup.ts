import { beforeAll, afterAll, vi } from "vitest";
import * as dotenv from "dotenv";

// Asegurar que NODE_ENV sea 'test' ANTES de cargar variables
process.env.NODE_ENV = "test";

// Cargar variables de entorno ANTES de cualquier otra importación
// Primero .env.test con override: true
dotenv.config({ path: ".env.test", override: true });
// Luego .env con override: false (solo para vars que no están en .env.test)
dotenv.config({ override: false });

// Asegurar que DATABASE_URL esté definida para tests
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://localhost:5432/test";
}

// Configuración global para tests
beforeAll(async () => {
  // Aquí puedes agregar setup global si es necesario
});

afterAll(async () => {
  // Cleanup global después de todos los tests
});
