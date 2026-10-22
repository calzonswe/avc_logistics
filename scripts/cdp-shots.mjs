// Screenshot capture for visual verification of the role views.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('/home/andreas/Projekt/avc_management_app/node_modules/.pnpm/ws@8.22.0/node_modules/ws/');
const WebSocket = require('ws');

const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const PORT = 9224;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tokens = {};
for (const line of fs.readFileSync('/tmp/opencode/tokens.txt', 'utf8').trim().split('\n')) {
  const [email, token] = line.split(' ');
  tokens[email.split('@')[0]] = token;
}
const roleOf = { admin: 'admin', driver1: 'driver', worker1: 'worker' };

const targets = JSON.parse(fs.readFileSync('/tmp/opencode/shots.json', 'utf8'));

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${PORT}`, '--window-size=1500,1000', 'about:blank',
], { stdio: 'ignore' });

let id = 0;
function send(ws, method, params = {}) {
  const msgId = ++id;
  return new Promise((resolve, reject) => {
    const onMsg = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === msgId) {
        ws.off('message', onMsg);
        msg.error ? reject(new Error(`${method}: ${JSON.stringify(msg.error)}`)) : resolve(msg.result);
      }
    };
    ws.on('message', onMsg);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

try {
  let version;
  for (let i = 0; i < 40; i++) {
    try { version = await (await fetch(`http://localhost:${PORT}/json/version`)).json(); break; } catch { await sleep(300); }
  }
  const t = await (await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent('http://localhost:5173/login')}`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  await send(ws, 'Runtime.enable');
  await send(ws, 'Page.enable');
  await send(ws, 'Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });

  let currentRole = null;
  for (const { role, route, file, wait = 3500 } of targets) {
    if (role !== currentRole) {
      await send(ws, 'Page.navigate', { url: 'http://localhost:5173/login' });
      await sleep(1000);
      await send(ws, 'Runtime.evaluate', {
        expression: `localStorage.setItem('accessToken', ${JSON.stringify(tokens[role])});
          localStorage.setItem('token_expires_at', (Date.now() + 3600000).toString());
          localStorage.setItem('avc-auth', JSON.stringify({ state: { user: { id: 'x', email: '${role}@avc.local', full_name: 'Test', role: '${roleOf[role]}' }, accessToken: 'x', refreshToken: 'y' }, version: 0 }));`,
      });
      currentRole = role;
    }
    await send(ws, 'Page.navigate', { url: `http://localhost:5173${route}` });
    await sleep(wait);
    const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`/tmp/opencode/${file}`, Buffer.from(shot.data, 'base64'));
    console.log('shot:', file, route);
  }
  ws.close();
} catch (e) {
  console.error('ERR', e.message);
} finally {
  chrome.kill('SIGKILL');
}
