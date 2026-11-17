// COMPE/families checked against the BCB STR participant list; never connector200.
const registry={
 '077':{name:'Inter',family:'inter'},'323':{name:'Mercado Pago',family:'mercadopago'},
 '380':{name:'PicPay',family:'picpay'},'079':{name:'PicPay Bank',family:'picpay'},
 '469':{name:'PicPay Invest',family:'picpay'},'637':{name:'Sofisa',family:'sofisa'},
};
const normalized=s=>typeof s==='string'?s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' '):'';
function family(name){const s=normalized(name);return /\bmercado\s*pago\b/.test(s)?'mercadopago':/\bpicpay\b/.test(s)?'picpay':/\bsofisa\b/.test(s)?'sofisa':/\binter\b/.test(s)?'inter':null;}
export function accountInstitution(account){
 const parts=typeof account.bankData?.transferNumber==='string'?account.bankData.transferNumber.split('/'):[];
 const code=parts.length===3&&parts.every(p=>p.trim())&&/^\d{3}$/.test(parts[0].trim())?parts[0].trim():null;
 if(code)return {code,...(registry[code]??{name:'Instituição COMPE '+code,family:null}),source:'bankData.transferNumber',state:registry[code]?'identified':'reported'};
 const nameFamily=family(account.name)||family(account.marketingName);const entry=Object.values(registry).find(v=>v.family===nameFamily);
 return entry?{code:null,name:entry.name,family:nameFamily,source:'account.name',state:'identified'}:{code:null,name:null,family:null,source:'unavailable',state:'unverified'};
}
export function itemIdentification(accounts,label){
 const expected=family(label);const found=[...new Set(accounts.map(a=>a.institution?.family).filter(Boolean))];
 const state=expected&&found.some(f=>f!==expected)?'mismatch':accounts.length&&accounts.every(a=>a.institution?.family===expected)&&expected?'confirmed':found.length?'partial':'unverified';
 return {state,institutions:[...new Set(accounts.map(a=>a.institution?.name).filter(Boolean))],codes:[...new Set(accounts.map(a=>a.institution?.code).filter(Boolean))]};
}
function validDocument(digits){
 if(/^(\d)\1+$/.test(digits))return false;
 const check=(base,weights)=>{const rem=[...base].reduce((sum,n,i)=>sum+Number(n)*weights[i],0)%11;return rem<2?0:11-rem};
 if(digits.length===11)return [9,10].every(n=>check(digits.slice(0,n),Array.from({length:n},(_,i)=>n+1-i))===Number(digits[n]));
 if(digits.length===14)return [12,13].every(n=>check(digits.slice(0,n),n===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2])===Number(digits[n]));
 return false;
}
function document(value){const raw=typeof value==='string'?value:value?.value;if(typeof raw!=='string'||!/^[\d.\-/\s]+$/.test(raw))return null;const digits=raw.replace(/\D/g,'');if(!validDocument(digits))return null;const type=digits.length===11?'CPF':'CNPJ';if(typeof value==='object'&&value.type&&value.type!==type)return null;return type+':'+digits;}
export function ownTransferEvidence(transaction,account){const owner=document(account.taxNumber),payer=document(transaction.paymentData?.payer?.documentNumber),receiver=document(transaction.paymentData?.receiver?.documentNumber);return Boolean(owner&&payer===owner&&receiver===owner);}
