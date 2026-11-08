import type { OAuth2Client } from 'google-auth-library';
import type { SheetInfo, SheetInput } from '../shared';
import { parseSheetUrl, quoteSheet, columnName, snapshot, type Snapshot } from './model';
import { UserError } from './errors';

export class Sheets {
  constructor(private auth: OAuth2Client) {}
  private base(id: string) { return `https://sheets.googleapis.com/v4/spreadsheets/${id}`; }
  async info(url: string): Promise<SheetInfo> {
    const { id, gid } = parseSheetUrl(url);
    const response = await this.auth.request<{ properties: { title: string }; sheets: { properties: { title: string; sheetId: number; sheetType: string } }[] }>({
      url: this.base(id), params: { fields: 'properties(title),sheets(properties(sheetId,title,sheetType))' }, timeout: 30_000,
    });
    const tabs = response.data.sheets.filter(sheet => sheet.properties.sheetType === 'GRID').map(sheet => ({ title: sheet.properties.title, id: sheet.properties.sheetId }));
    if (!tabs.length) throw new UserError('사용할 수 있는 시트 탭이 없습니다.');
    return { title: response.data.properties.title, tabs, selected: (tabs.find(tab => tab.id === gid) ?? tabs[0]).title };
  }
  async read(input: SheetInput): Promise<Snapshot> {
    const { id } = parseSheetUrl(input.url);
    const result = await this.auth.request<{ values?: unknown[][] }>({
      url: `${this.base(id)}/values/${encodeURIComponent(quoteSheet(input.sheetName))}`,
      params: { valueRenderOption: 'FORMATTED_VALUE' }, timeout: 30_000,
    });
    return snapshot(result.data.values ?? [], input.statusColumn);
  }
  async mark(input: SheetInput, source: Snapshot, status: string): Promise<void> {
    const { id } = parseSheetUrl(input.url);
    const rows = source.rows.filter(row => row.status === '입금완료');
    if (!rows.length) return;
    await this.auth.request({
      url: `${this.base(id)}/values:batchUpdate`, method: 'POST', timeout: 30_000, retry: false,
      data: { valueInputOption: 'RAW', data: rows.map(row => ({ range: `${quoteSheet(input.sheetName)}!${columnName(source.statusIndex)}${row.rowId}`, values: [[status]] })) },
    });
  }
}
