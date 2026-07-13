import { getRedis } from '../lib/redis.client.js';
import { logger } from '../utils/logger.util.js';
import { Profile } from '../database/models/index.js';
import type { CacheDomain, CacheLogContext, CacheSetOptions } from '../types/cache.types.js';

const PREFIX = 'contafy';
const DEFAULT_TTL_SECONDS = 300;

function logCache(context: {
  event: CacheLogContext['event'];
  key?: string;
  profileId?: string;
  userId?: string;
  domain?: CacheDomain;
  error?: string;
}): void {
  const payload: CacheLogContext = { cache: true, event: context.event };
  if (context.key !== undefined) payload.key = context.key;
  if (context.profileId !== undefined) payload.profileId = context.profileId;
  if (context.userId !== undefined) payload.userId = context.userId;
  if (context.domain !== undefined) payload.domain = context.domain;
  if (context.error !== undefined) payload.error = context.error;
  logger.info(payload, `cache_${context.event}`);
}

function cacheMetaFields(meta?: {
  profileId?: string;
  userId?: string;
  domain?: CacheDomain;
}): { profileId?: string; userId?: string; domain?: CacheDomain } {
  const fields: { profileId?: string; userId?: string; domain?: CacheDomain } = {};
  if (meta?.profileId !== undefined) fields.profileId = meta.profileId;
  if (meta?.userId !== undefined) fields.userId = meta.userId;
  if (meta?.domain !== undefined) fields.domain = meta.domain;
  return fields;
}

