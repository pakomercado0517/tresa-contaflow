import { Sequelize } from "sequelize";
import * as dotenv from "dotenv";

// Cargar variables de entorno
dotenv.config();

// En tests, permitir DATABASE_URL opcional (usar valor por defecto)
const databaseUrl = process.env.DATABASE_URL || "postgresql://localhost:5432/test";

// Validar solo en producción y desarrollo
if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "test") {
  // Logger desactivado
}

const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: process.env.NODE_ENV === "production" ? { require: true, rejectUnauthorized: false } : false,
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

// Exportar tanto default como named export para compatibilidad
export default sequelize;
export { sequelize };

