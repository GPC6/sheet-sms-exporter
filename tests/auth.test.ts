import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OAuth2Client } from 'google-auth-library';
import { Auth } from '../src/auth';
import type { Store } from '../src/store';

function fakeStore() {
  return { secureAvailable: vi.fn().mockResolvedValue(true), saveSession: vi.fn().mockResolvedValue(undefined), session: vi.fn().mockResolvedValue(null), clearSession: vi.fn().mockResolvedValue(undefined) };
}
const config = { clientId: 'test.apps.googleusercontent.com', clientSecret: 'desktop-test-config' };
const tokens = { refresh_token: 'synthetic-refresh', access_token: 'synthetic-access', id_token: 'synthetic-id', scope: 'openid email https://www.googleapis.com/auth/spreadsheets' };
afterEach(() => vi.restoreAllMocks());

describe('desktop OAuth orchestration (Google responses mocked)', () => {
  it('uses the browser, PKCE, state, verified identity and encrypted-store interface', async () => {
    const store = fakeStore();
    const exchange = vi.spyOn(OAuth2Client.prototype, 'getToken').mockResolvedValue({ tokens } as never);
    vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({ getPayload: () => ({ email: 'test@example.invalid', email_verified: true }) } as never);
    let authorization!: URL;
    const auth = new Auth(config, store as unknown as Store, async url => {
      authorization = new URL(url);
      const callback = new URL(authorization.searchParams.get('redirect_uri')!);
      callback.searchParams.set('state', authorization.searchParams.get('state')!); callback.searchParams.set('code', 'synthetic-code');
      await fetch(callback);
    });
    await auth.login();
    expect(authorization.hostname).toBe('accounts.google.com');
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    const request = exchange.mock.calls[0][0] as unknown as { codeVerifier: string; code: string };
    expect(createHash('sha256').update(request.codeVerifier).digest('base64url')).toBe(authorization.searchParams.get('code_challenge'));
    expect(request.code).toBe('synthetic-code');
    expect(store.saveSession).toHaveBeenCalledWith({ clientId: config.clientId, email: 'test@example.invalid', credentials: tokens });
    expect(auth.email).toBe('test@example.invalid');
  });
  it('refuses to authenticate when secure storage is unavailable', async () => {
    const store = fakeStore(); store.secureAvailable.mockResolvedValue(false); const browser = vi.fn();
    await expect(new Auth(config, store as unknown as Store, browser).login()).rejects.toThrow('보안 저장소');
    expect(browser).not.toHaveBeenCalled(); expect(store.saveSession).not.toHaveBeenCalled();
  });
  it('refuses tokens without the Sheets grant', async () => {
    const store = fakeStore(); vi.spyOn(OAuth2Client.prototype, 'getToken').mockResolvedValue({ tokens: { ...tokens, scope: 'openid email' } } as never);
    const auth = new Auth(config, store as unknown as Store, async url => {
      const query = new URL(url).searchParams;
      await fetch(`${query.get('redirect_uri')}?state=${query.get('state')}&code=test`);
    });
    await expect(auth.login()).rejects.toThrow('권한이 승인되지');
    expect(auth.client).toBeNull(); expect(store.saveSession).not.toHaveBeenCalled();
  });
  it('does not restore a token belonging to another OAuth client', async () => {
    const store = fakeStore(); store.session.mockResolvedValue({ clientId: 'other', email: 'test@example.invalid', credentials: tokens });
    const auth = new Auth(config, store as unknown as Store, vi.fn()); await auth.restore();
    expect(auth.client).toBeNull();
  });
});
