import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaxEstimateService } from '../../services/tax-estimate.service.js';
import { MetricsService } from '../../services/metrics.service.js';
import { createEmptyMetrics } from './fixtures.js';

vi.mock('../../database/models/index.js', () => ({
  Profile: {
    findByPk: vi.fn(),
  },
  Period: {
    findOne: vi.fn(),
  },
}));

import { Profile } from '../../database/models/index.js';

describe('TaxEstimateService', () => {
  let metricsService: MetricsService;
  let service: TaxEstimateService;

  beforeEach(() => {
    metricsService = new MetricsService();
    service = new TaxEstimateService(metricsService);
    vi.clearAllMocks();
  });

  describe('estimateFromMetrics', () => {
    it('agrega alerta de límite anual RESICO cuando el acumulado supera 3.5M', () => {
      const metrics = createEmptyMetrics({
        flujo: {
          ingresos_cobrados: 100_000,
          egresos_pagados: 0,
          flujo_neto: 100_000,
          ingresos_cobrados_sin_conciliar: 0,
          egresos_pagados_sin_conciliar: 0,
        },
      });

      const result = service.estimateFromMetrics(
        metrics,
        { regimen: '626', tipoPersona: 'FISICA', ejercicio: 2026, mes: 6 },
        { ingresosCobradosAcumulados: 3_600_000 }
      );

      expect(result.alerts.some((a) => a.code === 'W_RESICO_LIMITE_ANUAL')).toBe(true);
    });

    it('agrega alerta de límite anual RESICO PM cuando ingresos YTD superan 35M', () => {
      const metrics = createEmptyMetrics();
      const ytd = createEmptyMetrics({
        flujo: {
          ingresos_cobrados: 36_000_000,
          egresos_pagados: 0,
          flujo_neto: 36_000_000,
          ingresos_cobrados_sin_conciliar: 0,
          egresos_pagados_sin_conciliar: 0,
        },
      });

      const result = service.estimateFromMetrics(
        metrics,
        { regimen: '626', tipoPersona: 'MORAL', ejercicio: 2026, mes: 6 },
        { ytdMetrics: ytd }
      );

      expect(result.alerts.some((a) => a.code === 'W_RESICO_PM_LIMITE_ANUAL')).toBe(true);
      expect(result.supported).toBe(true);
    });
  });

  describe('estimateForProfileMonth', () => {
    it('lanza error si el régimen no pertenece al perfil', async () => {
      vi.mocked(Profile.findByPk).mockResolvedValue({
        id: 'p1',
        tipo_persona: 'FISICA',
        regimenes_fiscales: ['626'],
      } as never);

      await expect(service.estimateForProfileMonth('p1', 6, 2026, '601')).rejects.toMatchObject({
        code: 'REGIMEN_NOT_IN_PROFILE',
        statusCode: 400,
      });
    });
  });
});
