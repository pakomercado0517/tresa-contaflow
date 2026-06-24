import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  toFiscalSettingsSnapshot,
  upsertFiscalSettings,
} from '../services/profile-fiscal.service.js';
import { ProfileFiscalSettings } from '../database/models/index.js';

vi.mock('../database/models/index.js', () => ({
  Profile: { findOne: vi.fn() },
  ProfileFiscalSettings: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

describe('profile-fiscal.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toFiscalSettingsSnapshot devuelve ceros sin fila', () => {
    const snap = toFiscalSettingsSnapshot(null);
    expect(snap.isr_pagos_provisionales_acum).toBe(0);
    expect(snap.coeficiente_utilidad).toBeNull();
  });

  it('upsertFiscalSettings crea fila con defaults numéricos', async () => {
    vi.mocked(ProfileFiscalSettings.findOne).mockResolvedValue(null);
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    vi.mocked(ProfileFiscalSettings.create).mockResolvedValue({
      id: 'row-1',
      profile_id: 'profile-1',
      ejercicio: 2026,
      coeficiente_utilidad: '0.15',
      coeficiente_utilidad_ejercicio_anterior: null,
      isr_pagos_provisionales_acum: '0',
      saldo_a_favor_isr: '0',
      saldo_a_favor_iva: '0',
      perdidas_fiscales_pendientes: '0',
      ptu_pagada_acum: '0',
      created_at: createdAt,
      updated_at: createdAt,
    } as never);

    const data = await upsertFiscalSettings('profile-1', {
      ejercicio: 2026,
      coeficiente_utilidad: 0.15,
    });

    expect(ProfileFiscalSettings.create).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_id: 'profile-1',
        ejercicio: 2026,
        coeficiente_utilidad: 0.15,
        isr_pagos_provisionales_acum: 0,
      })
    );
    expect(data.coeficiente_utilidad).toBe(0.15);
  });
});
