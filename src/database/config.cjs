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
};

module.exports = {
  development: {
    url: process.env.DATABASE_URL,
    dialect: "postgres",
    logging: console.log,
    dialectOptions,
  },
  test: {
    url: process.env.DATABASE_URL,
    dialect: "postgres",
    logging: false,
    dialectOptions,
  },
  production: {
    url: process.env.DATABASE_URL,
    dialect: "postgres",
    logging: false,
    dialectOptions,
  },
};

