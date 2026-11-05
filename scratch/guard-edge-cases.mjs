import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const guard = require('./guard-build/custom-rss-url-guard.js');

const results = [];
function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(`${pass ? 'PASS' : 'FAIL'} ${name} => ${JSON.stringify(actual)}${pass ? '' : ` (expected ${JSON.stringify(expected)})`}`);
}

// --- validateCustomRssUrl edge cases ---
check('uppercase scheme+host', guard.validateCustomRssUrl('HTTPS://EXAMPLE.COM/Feed'), { ok: true });
check('leading/trailing whitespace', guard.validateCustomRssUrl('  https://example.com/feed  '), { ok: true });
check('userinfo spoof good.com@evil.com', guard.validateCustomRssUrl('https://good.com@evil.com/').ok === true && guard.validateCustomRssUrl('https://good.com@evil.com/').url.hostname, 'evil.com');
check('fragment spoof', guard.validateCustomRssUrl('https://evil.com#https://good.com').url.hostname, 'evil.com');
check('file://', guard.validateCustomRssUrl('file:///etc/hosts'), { ok: false, error: 'Only http and https URLs are allowed' });
check('javascript:', guard.validateCustomRssUrl('javascript:alert(1)'), { ok: false, error: 'Only http and https URLs are allowed' });
check('garbage', guard.validateCustomRssUrl('not a url'), { ok: false, error: 'Invalid URL format' });
check('credentials', guard.validateCustomRssUrl('https://user:pass@example.com/').ok, true);

// --- ensurePublicHost: all:true + family semantics ---
async function host(address, family, hostname = 'x.example.com') {
  const lookup = async () => [{ address, family }];
  return guard.ensurePublicHost(new URL(`https://${hostname}/`), lookup);
}
const ok = { ok: true };
check('public ipv4', await host('1.2.3.4', 4), ok);
check('loopback ipv4', await host('127.0.0.1', 4).then(r => r.ok), false);
check('0.0.0.0', await host('0.0.0.0', 4).then(r => r.ok), false);
check('0.255.255.255 (end of 0/8)', await host('0.255.255.255', 4).then(r => r.ok), false);
check('1.0.0.0 (just past 0/8)', await host('1.0.0.0', 4), ok);
check('127.255.255.255 (end of loopback)', await host('127.255.255.255', 4).then(r => r.ok), false);
check('172.31.255.255 (end of 172.16/12)', await host('172.31.255.255', 4).then(r => r.ok), false);
check('172.32.0.0 (just past)', await host('172.32.0.0', 4), ok);
check('169.254.255.255 (end of link-local)', await host('169.254.255.255', 4).then(r => r.ok), false);
check('255.255.255.255', await host('255.255.255.255', 4), ok);
check(':: (unspecified)', await host('::', 6).then(r => r.ok), false);
check('::1', await host('::1', 6).then(r => r.ok), false);
check('fdff:: (end of fc00::/7)', await host('fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', 6).then(r => r.ok), false);
check('febf:: (end of fe80::/10)', await host('febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff', 6).then(r => r.ok), false);
check('fec0:: (just past link-local)', await host('fec0::', 6), ok);
check('::ffff:192.168.0.1 (dotted mapped)', await host('::ffff:192.168.0.1', 6).then(r => r.ok), false);
check('::ffff:c0a8:1 (hex mapped - inet_ntop canonical)', await host('::ffff:c0a8:1', 6).then(r => r.ok), false);
check('::127.0.0.1 (compatible)', await host('::127.0.0.1', 6).then(r => r.ok), false);
check('::ffff:169.254.169.254 (metadata mapped)', await host('::ffff:169.254.169.254', 6).then(r => r.ok), false);
check('::ffff:0:c0a8:1 (SIIT translated form)', await host('::ffff:0:c0a8:1', 6).then(r => r.ok), true);
check('::ffff:8.8.8.8 (public mapped)', await host('::ffff:8.8.8.8', 6), ok);
check('fe80::1%eth0 (zone suffix)', await host('fe80::1%eth0', 6).then(r => r.ok), false);
check('100.64.0.1 (CGNAT)', await host('100.64.0.1', 4).then(r => r.ok), true);
check('unparseable v6 fail-open', await host('not-an-ip', 6).then(r => r.ok), true);
check('unknown family fail-open', await host('1.2.3.4', 0).then(r => r.ok), true);

// mixed records: one public, one private
const mixed = await guard.ensurePublicHost(new URL('https://multi.example.com/'), async () => [
  { address: '1.2.3.4', family: 4 },
  { address: '10.0.0.9', family: 4 },
]);
check('mixed public+private records rejected', mixed.ok, false);

// lookup error path
const lookupThrow = await guard.ensurePublicHost(new URL('https://err.example.com/'), async () => { throw new Error('ENOTFOUND'); });
check('lookup throws -> fail closed', lookupThrow.ok, false);

console.log(results.join('\n'));
const fails = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - fails}/${results.length} assertions matched my expectations (FAIL lines = behavior differing from MY expectation, review each)`);
