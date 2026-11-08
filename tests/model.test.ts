import { describe, it, expect } from 'vitest';
import { snapshot, parseSheetUrl, generationDate, quoteSheet, columnName, validateInput } from '../src/core/model';
import { publicError } from '../src/core/errors';

describe('sheet input and recipient validation', () => {
  it('accepts Google sheet links and resolves gid', () => {
    expect(parseSheetUrl('https://docs.google.com/spreadsheets/d/example-id/edit#gid=23')).toEqual({ id: 'example-id', gid: 23 });
  });
  it.each(['http://docs.google.com/spreadsheets/d/a', 'https://docs.google.com.evil.test/spreadsheets/d/a', 'https://evil.test/a', 'file:///tmp/file', 'https://user:pass@docs.google.com/spreadsheets/d/a', 'https://docs.google.com:8000/spreadsheets/d/a'])('rejects untrusted link %s', value => {
    expect(() => parseSheetUrl(value)).toThrow();
  });
  it('keeps row numbers across empty rows and ignores other statuses', () => {
    const value = snapshot([
      ['이름', '연락처', '문자송부여부'],
      ['테스트 A', '010-0000-0001', '입금완료'], [],
      ['테스트 B', '01000000002', '미입금'],
      ['테스트 C', '01000000003', '완료(10.26)'],
    ], '문자송부여부');
    expect(value.rows.map(row => row.rowId)).toEqual([2, 4]);
    expect(value.preview).toEqual({ paid: 1, unpaid: 1, skipped: 1 });
  });
  it.each([1000000001, '1000000001', '', '=123456789'])('rejects missing or damaged contact without guessing: %s', phone => {
    expect(() => snapshot([['이름', '연락처', '상태'], ['테스트', phone, '입금완료']], '상태')).toThrow('2행');
  });
  it('rejects missing and duplicate headers and conflicting status column', () => {
    for (const headers of [['이름', '상태'], ['이름', '이름', '연락처', '상태']]) expect(() => snapshot([headers], '상태')).toThrow();
    expect(() => snapshot([['이름', '연락처']], '연락처')).toThrow();
  });
  it('supports international contact text and literal names', () => {
    const result = snapshot([['이름', '연락처', '상태'], ['=1+1', '+82 10 0000 0001', '입금완료']], '상태');
    expect(result.rows[0].name).toBe('=1+1');
  });
  it('formats date in Seoul and escapes tab names and wide columns', () => {
    expect(generationDate(new Date('2026-10-26T16:00:00Z'))).toBe('10.27');
    expect(quoteSheet("등록 '명단'")).toBe("'등록 ''명단''' ".trim());
    expect(columnName(26)).toBe('AA');
  });
  it('validates IPC settings rather than spreading arbitrary object fields', () => {
    expect(() => validateInput({ url: 'https://docs.google.com/spreadsheets/d/a', sheetName: '', statusColumn: '상태', markComplete: true })).toThrow();
  });
  it('never returns request tokens or Google error body in public messages', () => {
    expect(publicError({ message: 'Bearer SECRET', response: { status: 500, data: { token: 'SECRET' } } })).not.toContain('SECRET');
    expect(publicError({ response: { status: 403 } })).toContain('권한');
  });
});
