import { realpath, stat, readFile } from 'node:fs/promises';
import { resolve, relative, extname, isAbsolute, sep } from 'node:path';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function serveStatic(req, res, distDir) {
  let path;
  try { path = decodeURIComponent(req.url.split('?')[0]); }
  catch { throw new HttpError(400, 'Caminho inválido.'); }
  if (/[\u0000-\u001f]/.test(path) || !path.startsWith('/')) throw new HttpError(400, 'Caminho inválido.');
  if (path.includes('\\') || path.includes(':') || path.split('/').some(p => p.startsWith('.'))) throw new HttpError(403, 'Caminho não autorizado.');
  const candidate = resolve(distDir, `.${path === '/' ? '/index.html' : path}`);
  if (!within(resolve(distDir), candidate)) throw new HttpError(403, 'Caminho não autorizado.');
  try {
    const root = await realpath(distDir);
    let file;
    try { file = await realpath(candidate); }
    catch (error) {
      if (!['ENOENT','ENOTDIR'].includes(error.code)) throw error;
      if (extname(path) || !req.headers.accept?.includes('text/html')) throw new HttpError(404, 'Arquivo não encontrado.');
      file = await realpath(resolve(root, 'index.html'));
    }
    if (!within(root, file)) throw new HttpError(403, 'Caminho não autorizado.');
    const info = await stat(file);
    if (!info.isFile()) throw new HttpError(404, 'Arquivo não encontrado.');
    const type = TYPES[extname(file)];
    if (!type) throw new HttpError(403, 'Tipo de arquivo não autorizado.');
    const body = req.method === 'HEAD' ? null : await readFile(file);
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size });
    res.end(body);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(404, 'Build não encontrado. Execute o build do frontend.');
  }
}

function within(root, target) {
  const rel = relative(root, target);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
