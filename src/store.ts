import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { safeStorage } from 'electron';
import type { Settings } from './shared';
import { UserError } from './core/errors';

export class Store {
  constructor(private directory: string) {}
  private file(name: string) { return path.join(this.directory, name); }
  private async write(name: string, value: string | Buffer) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temp = this.file(`${name}.tmp`);
    await writeFile(temp, value, { mode: 0o600 });
    await rename(temp, this.file(name));
  }
  async settings(defaultOutput: string): Promise<Settings> {
    const defaults: Settings = { url: '', sheetName: '', statusColumn: '문자송부여부', outputDir: defaultOutput, markComplete: true };
    try {
      const value = JSON.parse(await readFile(this.file('settings.json'), 'utf8'));
      for (const key of ['url', 'sheetName', 'statusColumn', 'outputDir'] as const) if (typeof value[key] === 'string') defaults[key] = value[key];
      if (typeof value.markComplete === 'boolean') defaults.markComplete = value.markComplete;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new UserError('저장된 설정을 읽을 수 없습니다. 앱 데이터 폴더의 settings.json을 확인하세요.'); }
    return defaults;
  }
  saveSettings(settings: Settings) { return this.write('settings.json', JSON.stringify(settings, null, 2)); }
  async secureAvailable() {
    if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') return false;
    return safeStorage.isAsyncEncryptionAvailable();
  }
  async saveSession(value: unknown) {
    if (!await this.secureAvailable()) throw new UserError('운영체제의 보안 저장소를 사용할 수 없어 로그인 정보를 저장하지 않았습니다.');
    await this.write('session.enc', await safeStorage.encryptStringAsync(JSON.stringify(value)));
  }
  async session(): Promise<unknown | null> {
    let bytes: Buffer;
    try { bytes = await readFile(this.file('session.enc')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    if (!await this.secureAvailable()) throw new UserError('보안 저장소에 접근할 수 없습니다. 운영체제 잠금을 해제하고 다시 로그인하세요.');
    const decrypted = await safeStorage.decryptStringAsync(bytes);
    const value = JSON.parse(decrypted.result);
    if (decrypted.shouldReEncrypt) await this.saveSession(value);
    return value;
  }
  async clearSession() { await rm(this.file('session.enc'), { force: true }); }
}
