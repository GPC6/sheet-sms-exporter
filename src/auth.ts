import { OAuth2Client, CodeChallengeMethod, type Credentials } from 'google-auth-library';
import { createCallback } from './core/oauth-loopback';
import { UserError } from './core/errors';
import type { Store } from './store';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export interface OAuthConfig { clientId?: string; clientSecret?: string }
interface Session { clientId: string; email: string; credentials: Credentials }

export class Auth {
  client: OAuth2Client | null = null;
  email: string | null = null;
  private pending: AbortController | null = null;
  get configured() { return !!this.config.clientId && !!this.config.clientSecret; }
  constructor(private config: OAuthConfig, private store: Store, private openBrowser: (url: string) => Promise<void>) {}
  async restore() {
    if (!this.configured) return;
    const data = await this.store.session() as Session | null;
    if (!data || data.clientId !== this.config.clientId) return;
    if (!data.credentials?.refresh_token || typeof data.email !== 'string') throw new UserError('저장된 인증을 사용할 수 없습니다. 다시 로그인하세요.');
    const client = new OAuth2Client({ clientId: this.config.clientId, clientSecret: this.config.clientSecret, transporterOptions: { timeout: 30_000 } });
    client.setCredentials(data.credentials);
    this.client = client;
    this.email = data.email;
  }
  async persist() {
    if (this.client && this.email) await this.store.saveSession({ clientId: this.config.clientId, email: this.email, credentials: this.client.credentials });
  }
  async login() {
    if (!this.configured) throw new UserError('이 빌드에는 Google 로그인 설정이 없습니다. 개발자가 OAuth 설정을 넣어 다시 빌드해야 합니다. README의 설정 안내를 확인하세요.');
    if (this.pending) throw new UserError('이미 로그인을 진행 중입니다.');
    if (!await this.store.secureAvailable()) throw new UserError('운영체제 보안 저장소를 사용할 수 없습니다. 잠금을 해제한 후 다시 시도하세요.');
    this.pending = new AbortController();
    const pending = this.pending;
    let callback: Awaited<ReturnType<typeof createCallback>> | undefined;
    try {
      callback = await createCallback(pending.signal);
      const client = new OAuth2Client({ clientId: this.config.clientId, clientSecret: this.config.clientSecret, redirectUri: callback.redirectUri, transporterOptions: { timeout: 30_000 } });
      const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
      const url = client.generateAuthUrl({
        access_type: 'offline', prompt: 'consent', scope: ['openid', 'email', SHEETS_SCOPE],
        state: callback.state, code_challenge: codeChallenge, code_challenge_method: CodeChallengeMethod.S256,
      });
      await this.openBrowser(url);
      const { tokens } = await client.getToken({ code: await callback.code, codeVerifier, redirect_uri: callback.redirectUri });
      if (pending.signal.aborted) throw new UserError('로그인이 취소되었습니다.');
      if (!tokens.refresh_token || !tokens.id_token || !tokens.scope?.split(' ').includes(SHEETS_SCOPE)) throw new UserError('시트 접근 권한이 승인되지 않았습니다. 로그인할 때 시트 권한을 허용하세요.');
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: this.config.clientId });
      const payload = ticket.getPayload();
      if (!payload?.email || !payload.email_verified) throw new UserError('구글 계정 정보를 확인할 수 없습니다. 다시 로그인하세요.');
      if (pending.signal.aborted) throw new UserError('로그인이 취소되었습니다.');
      client.setCredentials(tokens);
      await this.store.saveSession({ clientId: this.config.clientId, email: payload.email, credentials: tokens });
      if (pending.signal.aborted) { await this.store.clearSession(); throw new UserError('로그인이 취소되었습니다.'); }
      this.client = client;
      this.email = payload.email;
    } finally { callback?.close(); this.pending = null; }
  }
  cancel() { this.pending?.abort(); }
  requireClient() {
    if (!this.client) throw new UserError('먼저 Google 계정으로 로그인하세요.');
    return this.client;
  }
  async logout(): Promise<string | undefined> {
    this.cancel();
    const client = this.client;
    this.client = null;
    this.email = null;
    await this.store.clearSession();
    if (client) {
      try { await client.revokeCredentials(); }
      catch { return '이 기기의 로그인 정보는 삭제했습니다. 구글 연결 해제는 실패했으므로 Google 계정의 연결된 앱 설정에서 해제할 수 있습니다.'; }
    }
  }
}
