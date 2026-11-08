import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { UserError } from './errors';

export async function createCallback(signal?: AbortSignal, timeoutMs = 180_000) {
  const state = randomBytes(32).toString('base64url');
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  let finished = false;
  const code = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
  // A cancellation can happen while the system browser is opening.
  void code.catch(() => {});
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const supplied = Buffer.from(url.searchParams.get('state') ?? '');
    const expected = Buffer.from(state);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'");
    if (request.method !== 'GET' || url.pathname !== '/oauth2callback' || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      response.writeHead(400).end('올바르지 않은 로그인 응답입니다. 앱에서 다시 시도하세요.');
      return;
    }
    if (finished) { response.writeHead(410).end('이미 처리된 로그인입니다.'); return; }
    const value = url.searchParams.get('code');
    if (url.searchParams.has('error') || !value) {
      finished = true;
      response.end('로그인이 취소되었습니다. 앱으로 돌아가세요.');
      rejectCode(new UserError('구글 로그인이 취소되었습니다.'));
    } else {
      finished = true;
      response.end('로그인 응답을 받았습니다. 이 창을 닫고 앱으로 돌아가세요.');
      resolveCode(value);
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve()); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No loopback address');
  const cancel = () => { finished = true; rejectCode(new UserError('로그인이 취소되었습니다.')); };
  const timer = setTimeout(() => { finished = true; rejectCode(new UserError('로그인 시간이 초과되었습니다. 다시 시도하세요.')); }, timeoutMs);
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  return {
    state, code, redirectUri: `http://127.0.0.1:${address.port}/oauth2callback`,
    close() { clearTimeout(timer); signal?.removeEventListener('abort', cancel); server.close(); server.closeAllConnections(); },
  };
}
