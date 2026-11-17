import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {loadConfig} from '../server/config.mjs';
import {PluggyClient,normalizeAccount,normalizeTransaction} from '../server/pluggy.mjs';
import {normalizeInvestment,syncWindow} from '../server/products.mjs';
import {accountInstitution} from '../server/institutions.mjs';
import {classifyTransaction,summarizeTransactions} from '../src/domain/finance.ts';
import {createAppServer} from '../server/app.mjs';
import {createBankingApi} from '../src/lib/bankingApi.ts';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {Store} from '../server/store.mjs';
const ITEM='11111111-1111-4111-8111-111111111111',now='2026-11-17T12:00:00Z';
const scratch=()=>mkdtempSync(join(tmpdir(),'tracker-products-test-'));
function cleanup(dir){assert.ok(resolve(dir).toLowerCase().startsWith((resolve(tmpdir())+sep).toLowerCase()));rmSync(dir,{recursive:true,force:true})}
const bank={id:'bank',itemId:ITEM,name:'Conta corrente',type:'BANK',balance:100,currencyCode:'BRL',bankData:{transferNumber:'077/0001/123-4'},taxNumber:'11122233396'};
const card={...bank,id:'card',type:'CREDIT',subtype:'CREDIT_CARD',name:'Inter Mastercard',bankData:null,creditData:{creditLimit:1000,availableCreditLimit:700,balanceDueDate:'2026-11-25'}};
const tx=(extra={})=>({id:'tx',date:'2026-11-15',description:'Compra sintética',amount:-10,type:'DEBIT',currencyCode:'BRL',status:'POSTED',...extra});
const bill=(extra={})=>({id:'bill',dueDate:'2026-11-25',totalAmount:300,totalAmountCurrencyCode:'BRL',minimumPaymentAmount:null,payments:[],financeCharges:[],...extra});
const investment=(extra={})=>({id:'inv',itemId:ITEM,name:'CDB sintético',type:'FIXED_INCOME',balance:500,amount:510,currencyCode:'BRL',date:'2026-11-16',status:'ACTIVE',...extra});
const json=(p,status=200)=>new Response(JSON.stringify(p),{status});
function client({optionalFail=false,emptyProducts=false}={}){
 const calls=[];
 const api=new PluggyClient({clientId:'synthetic-client',clientSecret:'synthetic-secret',now:()=>Date.parse(now),fetchImpl:async(url,options)=>{
  const u=new URL(url);calls.push({path:u.pathname,params:Object.fromEntries(u.searchParams),method:options.method});if(u.pathname==='/auth')return json({apiKey:'synthetic-key'});assert.equal(options.method,'GET');
  if(u.pathname.startsWith('/items/'))return json({status:'UPDATED',executionStatus:'SUCCESS',lastUpdatedAt:now,connector:{id:200,name:'MeuPluggy',isSandbox:false,products:['ACCOUNTS','INVESTMENTS']}});
  if(u.pathname==='/accounts')return json({results:[bank,card],totalPages:1});if(u.pathname==='/v2/transactions')return json({results:[tx({id:u.searchParams.get('accountId')})],next:null});
  if(['/bills','/investments'].includes(u.pathname)){if(optionalFail)return json({error:'SYNTHETIC_SECRET'},403);if(emptyProducts)return json({results:[],totalPages:1});const page=u.searchParams.get('page');return json({results:u.pathname==='/bills'?[bill({id:page==='2'?'bill2':'bill'})]:[investment({id:page==='2'?'inv2':'inv'})],totalPages:2})}throw Error('unexpected route');
 }});return{calls,api};
}

