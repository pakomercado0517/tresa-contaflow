import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../database/models/index.js', () => ({
  Profile: {
    findByPk: vi.fn(),
  },
}));

import { Profile } from '../database/models/index.js';
import {
  getJson,
  setJson,
  setJsonForProfile,
  invalidateProfileCache,
  invalidateUserAuthCache,
  metricsMonthKey,
  taxMonthKey,
  publicReportKey,
  profileIndexKey,
  publicIndexKey,
  userListsIndexKey,
  authUserIndexKey,
} from '../services/cache.service.js';
import { resetRedisClientForTests, setRedisClientForTests } from '../lib/redis.client.js';

interface MockPipeline {
  setex: ReturnType<typeof vi.fn>;
  sadd: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
}

function createMockRedis(): {
  get: ReturnType<typeof vi.fn>;
  setex: ReturnType<typeof vi.fn>;
  sadd: ReturnType<typeof vi.fn>;
  smembers: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  pipeline: ReturnType<typeof vi.fn>;
  pipelineInstance: MockPipeline;
} {
  const pipelineInstance: MockPipeline = {
    setex: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };

  return {
    get: vi.fn(),
    setex: vi.fn(),
    sadd: vi.fn(),
    smembers: vi.fn(),
    del: vi.fn(),
    pipeline: vi.fn(() => pipelineInstance),
    pipelineInstance,
  };
}

describe('cache.service', () => {
  beforeEach(() => {
    resetRedisClientForTests();
  });

  afterEach(() => {
    resetRedisClientForTests();
    vi.restoreAllMocks();
  });

  it('getJson retorna null (fail-open) si Redis no está conectado', async () => {
    const result = await getJson<{ a: number }>('contafy:test');
    expect(result).toBeNull();
  });

  it('getJson retorna hit cuando hay valor', async () => {
    const redis = createMockRedis();
    redis.get.mockResolvedValue(JSON.stringify({ a: 1 }));
    setRedisClientForTests(redis as never);

    const result = await getJson<{ a: number }>('contafy:test', {
      profileId: 'p1',
      domain: 'metrics',
    });

    expect(result).toEqual({ a: 1 });
    expect(redis.get).toHaveBeenCalledWith('contafy:test');
  });

  it('getJson retorna miss cuando la clave no existe', async () => {
    const redis = createMockRedis();
    redis.get.mockResolvedValue(null);
    setRedisClientForTests(redis as never);

    const result = await getJson('contafy:missing');
    expect(result).toBeNull();
  });

  it('getJson retorna null (fail-open) si Redis lanza error', async () => {
    const redis = createMockRedis();
    redis.get.mockRejectedValue(new Error('connection lost'));
    setRedisClientForTests(redis as never);

    const result = await getJson('contafy:err');
    expect(result).toBeNull();
  });

  it('setJson guarda valor e indexa la clave', async () => {
    const redis = createMockRedis();
    setRedisClientForTests(redis as never);

    await setJson(
      'contafy:metrics:p1:2026:7:all',
      { ok: true },
      { ttlSeconds: 300, indexKey: 'contafy:idx:p1' },
      { profileId: 'p1', domain: 'metrics' }
    );

    expect(redis.pipeline).toHaveBeenCalled();
    expect(redis.pipelineInstance.setex).toHaveBeenCalledWith(
      'contafy:metrics:p1:2026:7:all',
      300,
      JSON.stringify({ ok: true })
    );
    expect(redis.pipelineInstance.sadd).toHaveBeenCalledWith(
      'contafy:idx:p1',
      'contafy:metrics:p1:2026:7:all'
    );
    expect(redis.pipelineInstance.exec).toHaveBeenCalled();
  });

  it('setJsonForProfile usa el index del perfil', async () => {
    const redis = createMockRedis();
    setRedisClientForTests(redis as never);

    await setJsonForProfile('contafy:tax:p1:2026:7:all', { x: 1 }, 'p1', 120, 'tax');

    expect(redis.pipelineInstance.sadd).toHaveBeenCalledWith(
      profileIndexKey('p1'),
      'contafy:tax:p1:2026:7:all'
    );
  });

  it('invalidateProfileCache elimina keys de ambos indexes', async () => {
    const redis = createMockRedis();
    vi.mocked(Profile.findByPk).mockResolvedValue({ user_id: 'u1' } as never);
    redis.smembers
      .mockResolvedValueOnce(['contafy:metrics:p1:2026:7:all', 'contafy:tax:p1:2026:7:all'])
      .mockResolvedValueOnce(['contafy:public:tok:2026:7'])
      .mockResolvedValueOnce(['contafy:invoices:list:user:u1:abc']);
    setRedisClientForTests(redis as never);

    await invalidateProfileCache('p1');

    expect(redis.smembers).toHaveBeenCalledWith(profileIndexKey('p1'));
    expect(redis.smembers).toHaveBeenCalledWith(publicIndexKey('p1'));
    expect(redis.smembers).toHaveBeenCalledWith(userListsIndexKey('u1'));
    expect(redis.pipelineInstance.del).toHaveBeenCalled();
    expect(redis.pipelineInstance.exec).toHaveBeenCalled();
  });

  it('invalidateProfileCache no falla si Redis está ausente', async () => {
    await expect(invalidateProfileCache('p1')).resolves.toBeUndefined();
  });

  it('invalidateUserAuthCache elimina claves del índice auth del usuario', async () => {
    const redis = createMockRedis();
    redis.smembers.mockResolvedValueOnce(['contafy:auth:me:u1']);
    setRedisClientForTests(redis as never);

    await invalidateUserAuthCache('u1');

    expect(redis.smembers).toHaveBeenCalledWith(authUserIndexKey('u1'));
    expect(redis.pipelineInstance.del).toHaveBeenCalledWith('contafy:auth:me:u1');
    expect(redis.pipelineInstance.del).toHaveBeenCalledWith(authUserIndexKey('u1'));
    expect(redis.pipelineInstance.exec).toHaveBeenCalled();
  });

  it('invalidateUserAuthCache no falla si Redis está ausente', async () => {
    await expect(invalidateUserAuthCache('u1')).resolves.toBeUndefined();
  });

  it('genera claves estables', () => {
    expect(metricsMonthKey('p1', 2026, 7, '612')).toBe('contafy:metrics:p1:2026:7:612');
    expect(metricsMonthKey('p1', 2026, 7)).toBe('contafy:metrics:p1:2026:7:all');
    expect(taxMonthKey('p1', 2026, 7)).toBe('contafy:tax:p1:2026:7:all');
    expect(publicReportKey('tok', 2026, 7)).toBe('contafy:public:tok:2026:7');
  });
});
