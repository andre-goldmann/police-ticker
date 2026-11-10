import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');
const CHROME = '/home/soulsaver/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const PORT = 9334;
const BASE = process.argv[2];

const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.cwd()}/.webperf-scratch/chrome-profile2`,
  '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch {} });

let msgId = 0; const pending = new Map(); const logs = []; let ws;
const send = (m, p = {}, s) => new Promise((res, rej) => { const id = ++msgId; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p, ...(s ? { sessionId: s } : {}) })); });

for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch {} await sleep(250); }
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find(t => t.type === 'page');
ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
await new Promise(r => ws.once('open', r));
ws.on('message', d => { const m = JSON.parse(d.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); } else if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + (m.params.args || []).map(a => (a.value ?? a.description ?? '')).join(' ').slice(0, 200)); else if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 300)); });
const { sessionId } = await send('Target.attachToTarget', { targetId: page.id, flatten: true });
await send('Runtime.enable', {}, sessionId);
await send('Page.enable', {}, sessionId);
await send('Page.navigate', { url: BASE }, sessionId);
await sleep(3000);
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true }, sessionId)).result?.value;
console.log('URL', await ev('location.href'));
console.log('OPTIONS', await ev(`JSON.stringify([...document.querySelectorAll('select[name="feedSelect"] option')].map(o => o.textContent.trim()))`));
console.log('SPINNER', await ev(`!!document.querySelector('.loading-spinner, .loading, [class*="loading"]')`) || false);
console.log('DOM_NODES', await ev(`document.querySelectorAll('*').length`));
console.log('HEAP_MB', await ev(`(performance.memory ? (performance.memory.usedJSHeapSize/1048576).toFixed(2) : 'n/a')`));
console.log('NG_VERSION', await ev(`document.querySelector('app-root')?.getAttribute('ng-version')`));
console.log('CONSOLE', JSON.stringify(logs.slice(0, 10)));
process.exit(0);