test('private mapping validates contents without leaking them',()=>{const dir=scratch();try{const data=join(dir,'data');mkdirSync(data);const file=join(data,'connections.json');writeFileSync(file,JSON.stringify([{itemId:ITEM,label:'Inter'}]));assert.deepEqual(loadConfig({cwd:dir,env:{TRACKER_DATA_DIR:data}}).connections,[{itemId:ITEM,label:'Inter'}]);for(const value of [[{itemId:ITEM,label:'Inter'},{itemId:ITEM.toUpperCase(),label:'Duplicate'}],[{itemId:'bad',label:'SYNTHETIC_SECRET'}],{secret:'SYNTHETIC_SECRET'}]){writeFileSync(file,JSON.stringify(value));let error;try{loadConfig({cwd:dir,env:{TRACKER_DATA_DIR:data}})}catch(e){error=e}assert.ok(error);assert.doesNotMatch(error.message,/SYNTHETIC_SECRET/)}}finally{cleanup(dir)}});

test('institution comes from account data rather than connector200',async()=>{const batch=await client().api.readItem(ITEM,{label:'Inter'});assert.equal(batch.accounts[0].institution.name,'Inter');assert.equal(batch.accounts[0].institution.code,'077');assert.equal(batch.accounts[0].institution.source,'bankData.transferNumber');assert.equal(batch.transactions[0].bankName,'Inter');assert.equal(batch.identification.state,'confirmed');assert.equal(normalizeAccount({...bank,name:'Conta corrente',bankData:{transferNumber:'1234/123-4'}},ITEM).institution.state,'unverified')});

test('optional products read every page and do not become transactions',async()=>{const{api,calls}=client();const b=await api.readItem(ITEM,{label:'Inter'});assert.equal(b.bills.length,2);assert.equal(b.investments.length,2);assert.equal(b.transactions.length,2);assert.equal(b.bills[0].totalAmountCents,30000);assert.equal(b.investments[0].balanceCents,50000);assert.equal(b.productStates.bills.state,'available');assert.equal(b.productStates.investments.state,'available');assert.equal(calls.filter(c=>c.path==='/bills').length,2);assert.equal(calls.filter(c=>c.path==='/investments').length,2)});

test('products listed in item are not proof of availability or data',async()=>{for(const[options,state]of [[{optionalFail:true},'unavailable'],[{emptyProducts:true},'empty']]){const b=await client(options).api.readItem(ITEM,{label:'Inter'});assert.equal(b.accounts.length,2);assert.equal(b.transactions.length,2);assert.equal(b.productStates.investments.state,state);assert.equal(b.productStates.bills.state,state);assert.deepEqual(b.investments,[])}});

test('documented date overlap is read without item refresh or enumeration',async()=>{const{api,calls}=client();await api.readItem(ITEM,{label:'Inter',dateFrom:'2026-10-15'});assert.ok(calls.filter(c=>c.path==='/v2/transactions').every(c=>c.params.dateFrom==='2026-10-15'));assert.ok(!calls.some(c=>c.path==='/v2/items'||c.path.includes('/refresh')))});

test('own transfer needs full matching owner evidence; never Pix text alone',()=>{const same={payer:{documentNumber:{type:'CPF',value:'11122233396'}},receiver:{documentNumber:{type:'CPF',value:'11122233396'}},paymentMethod:'PIX'};assert.equal(normalizeTransaction(tx({paymentData:same}),bank).isSelfTransfer,true);for(const data of [{...same,receiver:{documentNumber:{type:'CPF',value:'55566677788'}}},{...same,payer:{documentNumber:{type:'CPF',value:'***222333**'}}},{}])assert.notEqual(normalizeTransaction(tx({description:'PIX enviado',paymentData:data}),bank).isSelfTransfer,true);assert.doesNotMatch(JSON.stringify(normalizeTransaction(tx({paymentData:same}),bank)),/11122233396/)});

