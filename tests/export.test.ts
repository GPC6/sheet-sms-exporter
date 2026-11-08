import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { exportRecipients, type SheetAccess } from '../src/core/export';
import { snapshot } from '../src/core/model';
import type { SheetInput } from '../src/shared';

const input: SheetInput = { url: 'https://docs.google.com/spreadsheets/d/test-only', sheetName: '명단', statusColumn: '상태', markComplete: true };
const source = snapshot([['이름', '연락처', '상태'], ['=1+1', '010-0000-0001', '입금완료'], [], ['테스트 B', '01000000002', '미입금']], '상태');
const date = new Date('2026-10-26T16:00:00Z');

describe('recipient export and partial failures', () => {
  let directory: string;
  let api: SheetAccess;
  beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), 'sheet-sms-test-')); api = { read: vi.fn().mockResolvedValue(source), mark: vi.fn().mockResolvedValue(undefined) }; });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
  it('writes two real XLSX files, text phones, literal formula-like names and only paid updates', async () => {
    const result = await exportRecipients(api, input, source.digest, directory, date);
    expect(result.files).toHaveLength(2);
    expect(result.files[0]).toContain('1027_문자발송대상_입금완료자');
    const zip = unzipSync(await readFile(result.files[0]));
    const xml = Object.entries(zip).filter(([name]) => name.endsWith('.xml')).map(([, bytes]) => strFromU8(bytes)).join('\n');
    expect(xml).toContain('PersonName'); expect(xml).toContain('Cellular');
    expect(xml).toContain('010-0000-0001'); expect(xml).toContain('=1+1'); expect(xml).not.toContain('<f>');
    expect(xml).not.toContain('테스트 B');
    expect(result.marked).toBe(1);
    expect(api.mark).toHaveBeenCalledWith(input, source, '완료(10.27)');
  });
  it('preserves existing files when exporting twice', async () => {
    const first = await exportRecipients(api, { ...input, markComplete: false }, source.digest, directory, date);
    const bytes = await readFile(first.files[0]);
    const second = await exportRecipients(api, { ...input, markComplete: false }, source.digest, directory, date);
    expect(second.files[0]).toMatch(/_2\.xlsx$/);
    expect(await readFile(first.files[0])).toEqual(bytes);
    expect(api.mark).not.toHaveBeenCalled();
  });
  it('blocks stale preview before creating any files', async () => {
    await expect(exportRecipients(api, input, 'old-digest', directory, date)).rejects.toThrow('변경');
    expect(await readdir(directory)).toEqual([]); expect(api.mark).not.toHaveBeenCalled();
  });
  it('keeps files and skips status write if rows move during export', async () => {
    vi.mocked(api.read).mockResolvedValueOnce(source).mockResolvedValueOnce({ ...source, digest: 'changed' });
    const result = await exportRecipients(api, input, source.digest, directory, date);
    expect(result.warning).toContain('시트가 변경'); expect(result.marked).toBe(0);
    expect(await readdir(directory)).toHaveLength(2); expect(api.mark).not.toHaveBeenCalled();
  });
  it('reports ambiguous write failure without exposing raw request data or deleting generated files', async () => {
    vi.mocked(api.mark).mockRejectedValue(new Error('Bearer PRIVATE_TOKEN with personal data'));
    const result = await exportRecipients(api, input, source.digest, directory, date);
    expect(result.warning).toContain('갱신 결과'); expect(result.warning).not.toContain('PRIVATE_TOKEN');
    expect(await readdir(directory)).toHaveLength(2);
  });
  it('does not update the sheet when local save fails', async () => {
    const blocked = path.join(directory, 'file-not-folder'); await writeFile(blocked, 'existing');
    await expect(exportRecipients(api, input, source.digest, blocked, date)).rejects.toThrow();
    expect(api.mark).not.toHaveBeenCalled();
  });
  it('refuses empty recipient list', async () => {
    const empty = snapshot([['이름', '연락처', '상태']], '상태'); vi.mocked(api.read).mockResolvedValue(empty);
    await expect(exportRecipients(api, input, empty.digest, directory, date)).rejects.toThrow('대상이 없습니다');
  });
});
