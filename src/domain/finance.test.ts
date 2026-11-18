import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTransaction } from './finance.ts';
import * as finance from './finance.ts';
import type { Category, Rule } from '../types/finance';

const base = { id: 'pix-1', date: '2026-11-08', description: 'Pix enviado para Padaria', amount: 24.5, type: 'expense' as const, categoryId: 'alimentacao', source: 'import' as const, createdAt: '2026-11-08T12:00:00Z' };

test('Pix de terceiros não é transferência própria e não é neutro', () => {
  const tx = classifyTransaction(base);
  assert.equal(tx.isInternalTransfer, false);
  assert.equal(tx.isNeutral, false);
});

const categories: Category[] = [
  { id: 'alimentacao', name: 'Alimentação', color: '#000', keywords: ['padaria'], type: 'expense' },
  { id: 'lazer', name: 'Lazer', color: '#000', keywords: [], type: 'expense' },
  { id: 'transferencia', name: 'Entre contas', color: '#000', keywords: ['pix enviado', 'pix recebido'], type: 'both', isNeutral: true },
];

test('Regra ativa mais específica precede keyword e regra genérica', () => {
  const rules: Rule[] = [
    { id: 'r1', categoryId: 'alimentacao', keywords: ['padaria'], isActive: true },
    { id: 'r2', categoryId: 'lazer', keywords: ['Padaria do Zé'], isActive: true },
  ];
  assert.equal(finance.inferCategory('PIX PADARIA DO ZE', categories, rules, 'expense'), 'lazer');
  assert.equal(finance.inferCategory('Pix enviado para José', categories, [], 'expense'), 'uncategorized');
});

test('Regra inativa ou categoria removida não recategoriza', () => {
  const rules: Rule[] = [
    { id: 'r1', categoryId: 'lazer', keywords: ['padaria'], isActive: false },
    { id: 'r2', categoryId: 'nao-existe', keywords: ['padaria'], isActive: true },
  ];
  assert.equal(finance.inferCategory('Padaria', categories, rules, 'expense'), 'alimentacao');
});

test('Resumo usa centavos e exclui pendentes, remanejo e moedas diferentes', () => {
  const rows = [
    { ...base, id: 'salary', amount: 100, type: 'income' as const, description: 'Salário' },
    { ...base, id: 'small-1', amount: 0.1 },
    { ...base, id: 'small-2', amount: 0.2 },
    { ...base, id: 'pending', amount: 500, providerStatus: 'PENDING' as const },
    { ...base, id: 'internal', amount: 10, categoryId: 'transferencia', isSelfTransfer: true, manualSelfTransfer: true },
    { ...base, id: 'usd', amount: 700, currencyCode: 'USD' },
  ];
  const result = finance.summarizeTransactions(rows, categories);
  assert.equal(result.income, 100);
  assert.equal(result.expenses, 0.3);
  assert.equal(result.balance, 99.7);
  assert.equal(finance.isRealExpense(rows[3]), false);
});

test('Flags antigas de transferência genérica não excluem um Pix de terceiro', () => {
  assert.equal(classifyTransaction({ ...base, isInternalTransfer: true, isSelfTransfer: false, isNeutral: true }).isNeutral, false);
  assert.equal(classifyTransaction({ ...base, categoryId: 'transferencia' }).isSelfTransfer, false);
});

test('Categoria transferência não substitui confirmação explícita de conta própria', () => {
  const categorizedOnly = {
    ...base,
    amount: 85,
    description: 'PIX enviado para restaurante',
    categoryId: 'transferencia',
  };
  assert.equal(classifyTransaction(categorizedOnly, categories).isSelfTransfer, false);
  assert.equal(classifyTransaction(categorizedOnly, categories).isNeutral, false);
  assert.equal(finance.isRealExpense(categorizedOnly, categories), true);
  assert.equal(finance.summarizeTransactions([categorizedOnly], categories).expenses, 85);

  const manuallyCategorized = { ...categorizedOnly, manualCategory: true };
  assert.equal(classifyTransaction(manuallyCategorized, categories).isSelfTransfer, false);
  assert.equal(finance.isRealExpense(manuallyCategorized, categories), true);

  const explicitlyConfirmed = {
    ...categorizedOnly,
    manualCategory: true,
    isSelfTransfer: true,
    manualSelfTransfer: true,
  };
  assert.equal(classifyTransaction(explicitlyConfirmed, categories).isSelfTransfer, true);
  assert.equal(classifyTransaction(explicitlyConfirmed, categories).isNeutral, true);
  assert.equal(finance.isRealExpense(explicitlyConfirmed, categories), false);

  const explicitRejection = {
    ...categorizedOnly,
    isSelfTransfer: true,
    manualSelfTransfer: true,
  };
  assert.equal(classifyTransaction({ ...explicitRejection, isSelfTransfer: false }, categories).isNeutral, false);
});