test('isolated SQLite keeps products and manual notes across replay, empty and failed reads',async()=>{const dir=scratch();let store;try{store=new Store(join(dir,'synthetic-test.sqlite'));store.registerConnection({itemId:ITEM,label:'Inter'});const b=await client().api.readItem(ITEM,{label:'Inter'});store.applySync(ITEM,b,now);const id=b.transactions[0].id;store.patchTransaction(id,{categoryId:'custom',description:'Minha descrição',notes:'Minha anotação',isSelfTransfer:true});store.applySync(ITEM,b,'2026-11-18T12:00:00Z');let s=store.snapshot(true);assert.equal(s.transactions.length,2);assert.equal(s.products.bills.length,2);assert.equal(s.products.investments.length,2);assert.equal(s.transactions.find(t=>t.id===id).notes,'Minha anotação');assert.equal(s.transactions.find(t=>t.id===id).categoryId,'custom');assert.equal(s.transactions.find(t=>t.id===id).isSelfTransfer,true);store.applySync(ITEM,{...b,bills:[],investments:[],productStates:{bills:{state:'empty'},investments:{state:'error'}}},'2026-11-19T12:00:00Z');s=store.snapshot(true);assert.equal(s.products.bills.length,2);assert.equal(s.products.investments.length,2);const success=s.connections[0].lastSuccessfulSyncAt;store.recordSyncError(ITEM,'Falha compreensível');assert.equal(store.snapshot(true).connections[0].lastSuccessfulSyncAt,success);assert.equal(store.backup().schemaVersion,3)}finally{store?.close();cleanup(dir)}});


test('explicit false outranks inferred transfer category and its neutral flag',()=>{
 const t={id:'t',date:'2026-11-01',description:'Pix compra',amount:10,type:'expense',source:'pluggy',categoryId:'transferencia',isSelfTransfer:false,manualSelfTransfer:true,createdAt:now};
 const categories=[{id:'transferencia',isNeutral:true,excludeFromTotals:true}];
 assert.equal(classifyTransaction(t,categories).isSelfTransfer,false);
 assert.equal(summarizeTransactions([t],categories).expenses,10);
 assert.equal(summarizeTransactions([{...t,isCreditCardPayment:true}],categories).expenses,0);
 assert.equal(classifyTransaction({...t,manualSelfTransfer:undefined},categories).isSelfTransfer,true);
});

test('item UUID case is immaterial, while provider IDs retain their case',()=>{
 const lower='abcdefab-abcd-4abc-8abc-abcdefabcdef',upper=lower.toUpperCase();
 assert.equal(normalizeAccount({...bank,itemId:lower,id:'OpaqueA'},upper).itemId,upper);
 assert.equal(normalizeInvestment(investment({itemId:lower,id:'OpaqueI'}),upper).itemId,upper);
 assert.equal(normalizeAccount({...bank,itemId:lower,id:'OpaqueA'},upper).id,'OpaqueA');
 assert.throws(()=>normalizeAccount({...bank,itemId:lower},ITEM));
});

test('institution needs complete routing or recognized account words',()=>{
 for(const transferNumber of ['077///','077//x','077/x/','077/x/y/z'])assert.equal(accountInstitution({name:'Genérica',bankData:{transferNumber}}).state,'unverified');
 for(const name of ['Cartão Inter','Conta Inter','Banco Inter S.A.'])assert.equal(accountInstitution({name}).family,'inter');
 assert.equal(accountInstitution({name:'Internet conta'}).state,'unverified');
});

test('invalid full documents never neutralize transactions automatically',()=>{
 const paymentData={payer:{documentNumber:{type:'CPF',value:'12345678901'}},receiver:{documentNumber:{type:'CPF',value:'12345678901'}}};
 assert.equal(normalizeTransaction(tx({paymentData}),{...bank,taxNumber:'12345678901'}).isSelfTransfer,false);
});

test('incremental overlap and full reread account for old corrections',()=>{
 assert.deepEqual(syncWindow({},new Date(now)),{mode:'full'});
 assert.deepEqual(syncWindow({lastSuccessfulSyncAt:now,lastFullSyncAt:now},new Date('2026-11-18T12:00:00Z')),{mode:'incremental',dateFrom:'2026-10-18'});
 assert.deepEqual(syncWindow({lastSuccessfulSyncAt:now,lastFullSyncAt:now},new Date('2026-11-24T12:00:00Z')),{mode:'full'});
});

