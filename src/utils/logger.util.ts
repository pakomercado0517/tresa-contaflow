import pino from "pino";

// Determinar si estamos en producción
const isProduction = process.env.NODE_ENV === "production";

// Configuración base del logger
const pinoConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  ...(isProduction
    ? {
        // En producción: JSON estructurado (sin pretty-print)
        // Esto permite que herramientas como Datadog, Elasticsearch, etc. lo analicen
        formatters: {
          level: (label) => {
            return { level: label };
          },
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        // Opcional: Serializar objetos de error correctamente
        serializers: {
          err: pino.stdSerializers.err,
          req: pino.stdSerializers.req,
          res: pino.stdSerializers.res,
        },
      }
    : {
        // En desarrollo: formato legible (pretty-print)
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
            singleLine: false,
          },
        },
      }),
};

// Crear instancia del logger
export const logger = pino(pinoConfig);

// Tipos para mejor autocompletado
export type Logger = typeof logger;
