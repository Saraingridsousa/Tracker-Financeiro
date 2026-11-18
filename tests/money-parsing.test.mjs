import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMoney, MoneyParseError } from '../src/lib/parseMoney.ts';

const cases = [
 ['85.50',85.5],['85,50',85.5],['1.234,56',1234.56],['1,234.56',1234.56],
 ['1234,56',1234.56],['1234.56',1234.56],['-85,50',-85.5],['-85.50',-85.5],
 ['+85,50',85.5],['+85.50',85.5],['R$ 1.234,56',1234.56],['1 234,56',1234.56],
 ['1\u00a0234,56',1234.56],['1\u202f234.56',1234.56],['-R$ 85,50',-85.5],
 ['R$ -85,50',-85.5],['$ 1,234.56',1234.56],['EUR 85,50',85.5],['£ 85.50',85.5],
 ['1.234.567,89',1234567.89],['1,234,567.89',1234567.89],
 ['0',0],['0,00',0],['-0.00',0],['+0',0],[0,0],[85.5,85.5],[-85.5,-85.5],[0.1+0.2,0.3],
];
for (const [input,expected] of cases) test('money: parses '+String(input),()=>assert.equal(parseMoney(input),expected));
for (const input of ['1.234','1,234','1.000','1,000']) test('money: rejects ambiguous '+input,()=>assert.throws(()=>parseMoney(input),/ambíguo/));
test('money: explicit source resolves grouping without guessing',()=>{
 assert.equal(parseMoney('1.234','br'),1234);
 assert.equal(parseMoney('1,234','international'),1234);
 assert.equal(parseMoney('1.234.567','br'),1234567);
 assert.equal(parseMoney('1,234,567','international'),1234567);
 assert.throws(()=>parseMoney('1,234','br'),MoneyParseError);
 assert.throws(()=>parseMoney('1.234','international'),MoneyParseError);
 assert.equal(parseMoney(1.23,'br'),1.23);
});
for (const input of [undefined,null,'',' ','R$','abc','abc85.50','85.50abc','NaN','Infinity',NaN,Infinity,-Infinity,true,{},'1e3','--85,50','-R$ -85,50','1-2','12.34,56','1,23,4.56','1..234,56','85,5,0','85.','.50','1 23,45','12 34 567,89','1.234,567','1,234.567','999999999999999999',1.234,Number.MAX_VALUE,'90071992547409.91']) {
 test('money: rejects invalid '+String(input),()=>assert.throws(()=>parseMoney(input),MoneyParseError));
}
test('money: OFX has decimals and no thousands',()=>{
 for(const [input,expected] of [['-85.50',-85.5],['+85,50',85.5],['1.000',1],['85.5000',85.5]]) assert.equal(parseMoney(input,'ofx'),expected);
 for(const input of ['1.234','1,234','1.234,56','1,234.56','R$ 85.50','1 234.56']) assert.throws(()=>parseMoney(input,'ofx'),MoneyParseError);
});
