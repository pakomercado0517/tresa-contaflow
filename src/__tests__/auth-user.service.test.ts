import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getJson, setJsonForAuthUser } = vi.hoisted(() => ({
  getJson: vi.fn(),
  setJsonForAuthUser: vi.fn(),
}));

vi.mock('../database/models/index.js', () => ({
  User: {
    findByPk: vi.fn(),
  },
}));

vi.mock('../services/cache.service.js', () => ({
  authMeKey: (userId: string) => `contafy:auth:me:${userId}`,
  getAuthMeTtlSeconds: () => 300,
  getJson,
  setJsonForAuthUser,
}));

import { User } from '../database/models/index.js';
import { getCurrentUserCached } from '../services/auth-user.service.js';

const sampleUser = {
  id: 'u1',
  email: 'a@b.com',
  nombre: 'Ana',
  apellido: 'López',
  telefono: null,
  email_verified: true,
  tour_version: 'v1',
  tour_completed_at: new Date('2026-03-01T12:00:00.000Z'),
  logo_url: null,
  nombre_comercial: null,
};

describe('auth-user.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getCurrentUserCached retorna desde caché (hit) y rehidrata tour_completed_at', async () => {
    getJson.mockResolvedValue({
      user: {
        ...sampleUser,
        tour_completed_at: '2026-03-01T12:00:00.000Z',
      },
    });

    const result = await getCurrentUserCached('u1');

    expect(getJson).toHaveBeenCalledWith('contafy:auth:me:u1', {
      userId: 'u1',
      domain: 'auth',
    });
    expect(User.findByPk).not.toHaveBeenCalled();
    expect(setJsonForAuthUser).not.toHaveBeenCalled();
    expect(result?.user.tour_completed_at).toEqual(new Date('2026-03-01T12:00:00.000Z'));
    expect(result?.user.email).toBe('a@b.com');
  });

  it('getCurrentUserCached en miss consulta DB y guarda en caché', async () => {
    getJson.mockResolvedValue(null);
    vi.mocked(User.findByPk).mockResolvedValue(sampleUser as never);

    const result = await getCurrentUserCached('u1');

    expect(User.findByPk).toHaveBeenCalledWith('u1');
    expect(setJsonForAuthUser).toHaveBeenCalledWith(
      'contafy:auth:me:u1',
      { user: expect.objectContaining({ id: 'u1', email: 'a@b.com' }) },
      'u1',
      300
    );
    expect(result?.user.id).toBe('u1');
  });

  it('getCurrentUserCached retorna null si el usuario no existe', async () => {
    getJson.mockResolvedValue(null);
    vi.mocked(User.findByPk).mockResolvedValue(null);

    const result = await getCurrentUserCached('missing');

    expect(result).toBeNull();
    expect(setJsonForAuthUser).not.toHaveBeenCalled();
  });
});
