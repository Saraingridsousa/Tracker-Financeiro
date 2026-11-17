import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {Store} from '../server/store.mjs';
import {createAppServer} from '../server/app.mjs';
import {createBankingApi} from '../src/lib/bankingApi.ts';
const empty=()=>({transactions:[],categories:[],rules:[],assets:[],investmentOrders:[],exportedAt:'2026-11-16T12:00:00Z'});

test('local app opts into central finance only after explicit shared document initialization',async t=>{
 const store=new Store();const server=createAppServer({store,pluggy:{configured:false}});server.listen(0);await once(server,'listening');t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));store.close()});const base='http://127.0.0.1:'+server.address().port;
 const before=await fetch(base+'/api/banking').then(r=>r.json());assert.equal(before.sharedStateAvailable,undefined);assert.deepEqual(store.sharedState(),{revision:0,payload:null});
 store.saveSharedState(0,empty());const after=await fetch(base+'/api/banking').then(r=>r.json());assert.equal(after.sharedStateAvailable,true);assert.deepEqual(store.sharedState().payload,empty());assert.equal(after.accessMode,undefined);assert.equal(server.address().address,'127.0.0.1');
});

test('browser API refuses malformed central source flags instead of choosing a storage source',async()=>{
 for(const sharedStateAvailable of ['true',1,null,{},[]]){const api=createBankingApi(async()=>new Response(JSON.stringify({configured:false,connections:[],accounts:[],transactions:[],sharedStateAvailable})));await assert.rejects(api.load(),/inválida/);}
 const good={configured:false,connections:[],accounts:[],transactions:[],sharedStateAvailable:true};assert.deepEqual(await createBankingApi(async()=>new Response(JSON.stringify(good))).load(),good);
});
