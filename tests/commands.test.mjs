import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

test('Comando de desenvolvimento documenta execução local sem abrir serviços no help', () => {
  const result = spawnSync(process.execPath, ['scripts/dev.mjs', '--help'], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /127\.0\.0\.1/);
  assert.match(result.stdout, /config.env/);
});
