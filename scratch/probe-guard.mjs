import { ensurePublicHost } from './probe-build/custom-rss-url-guard.js';
const lookup = async (hostname) => {
  const table = {
    'h-priv': [{ address: '10.1.2.3', family: 4 }],
    'h-loop': [{ address: '127.0.0.1', family: 4 }],
    'h-mapped': [{ address: '::ffff:192.168.0.1', family: 6 }],
    'h-mappedhex': [{ address: '::ffff:c0a8:1', family: 6 }],
    'h-compat': [{ address: '::c0a8:1', family: 6 }],
    'h-compatzero': [{ address: '::0.0.0.1', family: 6 }],
    'h-zone': [{ address: 'fe80::a%eth0', family: 6 }],
    'h-nat64': [{ address: '64:ff9b::c0a8:1', family: 6 }],
    'h-6to4': [{ address: '2002:c0a8:1::', family: 6 }],
    'h-cgnat': [{ address: '100.64.0.1', family: 4 }],
    'h-multicast': [{ address: '224.0.0.1', family: 4 }],
    'h-reserved': [{ address: '240.0.0.1', family: 4 }],
    'h-broadcast': [{ address: '255.255.255.255', family: 4 }],
    'h-mixed': [{ address: '153.92.100.206', family: 4 }, { address: '10.0.0.9', family: 4 }],
    'h-fam4mapped': [{ address: '192.168.0.1', family: 4 }],
  };
  return table[hostname] ?? [{ address: '153.92.100.206', family: 4 }];
};
const cases = [
  ['h-priv', '10/8'], ['h-loop', 'loopback'], ['h-mapped', '::ffff:192.168.0.1'],
  ['h-mappedhex', '::ffff:c0a8:1'], ['h-compat', '::c0a8:1'], ['h-compatzero', '::0.0.0.1'],
  ['h-zone', 'fe80::a%eth0 (zone-qualified DNS result)'], ['h-nat64', '64:ff9b::c0a8:1 (NAT64 embedded IPv4)'],
  ['h-6to4', '2002:c0a8:1:: (6to4 embedded IPv4)'], ['h-cgnat', '100.64.0.0/10 CGNAT'],
  ['h-multicast', '224/4'], ['h-reserved', '240/4'], ['h-broadcast', '255.255.255.255'],
  ['h-mixed', 'public+private multi-record'], ['h-fam4mapped', 'mapped quad via family 4'],
];
for (const [h, label] of cases) {
  const r = await ensurePublicHost(new URL(`http://${h}/feed.xml`), lookup);
  console.log(`${r.ok ? 'ALLOW' : 'reject'}  ${label}`);
}
