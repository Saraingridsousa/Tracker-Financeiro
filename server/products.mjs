import {toCents} from './money.mjs';
const id=v=>typeof v==='string'&&v.length>0&&v.length<=200&&!/[\u0000-\u001f]/.test(v);
const currency=v=>typeof v==='string'&&/^[A-Z]{3}$/.test(v);
function date(v){if(v==null)return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v)||!Number.isFinite(Date.parse(v)))throw Error('Data de produto inválida.');const d=new Date(v.slice(0,10)+'T00:00:00Z');if(d.toISOString().slice(0,10)!==v.slice(0,10))throw Error('Data de produto inválida.');return v.slice(0,10)}
const amount=v=>v==null?null:toCents(v);
export function normalizeBill(raw,account){
 if(!id(raw?.id)||(raw.accountId!==undefined&&raw.accountId!==account.id)||!currency(raw.totalAmountCurrencyCode))throw Error('Fatura inválida.');const dueDate=date(raw.dueDate);if(!dueDate)throw Error('Vencimento de fatura inválido.');
 const payments=raw.payments??[],charges=raw.financeCharges??[];if(!Array.isArray(payments)||!Array.isArray(charges))throw Error('Detalhes de fatura inválidos.');
 return {id:encodeURIComponent(account.id)+':'+encodeURIComponent(raw.id),providerId:raw.id,itemId:account.itemId,accountId:account.id,dueDate,closingDate:date(raw.billClosingDate),totalAmountCents:toCents(raw.totalAmount),currencyCode:raw.totalAmountCurrencyCode,minimumPaymentCents:amount(raw.minimumPaymentAmount),payments:payments.map(p=>{if(!currency(p.currencyCode))throw Error('Moeda de pagamento inválida.');return{date:date(p.paymentDate),amountCents:toCents(p.amount),currencyCode:p.currencyCode,valueType:typeof p.valueType==='string'?p.valueType:null}}),financeCharges:charges.map(c=>{if(!currency(c.currencyCode))throw Error('Moeda de encargo inválida.');return{type:typeof c.type==='string'?c.type:null,amountCents:toCents(c.amount),currencyCode:c.currencyCode}})};
}
export function normalizeInvestment(raw,itemId){
 if(!id(raw?.id)||(raw.itemId!==undefined&&(typeof raw.itemId!=='string'||raw.itemId.toLowerCase()!==itemId.toLowerCase()))||typeof raw.name!=='string'||!raw.name.trim()||typeof raw.type!=='string'||!currency(raw.currencyCode))throw Error('Investimento inválido.');
 if(raw.quantity!=null&&(typeof raw.quantity!=='number'||!Number.isFinite(raw.quantity)))throw Error('Quantidade inválida.');
 return {id:encodeURIComponent(itemId)+':'+encodeURIComponent(raw.id),providerId:raw.id,itemId,name:raw.name,type:raw.type,subtype:typeof raw.subtype==='string'?raw.subtype:null,currencyCode:raw.currencyCode,balanceCents:toCents(raw.balance),grossAmountCents:amount(raw.amount),originalAmountCents:amount(raw.amountOriginal),profitCents:amount(raw.amountProfit),quantity:raw.quantity??null,referenceDate:date(raw.date),dueDate:date(raw.dueDate),status:typeof raw.status==='string'?raw.status:'UNKNOWN',code:typeof raw.code==='string'?raw.code:null};
}
export function syncWindow(connection,now=new Date()){
 const last=Date.parse(connection.lastSuccessfulSyncAt??connection.lastFetchedAt??''),full=Date.parse(connection.lastFullSyncAt??'');
 if(!Number.isFinite(last)||!Number.isFinite(full)||now.getTime()-full>=7*86400000||last>now.getTime())return {mode:'full'};
 return {mode:'incremental',dateFrom:new Date(last-30*86400000).toISOString().slice(0,10)};
}
