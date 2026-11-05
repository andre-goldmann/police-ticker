import {spawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const TARGET = 'http://127.0.0.1:4731/';
const CHROME = process.env.CHROME_BIN;
const ROOT = process.cwd();
const POST_LOAD_MS = 5000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    s.on('error', rej);
  });
}

const VIEWPORTS = [
  {label: 'desktop-1280x800', width: 1280, height: 800, mobile: false, ua: null},
  {label: 'mobile-375x667', width: 375, height: 667, mobile: true,
   ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'},
];

function inPage() {
  return new Promise(resolve => {
    const out = {
      href: location.href,
      readyState: document.readyState,
      title: document.title,
      domNodes: document.getElementsByTagName('*').length,
      perfNowAtEval: Math.round(performance.now()),
      viewportInner: {w: innerWidth, h: innerHeight, dpr: devicePixelRatio},
    };
    if (performance.memory) out.jsHeapUsedMB = +(performance.memory.usedJSHeapSize / 1048576).toFixed(1);
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
      const fields = ['startTime','redirectStart','redirectEnd','fetchStart','domainLookupStart','domainLookupEnd',
        'connectStart','connectEnd','secureConnectionStart','requestStart','responseStart','responseEnd',
        'domInteractive','domContentLoadedEventStart','domContentLoadedEventEnd','domComplete',
        'loadEventStart','loadEventEnd','transferSize','encodedBodySize','decodedBodySize','type','protocol','renderBlockingStatus'];
      out.nav = {};
      for (const k of fields) out.nav[k] = nav[k];
    }
    out.paint = performance.getEntriesByType('paint').map(e => ({name: e.name, startTime: +e.startTime.toFixed(1)}));
    out.resources = performance.getEntriesByType('resource').map(r => ({
      name: r.name, initiatorType: r.initiatorType, renderBlockingStatus: r.renderBlockingStatus,
      deliveryType: r.deliveryType, protocol: r.nextHopProtocol, startTime: +r.startTime.toFixed(1),
      duration: +r.duration.toFixed(1), transferSize: r.transferSize, encodedBodySize: r.encodedBodySize,
      decodedBodySize: r.decodedBodySize,
    }));
    let pending = 4, done = false;
    const finish = () => { if (!done) { done = true; resolve(out); } };
    const maybe = () => { if (--pending === 0) finish(); };
    const desc = el => el ? (el.tagName + (el.id ? '#' + el.id : '') +
      (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '')) : null;
    try {
      new PerformanceObserver(list => {
        out.lcp = list.getEntries().map(e => ({
          startTime: +e.startTime.toFixed(1), renderTime: e.renderTime ? +e.renderTime.toFixed(1) : 0,
          loadTime: e.loadTime ? +e.loadTime.toFixed(1) : 0, size: e.size, url: e.url, element: desc(e.element),
        }));
        maybe();
      }).observe({type: 'largest-contentful-paint', buffered: true});
    } catch (err) { out.lcpUnsupported = String(err); maybe(); }
    try {
      new PerformanceObserver(list => {
        out.longtasks = (out.longtasks || []).concat(list.getEntries().map(e => ({
          name: e.name, startTime: +e.startTime.toFixed(1), duration: +e.duration.toFixed(1),
          containerType: e.attribution && e.attribution[0] ? e.attribution[0].containerType : null,
          containerName: e.attribution && e.attribution[0] ? e.attribution[0].containerName : null,
        })));
        maybe();
      }).observe({type: 'longtask', buffered: true});
    } catch (err) { out.longtaskUnsupported = String(err); maybe(); }
    try {
      new PerformanceObserver(list => {
        out.eventTiming = (out.eventTiming || []).concat(list.getEntries().map(e => ({
          name: e.name, startTime: +e.startTime.toFixed(1), duration: +e.duration.toFixed(1),
          interactionId: e.interactionId,
        })));
        maybe();
      }).observe({type: 'event', buffered: true});
    } catch (err) { out.eventTimingUnsupported = String(err); maybe(); }
    try {
      let cls = 0, cur = 0, prevT = 0;
      new PerformanceObserver(list => {
        const entries = list.getEntries();
        out.layoutShifts = (out.layoutShifts || []).concat(entries.filter(e => !e.hadRecentInput)
          .map(e => ({startTime: +e.startTime.toFixed(1), value: +e.value.toFixed(4)})));
        for (const e of entries) {
          if (e.hadRecentInput) continue;
          if (prevT && e.startTime - prevT > 5000) { cls = Math.max(cls, cur); cur = 0; }
          cur += e.value; prevT = e.startTime;
        }
        cls = Math.max(cls, cur);
        out.cls = +cls.toFixed(4);
        maybe();
      }).observe({type: 'layout-shift', buffered: true});
    } catch (err) { out.layoutShiftUnsupported = String(err); maybe(); }
    setTimeout(finish, 2000);
  });
}

