import app from "./server.js";
import { logger } from "./utils/logger.util.js";
import { connectRedis, disconnectRedis } from "./lib/redis.client.js";

const port = parseInt(process.env.PORT || "3001");

// Manejo de errores no capturados
process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
  logger.error(
    { reason, promise },
    "Unhandled Rejection detectado"
  );
  // En producción, podrías querer cerrar el servidor o notificar a un servicio de monitoreo
  if (process.env.NODE_ENV === "production") {
    // Opcional: cerrar el servidor en producción si hay un error crítico
    // process.exit(1);
  }
});

process.on("uncaughtException", (error: Error) => {
  logger.fatal({ err: error }, "Uncaught Exception - Cerrando servidor");
  // En producción, cerrar el servidor de forma controlada
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
});

// Graceful shutdown
const gracefulShutdown = (signal: string): void => {
  logger.info({ signal }, "Recibida señal de cierre. Cerrando servidor de forma controlada...");
  void (async () => {
    await disconnectRedis();
    process.exit(0);
  })();
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

const startServer = async (): Promise<void> => {
  try {
    await connectRedis();
    app.listen(port, () => {
      logger.info(
        { port, environment: process.env.NODE_ENV || "development" },
        "Servidor iniciado correctamente"
      );
    });
  } catch (error) {
    logger.fatal({ err: error as Error }, "Error al iniciar el servidor");
    process.exit(1);
  }
};

void startServer();
