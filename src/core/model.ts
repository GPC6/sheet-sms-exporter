import { UserError } from './errors';
import { createHash } from 'node:crypto';
import type { SheetInput, Preview } from '../shared';

export const PAID = '입금완료';
export const UNPAID = '미입금';
export interface Target { rowId: number; name: string; phone: string; status: string }
export interface Snapshot { rows: Target[]; preview: Preview; digest: string; statusIndex: number }

export function parseSheetUrl(value: string): { id: string; gid?: number } {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new UserError('Google 스프레드시트 링크를 입력하세요.'); }
  const match = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || url.port || url.username || url.password || !match) {
    throw new UserError('https://docs.google.com/spreadsheets/d/ 로 시작하는 시트 링크가 필요합니다.');
  }
  const gid = new URLSearchParams(url.hash.slice(1)).get('gid') ?? url.searchParams.get('gid');
  return { id: match[1], ...(gid && /^\d+$/.test(gid) ? { gid: Number(gid) } : {}) };
}

export function validateInput(raw: SheetInput): SheetInput {
  if (!raw || typeof raw.url !== 'string' || typeof raw.sheetName !== 'string' || typeof raw.statusColumn !== 'string' || typeof raw.markComplete !== 'boolean') {
    throw new UserError('시트 설정이 올바르지 않습니다.');
  }
  parseSheetUrl(raw.url);
  if (!raw.sheetName.trim() || raw.sheetName.length > 100 || !raw.statusColumn.trim() || raw.statusColumn.length > 100) {
    throw new UserError('시트 탭과 상태 컬럼 이름을 확인하세요.');
  }
  return { url: raw.url.trim(), sheetName: raw.sheetName, statusColumn: raw.statusColumn.trim(), markComplete: raw.markComplete };
}

export function quoteSheet(name: string): string { return `'${name.replace(/'/g, "''")}'`; }
export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}

export function snapshot(values: unknown[][], statusColumn: string): Snapshot {
  const headers = (values[0] ?? []).map(value => String(value ?? '').trim());
  const fields = ['이름', '연락처', statusColumn];
  if (new Set(fields).size !== 3) throw new UserError('상태 컬럼은 이름·연락처 컬럼과 달라야 합니다.');
  for (const field of fields) {
    if (headers.filter(header => header === field).length !== 1) throw new UserError(`헤더에 '${field}' 컬럼이 정확히 하나 있어야 합니다.`);
  }
  const [nameIndex, phoneIndex, statusIndex] = fields.map(field => headers.indexOf(field));
  const rows: Target[] = [];
  let skipped = 0;
  values.slice(1).forEach((row, index) => {
    if (!row.some(cell => String(cell ?? '').trim())) return;
    const status = String(row[statusIndex] ?? '');
    if (status !== PAID && status !== UNPAID) { skipped++; return; }
    const name = String(row[nameIndex] ?? '').trim();
    const phone = String(row[phoneIndex] ?? '').trim();
    // Numeric cells can already have lost the leading zero. Never guess a recipient's number.
    const digits = phone.replace(/[ ()-]/g, '');
    if (!name || typeof row[phoneIndex] !== 'string' || !/^(?:0\d{8,10}|\+[1-9]\d{7,14})$/.test(digits)) {
      throw new UserError(`${index + 2}행의 이름 또는 연락처를 확인하세요. 연락처는 앞자리 0이 유지되는 텍스트로 입력해야 합니다.`);
    }
    rows.push({ rowId: index + 2, name, phone, status });
  });
  return {
    rows, statusIndex,
    preview: { paid: rows.filter(row => row.status === PAID).length, unpaid: rows.filter(row => row.status === UNPAID).length, skipped },
    digest: createHash('sha256').update(JSON.stringify(values)).digest('hex'),
  };
}

export function generationDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }).format(date).replace('/', '.');
}
