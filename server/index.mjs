#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { Store } from './store.mjs';
import { PluggyClient } from './pluggy.mjs';
import { createAppServer } from './app.mjs';
import { loadConfig } from './config.mjs';

export async function startServer({ env = process.env, cwd = process.cwd(), port, fetchImpl, distDir } = {}) {
  const config = loadConfig({ env, cwd });
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const store = new Store(join(config.dataDir, 'tracker.sqlite'));
  const pluggy = new PluggyClient({ clientId: config.clientId, clientSecret: config.clientSecret, fetchImpl });
  const server = createAppServer({ store, pluggy, distDir, privateAccess: config.privateAccess });
  try {
    server.listen(port ?? config.port, '127.0.0.1');
    await once(server, 'listening');
  } catch (error) { store.close(); throw error; }
  let closed = false;
  return { server, store, close: async () => {
    if (closed) return;
    closed = true;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    store.close();
  }};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  startServer().then(app => {
    console.info(`Tracker Financeiro em http://127.0.0.1:${app.server.address().port}`);
    const stop = () => { app.close().catch(() => { process.exitCode = 1; }); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }).catch(() => {
    console.error('Não foi possível iniciar o Tracker. Confira a porta, as permissões e a configuração local.');
    process.exitCode = 1;
  });
}
