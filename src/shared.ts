export interface SheetInput {
  url: string;
  sheetName: string;
  statusColumn: string;
  markComplete: boolean;
}
export interface Settings extends SheetInput { outputDir: string }
export interface AppState {
  configured: boolean;
  account: string | null;
  settings: Settings;
  notice?: string;
}
export interface SheetInfo { title: string; tabs: { title: string; id: number }[]; selected: string }
export interface Preview { paid: number; unpaid: number; skipped: number }
export interface ExportResult extends Preview {
  files: string[];
  marked: number;
  warning?: string;
}
export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };
export interface DesktopApi {
  state(): Promise<Reply<AppState>>;
  login(): Promise<Reply<AppState>>;
  cancelLogin(): Promise<Reply<void>>;
  logout(): Promise<Reply<AppState>>;
  chooseFolder(): Promise<Reply<string | null>>;
  loadSheet(url: string): Promise<Reply<SheetInfo>>;
  preview(input: SheetInput): Promise<Reply<Preview>>;
  export(input: SheetInput): Promise<Reply<ExportResult>>;
  openOutput(): Promise<Reply<void>>;
}
declare global { interface Window { desktop: DesktopApi } }
