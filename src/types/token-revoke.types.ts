export type TokenRevokeEvent = 'revoke' | 'deny_hit' | 'deny_miss' | 'error';

export type TokenRevokeKind = 'access' | 'refresh';

export interface TokenRevokeLogContext {
  domain: 'auth';
  event: TokenRevokeEvent;
  kind?: TokenRevokeKind;
  key?: string;
  userId?: string;
  error?: string;
}

export interface LogoutBody {
  refreshToken: string;
}
