import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';
import { createAppServer } from '../server/app.mjs';
import { loadConfig } from '../server/config.mjs';

const privateAccess = { origin: 'https://pc.synthetic.ts.net', user: 'owner@example.test' };
const ownerHeaders = { Host: 'pc.synthetic.ts.net', 'Tailscale-User-Login': privateAccess.user };
const document = () => ({ transactions: [], categories: [{id:'other',name:'Outros',color:'#fff',keywords:[],type:'both'}], rules: [], assets: [], investmentOrders: [], exportedAt: '2026-11-16T12:00:00Z' });
async function setup(t, options={}) {
  const store = new Store(); const server = createAppServer({store, pluggy:{configured:false}, ...options});
  server.listen(0); await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();});
  const call=(path, {method='GET',headers={},body}={})=>new Promise((resolve,reject)=>{
    const req=request({host:'127.0.0.1',port:server.address().port,path,method,headers:{...(body===undefined?{}:{'Content-Length':Buffer.byteLength(body)}),...headers}},res=>{
      let text='';res.on('data',c=>text+=c);res.on('end',()=>{let data;try{data=JSON.parse(text)}catch{}resolve({status:res.statusCode,data,text});});
    });req.on('error',reject);req.end(body);
  });return {store,server,call};
}

test('private configuration fails closed and accepts only an exact Tailscale HTTPS origin and owner',()=>{
  const env={TRACKER_PRIVATE_ORIGIN:privateAccess.origin,TRACKER_PRIVATE_USER:privateAccess.user};
  assert.deepEqual(loadConfig({env}).privateAccess,privateAccess);
  for(const patch of [{TRACKER_PRIVATE_USER:''},{TRACKER_PRIVATE_ORIGIN:''},{TRACKER_PRIVATE_ORIGIN:'http://pc.synthetic.ts.net'},{TRACKER_PRIVATE_ORIGIN:'https://pc.synthetic.ts.net/path'},{TRACKER_PRIVATE_ORIGIN:'https://pc.synthetic.ts.net:444'},{TRACKER_PRIVATE_ORIGIN:'https://user@pc.synthetic.ts.net'},{TRACKER_PRIVATE_ORIGIN:'https://evil.test'},{TRACKER_PRIVATE_ORIGIN:'https://pc.synthetic.ts.net#x'},{TRACKER_PRIVATE_USER:'owner@example.test\r\nspoof'},{TRACKER_PRIVATE_USER:'owner@example.test,other@example.test'}]) assert.throws(()=>loadConfig({env:{...env,...patch}}),/privad/i);
  assert.equal(loadConfig({env:{}}).privateAccess,undefined);
});

test('private ingress protects every route and requires exact owner, host and origin, with no local fallback',async t=>{
  const {call,server}=await setup(t,{privateAccess});assert.equal(server.address().address,'127.0.0.1');
  for(const path of ['/','/assets/file.js','/api/session','/api/banking','/api/backup','/api/shared-state']) {
    assert.equal((await call(path)).status,403,path);
    assert.equal((await call(path,{headers:{Host:ownerHeaders.Host}})).status,403,path);
    assert.equal((await call(path,{headers:{...ownerHeaders,'Tailscale-User-Login':'other@example.test'}})).status,403,path);
  }
  for(const headers of [{...ownerHeaders,Host:'evil.test'},{...ownerHeaders,Origin:'http://localhost:5173'},{...ownerHeaders,Origin:'https://pc.synthetic.ts.net.evil.test'},{...ownerHeaders,'Tailscale-User-Login':['owner@example.test','owner@example.test']},{...ownerHeaders,Origin:['https://pc.synthetic.ts.net','https://pc.synthetic.ts.net']}]) assert.equal((await call('/api/session',{headers})).status,403);
  assert.equal((await call('/api/session',{method:'OPTIONS'})).status,403);
  const session=await call('/api/session',{headers:{...ownerHeaders,Origin:privateAccess.origin}});assert.equal(session.status,200);assert.equal(typeof session.data.csrfToken,'string');
  assert.equal((await call('/api/banking',{headers:ownerHeaders})).data.accessMode,'private');
  assert.equal((await call('/api/shared-state',{method:'POST',headers:{...ownerHeaders,'Content-Type':'application/json'},body:'{}'})).status,403);
});

