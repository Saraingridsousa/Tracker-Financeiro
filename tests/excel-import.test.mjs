import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseExcelStatement } from '../src/utils/excelParser.ts';

for (const [extension, bookType] of [['xlsx', 'xlsx'], ['xls', 'biff8']]) {
  test('Excel ' + extension + ': preserves Brazilian dates, cents and directions after dependency upgrade', async () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Data', 'Descrição', 'Valor', 'Tipo'],
      ['12/11/2026', 'Consulta clínica sintética', '45,29', 'Saída'],
      ['13/11/2026', 'Crédito sintético', '200,50', 'Entrada'],
    ]);
    XLSX.utils.book_append_sheet(book, sheet, 'Extrato sintético');
    const data = XLSX.write(book, { bookType, type: 'array' });
    const rows = await parseExcelStatement(new File([data], 'sintetico.' + extension));
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(({ date, description, amount, type, source }) => ({ date, description, amount, type, source })), [
      { date: '2026-11-12', description: 'Consulta clínica sintética', amount: 45.29, type: 'expense', source: 'import' },
      { date: '2026-11-13', description: 'Crédito sintético', amount: 200.5, type: 'income', source: 'import' },
    ]);
    assert.equal(new Set(rows.map(row => row.id)).size, 2);
    assert.ok(rows.every(row => row.categoryId === 'uncategorized'));
  });
}

test('Excel parser keeps unsupported files outside its import flow', async () => {
  assert.deepEqual(await parseExcelStatement(new File(['synthetic'], 'sintetico.csv')), []);
});
