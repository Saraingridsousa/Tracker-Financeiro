import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Category, Rule } from '../types/finance';

interface CategoryManagerModalProps {
  open: boolean;
  categories: Category[];
  rules: Rule[];
  onClose: () => void;
  onCreateCategory: (category: Omit<Category, 'id'> & { id?: string }) => void;
  onUpdateCategory: (categoryId: string, updates: Partial<Category>) => void;
  onDeleteCategory: (categoryId: string) => void;
  onAddRule: (rule: Omit<Rule, 'id'> & { id?: string }) => void;
  onDeleteRule: (ruleId: string) => void;
}

const emptyCategoryForm = {
  name: '',
  color: '#3b82f6',
  keywords: '',
  type: 'expense' as Category['type'],
  isNeutral: false,
};

export function CategoryManagerModal({
  open,
  categories,
  rules,
  onClose,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onAddRule,
  onDeleteRule,
}: CategoryManagerModalProps) {
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [ruleText, setRuleText] = useState('');
  const [ruleCategoryId, setRuleCategoryId] = useState(categories[0]?.id ?? '');

  useMemo(() => {
    if (!ruleCategoryId && categories[0]) {
      setRuleCategoryId(categories[0].id);
    }
  }, [categories, ruleCategoryId]);

  if (!open) return null;

  const handleCreateCategory = () => {
    if (!categoryForm.name.trim()) return;

    onCreateCategory({
      name: categoryForm.name.trim(),
      color: categoryForm.color,
      keywords: categoryForm.keywords
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      type: categoryForm.type,
      isNeutral: categoryForm.isNeutral,
      excludeFromTotals: categoryForm.isNeutral,
    });

    setCategoryForm(emptyCategoryForm);
  };

  const handleAddRule = () => {
    if (!ruleText.trim() || !ruleCategoryId) return;

    onAddRule({
      categoryId: ruleCategoryId,
      keywords: ruleText
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      isActive: true,
    });

    setRuleText('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-400">Gerenciamento</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Categorias e regras</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/60">
            <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Nova categoria</h3>

            <div className="space-y-3">
              <input
                value={categoryForm.name}
                onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                placeholder="Nome da categoria"
              />

              <div className="flex gap-3">
                <input
                  type="color"
                  value={categoryForm.color}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, color: event.target.value }))}
                  className="h-11 w-14 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900"
                />

                <select
                  value={categoryForm.type}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, type: event.target.value as Category['type'] }))}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="expense">Despesa</option>
                  <option value="income">Receita</option>
                  <option value="both">Ambas</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={categoryForm.isNeutral}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, isNeutral: event.target.checked }))}
                />
                É neutra / excluir dos totais
              </label>

              <input
                value={categoryForm.keywords}
                onChange={(event) => setCategoryForm((current) => ({ ...current, keywords: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                placeholder="Palavras-chave separadas por vírgula"
              />

              <button
                type="button"
                onClick={handleCreateCategory}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-medium text-slate-950 hover:bg-cyan-400"
              >
                <Plus className="h-4 w-4" />
                Adicionar categoria
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/60">
            <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Categorias existentes</h3>
            <div className="space-y-3">
              {categories.map((category) => (
                <div key={category.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <CategoryTextInput
                      value={category.name}
                      label={`Nome da categoria ${category.name}`}
                      required
                      onCommit={(name) => onUpdateCategory(category.id, { name })}
                      className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    />
                    {!category.isDefault && (
                      <button
                        type="button"
                        onClick={() => onDeleteCategory(category.id)}
                        className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-600 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[90px_1fr]">
                    <input
                      type="color"
                      value={category.color}
                      onChange={(event) => onUpdateCategory(category.id, { color: event.target.value })}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900"
                    />

                    <CategoryTextInput
                      value={category.keywords.join(', ')}
                      label={`Palavras-chave da categoria ${category.name}`}
                      onCommit={(value) =>
                        onUpdateCategory(category.id, {
                          keywords: value
                            .split(',')
                            .map((keyword) => keyword.trim())
                            .filter(Boolean),
                        })
                      }
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={Boolean(category.isNeutral || category.excludeFromTotals)}
                        onChange={(event) =>
                          onUpdateCategory(category.id, {
                            isNeutral: event.target.checked,
                            excludeFromTotals: event.target.checked,
                          })
                        }
                      />
                      Neutra
                    </label>

                    <select
                      value={category.type}
                      onChange={(event) => onUpdateCategory(category.id, { type: event.target.value as Category['type'] })}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    >
                      <option value="expense">Despesa</option>
                      <option value="income">Receita</option>
                      <option value="both">Ambas</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/60">
          <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Regras de autocategorização</h3>

          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={ruleText}
              onChange={(event) => setRuleText(event.target.value)}
              placeholder="Ex.: pix enviado, mesma titularidade, investimento"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />

            <select
              value={ruleCategoryId}
              onChange={(event) => setRuleCategoryId(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleAddRule}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
            >
              <Plus className="h-4 w-4" />
              Salvar regra
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {rules.length ? (
              rules.map((rule) => {
                const category = categories.find((item) => item.id === rule.categoryId);
                return (
                  <div key={rule.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{category?.name ?? 'Categoria removida'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{rule.keywords.join(', ')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteRule(rule.id)}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma regra cadastrada.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// Keep intermediate text local; shared storage accepts only complete valid documents.
export function CategoryTextInput({ value, label, required = false, onCommit, className }: { value: string; label: string; required?: boolean; onCommit: (value: string) => void; className?: string }) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(value); }, [value]);
  return <input aria-label={label} title="Pressione Enter ou saia do campo para salvar" value={draft} className={className}
    onFocus={() => { focused.current = true; }}
    onChange={event => setDraft(event.target.value)}
    onBlur={() => { focused.current = false; if (required && !draft.trim()) { setDraft(value); return; } if (draft !== value) onCommit(required ? draft.trim() : draft); }}
    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } if (event.key === 'Escape') setDraft(value); }} />;
}
