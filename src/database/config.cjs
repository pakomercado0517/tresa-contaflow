require("dotenv").config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no está definida en las variables de entorno");
}

// Railway requiere SSL incluso en desarrollo, así que lo habilitamos siempre
const dialectOptions = {
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
  // Mantener conexiones vivas para evitar ECONNRESET
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000, // 10 segundos
};

// Configuración del pool de conexiones optimizada para conexiones remotas
// Nota: Sequelize maneja reconexiones automáticamente en caso de errores
const poolConfig = {
  max: 5, // Máximo de conexiones simultáneas
  min: 1, // Mantener al menos 1 conexión viva (evita reconexiones frecuentes)
  acquire: 60000, // 60 segundos para adquirir conexión
  idle: 30000, // 30 segundos antes de cerrar conexión inactiva (aumentado)
  evict: 10000, // Revisar conexiones cada 10 segundos
};

module.exports = {
  development: {
    url: process.env.DATABASE_URL,
    dialect: "postgres",
    logging: false,
    dialectOptions,
    pool: poolConfig,
  },
  test: {
    url: process.env.DATABASE_URL,
    dialect: "postgres",
    logging: false,
    dialectOptions,
    pool: poolConfig,
  },
  production: {
    url: process.env.DATABASE_URL,
    dialect: "postgres",
    logging: false,
    dialectOptions,
    pool: poolConfig,
  },
};

