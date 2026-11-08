import type { AppState, SheetInput, Reply, Preview } from '../shared';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const url = byId<HTMLInputElement>('sheet-url');
const tab = byId<HTMLSelectElement>('sheet-tab');
const status = byId<HTMLInputElement>('status-column');
const mark = byId<HTMLInputElement>('mark-complete');
const login = byId<HTMLButtonElement>('login');
const logout = byId<HTMLButtonElement>('logout');
const load = byId<HTMLButtonElement>('load-sheet');
const previewButton = byId<HTMLButtonElement>('preview');
const exportButton = byId<HTMLButtonElement>('export');
const cancel = byId<HTMLButtonElement>('cancel-login');
let current: AppState;
let working = false;
let preview: Preview | null = null;
let loadedUrl = '';

async function unwrap<T>(reply: Promise<Reply<T>>): Promise<T> {
  const result = await reply;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
function input(): SheetInput { return { url: url.value.trim(), sheetName: tab.value, statusColumn: status.value.trim(), markComplete: mark.checked }; }
function feedback(text: string, kind = '') {
  const element = byId('feedback'); element.textContent = text; element.className = kind; element.hidden = !text;
}
function sync() {
  login.disabled = working || !current?.configured;
  logout.disabled = working;
  url.disabled = working;
  status.disabled = working;
  mark.disabled = working;
  tab.disabled = working || !loadedUrl;
  load.disabled = working || !current?.account || !url.value.trim();
  previewButton.disabled = working || !current?.account || loadedUrl !== url.value.trim() || !tab.value;
  exportButton.disabled = working || !preview || preview.paid + preview.unpaid === 0;
  byId<HTMLButtonElement>('choose-folder').disabled = working;
  byId<HTMLButtonElement>('open-output').disabled = working;
}
function clearPreview() {
  preview = null;
  byId('paid-count').textContent = '—'; byId('unpaid-count').textContent = '—';
  byId('preview-hint').textContent = '대상을 확인하면 인원수가 표시됩니다.';
  byId('result').hidden = true;
  feedback(''); sync();
}
function renderState(state: AppState, initial = false) {
  current = state;
  byId('account').textContent = state.account ?? '로그인이 필요합니다';
  byId('account-help').textContent = state.account ? '이 계정에 공유된 시트를 불러올 수 있습니다.' : '브라우저에서 로그인하고 시트 접근을 허용해 주세요.';
  login.hidden = !!state.account; logout.hidden = !state.account;
  const note = state.notice ?? (!state.configured ? 'Google 로그인 설정 전의 테스트 빌드입니다. 개발자가 OAuth 설정을 넣어 빌드하면 로그인할 수 있습니다.' : '');
  byId('notice').textContent = note; byId('notice').hidden = !note;
  if (initial) {
    url.value = state.settings.url; status.value = state.settings.statusColumn; mark.checked = state.settings.markComplete;
    if (state.settings.sheetName) {
      tab.replaceChildren(new Option(state.settings.sheetName, state.settings.sheetName));
      // The saved tab is displayed, but must be reloaded with the current account.
      byId('sheet-title').textContent = '저장된 링크입니다. 불러오기로 시트 접근을 확인하세요.';
    }
  }
  byId('output-dir').textContent = state.settings.outputDir;
  byId('output-dir').title = state.settings.outputDir;
  sync();
}
async function task(message: string, action: () => Promise<void>) {
  if (working) return;
  working = true; sync(); feedback(message);
  try { await action(); }
  catch (error) { feedback(error instanceof Error ? error.message : '작업을 완료하지 못했습니다.', 'error'); }
  finally { working = false; cancel.hidden = true; sync(); }
}
login.addEventListener('click', () => void task('브라우저에서 Google 로그인을 완료해 주세요.', async () => {
  cancel.hidden = false; clearPreview(); feedback('브라우저에서 Google 로그인을 완료해 주세요.');
  renderState(await unwrap(window.desktop.login())); feedback('로그인했습니다. 시트 링크를 불러오세요.');
}));
cancel.addEventListener('click', () => { cancel.disabled = true; void unwrap(window.desktop.cancelLogin()).finally(() => { cancel.disabled = false; }); });
logout.addEventListener('click', () => void task('구글 연결을 해제하고 있습니다.', async () => {
  renderState(await unwrap(window.desktop.logout())); loadedUrl = ''; clearPreview(); feedback('이 기기의 로그인 정보를 삭제했습니다.');
}));
url.addEventListener('input', () => { loadedUrl = ''; clearPreview(); });
for (const element of [tab, status, mark]) element.addEventListener('change', clearPreview);
status.addEventListener('input', clearPreview);
load.addEventListener('click', () => void task('시트와 탭을 확인하고 있습니다.', async () => {
  clearPreview(); loadedUrl = ''; feedback('시트와 탭을 확인하고 있습니다.');
  const info = await unwrap(window.desktop.loadSheet(url.value.trim()));
  loadedUrl = url.value.trim(); tab.replaceChildren(...info.tabs.map(item => new Option(item.title, item.title)));
  tab.value = info.selected; byId('sheet-title').textContent = info.title; feedback('시트를 연결했습니다. 대상을 확인하세요.');
}));
byId('choose-folder').addEventListener('click', () => void task('저장 폴더를 선택해 주세요.', async () => {
  const folder = await unwrap(window.desktop.chooseFolder());
  if (folder) { current.settings.outputDir = folder; byId('output-dir').textContent = folder; byId('output-dir').title = folder; clearPreview(); }
  feedback('');
}));
previewButton.addEventListener('click', () => void task('시트에서 대상을 확인하고 있습니다.', async () => {
  clearPreview(); feedback('시트에서 대상을 확인하고 있습니다.');
  preview = await unwrap(window.desktop.preview(input()));
  byId('paid-count').textContent = preview.paid.toLocaleString(); byId('unpaid-count').textContent = preview.unpaid.toLocaleString();
  byId('preview-hint').textContent = `다른 상태 ${preview.skipped.toLocaleString()}행은 제외합니다.`;
  feedback(preview.paid + preview.unpaid ? '대상을 확인했습니다. 엑셀을 생성할 수 있습니다.' : '입금완료 또는 미입금 대상이 없습니다.');
}));
exportButton.addEventListener('click', () => void task('엑셀을 생성하고 있습니다. 잠시 기다려 주세요.', async () => {
  preview = null;
  const result = await unwrap(window.desktop.export(input()));
  byId('result').hidden = false;
  byId('result-detail').textContent = `입금완료자 ${result.paid}명 · 미입금자 ${result.unpaid}명${result.marked ? ` · ${result.marked}행 완료 표시` : ' · 완료 표시 없음'}`;
  byId('result-files').replaceChildren(...result.files.map(file => { const li = document.createElement('li'); li.textContent = file.split(/[\\/]/).pop() ?? file; return li; }));
  feedback(result.warning ?? '엑셀 생성이 끝났습니다. 발송 프로그램에서 파일을 확인하세요.', result.warning ? 'warning' : '');
  byId('result').scrollIntoView({ block: 'nearest' });
}));
byId('open-output').addEventListener('click', () => void task('저장 폴더를 열고 있습니다.', async () => { await unwrap(window.desktop.openOutput()); feedback(''); }));
void unwrap(window.desktop.state()).then(state => renderState(state, true)).catch(() => feedback('앱을 초기화하지 못했습니다. 종료 후 다시 실행하세요.', 'error'));
