import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { parseExcelStatement } from '../src/utils/excelParser.ts';
import { summarizeTransactions } from '../src/domain/finance.ts';
const workbookFile=(amounts,extension='xlsx',header='Valor')=>{
 const wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Data','Descrição',header],...amounts.map((a,i)=>['18/11/2026','Movimento '+i,a])]),'Extrato');
 return new File([XLSX.write(wb,{type:'array',bookType:extension==='xls'?'biff8':'xlsx'})],'extrato.'+extension);
};
for(const ext of ['xls','xlsx']) test('Excel money: binary '+ext+' numeric cells, text and zero',async()=>{
 const txs=await parseExcelStatement(workbookFile([1234.56,-85.5,'1.234,56','-85.50','1 234,56','1.234',0],ext));
 assert.deepEqual(txs.map(t=>t.amount),[1234.56,85.5,1234.56,85.5,1234.56,1234,0]);
 assert.equal(txs[1].type,'expense');assert.equal(txs[1].date,'2026-11-18');
 const simple=await parseExcelStatement(workbookFile([1234.56,-85.5,-0.1,-0.2,0],ext));
 assert.equal(summarizeTransactions(simple).balance,1148.76);
});
for(const a of ['','abc','1..234,56','1,234','1.234,567','Infinity']) test('Excel money: rejects invalid '+a,async()=>assert.rejects(parseExcelStatement(workbookFile(['100,00',a])),/Valor monetário/));
test('Excel money: never substitutes document number for missing amount',async()=>assert.rejects(parseExcelStatement(workbookFile([8550],'xlsx','Documento')),/coluna de valor/));