class Session {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const {resolve, reject} = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(m.method + ': ' + JSON.stringify(m.error))) : resolve(m.result);
      } else if (m.method) {
        (this.handlers.get(m.method) || []).forEach(h => h(m.params));
      }
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, {resolve, reject});
      this.ws.send(JSON.stringify({id, method, params}));
    });
  }
  on(method, cb) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(cb);
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', () => reject(new Error('websocket connect failed')));
  });
}

async function waitForCdp(port, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(300);
  }
  throw new Error('CDP endpoint never came up on port ' + port);
}

async function warmup(port, browserMeta) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {method: 'PUT'})).json();
  const ws = await connect(t.webSocketDebuggerUrl);
  const sess = new Session(ws);
  await sess.send('Page.enable');
  await sess.send('Emulation.setDeviceMetricsOverride', {width: 1280, height: 800, deviceScaleFactor: 1, mobile: false});
  const loadPromise = new Promise(res => sess.on('Page.loadEventFired', res));
  await sess.send('Page.navigate', {url: TARGET});
  await Promise.race([loadPromise, sleep(30000)]);
  await sleep(1500);
  await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`);
  ws.close();
  return {warmupDone: true};
}

async function measureViewport(port, v, browserMeta) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {method: 'PUT'})).json();
  const ws = await connect(t.webSocketDebuggerUrl);
  const sess = new Session(ws);
  const net = new Map();
  sess.on('Network.requestWillBeSent', e => {
    if (e.request.url.startsWith('data:')) return;
    net.set(e.requestId, {url: e.request.url, type: e.type || null, initiator: (e.initiator && e.initiator.type) || null,
      status: null, encodedDataLength: null, error: null, mimeType: null, protocol: null, fromDiskCache: null});
  });
  sess.on('Network.responseReceived', e => {
    const r = net.get(e.requestId);
    if (r) {
      r.type = e.type || r.type; r.status = e.response.status; r.mimeType = e.response.mimeType;
      r.protocol = e.response.protocol; r.fromDiskCache = e.response.fromDiskCache;
      if (e.type === 'Document') r.docHeaders = e.response.headers;
    }
  });
  sess.on('Network.loadingFinished', e => {
    const r = net.get(e.requestId);
    if (r) r.encodedDataLength = e.encodedDataLength;
  });
  sess.on('Network.loadingFailed', e => {
    const r = net.get(e.requestId);
    if (r) { r.error = e.errorText || 'failed'; r.canceled = !!e.canceled; }
  });

  await sess.send('Page.enable');
  await sess.send('Runtime.enable');
  await sess.send('Network.enable');
  await sess.send('Network.setCacheDisabled', {cacheDisabled: true});
  if (v.ua) await sess.send('Emulation.setUserAgentOverride', {userAgent: v.ua});
  await sess.send('Emulation.setDeviceMetricsOverride', {width: v.width, height: v.height, deviceScaleFactor: 1, mobile: v.mobile});
  if (v.mobile) await sess.send('Emulation.setTouchEmulationEnabled', {enabled: true});

  let loadTs = null;
  const loadPromise = new Promise(res => sess.on('Page.loadEventFired', () => { loadTs = Date.now(); res(); }));
  const navStart = Date.now();
  const nav = await sess.send('Page.navigate', {url: TARGET});
  if (nav.errorText) throw new Error('navigate failed: ' + nav.errorText);
  await Promise.race([loadPromise, sleep(30000)]);
  const loadMs = loadTs !== null ? loadTs - navStart : null;
  await sleep(POST_LOAD_MS);

  const ev = await sess.send('Runtime.evaluate', {
    expression: '(' + inPage.toString() + ')()',
    returnByValue: true, awaitPromise: true, userGesture: true,
  });
  if (ev.exceptionDetails) throw new Error('evaluate failed: ' + JSON.stringify(ev.exceptionDetails));
  const metrics = ev.result.value;

  const shot = await sess.send('Page.captureScreenshot', {format: 'png'});
  fs.writeFileSync(path.join(ROOT, 'scratch', `webperf-shot-${v.label}.png`), Buffer.from(shot.data, 'base64'));

  const reqs = [...net.values()];
  const completed = reqs.filter(r => r.encodedDataLength !== null);
  const wireBytes = completed.reduce((a, r) => a + r.encodedDataLength, 0);
  const doc = reqs.find(r => r.type === 'Document');
  await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`);
  ws.close();

  return {
    label: v.label,
    browser: browserMeta.Browser, chromeVersion: browserMeta['Chrome-Version'] || browserMeta['WebKit-Version'],
    timestamp: new Date().toISOString(),
    viewport: {width: v.width, height: v.height, mobileEmulation: v.mobile, dpr: 1, uaOverride: v.ua},
    loadEventWallClockMs: loadMs,
    metrics,
    network: {
      requestCount: reqs.length,
      completedCount: completed.length,
      failedCount: reqs.length - completed.length,
      wireBytesTotal: wireBytes,
      wireBytesMB: +(wireBytes / 1048576).toFixed(2),
      allRequests: reqs.map(r => ({url: r.url, type: r.type, initiator: r.initiator, status: r.status,
        bytes: r.encodedDataLength, mimeType: r.mimeType, protocol: r.protocol,
        fromDiskCache: r.fromDiskCache, error: r.error, canceled: r.canceled})),
      largestByWireBytes: completed.slice().sort((a, b) => b.encodedDataLength - a.encodedDataLength).slice(0, 12)
        .map(r => ({url: r.url, type: r.type, status: r.status, bytes: r.encodedDataLength, mimeType: r.mimeType, protocol: r.protocol})),
      failures: reqs.filter(r => r.encodedDataLength === null)
        .map(r => ({url: r.url, type: r.type, status: r.status, error: r.error, canceled: r.canceled})),
      documentHeaders: doc ? doc.docHeaders : null,
      documentInfo: doc ? {url: doc.url, status: doc.status, mimeType: doc.mimeType, protocol: doc.protocol, fromDiskCache: doc.fromDiskCache} : null,
    },
  };
}

