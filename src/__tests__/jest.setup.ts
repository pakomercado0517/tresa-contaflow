// Mock de la configuración de base de datos antes de importar modelos
import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

// Crear instancia de Sequelize para tests
const testSequelize = new Sequelize(
  process.env.DATABASE_URL || "postgresql://localhost:5432/test",
  {
    dialect: "postgres",
    logging: false,
    dialectOptions: {
      ssl: process.env.NODE_ENV === "production" ? { require: true, rejectUnauthorized: false } : false,
    },
  }
);

// Hacer disponible globalmente para los tests
(global as any).testSequelize = testSequelize;






