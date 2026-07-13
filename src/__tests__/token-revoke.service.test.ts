import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  revokeAccessToken,
  revokeRefreshToken,
  isAccessTokenRevoked,
  isRefreshTokenRevoked,
  accessDenyKey,
  refreshDenyKey,
} from '../services/token-revoke.service.js';
import { hashToken, generateAccessToken, generateRefreshToken } from '../utils/jwt.util.js';
import { resetRedisClientForTests, setRedisClientForTests } from '../lib/redis.client.js';

function createMockRedis(): {
  get: ReturnType<typeof vi.fn>;
  setex: ReturnType<typeof vi.fn>;
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
  };
}

describe('token-revoke.service', () => {
  const payload = { userId: 'u1', email: 'a@b.com' };

  beforeEach(() => {
    resetRedisClientForTests();
  });

  afterEach(() => {
    resetRedisClientForTests();
    vi.restoreAllMocks();
  });

  it('isAccessTokenRevoked retorna false (fail-open) sin Redis', async () => {
    const token = generateAccessToken(payload);
    expect(await isAccessTokenRevoked(token)).toBe(false);
  });

  it('isRefreshTokenRevoked retorna false (fail-open) si Redis lanza error', async () => {
    const redis = createMockRedis();
    redis.get.mockRejectedValue(new Error('connection lost'));
    setRedisClientForTests(redis as never);

    const token = generateRefreshToken(payload);
    expect(await isRefreshTokenRevoked(token)).toBe(false);
  });

  it('revokeAccessToken guarda deny con TTL y isAccessTokenRevoked detecta hit', async () => {
    const redis = createMockRedis();
    setRedisClientForTests(redis as never);

    const token = generateAccessToken(payload);
    await revokeAccessToken(token, 'u1');

    const key = accessDenyKey(hashToken(token));
    expect(redis.setex).toHaveBeenCalledWith(key, expect.any(Number), '1');
    expect(await isAccessTokenRevoked(token)).toBe(true);
  });

  it('revokeRefreshToken guarda deny y isRefreshTokenRevoked detecta hit', async () => {
    const redis = createMockRedis();
    setRedisClientForTests(redis as never);

    const token = generateRefreshToken(payload);
    await revokeRefreshToken(token, 'u1');

    const key = refreshDenyKey(hashToken(token));
    expect(redis.setex).toHaveBeenCalledWith(key, expect.any(Number), '1');
    expect(await isRefreshTokenRevoked(token)).toBe(true);
  });

  it('revokeAccessToken no falla si Redis está ausente', async () => {
    const token = generateAccessToken(payload);
    await expect(revokeAccessToken(token)).resolves.toBeUndefined();
  });

  it('revokeAccessToken no falla si Redis lanza error al escribir', async () => {
    const redis = createMockRedis();
    redis.setex.mockRejectedValue(new Error('write failed'));
    setRedisClientForTests(redis as never);

    const token = generateAccessToken(payload);
    await expect(revokeAccessToken(token)).resolves.toBeUndefined();
  });
});
