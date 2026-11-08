import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const temporary = await mkdtemp(path.join(tmpdir(), 'sheet-sms-desktop-'));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.', `--test-user-data=${temporary}`], env });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('#account').waitFor();
  const initial = await page.evaluate(() => window.desktop.state());
  assert.equal(initial.ok, true); assert.equal(initial.data.account, null);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.locator('#export').isDisabled(), true);
  const denied = await page.evaluate(() => window.desktop.loadSheet('https://evil.test/example'));
  assert.equal(denied.ok, false);
  const preferences = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
  assert.equal(preferences.sandbox, true); assert.equal(preferences.contextIsolation, true); assert.equal(preferences.nodeIntegration, false);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/desktop-initial.png', fullPage: true });

  // Exercise the real renderer with explicit synthetic responses; this does not test Google access.
  const preload = path.join(temporary, 'fixture-preload.cjs');
  await writeFile(preload, `
    const { contextBridge } = require('electron');
    const ok = data => Promise.resolve({ ok: true, data });
    const state = { configured: true, account: 'preview@example.invalid', settings: { url: '', sheetName: '', statusColumn: '문자송부여부', outputDir: '/Example/Exports', markComplete: true } };
    contextBridge.exposeInMainWorld('desktop', {
      state: () => ok(state), login: () => ok(state), cancelLogin: () => ok(), logout: () => ok({ ...state, account: null }),
      chooseFolder: () => ok('/Example/Selected'),
      loadSheet: () => ok({ title: '예시 등록 명단', tabs: [{ title: '명단', id: 0 }], selected: '명단' }),
      preview: () => ok({ paid: 12, unpaid: 3, skipped: 2 }),
      export: () => ok({ paid: 12, unpaid: 3, skipped: 2, marked: 12, files: ['/Example/Exports/1027_문자발송대상_입금완료자.xlsx', '/Example/Exports/1027_문자발송대상_미입금자.xlsx'] }),
      openOutput: () => ok()
    });
  `);
  const newWindow = app.waitForEvent('window');
  await app.evaluate(async ({ BrowserWindow }, args) => {
    const fixture = new BrowserWindow({ width: 1080, height: 860, webPreferences: { preload: args.preload, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await fixture.loadFile(args.html);
  }, { preload, html: path.resolve('dist/index.html') });
  const fixture = await newWindow;
  fixture.on('pageerror', error => errors.push(error.message));
  await fixture.locator('#sheet-url').fill('https://docs.google.com/spreadsheets/d/example-sheet/edit');
  await fixture.locator('#load-sheet').click();
  await fixture.locator('#preview').click();
  await fixture.waitForFunction(() => document.querySelector('#paid-count').textContent === '12');
  assert.equal(await fixture.locator('#export').isEnabled(), true);
  await fixture.screenshot({ path: 'test-results/desktop-preview.png', fullPage: true });
  await fixture.locator('#export').click();
  await fixture.locator('#result').waitFor({ state: 'visible' });
  assert.match(await fixture.locator('#result-detail').textContent(), /12행 완료 표시/);
  assert.equal(await fixture.locator('#export').isDisabled(), true);
  await fixture.screenshot({ path: 'test-results/desktop-result.png', fullPage: true });
  await fixture.locator('#status-column').fill('새상태');
  assert.equal(await fixture.locator('#result').isHidden(), true);
  const bounds = await fixture.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
  assert.ok(bounds.scroll <= bounds.width);
  assert.deepEqual(errors, []);
  console.log('Electron smoke passed: isolated main window, sandbox, input rejection, renderer preview/export/reset. Google login was not exercised.');
} finally { await app.close(); await rm(temporary, { recursive: true, force: true }); }
