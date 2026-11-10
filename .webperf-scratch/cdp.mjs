import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

const CHROME = '/home/soulsaver/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
const PORT = 9333;
const BASE = process.argv[2] || 'http://127.0.0.1:4200/';
const MODE = process.argv[3] || 'interactive'; // interactive | boot

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.cwd()}/.webperf-scratch/chrome-profile`,
  '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });

process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch {} });

let msgId = 0;
const pending = new Map();
let ws;

function send(method, params = {}, sessionId) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) break;
    } catch {}
    await sleep(250);
  }
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise(r => ws.once('open', r));
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  return page;
}

async function evalJs(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) throw new Error('page eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
}

async function metrics() {
  const r = await send('Performance.getMetrics');
  return Object.fromEntries(r.metrics.map(m => [m.name, m.value]));
}

const target = await connect();
const { sessionId } = await send('Target.attachToTarget', { targetId: target.id, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Performance.enable', {}, sessionId);
await send('Emulation.setCPUThrottlingRate', { rate: 1 }, sessionId);

const m0boot = await metrics();
const nav0 = Date.now();
await send('Page.navigate', { url: BASE }, sessionId);
await evalJs(`new Promise(res => {
  const poll = () => document.querySelector('app-rss-feed') ? res(true) : setTimeout(poll, 100);
  poll();
})`, true);
await sleep(1000); // let initial CD settle

const boot = await evalJs(`(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const paints = performance.getEntriesByType('paint').map(p => p.name + '=' + Math.round(p.startTime));
  const lis = document.querySelectorAll('ul.feed-items li').length;
  return {
    domInteractive: nav ? Math.round(nav.domInteractive) : null,
    domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
    loadEvent: nav ? Math.round(nav.loadEventEnd) : null,
    paints,
    liCount: lis,
    hasSearchBox: !!document.querySelector('input[name="feedSearch"]'),
    selectOptions: document.querySelectorAll('select[name="feedSelect"] option').length,
  };
})()`);
console.log('BOOT', JSON.stringify(boot));
const m1boot = await metrics();

if (MODE === 'boot') {
  const d = (k) => (m1boot[k] ?? 0) - (m0boot[k] ?? 0);
  console.log('BOOT_METRICS_DELTA', JSON.stringify({
    ScriptDuration_s: +d('ScriptDuration').toFixed(3),
    TaskDuration_s: +d('TaskDuration').toFixed(3),
    LayoutDuration_s: +d('LayoutDuration').toFixed(3),
    RecalcStyleDuration_s: +d('RecalcStyleDuration').toFixed(3),
    JSHeapUsedSize_MB: +((m1boot.JSHeapUsedSize ?? 0) / 1048576).toFixed(2),
    Documents: m1boot.Documents,
    Nodes: m1boot.Nodes,
    wallMs: Date.now() - nav0,
  }));
  process.exit(0);
}

// ---- interactive mode: load Brandenburg feed, then measure typing ----
const loaded = await evalJs(`(async () => {
  const select = document.querySelector('select[name="feedSelect"]');
  const opt = [...select.options].find(o => (o.textContent || '').includes('Polizei Brandenburg'));
  if (!opt) return { error: 'option not found' };
  select.selectedIndex = opt.index;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 100));
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Load Selected Feed'));
  btn.click();
  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 100));
    if (document.querySelectorAll('ul.feed-items li').length > 0) {
      await new Promise(r => setTimeout(r, 500));
      break;
    }
  }
  const lis = document.querySelectorAll('ul.feed-items li').length;
  const info = document.querySelector('.feed-meta span');
  return { liCount: lis, label: info ? info.textContent.trim() : null };
})()`, true);
console.log('FEED_LOADED', JSON.stringify(loaded));
if (!loaded.liCount) { console.log('NO_ITEMS'); process.exit(1); }

const m0type = await metrics();

// 20 single-keystroke tasks (one JS task each -> one zone.js CD pass each), timed in-page
const typing = await evalJs(`(async () => {
  const input = document.querySelector('input[name="feedSearch"]');
  const word = 'die';
  const starts = [];
  const durs = [];
  for (let i = 0; i <= word.length; i++) {
    await new Promise(r => setTimeout(r, 0));
    starts.push(performance.now());
    if (i < word.length) {
      input.value = word.slice(0, i + 1);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  const lis = document.querySelectorAll('ul.feed-items li').length;
  const label = document.querySelector('.feed-meta span');
  const per = [];
  for (let i = 1; i < starts.length; i++) per.push(+(starts[i] - starts[i - 1]).toFixed(3));
  return { keystrokes: word.length, perKeystrokeMs: per, filteredLi: lis, label: label ? label.textContent.trim() : null };
})()`, true);
console.log('TYPING', JSON.stringify(typing));

// burst: 100 programmatic input events in one task (stress)
const burst = await evalJs(`(() => {
  const input = document.querySelector('input[name="feedSearch"]');
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) {
    input.value = 'diebstahl '.slice(0, (i % 10) + 1);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return { totalMs: +(performance.now() - t0).toFixed(2) };
})()`);
console.log('BURST_100_EVENTS_ONE_TASK_MS', burst.totalMs);

const m1type = await metrics();
const d = (k) => (m1type[k] ?? 0) - (m0type[k] ?? 0);
console.log('TYPE_METRICS_DELTA', JSON.stringify({
  ScriptDuration_s: +d('ScriptDuration').toFixed(4),
  TaskDuration_s: +d('TaskDuration').toFixed(4),
  LayoutDuration_s: +d('LayoutDuration').toFixed(4),
  RecalcStyleDuration_s: +d('RecalcStyleDuration').toFixed(4),
  JSHeapUsedSize_MB: +((m1type.JSHeapUsedSize ?? 0) / 1048576).toFixed(2),
  Nodes: m1type.Nodes,
}));

// long query sweep on max-size state: set a long no-match query, one CD
const longQuery = await evalJs(`(() => {
  const input = document.querySelector('input[name="feedSearch"]');
  const t0 = performance.now();
  input.value = 'zzz qq yyy xyzzy plugh';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const ms = +(performance.now() - t0).toFixed(3);
  const empty = !!document.querySelector('.no-search-results');
  return { ms, showsEmptyState: empty };
})()`);
console.log('LONG_QUERY_ONE_CD_MS', longQuery.ms, 'emptyStateRendered', longQuery.showsEmptyState);

process.exit(0);