test('shared document is explicit, validated, atomic and revision guarded over HTTP',async t=>{
  const {call}=await setup(t);
  assert.deepEqual((await call('/api/shared-state')).data,{revision:0,payload:null});
  const token=(await call('/api/session')).data.csrfToken;
  const headers={'Content-Type':'application/json','X-Tracker-CSRF':token};
  const save=(revision,payload)=>call('/api/shared-state',{method:'POST',headers,body:JSON.stringify({revision,payload})});
  assert.equal((await save(0,document())).status,200);
  const first=(await call('/api/shared-state')).data;assert.equal(first.revision,1);
  assert.equal((await save(0,{...document(),rules:[]})).status,409);
  for(const bad of [{...document(),assets:undefined},{...document(),transactions:[{id:'bad'}]},{...document(),schemaVersion:2},{...document(),assets:[{id:'bad'}]}]) assert.equal((await save(1,bad)).status,400);
  assert.deepEqual((await call('/api/shared-state')).data,first);
  const next={...document(),categories:[]};
  const race=await Promise.all([save(1,next),save(1,document())]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  assert.equal((await call('/api/shared-state')).data.revision,2);
  assert.equal((await save(-1,document())).status,400);
  assert.equal((await call('/api/shared-state',{method:'POST',headers,body:JSON.stringify({revision:2,payload:document(),extra:true})})).status,400);
});

test('shared state survives reopen while banking export includes products in version 3',()=>{
  const dir=mkdtempSync(join(tmpdir(),'tracker-shared-'));let store;
  try {
    const file=join(dir,'state.sqlite');store=new Store(file);
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version,4);
    store.saveSharedState(0,document());const before=store.sharedState();store.close();store=new Store(file);
    assert.deepEqual(store.sharedState(),before);assert.equal(store.backup().schemaVersion,3);assert.equal('payload' in store.backup(),false);
  }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});

test('shared route supports historical documents above 64 KB without enlarging banking mutation limits',async t=>{
  const {call}=await setup(t);const headers={'Content-Type':'application/json','X-Tracker-CSRF':(await call('/api/session')).data.csrfToken};
  const payload=document();payload.transactions=Array.from({length:500},(_,i)=>({id:String(i),date:'2026-11-01',description:'synthetic history '.repeat(5),amount:1,type:'expense',categoryId:'other',source:'import',createdAt:'2026-11-01'}));
  const body=JSON.stringify({revision:0,payload});assert.ok(Buffer.byteLength(body)>65536);
  assert.equal((await call('/api/shared-state',{method:'POST',headers,body})).status,200);
  assert.equal((await call('/api/connections',{method:'POST',headers,body})).status,413);
});


test('local mode denies proxy headers even with a loopback Host after private configuration is removed',async t=>{
 const {call,server}=await setup(t);const Host='localhost:'+server.address().port;assert.equal((await call('/api/session',{headers:{Host}})).status,200);
 for(const headers of [{'Tailscale-User-Login':'other@example.test'},{'Tailscale-Funnel-Request':'?1'},{'X-Forwarded-For':'100.64.0.1'},{Forwarded:'for=100.64.0.1'},{'X-Forwarded-Proto':'https'}]) assert.equal((await call('/api/session',{headers:{Host,...headers}})).status,403);
});


test('separate SQLite connections enforce revision CAS and v2 migration preserves banking data',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tracker-cas-'));let a,b;
 try {
   const file=join(dir,'state.sqlite');a=new Store(file);a.registerConnection({itemId:'11111111-1111-4111-8111-111111111111',label:'Synthetic'});
   const before=a.backup();a.db.exec('DROP TABLE bank_products; DROP TABLE connection_sync; DROP TABLE transaction_annotations; DROP TABLE shared_state; PRAGMA user_version=2;');a.close();a=new Store(file);b=new Store(file);
   assert.deepEqual(a.backup().connections,before.connections);assert.equal(a.db.prepare('PRAGMA user_version').get().user_version,4);
   assert.equal(a.sharedState().revision,0);const readByB=b.sharedState().revision;
   a.saveSharedState(0,document());assert.throws(()=>b.saveSharedState(readByB,document()),{code:'REVISION_CONFLICT'});
   assert.equal(b.sharedState().revision,1);b.saveSharedState(1,{...document(),categories:[]});assert.equal(a.sharedState().revision,2);
   assert.deepEqual(a.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(a.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{a?.close();b?.close();rmSync(dir,{recursive:true,force:true});}
});

test('production startup wires private authorization, while dev refuses it before creating data',async()=>{
 const {startServer}=await import('../server/index.mjs');const {spawnSync}=await import('node:child_process');const {existsSync}=await import('node:fs');
 const dir=mkdtempSync(join(tmpdir(),'tracker-private-config-'));let app;
 try {
   const env={TRACKER_DATA_DIR:join(dir,'data'),TRACKER_PRIVATE_ORIGIN:privateAccess.origin,TRACKER_PRIVATE_USER:privateAccess.user};
   app=await startServer({env,cwd:dir,port:0});assert.equal((await fetch('http://127.0.0.1:'+app.server.address().port+'/api/session')).status,403);await app.close();app=undefined;
   const result=spawnSync(process.execPath,['scripts/dev.mjs'],{windowsHide:true,encoding:'utf8',env:{...process.env,...env,TRACKER_DATA_DIR:join(dir,'dev-data'),TRACKER_ENV_FILE:join(dir,'not-configured.env')}});
   assert.equal(result.status,1);assert.match(result.stderr,/privado exige build/);assert.equal(existsSync(join(dir,'dev-data')),false);
 }finally{await app?.close();rmSync(dir,{recursive:true,force:true});}
});