test('Transações legadas classificadas automaticamente como transferência são reavaliadas', () => {
  const legacy = {
    ...base,
    amount: 85,
    description: 'PIX enviado para restaurante',
    categoryId: 'transferencia',
    isInternalTransfer: true,
    isSelfTransfer: true,
    isNeutral: true,
  };
  assert.equal(classifyTransaction(legacy, categories).isSelfTransfer, false);
  assert.equal(classifyTransaction(legacy, categories).isInternalTransfer, false);
  assert.equal(classifyTransaction(legacy, categories).isNeutral, false);
  assert.equal(finance.isRealExpense(legacy, categories), true);
  assert.equal(finance.summarizeTransactions([legacy], categories).expenses, 85);

  const providerEvidence = {
    ...legacy,
    source: 'pluggy' as const,
  };
  assert.equal(classifyTransaction(providerEvidence, categories).isSelfTransfer, true);
  assert.equal(classifyTransaction(providerEvidence, categories).isNeutral, true);

  const manualEvidence = {
    ...legacy,
    isSelfTransfer: true,
    manualSelfTransfer: true,
  };
  assert.equal(classifyTransaction(manualEvidence, categories).isSelfTransfer, true);
});

test('PIX recebido de terceiro permanece receita', () => {
  const tx = {
    ...base,
    type: 'income' as const,
    description: 'Pix recebido de terceiro',
    categoryId: 'uncategorized',
  };
  assert.equal(finance.inferCategory(tx.description, categories, [], 'income'), 'uncategorized');
  assert.equal(classifyTransaction(tx, categories).isNeutral, false);
  assert.equal(finance.isRealIncome(tx, categories), true);
  assert.equal(finance.summarizeTransactions([tx], categories).income, 24.5);
});

test('PIX e TED só são neutros com evidência própria ou confirmação manual', () => {
  const restaurant = { ...base, amount: 85, description: 'PIX enviado para restaurante', categoryId: 'alimentacao' };
  const otherPerson = { ...base, amount: 60, description: 'PIX enviado para outra pessoa', categoryId: 'outros' };
  const tedThirdParty = { ...base, amount: 40, description: 'TED enviada para outra pessoa', categoryId: 'outros' };
  const insufficient = { ...base, amount: 30, description: 'Transferência realizada', categoryId: 'uncategorized' };

  for (const tx of [restaurant, otherPerson, tedThirdParty, insufficient]) {
    assert.equal(classifyTransaction(tx, categories).isSelfTransfer, false);
    assert.equal(classifyTransaction(tx, categories).isNeutral, false);
  }

  assert.equal(finance.summarizeTransactions([restaurant, otherPerson, tedThirdParty, insufficient], categories).expenses, 215);

  const pixOwn = { ...base, source: 'pluggy' as const, description: 'PIX entre contas próprias', categoryId: 'transferencia', isSelfTransfer: true, manualSelfTransfer: true };
  const tedOwn = { ...base, source: 'pluggy' as const, description: 'TED entre contas próprias', categoryId: 'uncategorized', isSelfTransfer: true, manualSelfTransfer: true };
  for (const tx of [pixOwn, tedOwn]) {
    assert.equal(classifyTransaction(tx, categories).isSelfTransfer, true);
    assert.equal(classifyTransaction(tx, categories).isNeutral, true);
  }
  assert.equal(finance.summarizeTransactions([pixOwn, tedOwn], categories).expenses, 0);
});

test('PIX, TED e transferência são classificados sem depender de caixa ou acentuação', () => {
  for (const description of [
    'PIX enviado para restaurante',
    'pix enviado para restaurante',
    'Pix enviado para restaurante',
    'PIX ENVIADO PARA RESTAURANTE',
    'TED enviada para terceiros',
    'Transferência recebida de terceiros',
  ]) {
    const tx = { ...base, description, amount: 85, type: 'expense' as const, categoryId: 'alimentacao' };
    assert.equal(classifyTransaction(tx, categories).isInternalTransfer, false);
  }

  const income = { ...base, description: 'TRANSFERÊNCIA RECEBIDA DE TERCEIROS', amount: 200, type: 'income' as const, categoryId: 'uncategorized' };
  assert.equal(classifyTransaction(income, categories).isNeutral, false);
  assert.equal(finance.isRealIncome(income, categories), true);
});

