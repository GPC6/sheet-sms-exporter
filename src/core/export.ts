import { mkdir, open, rm } from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx-js-style';
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
      // Keep the legacy template and writer: the SMS importer depends on the XLSX structure.
      const workbook = XLSX.readFile(path.join(__dirname, 'sms-template.xlsx'), { cellStyles: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      ['PersonName', 'Cellular'].forEach((header, column) => {
        const address = XLSX.utils.encode_cell({ r: 0, c: column });
        sheet[address] = { ...sheet[address], v: header, t: 's' };
      });
      const styles = ['A2', 'B2'].map(address => ({ s: sheet[address]?.s, z: sheet[address]?.z }));
      const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:B1');
      const lastRow = Math.max(range.e.r + 1, 2 + targets.length);
      for (let row = 2; row <= lastRow; row++) {
        delete sheet[`A${row}`];
        delete sheet[`B${row}`];
      }
      targets.forEach((target, index) => {
        [target.name, target.phone].forEach((value, column) => {
          sheet[XLSX.utils.encode_cell({ r: index + 1, c: column })] = { ...styles[column], v: value, t: 's' };
        });
      });
      sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(targets.length, 1), c: 1 } });
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
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
