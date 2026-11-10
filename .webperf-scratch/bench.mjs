import { feedItemMatchesQuery } from './fis.mjs';
import { readFileSync } from 'node:fs';

// Real items captured through the live proxy
const real = JSON.parse(readFileSync(new URL('./live-feed-bb.json', import.meta.url), 'utf8'));

// Synthetic worst-case items sized for MAX_CUSTOM_FEED_ITEMS-bound scenarios
const pad = (n, s) => {
  const base = 'Der Sachschaden beträgt mehrere tausend Euro. Zeugen werden gebeten, sich bei der Polizeidirektion zu melden. ';
  let out = s;
  while (out.length < n) out += base;
  return out.slice(0, n);
};
const mkItem = (title, desc) => ({ title, description: desc });

const bench = (fn, iters) => {
  fn(); // warmup
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) fn();
  const t1 = process.hrtime.bigint();
  return Number(t1 - t0) / 1e6 / iters; // ms per call
};

const sweep = (query, items) => {
  const indices = [];
  items.forEach((item, index) => {
    if (feedItemMatchesQuery(query, item)) indices.push(index);
  });
  return indices;
};

const scenarios = [
  { label: 'synthetic 100 x 500ch desc', items: Array.from({ length: 100 }, (_, i) => mkItem(`Polizeimeldung ${i}`, pad(500, `Meldung Nummer ${i}. `))) },
  { label: 'synthetic 100 x 2000ch desc', items: Array.from({ length: 100 }, (_, i) => mkItem(`Polizeimeldung ${i}`, pad(2000, `Meldung Nummer ${i}. `))) },
  { label: 'real Brandenburg 25 items', items: real },
  { label: 'real x4 (=100 items)', items: [...real, ...real, ...real, ...real].slice(0, 100) },
];

const queries = { 'empty "" (idle path)': '', '"brandenburg" (1w, mixed match)': 'brandenburg', '"polizei diebstahl" (3w, heavy miss)': 'polizei diebstahl zzzz' };

console.log('node', process.version);
for (const sc of scenarios) {
  const textLen = sc.items.reduce((a, i) => a + (i.title || '').length + (i.description || '').length, 0) / sc.items.length;
  console.log(`\n== ${sc.label} (avg chars/item=${textLen.toFixed(0)}) ==`);
  for (const [qlabel, q] of Object.entries(queries)) {
    const perSweep = bench(() => sweep(q, sc.items), sc.items.length >= 100 ? 300 : 1000);
    const perItem = (perSweep / sc.items.length) * 1000; // µs
    console.log(`  ${qlabel}: sweep=${perSweep.toFixed(4)} ms  (${perItem.toFixed(1)} µs/item)`);
    if (qlabel.includes('empty')) {
      // 3 template call sites only evaluate the getter while search active; idle = 1 (ngFor)
      console.log(`    -> idle CD pass (1 getter call, ngFor only): ${perSweep.toFixed(4)} ms`);
    } else {
      console.log(`    -> active-search CD pass (3 getter calls: ngFor + ngIf + itemCountLabel): ${(perSweep * 3).toFixed(4)} ms`);
    }
  }
}