test('Investimentos, estornos e pagamentos de fatura preservam suas classificações', () => {
  const categoriesWithSpecial = [
    ...categories,
    { id: 'investimentos', name: 'Investimentos', color: '#000', keywords: ['cdb'], type: 'expense' as const, isNeutral: true },
    { id: 'pagamento_fatura', name: 'Pagamento de Fatura', color: '#000', keywords: [], type: 'expense' as const, isNeutral: true },
  ];
  const investment = { ...base, amount: 500, description: 'Aplicação CDB', categoryId: 'investimentos' };
  const cardPayment = { ...base, amount: 900, description: 'Pagamento de fatura', categoryId: 'pagamento_fatura' };
  const refund = { ...base, amount: 50, description: 'Estorno PIX restaurante', type: 'income' as const, categoryId: 'uncategorized' };

  assert.equal(classifyTransaction(investment, categoriesWithSpecial).isInvestment, true);
  assert.equal(finance.summarizeTransactions([investment], categoriesWithSpecial).expenses, 0);
  assert.equal(classifyTransaction(cardPayment, categoriesWithSpecial).isCreditCardPayment, true);
  assert.equal(finance.summarizeTransactions([cardPayment], categoriesWithSpecial).expenses, 0);
  assert.equal(classifyTransaction(refund, categoriesWithSpecial).isNeutral, false);
  assert.equal(finance.isRealIncome(refund, categoriesWithSpecial), true);
});

test('Compra parcelada é distribuída igualmente pelos meses das parcelas', () => {
  const tx = {
    ...base,
    date: '2026-11-08',
    amount: 300,
    amountCents: 30000,
    type: 'expense' as const,
    description: 'Compra parcelada',
    categoryId: 'alimentacao',
    creditCardMetadata: {
      installmentNumber: 1,
      totalInstallments: 3,
      purchaseDate: '2026-11-08',
      totalAmountCents: 30000,
    },
  };

  const projected = finance.projectInstallmentTransactions([tx]);
  assert.equal(projected.length, 3);
  assert.deepEqual(projected.map((item) => item.date), ['2026-11-08', '2026-12-08', '2027-01-08']);
  assert.deepEqual(projected.map((item) => item.amountCents), [10000, 10000, 10000]);
  assert.equal(finance.summarizeTransactions([tx], categories).expenses, 300);

  const nextMonth = finance.projectInstallmentTransactions([{
    ...tx,
    amount: 100,
    amountCents: 10000,
  }]);
  assert.equal(nextMonth.length, 1);
});

test('Statement Payment já persistido com flag antiga falsa também não vira renda', () => {
  const tx = { ...base, description: 'Statement Payment', type: 'income' as const, amount: 150, isCreditCardPayment: false, source: 'pluggy' as const };
  assert.equal(finance.summarizeTransactions([tx]).income, 0);
  assert.equal(classifyTransaction(tx).isCreditCardPayment, true);
  assert.equal(classifyTransaction({ ...tx, description: 'Statement Payment Refund' }).isCreditCardPayment, false);
});

const healthCategories: Category[] = [
  { id: 'saude', name: 'Saúde', color: '#000', keywords: ['clinica'], type: 'expense' },
  { id: 'investimentos', name: 'Investimentos', color: '#000', keywords: ['cdb'], type: 'both', isNeutral: true },
];

test('Categoria específica e regra de Saúde vencem regex de aplicação no resumo financeiro', () => {
  const description = 'PIX CLINICA APLICACAO DE INSULINA';
  const rules: Rule[] = [{ id: 'insulina', categoryId: 'saude', keywords: ['aplicacao de insulina'], isActive: true }];
  for (const appliedRules of [[], rules]) {
    // With rules, remove the Saúde keyword: only the explicit rule can select it.
    const available = appliedRules.length ? healthCategories.map(c => c.id === 'saude' ? { ...c, keywords: [] } : c) : healthCategories;
    const categoryId = finance.inferCategory(description, available, appliedRules, 'expense');
    const tx = { ...base, amount: 45, description, categoryId };
    assert.equal(categoryId, 'saude');
    assert.equal(finance.summarizeTransactions([tx], healthCategories).expenses, 45);
    assert.equal(classifyTransaction(tx, healthCategories).isInvestment, false);
  }
});

