import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseLegacyBackup} from '../shared/legacyBackup.mjs';
import {FinanceState} from '../shared/financeState.mjs';
import {Store} from '../server/store.mjs';
const fixture=()=>({transactions:[],categories:[],rules:[],assets:[{id:'synthetic-asset',tickerOrName:'Ativo sintético',ticker:'SYNTH11',type:'Outros',quantity:2,avgPrice:11,currentPrice:12}],investmentOrders:[{id:'synthetic-order',assetId:'synthetic-asset',ticker:'SYNTH11',type:'Outros',operation:'BUY',date:'2026-11-01',quantity:2,unitPrice:11,totalValue:22,officialTotal:22.10}],exportedAt:'2026-11-16T12:00:00Z'});

test('legacy wallet preserves known optional ticker and official total without changing financial fields',()=>{
 const original=fixture();const parsed=parseLegacyBackup(JSON.stringify(original));assert.deepEqual(parsed,original);
 assert.equal(parsed.assets[0].tickerOrName,'Ativo sintético');assert.equal(parsed.investmentOrders[0].totalValue,22);assert.equal(parsed.investmentOrders[0].officialTotal,22.10);
 for(const value of [42,null,{},[]]){const bad=fixture();bad.assets[0].ticker=value;assert.throws(()=>parseLegacyBackup(JSON.stringify(bad)),/inválido/);}
 for(const value of ['22.10',null,-1,Infinity,Number.MAX_SAFE_INTEGER]){const bad=fixture();bad.investmentOrders[0].officialTotal=value;assert.throws(()=>parseLegacyBackup(JSON.stringify(bad)),/inválido/);}
 for(const field of ['assets','investmentOrders']){const bad=fixture();bad[field][0].unknownExtension=true;assert.throws(()=>parseLegacyBackup(JSON.stringify(bad)),/inválido/);}
});

test('legacy wallet metadata survives explicit client restore and SQLite reopening unchanged',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tracker-wallet-compat-'));let store;
 try {
  const file=join(dir,'shared.sqlite');store=new Store(file);const model=new FinanceState({load:async()=>store.sharedState(),save:async(revision,payload)=>store.saveSharedState(revision,payload)});await model.load();assert.equal(model.state.payload,null);
  const original=fixture();model.restore(JSON.stringify(original));await new Promise(r=>setImmediate(r));assert.equal(model.state.error,'');assert.equal(model.state.revision,1);
  assert.deepEqual(model.state.payload.assets,original.assets);assert.deepEqual(model.state.payload.investmentOrders,original.investmentOrders);store.close();store=new Store(file);
  const restored=parseLegacyBackup(JSON.stringify(store.sharedState().payload));assert.deepEqual(restored.assets,original.assets);assert.deepEqual(restored.investmentOrders,original.investmentOrders);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
