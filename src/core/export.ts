import { mkdir, open, rm } from 'node:fs/promises';
import path from 'node:path';
import writeXlsxFile from 'write-excel-file/node';
import { PAID, UNPAID, generationDate, type Snapshot } from './model';
import { UserError, publicError } from './errors';
import type { SheetInput, ExportResult } from '../shared';

export interface SheetAccess {
  read(input: SheetInput): Promise<Snapshot>;
  mark(input: SheetInput, snapshot: Snapshot, status: string): Promise<void>;
}

async function uniqueWrite(directory: string, base: string, data: Buffer) {
  for (let index = 1; ; index++) {
    const file = path.join(directory, `${base}${index === 1 ? '' : `_${index}`}.xlsx`);
    let handle;
    try { handle = await open(file, 'wx', 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue; throw error; }
    try { await handle.writeFile(data); }
    catch (error) { await handle.close(); await rm(file, { force: true }); throw error; }
    await handle.close();
    return file;
  }
}

export async function exportRecipients(api: SheetAccess, input: SheetInput, expectedDigest: string, outputDir: string, now = new Date()): Promise<ExportResult> {
  const source = await api.read(input);
  if (source.digest !== expectedDigest) throw new UserError('대상 확인 후 시트가 변경되었습니다. 대상을 다시 확인한 뒤 생성하세요.');
  if (source.rows.length === 0) throw new UserError('입금완료 또는 미입금 대상이 없습니다.');
  const date = generationDate(now);
  const files: string[] = [];
  await mkdir(outputDir, { recursive: true });
  try {
    for (const [status, label] of [[PAID, '입금완료자'], [UNPAID, '미입금자']]) {
      const targets = source.rows.filter(row => row.status === status);
      const buffer = await writeXlsxFile([
        [{ value: 'PersonName', type: String, fontWeight: 'bold' }, { value: 'Cellular', type: String, fontWeight: 'bold' }],
        ...targets.map(row => [{ value: row.name, type: String }, { value: row.phone, type: String, format: '@' }]),
      ], { sheet: 'Recipients', columns: [{ width: 22 }, { width: 24 }] }).toBuffer();
      files.push(await uniqueWrite(outputDir, `${date.replace('.', '')}_문자발송대상_${label}`, buffer));
    }
  } catch (error) {
    await Promise.all(files.map(file => rm(file, { force: true })));
    throw error;
  }
  const result: ExportResult = { ...source.preview, files, marked: 0 };
  if (input.markComplete && source.preview.paid) {
    try {
      // Avoid writing to shifted rows after an edit/sort during file generation.
      const latest = await api.read(input);
      if (latest.digest !== source.digest) {
        result.warning = '엑셀은 저장했습니다. 생성 중 시트가 변경되어 완료 표시는 하지 않았습니다. 시트를 확인하세요.';
      } else {
        await api.mark(input, source, `완료(${date})`);
        result.marked = source.preview.paid;
      }
    } catch (error) {
      result.warning = `엑셀은 저장했습니다. 시트 갱신 결과를 확인하지 못했습니다. 재실행 전 시트 상태를 확인하세요. ${publicError(error)}`;
    }
  }
  return result;
}