test('Correção manual Saúde recalcula flags antigas e recupera a despesa de aplicação clínica', () => {
  const tx = { ...base, amount: 45, description: 'APLICACAO DE INSULINA', categoryId: 'saude', manualCategory: true, isInvestment: true, isNeutral: true };
  const classified = classifyTransaction(tx, healthCategories);
  assert.equal(classified.isInvestment, false);
  assert.equal(classified.isNeutral, false);
  assert.equal(finance.summarizeTransactions([classified], healthCategories).expenses, 45);
});

test('Investimentos reais, fallback sem categoria e proventos mantêm políticas distintas', () => {
  for (const categoryId of ['investimentos', 'uncategorized', 'categoria-removida']) {
    const tx = { ...base, amount: 100, description: 'APLICACAO CDB', categoryId };
    const result = finance.summarizeTransactions([tx], healthCategories);
    assert.equal(classifyTransaction(tx, healthCategories).isInvestment, true);
    assert.equal(result.expenses, 0);
    assert.equal(result.totalInvested, 100);
  }
  const redemption = { ...base, amount: 70, type: 'income' as const, description: 'RESGATE TESOURO', categoryId: 'investimentos' };
  assert.equal(finance.summarizeTransactions([redemption], healthCategories).totalInvested, -70);
  const yieldIncome = { ...redemption, amount: 10, categoryId: 'proventos' };
  assert.equal(finance.summarizeTransactions([yieldIncome], healthCategories).income, 10);
  assert.equal(classifyTransaction(yieldIncome, healthCategories).isInvestment, false);
});

test('Resgate não conta como aplicação mensal', () => {
  const application = { ...base, amount: 100, description: 'APLICACAO CDB', categoryId: 'investimentos' };
  const redemption = { ...base, type: 'income' as const, amount: 70, description: 'RESGATE TESOURO', categoryId: 'investimentos' };
  assert.equal(finance.isInvestmentApplication(application, healthCategories), true);
  assert.equal(finance.isInvestmentApplication(redemption, healthCategories), false);
});

test('Descrição textual reconhece parcelas do PicPay e outros provedores', () => {
  for (const description of ['Compra PicPay - parcela 2 de 12', 'Compra 3/10', 'Parcelamento 4 de 6']) {
    const tx = { ...base, description, amount: 100, amountCents: 10000, type: 'expense' as const };
    const installment = finance.inferCreditCardInstallment(tx);
    assert.ok(installment);
    assert.equal(installment.totalInstallments > 1, true);
  }
});

test('Categoria neutra e marcações explícitas de transferência/fatura continuam fora do resultado', () => {
  const policies: Category[] = [...healthCategories,
    { id: 'ajuste', name: 'Ajuste', color: '#000', keywords: [], type: 'both', isNeutral: true },
    { id: 'fora', name: 'Fora', color: '#000', keywords: [], type: 'both', excludeFromTotals: true },
  ];
  for (const extra of [{ categoryId: 'ajuste' }, { categoryId: 'fora' }, { categoryId: 'saude', isSelfTransfer: true, manualSelfTransfer: true }, { categoryId: 'saude', isCreditCardPayment: true }]) {
    const tx = { ...base, description: 'APLICACAO DE INSULINA', manualCategory: true, ...extra };
    assert.equal(finance.summarizeTransactions([tx], policies).expenses, 0);
    assert.equal(classifyTransaction(tx, policies).isNeutral, true);
  }
});


test('bank cofrinho contributions and reserved money are allocations, never spending', () => {
  for (const description of ['APORTE NA CARTEIRA COFRINHO SINTÉTICO', 'Dinheiro reservado - Cofrinho do cartão sintético']) {
    const tx = { ...base, description, categoryId: 'uncategorized', amount: 100 };
    const classified = classifyTransaction(tx, healthCategories);
    assert.equal(classified.isInvestment, true, description);
    assert.equal(finance.isRealExpense(tx, healthCategories), false);
    assert.equal(finance.summarizeTransactions([tx], healthCategories).expenses, 0);
    assert.equal(finance.summarizeTransactions([tx], healthCategories).neutralTotal, 100);
    // Explicit user correction still takes priority over description inference.
    assert.equal(classifyTransaction({ ...tx, categoryId: 'saude', manualCategory: true }, healthCategories).isInvestment, false);
  }
  const retail = { ...base, description: 'Compra de cofrinho decorativo', categoryId: 'uncategorized' };
  assert.equal(classifyTransaction(retail, healthCategories).isInvestment, false);
  assert.equal(finance.isRealExpense(retail, healthCategories), true);
});
