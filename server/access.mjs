import { HttpError } from './static.mjs';

export function parsePrivateAccess(origin, user) {
  if (origin === undefined && user === undefined) return undefined;
  const invalid = () => { throw new Error('Configuração de acesso privado inválida ou incompleta.'); };
  if (typeof origin !== 'string' || typeof user !== 'string') return invalid();
  let url;try { url = new URL(origin); } catch { return invalid(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
    || url.pathname !== '/' || origin !== url.origin
    || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.ts\.net$/.test(url.hostname)
    || !/^[A-Za-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[A-Za-z0-9.-]+$/.test(user) || user.length > 254) return invalid();
  return { origin: url.origin, user };
}

export function authorizeRequest(req, port, privateAccess) {
  for (const name of ['host','origin','tailscale-user-login']) {
    let count=0;for(let i=0;i<req.rawHeaders.length;i+=2) if(req.rawHeaders[i].toLowerCase()===name) count++;
    if(count>1) throw new HttpError(403,'Acesso não autorizado.');
  }
  if (privateAccess) {
    if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== new URL(privateAccess.origin).host
      || req.headers['tailscale-user-login'] !== privateAccess.user
      || (req.headers.origin !== undefined && req.headers.origin !== privateAccess.origin)) throw new HttpError(403,'Acesso privado não autorizado.');
    return;
  }
  if (Object.keys(req.headers).some(name => name.startsWith('tailscale-') || name === 'forwarded' || name.startsWith('x-forwarded-'))) throw new HttpError(403,'Proxy privado exige configuração explícita de acesso.');
  const hosts = new Set(['127.0.0.1:'+port, 'localhost:'+port, '127.0.0.1:5173', 'localhost:5173']);
  const origins = new Set([...hosts].map(host=>'http://'+host));
  if (!hosts.has(req.headers.host) || (req.headers.origin !== undefined && !origins.has(req.headers.origin))) throw new HttpError(403,'Host ou Origin não autorizado.');
}