test('optional failure on a later page discards partial batch and keeps previous stored products',async()=>{
 const dir=scratch();let store;try {
 store=new Store(join(dir,'synthetic-test.sqlite'));store.registerConnection({itemId:ITEM,label:'Inter'});
 const initial=await client().api.readItem(ITEM,{label:'Inter'});store.applySync(ITEM,initial,now);
 const {api}=client();const request=api.request.bind(api);api.request=async path=>{if(path.startsWith('/investments?')&&path.includes('page=2&'))throw Error('SYNTHETIC_SECRET');return request(path)};
 const partial=await api.readItem(ITEM,{label:'Inter'});assert.equal(partial.investments.length,0);assert.equal(partial.productStates.investments.state,'error');
 assert.doesNotMatch(JSON.stringify(partial.productStates),/SYNTHETIC_SECRET/);store.applySync(ITEM,partial,'2026-11-18T12:00:00Z');assert.equal(store.snapshot(true).products.investments.length,2);
 const before=JSON.stringify(store.snapshot(true));assert.throws(()=>store.applySync(ITEM,{...initial,bills:[{...initial.bills[0],itemId:'other'}]},now));assert.equal(JSON.stringify(store.snapshot(true)),before);
 assert.throws(()=>store.applySync(ITEM,{...initial,bills:[initial.bills[0],{...initial.bills[0],totalAmountCents:1}]},now));assert.equal(JSON.stringify(store.snapshot(true)),before);
 }finally{store?.close();cleanup(dir)}
});

test('manual notes and false transfer flag survive ID reconciliation and replay',async()=>{
 const dir=scratch();let store;try{store=new Store(join(dir,'synthetic-test.sqlite'));store.registerConnection({itemId:ITEM,label:'Inter'});const b=await client().api.readItem(ITEM,{label:'Inter'});b.transactions=b.transactions.slice(0,1).map(t=>({...t,providerId:'stable',isSelfTransfer:true}));store.applySync(ITEM,b,now);store.patchTransaction(b.transactions[0].id,{notes:'Preservar',isSelfTransfer:false});
 const changed={...b,transactions:b.transactions.map(t=>({...t,id:'bank:new',providerTransactionId:'new'}))};store.applySync(ITEM,changed,now);store.applySync(ITEM,b,now);const rows=store.snapshot(true).transactions;assert.equal(rows.length,1);assert.equal(rows[0].notes,'Preservar');assert.equal(rows[0].isSelfTransfer,false);assert.equal(rows[0].manualSelfTransfer,true);
 }finally{store?.close();cleanup(dir)}});

test('private registration is idempotent, edit labels, and rolls back invalid batches',()=>{
 const dir=scratch();let store;try{store=new Store(join(dir,'synthetic-test.sqlite'));store.configureConnections([{itemId:ITEM,label:'Inter'}]);store.configureConnections([{itemId:ITEM.toUpperCase(),label:'Novo apelido'}]);assert.equal(store.connections().length,1);assert.equal(store.connections()[0].label,'Novo apelido');assert.throws(()=>store.configureConnections([{itemId:ITEM,label:'Alteração'},{itemId:'invalid',label:'Outro'}]));assert.equal(store.connections()[0].label,'Novo apelido');}finally{store?.close();cleanup(dir)}
});

