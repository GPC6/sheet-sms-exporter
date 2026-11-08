import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
let oauth = {};
try {
  const raw = JSON.parse(await readFile('oauth-config.json', 'utf8'));
  if (!raw.installed || raw.type === 'service_account') throw new Error('Desktop app OAuth JSON만 사용할 수 있습니다.');
  oauth = { clientId: raw.installed.client_id, clientSecret: raw.installed.client_secret };
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (process.env.GOOGLE_OAUTH_CLIENT_ID) {
  oauth = { clientId: process.env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
}
if (oauth.clientId && (!oauth.clientId.endsWith('.apps.googleusercontent.com') || oauth.clientId.includes('YOUR_'))) {
  throw new Error('유효한 Desktop OAuth client ID를 설정하세요.');
}
if (process.env.REQUIRE_OAUTH_CONFIG === '1' && (!oauth.clientId || !oauth.clientSecret)) {
  throw new Error('릴리즈 빌드에는 Google Desktop OAuth 설정이 필요합니다.');
}
await writeFile('dist/oauth-config.json', JSON.stringify(oauth));
await build({ entryPoints: ['src/main.ts'], outfile: 'dist/main.cjs', bundle: true, platform: 'node', format: 'cjs', packages: 'external', target: 'node22' });
await build({ entryPoints: ['src/preload.ts'], outfile: 'dist/preload.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], target: 'node22' });
await build({ entryPoints: ['src/renderer/app.ts'], outfile: 'dist/app.js', bundle: true, platform: 'browser', target: 'chrome130' });
await Promise.all(['index.html', 'style.css'].map(file => copyFile(`src/renderer/${file}`, `dist/${file}`)));
console.log(oauth.clientId ? '앱 빌드 완료 (Google 로그인 설정 포함)' : '앱 빌드 완료 (Google 로그인 설정 필요)');