function parseTtl(envValue: string | undefined, fallback: number): number {
  if (!envValue) {
    return fallback;
  }
  const parsed = Number.parseInt(envValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getMetricsTtlSeconds(): number {
  return parseTtl(process.env.CACHE_TTL_METRICS_SECONDS, DEFAULT_TTL_SECONDS);
}

export function getTaxEstimatesTtlSeconds(): number {
  return parseTtl(process.env.CACHE_TTL_TAX_ESTIMATES_SECONDS, DEFAULT_TTL_SECONDS);
}

export function getPublicReportsTtlSeconds(): number {
  return parseTtl(process.env.CACHE_TTL_PUBLIC_REPORTS_SECONDS, DEFAULT_TTL_SECONDS);
}

export function getInvoicesListTtlSeconds(): number {
  return parseTtl(process.env.CACHE_TTL_INVOICES_LIST_SECONDS, DEFAULT_TTL_SECONDS);
}

export function getExpensesListTtlSeconds(): number {
  return parseTtl(process.env.CACHE_TTL_EXPENSES_LIST_SECONDS, DEFAULT_TTL_SECONDS);
}

export function getAuthMeTtlSeconds(): number {
  return parseTtl(process.env.CACHE_TTL_AUTH_ME_SECONDS, DEFAULT_TTL_SECONDS);
}

export function authMeKey(userId: string): string {
  return `${PREFIX}:auth:me:${userId}`;
}

export function authUserIndexKey(userId: string): string {
  return `${PREFIX}:idx:auth:${userId}`;
}

export function userListsIndexKey(userId: string): string {
  return `${PREFIX}:idx:user-lists:${userId}`;
}

export function profileIndexKey(profileId: string): string {
  return `${PREFIX}:idx:${profileId}`;
}

export function publicIndexKey(profileId: string): string {
  return `${PREFIX}:idx:public:${profileId}`;
}

export function metricsMonthKey(
  profileId: string,
  año: number,
  mes: number,
  regimenFiscal?: string
): string {
  const regimen = regimenFiscal ?? 'all';
  return `${PREFIX}:metrics:${profileId}:${año}:${mes}:${regimen}`;
}

export function metricsPeriodKey(
  profileId: string,
  periodId: string,
  regimenFiscal?: string
): string {
  const regimen = regimenFiscal ?? 'all';
  return `${PREFIX}:metrics:period:${profileId}:${periodId}:${regimen}`;
}

export function metricsDateRangeKey(
  profileId: string,
  startIso: string,
  endIso: string,
  regimenFiscal?: string
): string {
  const regimen = regimenFiscal ?? 'all';
  return `${PREFIX}:metrics:range:${profileId}:${startIso}:${endIso}:${regimen}`;
}

export function taxMonthKey(
  profileId: string,
  año: number,
  mes: number,
  regimenFiscal?: string
): string {
  const regimen = regimenFiscal ?? 'all';
  return `${PREFIX}:tax:${profileId}:${año}:${mes}:${regimen}`;
}

export function taxPeriodKey(
  profileId: string,
  periodId: string,
  regimenFiscal?: string
): string {
  const regimen = regimenFiscal ?? 'all';
  return `${PREFIX}:tax:period:${profileId}:${periodId}:${regimen}`;
}

export function publicReportKey(token: string, año: number, mes: number): string {
  return `${PREFIX}:public:${token}:${año}:${mes}`;
}

export async function getJson<T>(
  key: string,
  meta?: { profileId?: string; userId?: string; domain?: CacheDomain }
): Promise<T | null> {
  const redis = getRedis();
  if (!redis) {
    return null;
  }

  try {
    const raw = await redis.get(key);
    if (raw === null) {
      logCache({ event: 'miss', key, ...cacheMetaFields(meta) });
      return null;
    }
    logCache({ event: 'hit', key, ...cacheMetaFields(meta) });
    return JSON.parse(raw) as T;
  } catch (error) {
    logCache({
      event: 'error',
      key,
      ...cacheMetaFields(meta),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function setJson(
  key: string,
  value: unknown,
  options: CacheSetOptions,
  meta?: { profileId?: string; userId?: string; domain?: CacheDomain }
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  try {
    const payload = JSON.stringify(value);
    const pipeline = redis.pipeline();
    pipeline.setex(key, options.ttlSeconds, payload);
    pipeline.sadd(options.indexKey, key);
    await pipeline.exec();
    logCache({ event: 'set', key, ...cacheMetaFields(meta) });
  } catch (error) {
    logCache({
      event: 'error',
      key,
      ...cacheMetaFields(meta),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function deleteIndexKeys(indexKey: string): Promise<number> {
  const redis = getRedis();
  if (!redis) {
    return 0;
  }

  const members = await redis.smembers(indexKey);
  if (members.length === 0) {
    await redis.del(indexKey);
    return 0;
  }

  const pipeline = redis.pipeline();
  pipeline.del(...members);
  pipeline.del(indexKey);
  await pipeline.exec();
  return members.length;
}

/**
 * Invalida caché de métricas, tax, reportes públicos y listados del perfil;
 * también listados agregados del usuario dueño del perfil.
 */
export async function invalidateProfileCache(profileId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  try {
    const deletedMain = await deleteIndexKeys(profileIndexKey(profileId));
    const deletedPublic = await deleteIndexKeys(publicIndexKey(profileId));

    let deletedUserLists = 0;
    const profile = await Profile.findByPk(profileId, { attributes: ['user_id'] });
    if (profile?.user_id) {
      deletedUserLists = await deleteIndexKeys(userListsIndexKey(profile.user_id));
    }

    logCache({
      event: 'invalidate',
      profileId,
      key: `deleted:${deletedMain + deletedPublic + deletedUserLists}`,
    });
  } catch (error) {
    logCache({
      event: 'error',
      profileId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function setJsonForProfile(
  key: string,
  value: unknown,
  profileId: string,
  ttlSeconds: number,
  domain: CacheDomain
): Promise<void> {
  await setJson(
    key,
    value,
    { ttlSeconds, indexKey: profileIndexKey(profileId) },
    { profileId, domain }
  );
}

export async function setJsonForPublicReport(
  key: string,
  value: unknown,
  profileId: string,
  ttlSeconds: number
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  try {
    const payload = JSON.stringify(value);
    const pipeline = redis.pipeline();
    pipeline.setex(key, ttlSeconds, payload);
    pipeline.sadd(publicIndexKey(profileId), key);
    pipeline.sadd(profileIndexKey(profileId), key);
    await pipeline.exec();
    logCache({ event: 'set', key, profileId, domain: 'public' });
  } catch (error) {
    logCache({
      event: 'error',
      key,
      profileId,
      domain: 'public',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function setJsonForAuthUser(
  key: string,
  value: unknown,
  userId: string,
  ttlSeconds: number
): Promise<void> {
  await setJson(
    key,
    value,
    { ttlSeconds, indexKey: authUserIndexKey(userId) },
    { userId, domain: 'auth' }
  );
}

/**
 * Invalida la caché de GET /api/auth/me del usuario.
 */
export async function invalidateUserAuthCache(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  try {
    const deleted = await deleteIndexKeys(authUserIndexKey(userId));
    logCache({
      event: 'invalidate',
      userId,
      domain: 'auth',
      key: `deleted:${deleted}`,
    });
  } catch (error) {
    logCache({
      event: 'error',
      userId,
      domain: 'auth',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
