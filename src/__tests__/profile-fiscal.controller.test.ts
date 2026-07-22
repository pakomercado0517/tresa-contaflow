import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth.middleware.js';
import { AppError } from '../utils/AppError.js';

const { getProfileFiscalSettingsService, putProfileFiscalSettingsService } = vi.hoisted(() => ({
  getProfileFiscalSettingsService: vi.fn(),
  putProfileFiscalSettingsService: vi.fn(),
}));

vi.mock('../services/profile-fiscal-crud.service.js', () => ({
  getProfileFiscalSettingsService,
  putProfileFiscalSettingsService,
}));

import {
  getProfileFiscalSettings,
  putProfileFiscalSettings,
} from '../controllers/profile-fiscal.controller.js';

const mockRes = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
};

const mockReq = (overrides: Partial<AuthRequest> = {}) =>
  ({
    userId: 'u1',
    params: { id: 'p1' },
    query: {},
    body: {},
    ...overrides,
  }) as AuthRequest;

describe('profile-fiscal.controller', () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
  });

  describe('getProfileFiscalSettings', () => {
    it('envia AppError 401 si no hay usuario autenticado', async () => {
      const res = mockRes();

      await getProfileFiscalSettings(mockReq({ userId: undefined }), res, next);

      expect(getProfileFiscalSettingsService).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(vi.mocked(next).mock.calls[0]?.[0]).toMatchObject({
        status: 401,
        message: 'Usuario no autenticado',
      });
    });

    it('consulta settings fiscales con profileId y ejercicio normalizados', async () => {
      const result = { data: null };
      vi.mocked(getProfileFiscalSettingsService).mockResolvedValue(result as never);
      const res = mockRes();

      await getProfileFiscalSettings(
        mockReq({ params: { id: 'p1' }, query: { ejercicio: '2026' } }),
        res,
        next
      );

      expect(getProfileFiscalSettingsService).toHaveBeenCalledWith({
        userId: 'u1',
        profileId: 'p1',
        ejercicio: 2026,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('putProfileFiscalSettings', () => {
    it('actualiza settings fiscales con el body recibido', async () => {
      const body = {
        ejercicio: 2026,
        coeficiente_utilidad: 0.15,
        saldo_a_favor_iva: 100,
      };
      const result = { id: 'settings-1', profile_id: 'p1', ...body };
      vi.mocked(putProfileFiscalSettingsService).mockResolvedValue(result as never);
      const res = mockRes();

      await putProfileFiscalSettings(mockReq({ params: { id: 'p1' }, body }), res, next);

      expect(putProfileFiscalSettingsService).toHaveBeenCalledWith({
        userId: 'u1',
        profileId: 'p1',
        body,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Configuración fiscal guardada',
        data: result,
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
