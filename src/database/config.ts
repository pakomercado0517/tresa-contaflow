import { Sequelize } from "sequelize";
import * as dotenv from "dotenv";

// Cargar variables de entorno según el entorno
if (process.env.NODE_ENV === "test") {
  // En tests, cargar .env.test
  dotenv.config({ path: ".env.test", override: true });
} else {
  // En desarrollo/producción, cargar .env
  dotenv.config();
}

// En tests, permitir DATABASE_URL opcional (usar valor por defecto)
const databaseUrl = process.env.DATABASE_URL || "postgresql://localhost:5432/test";

// Validar solo en producción y desarrollo
if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "test") {
  // Logger desactivado
}

// Detectar si es Railway (requiere SSL)
const isRailway = databaseUrl.includes("railway.app") || databaseUrl.includes("rlwy.net");

const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: isRailway || process.env.NODE_ENV === "production" 
      ? { 
          require: true, 
          rejectUnauthorized: false 
        } 
      : false,
    // Mantener conexiones vivas para evitar ECONNRESET
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  },
  pool: {
    max: 5,
    min: 1, // Mantener al menos 1 conexión viva
    acquire: 60000, // 60 segundos para adquirir conexión
    idle: 30000, // 30 segundos antes de cerrar conexión inactiva
    evict: 10000, // Revisar conexiones cada 10 segundos
    // Nota: handleDisconnects no existe en Sequelize, pero el pool maneja reconexiones automáticamente
  },
  // Sequelize maneja reconexiones automáticamente en caso de errores de conexión
});

// Exportar tanto default como named export para compatibilidad
export default sequelize;
export { sequelize };

