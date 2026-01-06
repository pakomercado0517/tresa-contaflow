const { Sequelize } = require("sequelize");
const dotenv = require("dotenv");

// Cargar variables de entorno en el orden correcto
// Si estamos en modo test, cargar primero .env.test
if (process.env.NODE_ENV === "test" || process.argv.includes("vitest")) {
  dotenv.config({ path: ".env.test", override: true });
}
dotenv.config();

// Obtener DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;

// Validar que DATABASE_URL esté definida
if (!databaseUrl) {
  throw new Error("DATABASE_URL no está definida en las variables de entorno");
}

// Detectar si la URL es de Railway (requiere SSL)
const requiresSSL = databaseUrl.includes("railway.app") || databaseUrl.includes("rlwy.net");

// Configuración de Sequelize
const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: requiresSSL || process.env.NODE_ENV === "production" 
      ? { require: true, rejectUnauthorized: false } 
      : false,
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

// Exportar tanto default como named export para compatibilidad
module.exports = sequelize;
module.exports.sequelize = sequelize;
module.exports.default = sequelize;

