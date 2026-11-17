import { syncWindow } from './products.mjs';
import { parsePrivateAccess, authorizeRequest } from './access.mjs';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { PluggyError } from './pluggy.mjs';
import { fileURLToPath } from 'node:url';
import { HttpError, serveStatic } from './static.mjs';

export function createAppServer({ store, pluggy, now = () => new Date(), privateAccess: suppliedAccess, distDir = fileURLToPath(new URL('../dist/', import.meta.url)) } = {}) {
  const privateAccess = suppliedAccess === undefined ? undefined : parsePrivateAccess(suppliedAccess.origin, suppliedAccess.user);
  const snapshot = () => ({ ...store.snapshot(pluggy.configured), ...(privateAccess ? { accessMode: 'private' } : {}), ...(store.hasSharedState() ? { sharedStateAvailable: true } : {}) });
  const csrfToken = randomBytes(32).toString('base64url');
  const syncing = new Set();
  const server = createServer((req, res) => { handle(req, res).catch(error => {
    if (!res.headersSent) send(res, error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : 'Erro interno do aplicativo.' });
    else res.end();
  }); });
  async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const port = server.address()?.port;
    authorizeRequest(req, port, privateAccess);
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tracker-CSRF');
      res.writeHead(204); return res.end();
    }
    if (req.method === 'GET' && req.url === '/api/session') return send(res, 200, { csrfToken });
    if (req.method === 'GET' && req.url === '/api/banking') return send(res, 200, snapshot());
    if (req.method === 'GET' && req.url === '/api/backup') {
      res.setHeader('Content-Disposition', 'attachment; filename="tracker-backup.json"');
      return send(res, 200, store.backup());
    }
    if (req.method === 'GET' && req.url === '/api/shared-state') return send(res, 200, store.sharedState());
    let body;
    if (['POST','PATCH','DELETE'].includes(req.method)) {
      const token = req.headers['x-tracker-csrf'];
      if (typeof token !== 'string' || Buffer.byteLength(token) !== Buffer.byteLength(csrfToken) || !timingSafeEqual(Buffer.from(token), Buffer.from(csrfToken))) throw new HttpError(403, 'Token CSRF inválido. Recarregue o aplicativo.');
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Envie Content-Type application/json.');
      body = await readJson(req, req.url === '/api/shared-state' ? 10 * 1024 * 1024 : 64 * 1024);
    }
    if (req.method === 'POST' && req.url === '/api/shared-state') {
      if (Object.keys(body).some(key => !['revision','payload'].includes(key))) throw new HttpError(400, 'Documento compartilhado inválido.');
      try { return send(res, 200, store.saveSharedState(body.revision, body.payload)); }
      catch (error) { throw new HttpError(error.code === 'REVISION_CONFLICT' ? 409 : 400, error.code === 'REVISION_CONFLICT' ? 'Os dados foram alterados em outro aparelho. Exporte seu rascunho e recarregue antes de continuar.' : 'Documento compartilhado inválido. Nenhum dado foi alterado.'); }
    }
    if (req.method === 'POST' && req.url === '/api/connections') {
      if (Object.keys(body).some(k => !['itemId','label'].includes(k))) throw new HttpError(400, 'Campos de conexão inválidos.');
      try { store.registerConnection(body); }
      catch { throw new HttpError(400, 'Conexão inválida, já registrada ou limite de cinco conexões atingido. Informe UUID e nome válidos.'); }
      return send(res, 201, snapshot());
    }
    const transactionMatch = /^\/api\/transactions\/([^/]+)$/.exec(req.url);
    if (['PATCH','DELETE'].includes(req.method) && transactionMatch) {
      const id = decodeId(transactionMatch[1]);
      try { store.requireTransaction(id); }
      catch { throw new HttpError(404, 'Transação não encontrada.'); }
      try {
        if (req.method === 'PATCH') store.patchTransaction(id, body);
        else {
          if (Object.keys(body).length) throw new Error();
          store.hideTransaction(id);
        }
      } catch { throw new HttpError(400, 'Campos de edição inválidos.'); }
      return send(res, 200, snapshot());
    }
    const syncMatch = /^\/api\/connections\/([^/]+)\/sync$/.exec(req.url);
    if (req.method === 'POST' && syncMatch) {
      const id = decodeId(syncMatch[1]);
      if (!store.connections().some(c => c.id === id)) throw new HttpError(404, 'Conexão não encontrada.');
      if (Object.keys(body).some(k=>k!=='full') || ('full' in body && typeof body.full!=='boolean')) throw new HttpError(400, 'Campos de consulta inválidos.');
      if (syncing.has(id)) throw new HttpError(409, 'Esta conexão já está sendo consultada. Aguarde a conclusão.');
      syncing.add(id);
      try {
        const connection=store.connections().find(c=>c.id===id);
        const window=body.full===true?{mode:'full'}:syncWindow(connection,now());
        const batch = await pluggy.readItem(id,{label:connection.label,dateFrom:window.dateFrom,full:window.mode==='full'});
        store.applySync(id, batch, now().toISOString());
      } catch (error) {
        const message = error instanceof PluggyError ? error.message : 'Não foi possível concluir a consulta. O histórico foi preservado.';
        store.recordSyncError(id, message);
        throw new HttpError(error instanceof PluggyError && error.code === 'CONFIG' ? 503 : 502, message);
      } finally { syncing.delete(id); }
      return send(res, 200, snapshot());
    }
    if (['GET','HEAD'].includes(req.method) && !req.url.startsWith('/api/')) return serveStatic(req, res, distDir);
    send(res, 404, { error: 'Não encontrado.' });
  }
  const listen = server.listen.bind(server);
  server.listen = (port, host, callback) => {
    if (host !== undefined && typeof host !== 'function' && host !== '127.0.0.1') throw new Error('Servidor restrito a loopback 127.0.0.1.');
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Porta inválida.');
    return listen(port, '127.0.0.1', typeof host === 'function' ? host : callback);
  };
  return server;
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function decodeId(value) {
  try { return decodeURIComponent(value); }
  catch { throw new HttpError(400, 'Identificador inválido.'); }
}

function readJson(req, limit) {
  if (Number(req.headers['content-length']) > limit) { req.resume(); throw new HttpError(413, 'Corpo excede o limite de ' + (limit / 1024) + ' KB.'); }
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { chunks.length = 0; reject(new HttpError(413, 'Corpo excede o limite de ' + (limit / 1024) + ' KB.')); }
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > limit) return;
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error();
        resolve(data);
      } catch { reject(new HttpError(400, 'Envie um objeto JSON válido.')); }
    });
    req.on('error', () => reject(new HttpError(400, 'Não foi possível ler a requisição.')));
    req.on('aborted', () => reject(new HttpError(400, 'Requisição interrompida.')));
  });
}
