// Visits every role view in headless Chromium and reports whether the main
// content area actually rendered (this is the regression check for the blank
// content area caused by absolute child paths under a splat parent route).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire('/home/andreas/Projekt/avc_management_app/node_modules/.pnpm/ws@8.22.0/node_modules/ws/');
const WebSocket = require('ws');

const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const PORT = 9223;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// role -> token
const tokens = {};
for (const line of fs.readFileSync('/tmp/opencode/tokens.txt', 'utf8').trim().split('\n')) {
  const [email, token] = line.split(' ');
  tokens[email.split('@')[0]] = token; // admin, driver1, worker1
}

const ROUTES = [
  ['admin', '/manager'],
  ['admin', '/manager/containers'],
  ['admin', '/manager/transport-orders'],
  ['admin', '/manager/sites'],
  ['admin', '/manager/vehicles'],
  ['admin', '/manager/drivers'],
  ['admin', '/manager/maintenance'],
  ['admin', '/manager/incidents'],
  ['admin', '/manager/reports'],
  ['admin', '/manager/map'],
  ['admin', '/manager/settings'],
  ['admin', '/manager/does-not-exist'],
  ['admin', '/dashboard'],
  ['driver1', '/driver'],
  ['worker1', '/worker'],
  ['worker1', '/dashboard'],
];

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--remote-debugging-port=${PORT}`, '--window-size=1400,900', 'about:blank',
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
  if (!version) throw new Error('no chrome');

  const target = await (await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent('http://localhost:5173/login')}`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));

  const errors = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(`EXCEPTION ${d.exception?.description?.split('\n')[0] || d.text}`);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push('console.error ' + (msg.params.args || []).map((a) => a.value ?? a.description).join(' ').slice(0, 160));
    }
  });

  await send(ws, 'Runtime.enable');
  await send(ws, 'Page.enable');

  let currentRole = null;
  for (const [role, route] of ROUTES) {
    errors.length = 0;
    if (role !== currentRole) {
      await send(ws, 'Page.navigate', { url: 'http://localhost:5173/login' });
      await sleep(1200);
      await send(ws, 'Runtime.evaluate', {
        expression: `localStorage.setItem('accessToken', ${JSON.stringify(tokens[role])});
          localStorage.setItem('token_expires_at', (Date.now() + 3600000).toString());
          localStorage.setItem('avc-auth', JSON.stringify({ state: { user: { id: 'x', email: '${role}@avc.local', full_name: 'Test', role: '${role === 'admin' ? 'admin' : role === 'driver1' ? 'driver' : 'worker'}' }, accessToken: 'x', refreshToken: 'y' }, version: 0 }));`,
      });
      currentRole = role;
    }
    await send(ws, 'Page.navigate', { url: `http://localhost:5173${route}` });
    await sleep(2600);

    const res = await send(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const m = document.querySelector('main');
        const text = m ? m.innerText.replace(/\\s+/g, ' ').trim() : 'NO MAIN';
        return JSON.stringify({
          children: m ? m.children.length : -1,
          chars: m ? m.innerText.trim().length : 0,
          head: text.slice(0, 110),
        });
      })()`,
      returnByValue: true,
    });
    const info = JSON.parse(res.result.value);
    const ok = info.children > 0 && info.chars > 20;
    const filtered = errors.filter((e) => !e.includes('Service Worker') && !e.includes('sw.js'));
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${role.padEnd(8)} ${route.padEnd(30)} children=${info.children} chars=${info.chars} | ${info.head}`);
    if (filtered.length) console.log(`      errors: ${filtered.slice(0, 3).join(' | ')}`);
  }
} catch (err) {
  console.error('DRIVER ERROR:', err.message);
} finally {
  chrome.kill('SIGKILL');
}
