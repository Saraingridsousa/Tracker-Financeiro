import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function collect(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const full = join(path, entry.name);
    return entry.isDirectory() ? collect(full) : /\.test\.(mjs|ts)$/.test(entry.name) ? [full] : [];
  });
}
const files = [...collect('src'), ...collect('tests')].sort();
if (!files.length) throw new Error('Nenhum teste encontrado.');
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...files], { stdio: 'inherit', windowsHide: true });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
