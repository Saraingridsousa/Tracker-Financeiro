import { useEffect, useRef } from 'react';
import type { Category } from '../types/finance';
import type { SharedFinanceController } from '../hooks/useSharedFinance';

function downloadDraft(payload: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tracker-rascunho-nao-confirmado.json';
  link.click();
  URL.revokeObjectURL(url);
}

export function SharedFinancePanel({ shared, initialCategories = [] }: { shared: SharedFinanceController; initialCategories?: Category[] }) {
  const { status, model } = shared;
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (status.error) {
      alertRef.current?.scrollIntoView({ block: 'start' });
      alertRef.current?.focus();
    }
  }, [status.error]);
  if (!shared.enabled) return null;

  const reload = () => {
    if (status.draft && !window.confirm('O rascunho não confirmado será descartado deste navegador. Exporte-o primeiro para preservar suas alterações. Continuar?')) return;
    void model?.discardAndReload();
  };
  if (status.ready && status.payload && !status.error && !status.draft) {
    return <section aria-label="Dados compartilhados" className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">
      <span>Dados compartilhados no PC · {status.busy ? 'Salvando…' : 'Revisão ' + status.revision}</span>
      <details><summary className="cursor-pointer">Detalhes e atualização</summary><p className="my-2">O PC deve permanecer ligado. A leitura é atualizada ao abrir e voltar à janela.</p><button type="button" disabled={status.busy} onClick={reload} className="rounded-lg border px-3 py-2">Atualizar dados</button></details>
    </section>;
  }
  return <section aria-label="Dados compartilhados" className={(status.error ? 'fixed inset-x-0 top-0 z-[100] max-h-[90vh] overflow-y-auto ' : '') + 'mx-auto my-4 max-w-7xl space-y-3 rounded-2xl border border-cyan-200 bg-white p-4 text-slate-900 shadow-sm dark:border-cyan-900 dark:bg-slate-900 dark:text-slate-100'}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">Dados compartilhados no PC</h2><p className="text-sm text-slate-600 dark:text-slate-300">{status.busy ? 'Salvando no PC…' : !status.ready ? 'Lendo os dados do PC…' : status.payload ? 'Revisão ' + status.revision + ' · preferências compartilhadas.' : 'Ative as preferências para usar o painel.'}</p></div>
      <button type="button" disabled={status.busy} onClick={reload} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{status.draft ? 'Descartar rascunho e recarregar' : 'Atualizar dados'}</button>
    </div>
    <p className="text-sm">O PC deve permanecer ligado. A leitura é atualizada ao abrir, voltar à janela ou usar “Atualizar dados”.</p>
    {status.error && <div ref={alertRef} tabIndex={-1} role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-900"><p>{status.error}</p><p className="text-sm">As edições ficam bloqueadas até recarregar. Uma gravação sem confirmação pode já ter chegado ao PC; confira os dados antes de repetir.</p></div>}
    {status.draft && !status.busy && <button type="button" onClick={() => downloadDraft(status.draft)} className="rounded-lg border px-3 py-2 text-sm">Exportar rascunho não confirmado</button>}
    {status.ready && !status.payload && !status.error && <div className="space-y-3 border-t pt-3">
      <p className="text-sm">Ative as categorias e preferências no PC para organizar os dados dos bancos.</p>
      <button type="button" disabled={status.busy} onClick={() => model?.replace({ transactions: [], categories: initialCategories, rules: [], assets: [], investmentOrders: [], exportedAt: new Date().toISOString() })} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm text-white disabled:opacity-50">Ativar preferências no PC</button>
    </div>}
  </section>;
}
