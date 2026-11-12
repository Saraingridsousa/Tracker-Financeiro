import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.mjs';
import { normalizeAccount, normalizeTransaction } from '../server/pluggy.mjs';
import { filterTransactionsByPeriod } from '../src/domain/period.ts';
import { summarizeTransactions } from '../src/domain/finance.ts';
import { createBankingApi } from '../src/lib/bankingApi.ts';
const itemId='11111111-1111-4111-8111-111111111111';
const account={id:'review-account',name:'Sintetica',type:'CREDIT',currencyCode:'BRL',balance:100};
const raw=(extra={})=>({id:'tx',providerId:'stable',description:'Compra',date:'2026-11-01',amount:10,currencyCode:'BRL',status:'POSTED',...extra});
const batch=rows=>({accounts:[normalizeAccount(account,itemId)],transactions:rows.map(t=>normalizeTransaction(t,account)),status:'UPDATED'});
const empty={configured:false,connections:[],accounts:[],transactions:[]};
const response=body=>new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
test('review: rolling windows contain exactly 2, 3, 6 or 12 calendar months',()=>{
 const rows=Array.from({length:14},(_,i)=>{const d=new Date(2026,10-i,1);return {...raw(),id:String(i),date:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01'};});
 const opts={source:'banking',now:()=>new Date(2026,10,12)};
 for(const [period,count] of [['month',1],['last2months',2],['quarter',3],['semester',6],['year',12]]) assert.deepEqual(filterTransactionsByPeriod(rows,period,opts).map(r=>r.id),rows.slice(0,count).map(r=>r.id),period);
 assert.deepEqual(filterTransactionsByPeriod([], 'month',opts),[]);
 assert.deepEqual(filterTransactionsByPeriod([{...rows[0],date:'2026-02-30'}],'year',opts),[]);
 const historical={source:'legacy',now:()=>new Date(2028,0,1)};
 assert.deepEqual(filterTransactionsByPeriod(rows,'year',historical).map(r=>r.id),filterTransactionsByPeriod([...rows].reverse(),'year',historical).map(r=>r.id).reverse());
});
test('review: successful HTTP with malformed records or non-JSON is rejected',async()=>{
 for(const body of [{...empty,connections:[null]},{...empty,accounts:[{currencyCode:'INVALID',balanceCents:'bad'}]},{...empty,transactions:[null]}]) await assert.rejects(createBankingApi(async()=>response(body)).load(),/inválida/i);
 for(const body of [null,{ok:true},'<html>fallback</html>']) {
  const api=createBankingApi(async p=>p==='/api/session'?response({csrfToken:'test-session'}):typeof body==='string'?new Response(body):response(body));
  await assert.rejects(api.mutate('POST','/api/connections',{}),/inválid/i);
 }
 const store=new Store();try{store.registerConnection({itemId,label:'QA'});store.applySync(itemId,batch([raw()]),'2026-11-12T12:00:00Z');const snapshot=store.snapshot(true);assert.deepEqual(await createBankingApi(async()=>response(snapshot)).load(),snapshot);}finally{store.close();}
});
