import test from 'node:test';
import assert from 'node:assert/strict';
import { FinanceState, createSharedApi } from '../shared/financeState.mjs';
const payload=()=>({transactions:[],categories:[],rules:[],assets:[],investmentOrders:[],exportedAt:'2026-11-16T12:00:00Z'});
const tick=()=>new Promise(r=>setTimeout(r,0));

test('same-event changes to history and wallet use one validated CAS write',async()=>{
 let calls=[];const c=new FinanceState({load:async()=>({revision:1,payload:payload()}),save:async(revision,payload)=>{calls.push({revision,payload});return {revision:revision+1,payload}}});
 await c.load();c.set('categories',x=>[...x,{id:'a',name:'A',color:'#fff',keywords:[],type:'both'}]);c.set('rules',[]);c.set('assets',[{id:'asset',tickerOrName:'Synthetic',type:'Outros',quantity:1,avgPrice:1,currentPrice:2}]);await tick();
 assert.equal(calls.length,1);assert.equal(calls[0].revision,1);assert.equal(calls[0].payload.categories.length,1);assert.equal(calls[0].payload.assets.length,1);assert.equal(c.state.revision,2);assert.equal(c.state.busy,false);
});

test('two devices cannot overwrite concurrent changes and failed draft survives for explicit recovery',async()=>{
 let server={revision:1,payload:payload()},recovery;
 const api={load:async()=>structuredClone(server),save:async(revision,payload)=>{if(revision!==server.revision)throw new Error('Conflito de revisão');server={revision:revision+1,payload};return structuredClone(server)}};
 const a=new FinanceState(api),b=new FinanceState(api,{persistDraft:value=>{recovery=value}});await Promise.all([a.load(),b.load()]);
 a.set('categories',[{id:'a',name:'A',color:'#fff',keywords:[],type:'both'}]);await tick();b.set('rules',[{id:'b',categoryId:'a',keywords:['test'],isActive:true}]);await tick();
 assert.match(b.state.error,/Conflito/);assert.equal(b.state.draft.rules.length,1);assert.equal(recovery.rules.length,1);assert.equal(server.payload.rules.length,0);
 assert.equal(await b.load(),false);assert.throws(()=>b.set('rules',[]),/rascunho/i);
 await b.discardAndReload();assert.equal(b.state.revision,2);assert.equal(b.state.payload.categories.length,1);assert.equal(b.state.draft,null);assert.equal(recovery,null);
});

test('stale reads and reads during pending writes never replace acknowledged state',async()=>{
 let finish;let count=0;const c=new FinanceState({load:async()=>++count===1?new Promise(r=>finish=r):({revision:2,payload:payload()}),save:async(r,p)=>({revision:r+1,payload:p})});
 const slow=c.load();await c.load();finish({revision:1,payload:payload()});await slow;assert.equal(c.state.revision,2);
 c.set('rules',[]);assert.equal(await c.load(),false);await tick();assert.equal(c.state.revision,3);
});

test('restore preserves absent wallet, rejects invalid backup and requires explicit initialization',async()=>{
 const initial={...payload(),assets:[{id:'asset',tickerOrName:'Synthetic',type:'Outros',quantity:1,avgPrice:1,currentPrice:2}]};
 const c=new FinanceState({load:async()=>({revision:0,payload:null}),save:async(r,p)=>({revision:r+1,payload:p})});await c.load();assert.throws(()=>c.set('rules',[]),/inicializ/i);
 c.replace(initial);await tick();const legacy=payload();delete legacy.assets;delete legacy.investmentOrders;c.restore(JSON.stringify(legacy));await tick();assert.equal(c.state.payload.assets.length,1);
 const before=c.state;assert.throws(()=>c.restore('{invalid'),/backup/);assert.equal(c.state,before);
 c.restore(JSON.stringify(payload()));await tick();assert.equal(c.state.payload.assets.length,0);
});

test('network acknowledgement loss retains draft and blocks further writes until explicit reload',async()=>{
 let saved;const c=new FinanceState({load:async()=>({revision:1,payload:payload()}),save:async()=>{throw new Error('PC indisponível')}},{persistDraft:x=>{saved=x}});await c.load();c.set('rules',[]);await tick();assert.match(c.state.error,/PC indisponível/);assert.ok(saved);assert.ok(c.state.draft);assert.throws(()=>c.replace(payload()),/rascunho/i);
});

test('client validates complete server state and obtains CSRF for document writes',async()=>{
 const calls=[];const api=createSharedApi(async(path,options={})=>{calls.push({path,options});return new Response(JSON.stringify(path==='/api/session'?{csrfToken:'synthetic'}:{revision:1,payload:payload()}),{status:200})});
 await api.save(0,payload());assert.equal(calls[1].options.headers['X-Tracker-CSRF'],'synthetic');assert.equal(calls[1].options.credentials,'same-origin');
 for(const body of [{revision:-1,payload:null},{revision:1,payload:null},{revision:0,payload:payload()},{revision:1,payload:{...payload(),assets:undefined}}]) await assert.rejects(createSharedApi(async()=>new Response(JSON.stringify(body))).load(),/inválid/);
});


test('storage quota failure aborts network write and keeps an exportable draft',async()=>{
 let writes=0;const c=new FinanceState({load:async()=>({revision:1,payload:payload()}),save:async()=>{writes++;throw Error('should not send')}},{persistDraft:()=>{throw Error('Armazenamento do navegador indisponível')}});await c.load();c.set('rules',[]);await tick();assert.equal(writes,0);assert.ok(c.state.draft);assert.match(c.state.error,/Armazenamento/);
});

test('invalid batched financial input never reaches the server or removes acknowledged data',async()=>{
 let writes=0;const c=new FinanceState({load:async()=>({revision:1,payload:payload()}),save:async()=>{writes++;throw Error('should not send')}});await c.load();c.set('assets',[{id:'invalid'}]);await tick();assert.equal(writes,0);assert.deepEqual(c.state.payload,payload());assert.ok(c.state.draft);assert.match(c.state.error,/inválido/);
});
