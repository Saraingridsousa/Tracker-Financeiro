import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { parseExcelStatement } from '../src/utils/excelParser.ts';
import { parseBankFile } from '../src/lib/parseBankFile.ts';
import { summarizeTransactions } from '../src/domain/finance.ts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as XLSX from 'xlsx';

function pdfFile(lines) {
 const stream='BT /F1 12 Tf 20 TL 50 780 Td '+lines.map((line,i)=>(i?'T* ':'')+'('+line+') Tj').join('\n')+' ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'];
 let pdf='%PDF-1.4\n';const offsets=[];
 objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+obj+'\nendobj\n';});
 const xref=pdf.length;
 pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
 pdf+='trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
 return new File([pdf],'synthetic.pdf');
}
test('PDF money: real PDF.js extraction, bank layouts and currency rendering',async(t)=>{
 const oldWorker=Object.getOwnPropertyDescriptor(globalThis,'pdfjsWorker');
 globalThis.pdfjsWorker=await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
 const vite=await createServer({
  configFile:false,optimizeDeps:{noDiscovery:true,include:[]},
  resolve:{alias:[{find:/^pdfjs-dist$/,replacement:'pdfjs-dist/legacy/build/pdf.mjs'}]},
  server:{middlewareMode:true,hmr:false,ws:false,watch:{ignored:['**/*']}},
 });
 try {
  const {parsePDFStatement}=await vite.ssrLoadModule('/src/utils/pdfParser.ts');
  for(const [name,lines,expected] of [
   ['generic',['18/11/2026 Salario 1234,56','18/11/2026 Compra -85.50','18/11/2026 Ajuste 0,00'],[[1234.56,'income'],[85.5,'expense'],[0,'income']]],
   ['Caixa',['18/11/2026 123 Salario 1.234,56 C','18/11/2026 124 Compra 85,50 D'],[[1234.56,'income'],[85.5,'expense']]],
   ['Inter',['18 de novembro de 2026','PIX RECEBIDO R$ 1.234,56','PIX ENVIADO -R$ 85.50','RESGATE R$ 1 234,56'],[[1234.56,'income'],[85.5,'expense'],[1234.56,'income']]],
  ]) await t.test(name,async()=>{
   const txs=await parsePDFStatement(pdfFile(lines));
   assert.deepEqual(txs.map(tx=>[tx.amount,tx.type]),expected);
   if(name==='generic') assert.equal(summarizeTransactions(txs).balance,1149.06);
  });
  for(const amount of ['1..234,56','12.34,56','1.234,567','85.50abc','abc','abc85.50','--85.50']) await t.test('rejects complete malformed PDF token '+amount,async()=>{
   await assert.rejects(parsePDFStatement(pdfFile(['18/11/2026 Compra R$ '+amount])),/Valor monetário/);
  });
  await t.test('transaction table renders imported CSV, Excel and PDF correctly',async()=>{
   const {TransactionTable}=await vite.ssrLoadModule('/src/components/TransactionTable.tsx');
   const csv=await parseBankFile(new File(['data;descricao;valor\n18/11/2026;Compra teste;-85.50'],'synthetic.csv'));
   const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Data','Descrição','Valor'],['18/11/2026','Compra teste',-85.5]]),'Extrato');
   const excel=await parseExcelStatement(new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'synthetic.xlsx'));
   const pdf=await parsePDFStatement(pdfFile(['18/11/2026 Compra teste -85.50']));
   for(const transactions of [csv,excel,pdf]) {
    const html=renderToStaticMarkup(createElement(TransactionTable,{transactions,categories:[],onUpdateCategory(){},onUpdateTransaction(){},onDeleteTransaction(){}})).replace(/\u00a0/g,' ');
    assert.match(html,/85,50/);assert.doesNotMatch(html,/8\.550,00|NaN|Infinity/);
   }
  });
 } finally {
  await vite.close();
  if(oldWorker)Object.defineProperty(globalThis,'pdfjsWorker',oldWorker);else delete globalThis.pdfjsWorker;
 }
});
