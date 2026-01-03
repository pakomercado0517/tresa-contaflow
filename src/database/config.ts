import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

// En tests, permitir DATABASE_URL opcional (usar valor por defecto)
const databaseUrl = process.env.DATABASE_URL || "postgresql://localhost:5432/test";

if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "test") {
  throw new Error("DATABASE_URL no está definida en las variables de entorno");
}

const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  dialectOptions: {
    ssl: process.env.NODE_ENV === "production" ? { require: true, rejectUnauthorized: false } : false,
  },
});

// Exportar tanto default como named export para compatibilidad con Jest
export default sequelize;
export { sequelize };

