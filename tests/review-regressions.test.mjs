import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.mjs';
import { normalizeAccount, normalizeTransaction } from '../server/pluggy.mjs';
import { summarizeTransactions } from '../src/domain/finance.ts';
const itemId='11111111-1111-4111-8111-111111111111';
const account={id:'review-account',name:'Sintetica',type:'CREDIT',currencyCode:'BRL',balance:100};
const raw=(extra={})=>({id:'tx',providerId:'stable',description:'Compra',date:'2026-11-01',amount:10,currencyCode:'BRL',status:'POSTED',...extra});
const batch=rows=>({accounts:[normalizeAccount(account,itemId)],transactions:rows.map(t=>normalizeTransaction(t,account)),status:'UPDATED'});
test('review: conflicting copies reject the whole batch regardless of order or changed field',()=>{
 for(const extra of [{amount:999},{date:'2026-11-02'},{status:'PENDING'},{currencyCode:'USD'},{description:'Different'},{amount:-10}]) for(const reverse of [false,true]) {
  const store=new Store(); try {
   store.registerConnection({itemId,label:'QA'});store.applySync(itemId,batch([raw({id:'old'})]),'before');
   store.patchTransaction('review-account:old',{description:'Manual'});const { exportedAt: beforeExportedAt, ...before }=store.backup();
   const rows=[raw(),raw(extra)];if(reverse)rows.reverse();
   assert.throws(()=>store.applySync(itemId,batch(rows),'after'),/conflit|identidade/i,JSON.stringify(extra));
   const { exportedAt, ...after }=store.backup();assert.ok(Number.isFinite(Date.parse(exportedAt)));assert.ok(Number.isFinite(Date.parse(beforeExportedAt)));assert.deepEqual(after,before);
  } finally {store.close();}
 }
});
test('review: provider dates must exist and preserve their supplied calendar day',()=>{
 for(const date of ['2026-02-30','2026-02-29','2026-04-31T12:00:00Z','2026-13-01']) assert.throws(()=>normalizeTransaction(raw({date}),account),/dados/i,date);
 for(const date of ['2024-02-29','2026-11-01T00:30:00Z']) assert.equal(normalizeTransaction(raw({date}),account).date,date.slice(0,10));
});
test('review: account-currency amount retains original signed money and provenance through SQLite export',()=>{
 const store=new Store();try{
  store.registerConnection({itemId,label:'QA'});
  store.applySync(itemId,batch([raw({amount:-3,currencyCode:'USD',amountInAccountCurrency:-15.12})]),'fetched');
  for(const row of [store.snapshot(true).transactions[0],store.backup().transactions[0]]) {
   assert.equal(row.amountCents,1512);assert.equal(row.type,'income');assert.equal(row.currencyCode,'BRL');
   assert.equal(row.originalAmountCents,-300);assert.equal(row.originalCurrencyCode,'USD');
   assert.equal(row.amountSource,'provider.amountInAccountCurrency');
  }
 }finally{store.close();}
});
test('review: converted money cannot hide invalid original amounts',()=>{
 for(const amount of [undefined,null,'3',NaN,Infinity,1e100]) assert.throws(()=>normalizeTransaction(raw({amount,currencyCode:'USD',amountInAccountCurrency:15}),account),/valor/i);
});
test('review: auxiliary BRL totals exclude pending and foreign neutral/investment records',()=>{
 const base={id:'t',date:'2026-11-01',description:'Investimento',amount:20,type:'expense',categoryId:'investimentos',source:'pluggy'};
 const summary=summarizeTransactions([{...base,currencyCode:'USD'},{...base,currencyCode:'BRL',providerStatus:'PENDING'},{...base,currencyCode:'BRL',providerStatus:'POSTED'}]);
 assert.equal(summary.totalInvested,20);assert.equal(summary.neutralTotal,20);
});

test('review: provider payload cannot silently reassign account or item ownership', () => {
  assert.throws(() => normalizeAccount({ ...account, itemId: 'different-item' }, itemId), /dados/i);
  assert.throws(() => normalizeTransaction(raw({ accountId: 'different-account' }), account), /dados/i);
  assert.equal(normalizeAccount({ ...account, itemId }, itemId).itemId, itemId);
  assert.equal(normalizeTransaction(raw({ accountId: account.id }), account).accountId, account.id);
});