test('v3 to v4 migration preserves central document and banking overrides',()=>{
 const dir=scratch();let store,db;try{const file=join(dir,'synthetic-test.sqlite');store=new Store(file);store.registerConnection({itemId:ITEM,label:'Inter'});store.applySync(ITEM,{accounts:[normalizeAccount(bank,ITEM)],transactions:[normalizeTransaction(tx(),bank)],status:'UPDATED'},now);store.patchTransaction('bank:tx',{description:'Manual',categoryId:'custom'});
 const document={exportedAt:now,transactions:[],categories:[],rules:[],assets:[],investmentOrders:[]};store.saveSharedState(0,document);const shared=store.sharedState();store.close();store=null;db=new DatabaseSync(file);db.exec('DROP TABLE bank_products; DROP TABLE connection_sync; DROP TABLE transaction_annotations; PRAGMA user_version=3');db.close();db=null;store=new Store(file);assert.equal(store.schemaVersion,4);assert.deepEqual(store.sharedState(),shared);assert.equal(store.snapshot(true).transactions[0].description,'Manual');assert.equal(store.snapshot(true).transactions[0].categoryId,'custom');
 }finally{db?.close();store?.close();cleanup(dir)}});


test('partial bills availability remains visible per account',async()=>{
 const {api}=client();const request=api.request.bind(api);api.request=async path=>{if(path.startsWith('/accounts?'))return{results:[bank,card,{...card,id:'card2',name:'Segundo cartão'}],totalPages:1};if(path.startsWith('/bills?accountId=card2&')){const e=Error('unavailable');e.status=403;throw e}return request(path)};
 const b=await api.readItem(ITEM,{label:'Inter'});assert.equal(b.productStates.bills.state,'available');assert.equal(b.productStates.bills.accounts.find(a=>a.accountId==='card2').state,'unavailable');assert.equal(b.bills.length,2);
});

test('invalid product/connection metadata is rejected before frontend replacement',async()=>{
 const dir=scratch();let store;try{store=new Store(join(dir,'synthetic-test.sqlite'));store.registerConnection({itemId:ITEM,label:'Inter'});store.applySync(ITEM,await client().api.readItem(ITEM,{label:'Inter'}),now);const original=store.snapshot(true);
 const load=value=>createBankingApi(async()=>json(value)).load();assert.equal((await load(original)).products.bills.length,2);
 for(const mutate of [s=>s.connections[0].productStates.bills.state='unexpected',s=>s.connections[0].productStates.bills.accounts[0].accountId='unknown',s=>s.connections[0].identification.institutions=[{}],s=>s.accounts[0].institution.name={},s=>s.transactions[0].manualSelfTransfer='yes',s=>s.products.investments[0].status={},s=>s.products.bills[0].observedAt='invalid']){const bad=structuredClone(original);mutate(bad);await assert.rejects(load(bad),/inválida/)}
 }finally{store?.close();cleanup(dir)}
});

test('HTTP selects incremental window and accepts explicit full reread',async()=>{
 const dir=scratch();let store,server;try{store=new Store(join(dir,'synthetic-test.sqlite'));store.registerConnection({itemId:ITEM,label:'Inter'});const initial=await client().api.readItem(ITEM,{label:'Inter'});store.applySync(ITEM,initial,now);const options=[];const pluggy={configured:true,readItem:async(id,o)=>{options.push(o);return{...initial,syncMode:o.full?'full':'incremental'}}};server=createAppServer({store,pluggy,now:()=>new Date('2026-11-18T12:00:00Z')});server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;const session=await(await fetch(base+'/api/session')).json();const send=body=>fetch(base+'/api/connections/'+ITEM+'/sync',{method:'POST',headers:{'Content-Type':'application/json','X-Tracker-CSRF':session.csrfToken},body:JSON.stringify(body)});
 assert.equal((await send({})).status,200);assert.equal(options[0].dateFrom,'2026-10-18');assert.equal(options[0].full,false);assert.equal((await send({full:true})).status,200);assert.equal(options[1].dateFrom,undefined);assert.equal(options[1].full,true);assert.equal((await send({full:'yes'})).status,400);
 }finally{if(server?.listening){server.closeAllConnections();await new Promise(r=>server.close(r))}store?.close();cleanup(dir)}
});
