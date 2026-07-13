export type CacheEvent = 'hit' | 'miss' | 'set' | 'invalidate' | 'error';

export type CacheDomain = 'metrics' | 'tax' | 'public' | 'invoices' | 'expenses' | 'auth';

export interface CacheLogContext {
  cache: true;
  event: CacheEvent;
  key?: string;
  profileId?: string;
  userId?: string;
  domain?: CacheDomain;
  error?: string;
}

export interface CacheSetOptions {
  ttlSeconds: number;
  indexKey: string;
}
