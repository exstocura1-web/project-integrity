import { readFileSync } from 'fs';
import { join } from 'path';

const VPS_IP = '72.62.83.136';
const DOMAIN = 'exstocura.com';
const SUBDOMAIN = 'n8n';
const API_BASE = 'https://developers.hostinger.com';

function readEnv(path) {
  try {
    const lines = readFileSync(path, 'utf8').split('\n');
    const map = {};
    for (const line of lines) {
      const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) map[m[1]] = m[2].trim();
    }
    return map;
  } catch { return {}; }
}

const env = readEnv('C:\\Exsto\\.env');
const token = process.argv[2] || env['HOSTINGER_API_TOKEN'];

if (!token) {
  console.error(`
  Hostinger API token required.

  To generate one:
    1. Go to https://hpanel.hostinger.com/profile/api
    2. Click "Create Token"
    3. Copy the token

  Then run:
    node self-host/setup-hostinger-dns.mjs YOUR_TOKEN_HERE

  Or add to C:\\Exsto\\.env:
    HOSTINGER_API_TOKEN=your_token
`);
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
};

async function api(method, path, body) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${API_BASE}${path}`, opts);
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: resp.status, data };
}

async function main() {
  console.log('\n── Hostinger DNS Setup ──\n');

  // Step 1: Check if domain exists in Hostinger DNS zones
  console.log('[1/4] Checking DNS zones...');
  const zones = await api('GET', '/api/dns/v1/zones');
  if (zones.status !== 200) {
    console.error('  Failed to list zones:', zones.status, JSON.stringify(zones.data).substring(0, 200));

    // Try to add the domain as a DNS zone
    console.log('\n[1b] Adding domain to Hostinger DNS...');
    const addZone = await api('POST', '/api/dns/v1/zones', { domain: DOMAIN });
    if (addZone.status !== 200 && addZone.status !== 201) {
      console.error('  Could not add zone:', addZone.status, JSON.stringify(addZone.data).substring(0, 300));
      console.log('\n  The domain may need to be added through hPanel first.');
      console.log('  Go to: https://hpanel.hostinger.com → Domains → Add Domain');
      process.exit(1);
    }
    console.log('  Zone added');
  } else {
    const zoneList = Array.isArray(zones.data) ? zones.data : zones.data?.data || [];
    console.log(`  Found ${zoneList.length} zone(s)`);
    const hasDomain = zoneList.some(z => z.domain === DOMAIN || z.name === DOMAIN);
    if (!hasDomain) {
      console.log(`  Domain ${DOMAIN} not found. Adding...`);
      const addZone = await api('POST', '/api/dns/v1/zones', { domain: DOMAIN });
      console.log(`  Add zone result: ${addZone.status}`);
    } else {
      console.log(`  Domain ${DOMAIN} found in zones`);
    }
  }

  // Step 2: List existing records
  console.log('\n[2/4] Checking existing records...');
  const records = await api('GET', `/api/dns/v1/zones/${DOMAIN}`);
  if (records.status === 200) {
    const recs = Array.isArray(records.data) ? records.data : records.data?.records || records.data?.data || [];
    const existing = recs.filter(r => r.type === 'A' && (r.name === SUBDOMAIN || r.name === `${SUBDOMAIN}.${DOMAIN}`));
    if (existing.length > 0) {
      console.log(`  Found existing A record(s) for ${SUBDOMAIN}:`, existing.map(r => r.content || r.value || r.address));
    } else {
      console.log(`  No existing A record for ${SUBDOMAIN}`);
    }
  }

  // Step 3: Add A record
  console.log(`\n[3/4] Creating A record: ${SUBDOMAIN}.${DOMAIN} → ${VPS_IP}...`);
  const addRecord = await api('POST', `/api/dns/v1/zones/${DOMAIN}`, {
    records: [{
      type: 'A',
      name: SUBDOMAIN,
      content: VPS_IP,
      ttl: 300,
    }]
  });

  if (addRecord.status >= 200 && addRecord.status < 300) {
    console.log('  A record created successfully');
  } else {
    console.log(`  Response ${addRecord.status}:`, JSON.stringify(addRecord.data).substring(0, 400));

    // Try alternative payload formats
    const alt = await api('POST', `/api/dns/v1/zones/${DOMAIN}/records`, {
      type: 'A',
      name: SUBDOMAIN,
      content: VPS_IP,
      ttl: 300,
    });
    if (alt.status >= 200 && alt.status < 300) {
      console.log('  A record created (alt endpoint)');
    } else {
      console.log(`  Alt response ${alt.status}:`, JSON.stringify(alt.data).substring(0, 400));
    }
  }

  // Step 4: Verify
  console.log('\n[4/4] Verifying...');
  const verify = await api('GET', `/api/dns/v1/zones/${DOMAIN}`);
  if (verify.status === 200) {
    const recs = Array.isArray(verify.data) ? verify.data : verify.data?.records || verify.data?.data || [];
    const found = recs.filter(r => r.type === 'A' && (r.name === SUBDOMAIN || r.name === `${SUBDOMAIN}.${DOMAIN}`));
    if (found.length > 0) {
      console.log(`  CONFIRMED: ${SUBDOMAIN}.${DOMAIN} → ${found[0].content || found[0].value}`);
    } else {
      console.log('  Record not found in zone yet. May take a moment to propagate.');
    }
  }

  console.log(`
── Summary ──
  n8n is live NOW at: http://${VPS_IP}
  
  Once you change nameservers at HostPapa to Hostinger's:
    ns1.dns-parking.com
    ns2.dns-parking.com
  
  Then https://n8n.exstocura.com will also work (auto-SSL via Caddy).

  Hostinger nameserver change guide:
    https://www.hostinger.com/tutorials/how-to-change-nameservers/
`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
