import { Router, type IRouter, type Request, type Response } from 'express';
import { Profile } from '../database/models/index.js';
import { syncInvoicesForProfile } from '../services/sat-descarga-masiva.service.js';

const router: IRouter = Router();

/**
 * Middleware: exige header X-Cron-Secret igual a CRON_SECRET.
 */
function requireCronSecret(req: Request, res: Response, next: () => void): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({
      error: 'Cron no configurado',
      message: 'CRON_SECRET no está definido',
    });
    return;
  }
  const headerSecret = req.headers['x-cron-secret'];
  if (headerSecret !== secret) {
    res.status(403).json({
      error: 'No autorizado',
      message: 'Header X-Cron-Secret inválido',
    });
    return;
  }
  next();
}

/**
 * POST /api/internal/sat-sync
 * Llamado por Railway Cron. Procesa perfiles con sat_download_sync_enabled.
 */
router.post('/sat-sync', requireCronSecret, async (_req: Request, res: Response): Promise<void> => {
  try {
    const profiles = await Profile.findAll({
      where: { sat_download_sync_enabled: true },
      attributes: ['id'],
    });

    let processed = 0;
    const errors: string[] = [];

    for (const p of profiles) {
      try {
        const result = await syncInvoicesForProfile(p.id);
        processed += result.synced;
        if (result.errors.length > 0) {
          errors.push(`${p.id}: ${result.errors.join('; ')}`);
        }
      } catch (err) {
        errors.push(`${p.id}: ${err instanceof Error ? err.message : 'Error desconocido'}`);
      }
    }

    res.status(200).json({ processed, errors });
  } catch (error) {
    console.error('Error en sat-sync cron:', error);
    res.status(500).json({
      processed: 0,
      errors: [error instanceof Error ? error.message : 'Error desconocido'],
    });
  }
});

export default router;
