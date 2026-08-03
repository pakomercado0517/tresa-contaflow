import type {
  DiscountCodeCreateInput,
  DiscountCodeListQueryParams,
} from '../types/discount.types.js';
import { AppError } from '../utils/AppError.js';

const DISCOUNT_DURATIONS = ['once', 'repeating', 'forever'] as const;

function isDiscountDuration(value: string): value is DiscountCodeCreateInput['duration'] {
  return (DISCOUNT_DURATIONS as readonly string[]).includes(value);
}

export function normalizeDiscountCodeCreateInput(
  body: Record<string, unknown>
): DiscountCodeCreateInput {
  const codeRaw = body.code;
  if (typeof codeRaw !== 'string' || codeRaw.trim().length === 0) {
    throw new AppError('code es requerido', 400);
  }

  const durationRaw = body.duration;
  if (typeof durationRaw !== 'string' || !isDiscountDuration(durationRaw)) {
    throw new AppError('duration debe ser once, repeating o forever', 400);
  }

  const input: DiscountCodeCreateInput = {
    code: codeRaw.trim().toUpperCase(),
    duration: durationRaw,
  };

  if (typeof body.durationInMonths === 'number') {
    input.durationInMonths = body.durationInMonths;
  }
  if (typeof body.percentOff === 'number') {
    input.percentOff = body.percentOff;
  }
  if (typeof body.amountOff === 'number') {
    input.amountOff = body.amountOff;
  }
  if (typeof body.currency === 'string' && body.currency.length > 0) {
    input.currency = body.currency;
  }
  if (typeof body.maxRedemptions === 'number') {
    input.maxRedemptions = body.maxRedemptions;
  }
  if (typeof body.expiresAt === 'string' && body.expiresAt.length > 0) {
    input.expiresAt = new Date(body.expiresAt);
  }
  if (typeof body.active === 'boolean') {
    input.active = body.active;
  }
  if (body.metadata !== null && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
    input.metadata = body.metadata as Record<string, string>;
  }
  if (typeof body.trialDays === 'number') {
    input.trialDays = body.trialDays;
  }

  return input;
}

/**
 * Normaliza query params ya validados en routes: defaults de paginación y formato de filtros.
 */
export function normalizeDiscountListQuery(
  query: Record<string, unknown>
): DiscountCodeListQueryParams {
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit ?? '50'), 10) || 50));

  const params: DiscountCodeListQueryParams = { page, limit };

  if (typeof query.code === 'string' && query.code.trim().length > 0) {
    params.code = query.code.trim().toUpperCase();
  }

  if (query.active === 'true') {
    params.active = true;
  } else if (query.active === 'false') {
    params.active = false;
  }

  return params;
}
