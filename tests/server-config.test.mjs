import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const scratch = () => mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'tracker-config-'));

test('executable startup creates an external SQLite database and safely reopens persisted state', async () => {
  const { startServer } = await import('../server/index.mjs');
  const dir = scratch();
  const env = { TRACKER_DATA_DIR: join(dir, 'data'), LOCALAPPDATA: join(dir, 'local') };
  let app;
  try {
    app = await startServer({ env, cwd: dir, port: 0 });
    assert.equal(app.server.address().address, '127.0.0.1');
    assert.equal(existsSync(join(dir, 'data', 'tracker.sqlite')), true);
    app.store.registerConnection({ itemId: '11111111-1111-4111-8111-111111111111', label: 'Sintético' });
    const snapshot = await fetch(`http://127.0.0.1:${app.server.address().port}/api/banking`).then(r => r.json());
    assert.equal(snapshot.configured, false);
    assert.equal(snapshot.connections.length, 1);
    await app.close(); app = undefined;
    app = await startServer({ env, cwd: dir, port: 0 });
    assert.equal(app.store.snapshot(false).connections[0].label, 'Sintético');
    assert.equal(existsSync(join(dir, 'tracker.sqlite')), false);
  } finally { if (app) await app.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('node server/index.mjs starts an actual loopback process and reports no credentials', async () => {
  const dir = scratch();
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server/index.mjs', import.meta.url))], { cwd: dir, windowsHide: true,
    env: { ...process.env, TRACKER_PORT: String(port), TRACKER_DATA_DIR: join(dir, 'data'), PLUGGY_CLIENT_ID: '', PLUGGY_CLIENT_SECRET: '' }, stdio: ['ignore','pipe','pipe'] });
  let output = ''; child.stdout.on('data', chunk => { output += chunk.toString(); }); child.stderr.on('data', chunk => { output += chunk.toString(); });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CLI failed to start')), 4000);
      child.stdout.on('data', () => { if (output.includes(`http://127.0.0.1:${port}`)) { clearTimeout(timer); resolve(); } });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('CLI exited before listening')); });
    });
    const response = await fetch(`http://127.0.0.1:${port}/api/banking`);
    assert.equal(response.status, 200); assert.equal((await response.json()).configured, false);
    assert.doesNotMatch(output, /clientSecret|apiKey|csrfToken/);
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, 'exit'); }
    rmSync(dir, { recursive: true, force: true });
  }
});

test('backend config uses external app data, honors environment overrides and reads only optional local credentials', async () => {
  const { loadConfig } = await import('../server/config.mjs');
  const dir = scratch();
  try {
    writeFileSync(join(dir, '.env'), '# synthetic credentials only\nPLUGGY_CLIENT_ID="SYNTHETIC_FILE_ID"\nPLUGGY_CLIENT_SECRET=\'SYNTHETIC_FILE_SECRET\'\nVITE_API_KEY=not-loaded\nTRACKER_PORT=9\n');
    const config = loadConfig({ env: { LOCALAPPDATA: join(dir, 'local') }, cwd: dir });
    assert.equal(config.dataDir, join(dir, 'local', 'TrackerFinanceiro'));
    assert.equal(config.port, 3001);
    assert.equal(config.clientId, 'SYNTHETIC_FILE_ID');
    assert.equal(config.clientSecret, 'SYNTHETIC_FILE_SECRET');
    assert.equal(config.VITE_API_KEY, undefined);
    const overridden = loadConfig({ env: { TRACKER_DATA_DIR: './custom-data', TRACKER_PORT: '4001', PLUGGY_CLIENT_ID: 'SYNTHETIC_ENV_ID', PLUGGY_CLIENT_SECRET: 'SYNTHETIC_ENV_SECRET' }, cwd: dir });
    assert.equal(overridden.dataDir, resolve(dir, 'custom-data'));
    assert.equal(overridden.port, 4001);
    assert.equal(overridden.clientId, 'SYNTHETIC_ENV_ID');
    assert.equal(overridden.clientSecret, 'SYNTHETIC_ENV_SECRET');
    for (const value of ['abc', '-1', '65536', '1.5', '0', '3001x']) assert.throws(() => loadConfig({ env: { TRACKER_PORT: value }, cwd: dir }), /porta/i);
    assert.equal(existsSync(join(dir, 'custom-data')), false, 'reading config does not create data');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
