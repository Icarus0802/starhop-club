'use strict';
const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

// Stable origin and Electron profile preserve games across portable extractions.
const port = 52730, origin = `http://127.0.0.1:${port}`;
const game = app.isPackaged ? path.join(process.resourcesPath, 'game') : path.join(__dirname, 'payload');
const smoke = process.argv.includes('--starhop-smoke');
const runtimeCache = path.join(game, 'arena-results', 'current-challenge', 'runtime', 'cache');
let window, backend, quitting = false, stopping = false;
app.setName('StarhopClub');
app.setPath('userData', path.join(app.getPath('appData'), smoke ? 'StarhopClub-Desktop-Test' : 'StarhopClub-Desktop'));
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(start).catch(fail);
}

function request(route, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(origin + route, { method: body === undefined ? 'GET' : 'POST', headers }, res => {
      let data = ''; res.setEncoding('utf8'); res.on('data', x => data += x);
      res.on('end', () => { try { if (res.statusCode !== 200) throw Error(`HTTP ${res.statusCode}`); resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.setTimeout(25000, () => req.destroy(Error('������Ӧ��ʱ')));
    req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function start() {
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({
    width: 1440, height: 960, minWidth: 880, minHeight: 640,
    backgroundColor: '#f4f0e9', title: '��Ծ���� �� �����ˣ�١ѩӣ',
    icon: path.join(__dirname, 'icon.ico'), show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, spellcheck: false }
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(origin + '/')) { event.preventDefault(); openExternal(url); } });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  window.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') { window.setFullScreen(!window.isFullScreen()); event.preventDefault(); }
    if (input.key === 'Escape' && window.isFullScreen()) window.setFullScreen(false);
  });
  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html lang="zh-CN"><body style="margin:0;background:#f4f0e9;color:#38352f;font:18px system-ui;display:grid;place-content:center;height:100vh;text-align:center"><h1>��Ծ����</h1><p>����׼�������뱾�� AI��</p><small>�����ˣ�١ѩӣ</small></body></html>'));
  // Never connect to an unrelated process occupying the desktop port.
  let existing;
  try { existing = await request('/api/app/status'); } catch (_) {}
  if (existing) throw Error('��������˿��ѱ�ռ�á���ر���һ����Ծ�������������ԡ�');
  const savedCache = path.join(app.getPath('userData'), 'native-cache-2.2');
  if (fs.existsSync(savedCache)) fs.cpSync(savedCache, runtimeCache, { recursive: true });
  fs.mkdirSync(path.join(app.getPath('userData'), 'logs'), { recursive: true });
  const log = fs.openSync(path.join(app.getPath('userData'), 'logs', 'server.log'), 'a');
  try {
    backend = spawn(path.join(game, 'runtime', 'node.exe'), [path.join(game, 'server.cjs')], {
      cwd: game, windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', log, log]
    });
  } finally { fs.closeSync(log); }
  backend.on('error', fail);
  backend.on('exit', code => { if (!stopping && !quitting) fail(Error(`�������������˳���${code}������־��${app.getPath('userData')}\\logs\\server.log`)); });
  let status;
  for (let i = 0; i < 150; i++) {
    if (quitting) return;
    try { status = await request('/api/app/status'); } catch (_) {}
    if (status && status.installation === game && status.version === app.getVersion()) break;
    status = null; await wait(200);
  }
  if (!status) throw Error('��������������ʱ�������´򿪡�');
  await window.loadURL(origin + '/#play');
  if (smoke) await smokeTest(status);
}
function openExternal(url) {
  try {
    const u = new URL(url);
    if (u.origin === origin && ['/LICENSE', '/ATTRIBUTION.md', '/THIRD_PARTY.md'].includes(u.pathname)) {
      const notice = new BrowserWindow({ parent: window, width: 850, height: 700, autoHideMenuBar: true, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
      notice.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      notice.webContents.on('will-navigate', event => event.preventDefault());
      notice.loadURL(u.href).catch(() => notice.close());
    } else if (u.protocol === 'https:') shell.openExternal(u.href).catch(() => {});
  } catch (_) {}
}
function fail(error) {
  if (quitting) return;
  if (smoke) writeSmoke({ ok: false, error: error.stack || String(error) });
  else dialog.showErrorBox('��Ծ��������ʧ��', error.message || String(error));
  app.quit();
}
async function stop() {
  stopping = true;
  if (!backend || backend.exitCode !== null) return;
  await Promise.race([
    request('/api/app/stop', {}, { Origin: origin, 'X-Starhop-Stop': '1', 'Content-Type': 'application/json' }).catch(() => {}),
    wait(3000)
  ]);
  for (let i = 0; i < 30 && backend.exitCode === null; i++) await wait(100);
  if (backend.exitCode === null && backend.pid) {
    await new Promise(resolve => { const p = spawn('taskkill.exe', ['/PID', String(backend.pid), '/T', '/F'], { windowsHide: true }); p.on('error', resolve); p.on('exit', resolve); });
  }
  if (fs.existsSync(runtimeCache)) {
    try { fs.cpSync(runtimeCache, path.join(app.getPath('userData'), 'native-cache-2.2'), { recursive: true }); } catch (_) {}
  }
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); quitting = true;
  stop().finally(() => app.quit());
});
function writeSmoke(value) {
  if (process.env.STARHOP_SMOKE_OUTPUT) fs.writeFileSync(process.env.STARHOP_SMOKE_OUTPUT, JSON.stringify(value, null, 2));
}
async function smokeTest(status) {
  await wait(1800);
  const content = await window.webContents.executeJavaScript('({title:document.title,watermark:document.querySelector(".creator-watermark")?.textContent,body:document.body.innerText.slice(0,2500)})');
  if (!content.watermark?.includes('١ѩӣ')) throw Error('������ˮӡȱʧ');
  await window.webContents.executeJavaScript('localStorage.setItem("desktop-smoke", "persistent")');
  const reloaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve));
  window.webContents.reload(); await reloaded;
  const storage = await window.webContents.executeJavaScript('localStorage.getItem("desktop-smoke")');
  await window.webContents.executeJavaScript('localStorage.removeItem("desktop-smoke")');
  if (storage !== 'persistent') throw Error('�浵�洢δ����');
  window.setFullScreen(true); await wait(500);
  const fullscreen = window.isFullScreen(); window.setFullScreen(false);
  let ai;
  for (let i = 0; i < 240; i++) { ai = await request('/api/ai/status'); if (ai.state !== 'loading') break; await wait(500); }
  if (ai.state !== 'ready') throw Error('���� AI δ������' + JSON.stringify(ai));
  const E = require(path.join(game, 'js', 'engine.js'));
  const state = E.createGame({ players: 2, jump: 'short', goalLock: false });
  const search = await request('/api/ai/search', { state, options: { level: 4, time: 1500, algorithm: 'auto' } }, { Origin: origin, 'Content-Type': 'application/json' });
  const legalMove = E.applyMove(state, search.result.move).move;
  if (process.env.STARHOP_SMOKE_SCREENSHOT) { await wait(700); fs.writeFileSync(process.env.STARHOP_SMOKE_SCREENSHOT, (await window.webContents.capturePage()).toPNG()); }
  writeSmoke({ ok: true, status, ai, legalMove, native: search.result.native, content, storage, fullscreen, electron: process.versions.electron, backendPID: backend.pid });
  app.quit();
}
