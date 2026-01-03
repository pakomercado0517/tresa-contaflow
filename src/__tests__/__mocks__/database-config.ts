import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

// Mock de la configuración de base de datos para tests
const sequelize = new Sequelize(
  process.env.DATABASE_URL || "postgresql://localhost:5432/test",
  {
    dialect: "postgres",
    logging: false,
    dialectOptions: {
      ssl: process.env.NODE_ENV === "production" ? { require: true, rejectUnauthorized: false } : false,
    },
  }
);

export default sequelize;

