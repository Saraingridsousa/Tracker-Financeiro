import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBankFile } from '../src/lib/parseBankFile.ts';
import { summarizeTransactions, classifyTransaction } from '../src/domain/finance.ts';

const csv=(amounts,header='valor')=>new File(['data;descricao;'+header+'\n'+amounts.map((a,i)=>'18/11/2026;Movimento '+i+';'+a).join('\n')],'extrato.csv');
export const ofx=(amounts,xml=false)=>new File([
 (xml?'<?xml version="1.0"?>':'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n\n')+
 '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>'+
 amounts.map((a,i)=>{
  const field=(k,v)=>'<'+k+'>'+v+(xml?'</'+k+'>':'\n');
  return '<STMTTRN>'+field('TRNTYPE',a.startsWith('-')?'DEBIT':'CREDIT')+field('DTPOSTED','20261118120000[-3:BRT]')+field('TRNAMT',a)+field('FITID',String(i))+field(i%2?'MEMO':'NAME','Movimento &amp; teste '+i)+'</STMTTRN>';
 }).join('\n')+'</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>'
],'extrato.ofx');

const expected=[1234.56,85.5,0,0.1,0.2];
for(const amounts of [['1.234,56','-85,50','0','-0,10','-0,20'],['1,234.56','-85.50','0.00','-0.10','-0.20']]) {
 test('bank CSV: signs, zero and exact dashboard totals '+amounts.join(' '),async()=>{
  const txs=await parseBankFile(csv(amounts));
  assert.deepEqual(txs.map(t=>t.amount),expected);
  assert.deepEqual(txs.map(t=>t.type),['income','expense','income','expense','expense']);
  assert.ok(txs.every(t=>t.date==='2026-11-18'&&t.categoryId==='uncategorized'));
  const summary=summarizeTransactions(txs);
  assert.equal(summary.income,1234.56);assert.equal(summary.expenses,85.8);assert.equal(summary.balance,1148.76);
 });
}
test('bank CSV: quoted international thousands and currencies',async()=>{
 assert.deepEqual((await parseBankFile(new File(['date,description,amount\n2026-11-18,Salary,"1,234.56"\n2026-11-18,Shop,-85.50'],'us.csv'))).map(t=>t.amount),[1234.56,85.5]);
 assert.deepEqual((await parseBankFile(csv(['R$ 1.234,56','1 234,56','$ 85.50']))).map(t=>t.amount),[1234.56,1234.56,85.5]);
});
test('bank CSV: ambiguous source requires configuration',async()=>{
 await assert.rejects(parseBankFile(csv(['1.234'])),/transação 1.*ambíguo/);
 assert.equal((await parseBankFile(csv(['1.234']),{amountFormat:'br'}))[0].amount,1234);
 assert.equal((await parseBankFile(csv(['1,234']),{amountFormat:'international'}))[0].amount,1234);
 await assert.rejects(parseBankFile(csv(['1,234']),{amountFormat:'br'}));
});
for(const amount of ['','abc','85.50xxx','1..234,56','Infinity','--85','12.34,56']) {
 test('bank CSV: aborts entire file on invalid '+amount,async()=>assert.rejects(parseBankFile(csv(['100,00',amount])),/transação 2/));
}
test('bank CSV: missing value or broken structure is an error',async()=>{
 await assert.rejects(parseBankFile(csv(['85.50'],'saldo')),/ausente/);
 await assert.rejects(parseBankFile(new File(['date,description,amount\n2026-11-18,Shop,85,50'],'bad.csv')),/CSV malformado/);
});
test('bank CSV: unsigned debit remains expense',async()=>assert.equal((await parseBankFile(csv(['85.50'],'debit')))[0].type,'expense'));
test('bank CSV Inter: preserves category, invoice flags, zero and source locale',async()=>{
 const txs=await parseBankFile(new File(['Data;Lançamento;Categoria;Valor\n18/11/2026;Mercado;SUPERMERCADO;85.50\n18/11/2026;Pagamento de fatura;OUTROS;1.234\n18/11/2026;Ajuste;OUTROS;0,00'],'inter-from-2026-11.csv'));
 assert.deepEqual(txs.map(t=>t.amount),[85.5,1234,0]);
 assert.equal(txs[0].category,'Supermercado');assert.equal(txs[0].paymentMethod,'CREDIT_CARD');
 assert.equal(txs[1].categoryId,'pagamento_fatura');assert.equal(txs[1].isNeutral,true);
 await assert.rejects(parseBankFile(new File(['Data;Lançamento;Valor\n18/11/2026;Compra;abc'],'inter-from-bad.csv')));
});
test('bank imports do not revive name-based own-transfer heuristics',async()=>{
 const txs=await parseBankFile(new File(['data;descricao;valor\n18/11/2026;Pix enviado para Sara;-85.50'],'pix.csv'));
 assert.equal(txs[0].isSelfTransfer,false);
 assert.equal(classifyTransaction(txs[0]).isNeutral,false);
 assert.equal(summarizeTransactions(txs).expenses,85.5);
});
for(const xml of [false,true]) test('bank OFX: real SGML/XML blocks and totals xml='+xml,async()=>{
 const txs=await parseBankFile(ofx(['1234.56','-85.50','0','-0.10','-0.20'],xml));
 assert.deepEqual(txs.map(t=>t.amount),expected);
 assert.equal(txs[1].description,'Movimento & teste 1');assert.equal(txs[1].date,'2026-11-18');assert.equal(txs[1].type,'expense');
 const summary=summarizeTransactions(txs);
 assert.equal(summary.income,1234.56);assert.equal(summary.expenses,85.8);assert.equal(summary.balance,1148.76);
});
test('bank OFX: decimal comma, zero precision and no CSV locale inference',async()=>assert.deepEqual((await parseBankFile(ofx(['85,50','1.000']),{amountFormat:'br'})).map(t=>t.amount),[85.5,1]));
for(const amount of ['1.234','1,234','1.234,56','1,234.56','','NaN','R$ 85.50']) test('bank OFX: rejects invalid '+amount,async()=>assert.rejects(parseBankFile(ofx([amount]))));
test('bank OFX: rejects truncated, invalid or unsupported files',async()=>{
 await assert.rejects(parseBankFile(new File(['<OFX><STMTTRN><TRNAMT>85.50</OFX>'],'bad.ofx')),/incompleta/);
 await assert.rejects(parseBankFile(new File(['abc'],'bad.ofx')),/OFX inválido/);
 await assert.rejects(parseBankFile(new File(['abc'],'bad.txt')),/Formato não suportado/);
 assert.deepEqual(await parseBankFile(ofx([])),[]);
});
