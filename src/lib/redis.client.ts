import { Redis } from 'ioredis';
import { logger } from '../utils/logger.util.js';

let redisClient: Redis | null = null;
let connectAttempted = false;

/**
 * Conecta el cliente Redis usando REDIS_URL.
 * Si la variable no existe o la conexión falla, deja el cliente en null (fail-open).
 */
export async function connectRedis(): Promise<void> {
  if (connectAttempted) {
    return;
  }
  connectAttempted = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.warn('REDIS_URL no definida; caché Redis deshabilitada (fail-open)');
    return;
  }

  try {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 5000,
    });

    client.on('error', (err: Error) => {
      logger.warn({ err }, 'Error de Redis (fail-open)');
    });

    await client.connect();
    redisClient = client;
    logger.info('Redis conectado correctamente');
  } catch (error) {
    redisClient = null;
    logger.warn(
      { err: error instanceof Error ? error : new Error(String(error)) },
      'No se pudo conectar a Redis; caché deshabilitada (fail-open)'
    );
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!redisClient) {
    return;
  }
  try {
    await redisClient.quit();
  } catch {
    redisClient.disconnect();
  } finally {
    redisClient = null;
    connectAttempted = false;
    logger.info('Redis desconectado');
  }
}

export function getRedis(): Redis | null {
  return redisClient;
}

/** Solo para tests: reinicia el estado del singleton. */
export function resetRedisClientForTests(): void {
  redisClient = null;
  connectAttempted = false;
}

/** Solo para tests: inyecta un cliente mock. */
export function setRedisClientForTests(client: Redis | null): void {
  redisClient = client;
  connectAttempted = true;
}
