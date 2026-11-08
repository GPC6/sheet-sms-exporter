import { describe, it, expect } from 'vitest';
import { createCallback } from '../src/core/oauth-loopback';

describe('OAuth loopback callback', () => {
  it('rejects wrong state and still accepts the legitimate response', async () => {
    const callback = await createCallback();
    try {
      const wrong = await fetch(`${callback.redirectUri}?state=bad&code=attacker`);
      expect(wrong.status).toBe(400);
      const correct = await fetch(`${callback.redirectUri}?state=${callback.state}&code=legitimate`);
      expect(correct.status).toBe(200);
      expect(correct.headers.get('cache-control')).toBe('no-store');
      await expect(callback.code).resolves.toBe('legitimate');
    } finally { callback.close(); }
  });
  it('rejects denied consent with correct state', async () => {
    const callback = await createCallback();
    try {
      await fetch(`${callback.redirectUri}?state=${callback.state}&error=access_denied`);
      await expect(callback.code).rejects.toThrow('취소');
    } finally { callback.close(); }
  });
  it('supports cancel and timeout without leaving pending login', async () => {
    const controller = new AbortController();
    const callback = await createCallback(controller.signal);
    controller.abort(); await expect(callback.code).rejects.toThrow('취소'); callback.close();
    const expired = await createCallback(undefined, 15);
    await expect(expired.code).rejects.toThrow('초과'); expired.close();
  });
});
