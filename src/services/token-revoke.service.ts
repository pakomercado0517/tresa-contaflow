import { getRedis } from '../lib/redis.client.js';
import { hashToken, getTokenTtlSeconds } from '../utils/jwt.util.js';
import { logger } from '../utils/logger.util.js';
import type {
  TokenRevokeEvent,
  TokenRevokeKind,
  TokenRevokeLogContext,
} from '../types/token-revoke.types.js';

const PREFIX = 'contafy';

function denyKey(kind: TokenRevokeKind, tokenHash: string): string {
  return `${PREFIX}:auth:deny:${kind}:${tokenHash}`;
}

function logRevoke(context: {
  event: TokenRevokeEvent;
  kind?: TokenRevokeKind;
  key?: string;
  userId?: string;
  error?: string;
}): void {
  const payload: TokenRevokeLogContext = { domain: 'auth', event: context.event };
  if (context.kind !== undefined) payload.kind = context.kind;
  if (context.key !== undefined) payload.key = context.key;
  if (context.userId !== undefined) payload.userId = context.userId;
  if (context.error !== undefined) payload.error = context.error;
  logger.info(payload, `auth_${context.event}`);
}

async function revokeToken(
  kind: TokenRevokeKind,
  token: string,
  userId?: string
): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    return;
  }

  const ttlSeconds = getTokenTtlSeconds(token);
  if (ttlSeconds === null) {
    return;
  }

  const key = denyKey(kind, hashToken(token));
  try {
    await redis.setex(key, ttlSeconds, '1');
    const revokeLog: {
      event: 'revoke';
      kind: TokenRevokeKind;
      key: string;
      userId?: string;
    } = { event: 'revoke', kind, key };
    if (userId !== undefined) revokeLog.userId = userId;
    logRevoke(revokeLog);
  } catch (error) {
    const errorLog: {
      event: 'error';
      kind: TokenRevokeKind;
      key: string;
      userId?: string;
      error: string;
    } = {
      event: 'error',
      kind,
      key,
      error: error instanceof Error ? error.message : String(error),
    };
    if (userId !== undefined) errorLog.userId = userId;
    logRevoke(errorLog);
  }
}

async function isTokenRevoked(kind: TokenRevokeKind, token: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    return false;
  }

  const key = denyKey(kind, hashToken(token));
  try {
    const value = await redis.get(key);
    if (value !== null) {
      logRevoke({ event: 'deny_hit', kind, key });
      return true;
    }
    return false;
  } catch (error) {
    logRevoke({
      event: 'error',
      kind,
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function revokeAccessToken(token: string, userId?: string): Promise<void> {
  await revokeToken('access', token, userId);
}

export async function revokeRefreshToken(token: string, userId?: string): Promise<void> {
  await revokeToken('refresh', token, userId);
}

export async function isAccessTokenRevoked(token: string): Promise<boolean> {
  return isTokenRevoked('access', token);
}

export async function isRefreshTokenRevoked(token: string): Promise<boolean> {
  return isTokenRevoked('refresh', token);
}

export function accessDenyKey(tokenHash: string): string {
  return denyKey('access', tokenHash);
}

export function refreshDenyKey(tokenHash: string): string {
  return denyKey('refresh', tokenHash);
}
