import { parsePrivateAccess } from './access.mjs';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

export function loadConfig({ env = process.env, cwd = process.cwd() } = {}) {
  const local = {};
  try {
    const text = readFileSync(join(cwd, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?(PLUGGY_CLIENT_ID|PLUGGY_CLIENT_SECRET)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      else value = value.replace(/\s+#.*$/, '').trim();
      local[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Não foi possível ler a configuração local.');
  }
  const portText = env.TRACKER_PORT ?? '3001';
  if (!/^\d+$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) throw new Error('Porta TRACKER_PORT inválida.');
  return { privateAccess: parsePrivateAccess(env.TRACKER_PRIVATE_ORIGIN, env.TRACKER_PRIVATE_USER), port: Number(portText), dataDir: env.TRACKER_DATA_DIR ? resolve(cwd, env.TRACKER_DATA_DIR) : resolve(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'TrackerFinanceiro'),
    clientId: env.PLUGGY_CLIENT_ID ?? local.PLUGGY_CLIENT_ID,
    clientSecret: env.PLUGGY_CLIENT_SECRET ?? local.PLUGGY_CLIENT_SECRET,
  };
}
