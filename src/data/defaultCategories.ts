import type { Category } from '../types/finance';

export const defaultCategories: Category[] = [
  { id: 'alimentacao', name: 'Alimentação', color: '#ef4444', keywords: ['uber', 'restaurante', 'mercado', 'padaria', 'delivery'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'moradia', name: 'Moradia', color: '#f59e0b', keywords: ['aluguel', 'condominio', 'luz', 'água', 'internet'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'transporte', name: 'Transporte', color: '#3b82f6', keywords: ['uber', 'metro', 'onibus', 'combustivel', 'posto'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'lazer', name: 'Lazer', color: '#8b5cf6', keywords: ['cinema', 'spotify', 'streaming', 'ingresso'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'saude', name: 'Saúde', color: '#10b981', keywords: ['farmacia', 'medico', 'consulta', 'dentista'], type: 'expense', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'investimentos', name: 'Investimentos', color: '#06b6d4', keywords: ['investimento', 'aplicacao', 'aplicação', 'resgate', 'cdb', 'lci', 'debito online td', 'debito online t/d', 'selic', 'tesouro', 'investir'], type: 'expense', isDefault: true, isNeutral: true, excludeFromTotals: true },
  { id: 'transferencia', name: 'Transferência Entre Contas', color: '#a78bfa', keywords: ['sara ingrid', 'sara i s o afonso', 'sara afonso', 'pix recebido', 'pix enviado', 'recebimento de transferencia', 'recebimento de transferência', 'envio de transferencia', 'envio de transferência', 'mesma titularidade', 'conta propria', 'entre contas'], type: 'both', isDefault: true, isNeutral: true, excludeFromTotals: true },
  { id: 'pagamento_fatura', name: 'Pagamento de Fatura', color: '#f97316', keywords: ['pagamento de fatura', 'pagamento fatura cartao', 'pagamento efetuado pagamento fatura', 'pgto fatura', 'fatura', 'invoice', 'payment'], type: 'expense', isDefault: true, isNeutral: true, excludeFromTotals: true },
  { id: 'proventos', name: 'Receitas / Proventos e Dividendos', color: '#22c55e', keywords: ['prov rendimento', 'prov dividendos', 'prov juros s capital', 'credito evento b3', 'crédito evento b3', 'dividendos', 'juros sobre capital'], type: 'income', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'salario', name: 'Salário/Entradas', color: '#22c55e', keywords: ['salario', 'beneficio', 'pagamento', 'venda'], type: 'income', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'outros', name: 'Outros', color: '#64748b', keywords: ['varios', 'outros'], type: 'both', isDefault: true, isNeutral: false, excludeFromTotals: false },
  { id: 'uncategorized', name: 'Sem categoria', color: '#cbd5e1', keywords: [], type: 'both', isDefault: true, isNeutral: false, excludeFromTotals: false },
];