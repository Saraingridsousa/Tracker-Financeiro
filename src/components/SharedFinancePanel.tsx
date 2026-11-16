import { useEffect, useRef, useState } from 'react';
import { parseLegacyBackup } from '../domain/backup';
import type { SharedPayload } from '../../shared/financeState.mjs';
import type { SharedFinanceController } from '../hooks/useSharedFinance';

function download(payload:unknown) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='tracker-rascunho-nao-confirmado.json';link.click();URL.revokeObjectURL(url);
}
export function SharedFinancePanel({shared,browserCopy}:{shared:SharedFinanceController;browserCopy:()=>SharedPayload}) {
  const [candidate,setCandidate]=useState<SharedPayload|null>(null);
  const [previewError,setPreviewError]=useState('');
  const {status,model}=shared;
  const alertRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(status.error){alertRef.current?.scrollIntoView({block:'start'});alertRef.current?.focus();}},[status.error]);
  if(!shared.enabled)return null;
  const review=(payload:SharedPayload)=>{
    try{setCandidate(parseLegacyBackup(JSON.stringify(payload)) as SharedPayload);setPreviewError('');}
    catch(error){setCandidate(null);setPreviewError(error instanceof Error?error.message:'Cópia inválida.');}
  };
  const reload=()=>{
    if(status.draft && !window.confirm('O rascunho não confirmado será descartado deste navegador. Exporte-o primeiro para preservar suas alterações. Continuar?'))return;
    void model?.discardAndReload();
  };
  return <section aria-label="Dados compartilhados" className={(status.error ? 'fixed inset-x-0 top-0 z-[100] max-h-[90vh] overflow-y-auto ' : '') + 'mx-auto my-4 max-w-7xl space-y-3 rounded-2xl border border-cyan-200 bg-white p-4 text-slate-900 shadow-sm dark:border-cyan-900 dark:bg-slate-900 dark:text-slate-100'}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">Dados compartilhados no PC</h2><p className="text-sm text-slate-600 dark:text-slate-300">{status.busy?'Salvando no PC…':!status.ready?'Lendo os dados do PC…':status.payload?'Revisão '+status.revision+' · histórico e carteira iguais nos aparelhos.':'Escolha a primeira cópia para compartilhar.'}</p></div>
      <button type="button" disabled={status.busy} onClick={reload} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{status.draft?'Descartar rascunho e recarregar':'Atualizar dados'}</button>
    </div>
    <p className="text-sm">O PC deve permanecer ligado. A leitura é atualizada ao abrir, voltar à janela ou usar “Atualizar dados”.</p>
    {status.error&&<div ref={alertRef} tabIndex={-1} role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-900"><p>{status.error}</p><p className="text-sm">As edições ficam bloqueadas até recarregar. Uma gravação sem confirmação pode já ter chegado ao PC; confira os dados antes de repetir.</p></div>}
    {status.draft&&!status.busy&&<button type="button" onClick={()=>download(status.draft)} className="rounded-lg border px-3 py-2 text-sm">Exportar rascunho não confirmado</button>}
    {status.ready&&!status.payload&&!status.error&&<div className="space-y-3 border-t pt-3">
      <p>A cópia antiga no navegador será preservada. Se você abriu esta URL privada pela primeira vez, exporte o backup completo no endereço antigo do PC e selecione-o aqui.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={status.busy} onClick={()=>review(browserCopy())} className="rounded-lg border px-3 py-2 text-sm">Conferir cópia deste navegador</button>
        <label className="rounded-lg border px-3 py-2 text-sm">Conferir backup JSON<input aria-label="Conferir backup compartilhado" type="file" accept="application/json,.json" disabled={status.busy} className="mt-2 block w-full max-w-xs" onChange={async event=>{
          const input=event.currentTarget;const file=input.files?.[0];if(!file)return;
          try{const payload=parseLegacyBackup(await file.text());review({...payload,assets:payload.assets??[],investmentOrders:payload.investmentOrders??[]});}
          catch(error){setCandidate(null);setPreviewError(error instanceof Error?error.message:'Backup inválido.');}finally{input.value='';}
        }}/></label>
      </div>
      {previewError&&<p role="alert">{previewError}</p>}
      {candidate&&<div className="space-y-2 rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
        <p>Conferência: {candidate.transactions.length} transações · {candidate.categories.length} categorias · {candidate.rules.length} regras · {candidate.assets.length} ativos · {candidate.investmentOrders.length} ordens.</p>
        {candidate.transactions.length===0&&candidate.assets.length===0&&<p className="font-medium">Esta cópia não contém histórico nem ativos. Só continue se deseja começar vazia; para levar os dados antigos, selecione o backup completo.</p>}
        <button type="button" disabled={status.busy} onClick={()=>{
          try{model?.replace(candidate);}catch(error){setPreviewError(error instanceof Error?error.message:'Não foi possível copiar.');}
        }} className="rounded-lg bg-cyan-700 px-4 py-2 text-white disabled:opacity-50">Confirmar esta cópia no PC</button>
      </div>}
    </div>}
  </section>;
}
