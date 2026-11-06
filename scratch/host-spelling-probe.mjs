// Handler-level probe of tricky host spellings (real DNS for literals).
import { netlifyAppEngineHandler } from '../node_modules/.server-test-build/src/server.js';

const urls = [
  'http://127.0.0.1/feed.xml',
  'http://2130706433/feed.xml',        // decimal IPv4
  'http://0x7f000001/feed.xml',        // hex IPv4
  'http://0177.0.0.1/feed.xml',        // octal-ish IPv4
  'http://127.0.0.1./feed.xml',        // trailing dot
  'http://[::ffff:127.0.0.1]/feed.xml',
  'http://[::1]/feed.xml',
  'http://0.0.0.0/feed.xml',
  'http://user@127.0.0.1/feed.xml',    // credentials
  'http://LOCALHOST/feed.xml',         // case; resolves via /etc/hosts
  'file:///etc/hosts',
  'http://[fe80::1%25eth0]/feed.xml',  // zone id
];

for (const u of urls) {
  try {
    const res = await netlifyAppEngineHandler(
      new Request(`http://localhost/api/custom-rss?url=${encodeURIComponent(u)}`),
    );
    const body = await res.json().catch(() => ({}));
    console.log(String(res.status), u, '->', body.error ?? '(no error body)');
  } catch (e) {
    console.log('ERR', u, '->', e.message.slice(0, 80));
  }
}
