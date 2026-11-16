import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) throw new Error('Use Node.js 22.18 ou superior.');
if (process.argv.includes('--help')) {
  console.log('Tracker local: 127.0.0.1:5173 (desenvolvimento) e 127.0.0.1:3001 (backend/produção).');
  console.log('Credenciais somente no backend: config.env no diretório local de dados, ou TRACKER_ENV_FILE.');
  console.log('npm run dev inicia os dois processos; npm start serve o build local. Ctrl+C encerra ambos.');
  process.exit(0);
}
const defaultDataDir = process.platform === 'win32' ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'TrackerFinanceiro') : join(homedir(), '.local', 'share', 'TrackerFinanceiro');
const envFile = process.env.TRACKER_ENV_FILE || join(process.env.TRACKER_DATA_DIR || defaultDataDir, 'config.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.argv.includes('--production') && (process.env.TRACKER_PRIVATE_ORIGIN !== undefined || process.env.TRACKER_PRIVATE_USER !== undefined)) throw new Error('Acesso privado exige build e npm start; desenvolvimento não autorizado neste modo.');
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill();
  process.exitCode = code;
}
function launch(args) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true, env: process.env });
  children.push(child);
  child.on('error', (error) => { console.error('Não foi possível iniciar o processo local:', error.message); stop(1); });
  child.on('exit', (code) => { if (!stopping) stop(code ?? 1); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
launch(['server/index.mjs']);
if (!process.argv.includes('--production')) launch(['node_modules/vite/bin/vite.js', '--config', 'vite.config.ts', '--host', '127.0.0.1']);
