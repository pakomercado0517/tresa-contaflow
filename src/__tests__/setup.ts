import dotenv from "dotenv";

// Cargar variables de entorno de prueba (si existe)
// Si no existe, usar .env normal
try {
  dotenv.config({ path: ".env.test" });
} catch {
  dotenv.config();
}

// Asegurar que DATABASE_URL esté definida para tests
// Si no está definida, usar una URL por defecto para tests
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://localhost:5432/test";
  process.env.NODE_ENV = "test";
}

// Configuración global para tests
beforeAll(async () => {
  // Aquí puedes agregar setup global si es necesario
  // Por ejemplo, conectar a una BD de pruebas
});

afterAll(async () => {
  // Cleanup global después de todos los tests
});
