import { readFileSync } from 'fs';
import { Client } from 'ssh2';
import { homedir } from 'os';
import { join } from 'path';

const VPS_IP   = '72.62.83.136';
const VPS_USER = 'root';
const VPS_PASS = process.argv[2] || '';
const DOMAIN   = 'n8n.exstocura.com';

const pubKey = readFileSync(join(homedir(), '.ssh', 'id_ed25519.pub'), 'utf8').trim();

const dockerCompose = readFileSync(join(import.meta.dirname, 'docker-compose.yml'), 'utf8');
const caddyfile     = readFileSync(join(import.meta.dirname, 'Caddyfile'), 'utf8');

const encKeyCmd = 'openssl rand -hex 32';

const commands = [
  // 1. Install SSH key
  `mkdir -p ~/.ssh && echo "${pubKey}" >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`,

  // 2. Install Docker if missing
  `command -v docker >/dev/null 2>&1 && echo "Docker already installed" || (curl -fsSL https://get.docker.com | sh && systemctl enable --now docker)`,

  // 3. Create deploy directory
  `mkdir -p /opt/n8n`,

  // 4. Write docker-compose.yml
  `cat > /opt/n8n/docker-compose.yml << 'DCEOF'\n${dockerCompose}DCEOF`,

  // 5. Write Caddyfile
  `cat > /opt/n8n/Caddyfile << 'CFEOF'\n${caddyfile}CFEOF`,

  // 6. Generate encryption key + write .env
  `ENC_KEY=$(${encKeyCmd}) && cat > /opt/n8n/.env << ENVEOF
N8N_DOMAIN=${DOMAIN}
N8N_ENCRYPTION_KEY=$ENC_KEY
ENVEOF
echo "ENCRYPTION KEY (BACK THIS UP): $ENC_KEY"`,

  // 7. Pull and start
  `cd /opt/n8n && docker compose pull 2>&1`,
  `cd /opt/n8n && docker compose up -d 2>&1`,

  // 8. Verify
  `sleep 5 && docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>&1`,
];

function run(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => { out += d; process.stdout.write(d); });
      stream.stderr.on('data', d => { out += d; process.stderr.write(d); });
      stream.on('close', (code) => resolve({ code, out }));
    });
  });
}

async function main() {
  const conn = new Client();

  await new Promise((resolve, reject) => {
    conn.on('ready', resolve);
    conn.on('error', reject);
    conn.connect({ host: VPS_IP, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 15000 });
  });

  console.log(`\n── Connected to ${VPS_IP} ──\n`);

  for (let i = 0; i < commands.length; i++) {
    const label = [
      'SSH key', 'Docker install', 'Create /opt/n8n',
      'docker-compose.yml', 'Caddyfile', '.env + encryption key',
      'Docker pull', 'Docker compose up', 'Verify containers'
    ][i];
    console.log(`\n[${i + 1}/${commands.length}] ${label}...`);
    const { code } = await run(conn, commands[i]);
    if (code !== 0 && i >= 6) {
      console.error(`  FAILED (exit ${code})`);
      conn.end();
      process.exit(1);
    }
    console.log(`  done`);
  }

  console.log(`\n── Deploy complete ──`);
  console.log(`  n8n: https://${DOMAIN}`);
  console.log(`  SSH: ssh root@${VPS_IP} (key-based, no password)`);
  console.log(`\n  Next: setup DNS, then visit https://${DOMAIN} to create owner account\n`);

  conn.end();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
