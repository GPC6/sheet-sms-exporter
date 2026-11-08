import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Store } from './store';
import { Auth, type OAuthConfig } from './auth';
import { Sheets } from './core/sheets';
import { exportRecipients } from './core/export';
import { validateInput, parseSheetUrl } from './core/model';
import { UserError, publicError } from './core/errors';
import type { Settings, SheetInput, AppState, Reply } from './shared';

let window: BrowserWindow | null = null;
let auth: Auth;
let settings: Settings;
let store: Store;
let notice: string | undefined;
let busy = false;
let checked: { input: string; digest: string } | null = null;
const rendererFile = path.join(__dirname, 'index.html');
const rendererUrl = pathToFileURL(rendererFile).href;
// Isolate development smoke tests from the operator's saved account and settings.
const testUserData = app.commandLine.getSwitchValue('test-user-data');
if (!app.isPackaged && testUserData && path.isAbsolute(testUserData)) app.setPath('userData', testUserData);

function state(): AppState { return { configured: auth.configured, account: auth.email, settings, notice }; }

function handle<T>(name: string, callback: (...args: any[]) => Promise<T> | T, exclusive = true) {
  ipcMain.handle(name, async (event, ...args): Promise<Reply<T>> => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== rendererUrl) {
      return { ok: false, error: '허용되지 않은 요청입니다.' };
    }
    if (exclusive && busy) return { ok: false, error: '진행 중인 작업이 끝난 뒤 다시 시도하세요.' };
    if (exclusive) busy = true;
    try { return { ok: true, data: await callback(...args) }; }
    catch (error) { return { ok: false, error: publicError(error) }; }
    finally { if (exclusive) busy = false; }
  });
}

async function withSheets<T>(action: (api: Sheets) => Promise<T>) {
  const result = await action(new Sheets(auth.requireClient()));
  try { await auth.persist(); }
  catch { notice = '로그인 정보의 갱신을 저장하지 못했습니다. 다음 실행 시 다시 로그인해야 할 수 있습니다.'; }
  return result;
}

function registerHandlers() {
  handle('state', state, false);
  handle('login', async () => { checked = null; await auth.login(); notice = undefined; return state(); });
  handle('cancel-login', () => auth.cancel(), false);
  handle('logout', async () => { checked = null; notice = await auth.logout(); return state(); });
  handle('choose-folder', async () => {
    const result = await dialog.showOpenDialog(window!, { title: '엑셀 저장 폴더', properties: ['openDirectory', 'createDirectory'], defaultPath: settings.outputDir });
    if (result.canceled) return null;
    settings.outputDir = result.filePaths[0];
    await store.saveSettings(settings);
    checked = null;
    return settings.outputDir;
  });
  handle('load-sheet', async (url: string) => {
    if (typeof url !== 'string') throw new UserError('시트 링크를 입력하세요.');
    parseSheetUrl(url);
    checked = null;
    const info = await withSheets(api => api.info(url));
    const previous = settings.url === url && info.tabs.some(tab => tab.title === settings.sheetName) ? settings.sheetName : info.selected;
    settings = { ...settings, url: url.trim(), sheetName: previous };
    await store.saveSettings(settings);
    return { ...info, selected: previous };
  });
  handle('preview', async (raw: SheetInput) => {
    checked = null;
    const input = validateInput(raw);
    const source = await withSheets(api => api.read(input));
    settings = { ...settings, ...input };
    await store.saveSettings(settings);
    checked = { input: JSON.stringify(input), digest: source.digest };
    return source.preview;
  });
  handle('export', async (raw: SheetInput) => {
    const input = validateInput(raw);
    const expected = checked;
    checked = null;
    if (!expected || expected.input !== JSON.stringify(input)) throw new UserError('먼저 현재 설정으로 대상을 확인하세요.');
    return withSheets(api => exportRecipients(api, input, expected.digest, settings.outputDir));
  });
  handle('open-output', async () => {
    const error = await shell.openPath(settings.outputDir);
    if (error) throw new UserError('저장 폴더를 열 수 없습니다. 엑셀 생성 후 다시 시도하세요.');
  });
}

async function createWindow() {
  window = new BrowserWindow({
    width: 1080, height: 860, minWidth: 840, minHeight: 720, title: '시트 문자 도우미',
    backgroundColor: '#f4f5f7', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, devTools: !app.isPackaged },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.once('ready-to-show', () => window?.show());
  window.on('close', event => {
    if (busy) { event.preventDefault(); void dialog.showMessageBox(window!, { message: '작업이 진행 중입니다.', detail: '로그인은 화면에서 취소할 수 있습니다. 엑셀 생성 중에는 작업이 끝날 때까지 기다려 주세요.' }); }
  });
  window.on('closed', () => { window = null; });
  await window.loadFile(rendererFile);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.focus(); });
  app.whenReady().then(async () => {
    store = new Store(app.getPath('userData'));
    settings = await store.settings(path.join(app.getPath('documents'), 'Sheet SMS Exporter'));
    const config: OAuthConfig = JSON.parse(await readFile(path.join(__dirname, 'oauth-config.json'), 'utf8'));
    auth = new Auth(config, store, url => shell.openExternal(url));
    try { await auth.restore(); } catch { notice = '저장된 로그인을 복원하지 못했습니다. 다시 로그인하세요.'; }
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ label: app.name, submenu: [{ role: 'about' as const }, { type: 'separator' as const }, { role: 'quit' as const }] }] : []),
      { label: '편집', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: '보기', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
    ]));
    registerHandlers();
    await createWindow();
    app.on('activate', () => { if (!window) void createWindow(); });
  }).catch(() => { dialog.showErrorBox('앱을 시작할 수 없습니다', '앱 파일 또는 저장된 설정을 확인한 뒤 다시 실행하세요.'); app.quit(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', event => { if (busy) event.preventDefault(); else auth?.cancel(); });
}