const port = await freePort();
const chromeHome = path.join(ROOT, 'scratch', 'chrome-home');
fs.mkdirSync(chromeHome, {recursive: true});
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`,
  `--user-data-dir=${path.join(ROOT, 'scratch', 'chrome-profile')}`,
  `--crash-dumps-dir=${path.join(ROOT, 'scratch', 'chrome-crash')}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions',
  '--disable-background-networking', '--disable-component-update', '--disable-sync',
  '--metrics-recording-only', '--noerrdialogs', '--disable-dev-shm-usage',
  '--window-size=1280,1000', 'about:blank',
], {env: {...process.env, HOME: chromeHome, XDG_CONFIG_HOME: path.join(chromeHome, '.config'),
  XDG_CACHE_HOME: path.join(chromeHome, '.cache')}, stdio: ['ignore', 'pipe', 'pipe']});

const results = {target: TARGET, chromeBinary: CHROME, runs: []};
try {
  const browserMeta = await waitForCdp(port);
  results.browserMeta = browserMeta;
  results.warmup = await warmup(port, browserMeta);
  for (const v of VIEWPORTS) {
    console.error(`measuring ${v.label} ...`);
    results.runs.push(await measureViewport(port, v, browserMeta));
  }
} finally {
  chrome.kill('SIGKILL');
}
fs.writeFileSync(path.join(ROOT, 'scratch', 'webperf-results.json'), JSON.stringify(results, null, 1));
console.log('WROTE scratch/webperf-results.json');
