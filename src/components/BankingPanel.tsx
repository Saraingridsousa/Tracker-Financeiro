import { BankProductsPanel } from './BankProductsPanel';
import { useState } from 'react';
import { Landmark, RefreshCw, ShieldCheck, Download, ExternalLink } from 'lucide-react';
import type { BankingController } from '../hooks/useBanking';

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700';
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR') : 'Ainda não informado';

export function BankingPanel({ banking, onShowInvestments }: { banking: BankingController; onShowInvestments?: () => void }) {
  const { snapshot, busy, error } = banking;
  const [itemId, setItemId] = useState('');
  const [label, setLabel] = useState('');
  return <section aria-labelledby="banking-title" className="space-y-5 rounded-2xl border border-cyan-200 bg-white p-6 shadow-sm dark:border-cyan-900 dark:bg-slate-900">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="mb-2 flex items-center gap-2 text-cyan-600"><Landmark className="h-5 w-5" /><span className="text-xs font-semibold uppercase tracking-widest">Bancos conectados</span></div>
        <h2 id="banking-title" className="text-xl font-semibold">Suas movimentações, sem depender de PDF</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Meu Pluggy pessoal: atualização bancária a cada 24 horas. Sincronizar aqui lê os dados já disponíveis, sem forçar uma atualização do banco.</p>
      </div>
      <button className={buttonClass} disabled={busy} onClick={() => void banking.downloadBackup()}><Download className="h-4 w-4" />Backup bancário</button>
    </div>
    <details className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-950" open={!snapshot.connections.length}>
      <summary className="cursor-pointer font-medium">Como conectar pelo Meu Pluggy gratuito</summary>
      <ol className="mt-3 list-inside list-decimal space-y-2 text-slate-600 dark:text-slate-300">
        <li>Autorize seus bancos no <a className="text-cyan-600 underline" href="https://meu.pluggy.ai" target="_blank" rel="noopener noreferrer">Meu Pluggy <ExternalLink className="inline h-3 w-3" /></a>.</li>
        <li>No Dashboard Pluggy, use a mesma conta e escolha o conector <strong>MeuPluggy</strong>, não o banco diretamente nem Sandbox.</li>
        <li>Configure Client ID e Client Secret somente no <strong>backend</strong>, conforme o README. Não coloque chaves no navegador, no Git ou no chat.</li>
        <li>Copie o <strong>itemId</strong> da conexão e registre abaixo. A primeira leitura real só acontece depois dessa configuração.</li>
      </ol>
      <p className="mt-3 text-xs text-slate-500">Uso pessoal, até cinco conexões conforme a modalidade atual. O acesso envolve a Pluggy; não é um fluxo totalmente offline. Dados e histórico dependem do banco e do consentimento.</p>
    </details>
    {!snapshot.configured && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"><ShieldCheck className="mr-2 inline h-4 w-4" />Backend sem credenciais Pluggy. A interface funciona, mas nenhuma conta real está conectada pelo Tracker.</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</p>}
    <details><summary className="cursor-pointer text-sm font-medium">Registrar outra conexão autorizada</summary>
    <form className="grid items-end gap-3 sm:grid-cols-[1fr_2fr_auto]" onSubmit={async (event) => {
      event.preventDefault();
      if (await banking.addConnection(itemId, label)) { setItemId(''); setLabel(''); }
    }}>
      <label className="space-y-1 text-sm">Apelido da conexão<input className={inputClass} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Meu banco" maxLength={80} /></label>
      <label className="space-y-1 text-sm">itemId autorizado<input className={inputClass} required value={itemId} onChange={(event) => setItemId(event.target.value)} placeholder="UUID obtido no Dashboard Pluggy" autoComplete="off" spellCheck={false} /></label>
      <button className={buttonClass} disabled={busy || snapshot.connections.length >= 5}>Registrar conexão</button>
    </form></details>
    <div className="space-y-3">{snapshot.connections.map((connection) => <article key={connection.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-medium">{connection.label || 'Conexão MeuPluggy'}</h3><p className="text-xs text-slate-500">Estado na Pluggy: {connection.status}{connection.executionStatus ? ` · ${connection.executionStatus}` : ''}</p><p className="text-xs text-slate-500">Identificação pelas contas: {connection.identification?.institutions?.join(', ') || 'pendente'} · {connection.identification?.state==='confirmed'?'confirmada':connection.identification?.state==='mismatch'?'divergência: confira o apelido':'confira os dados da conta'}</p></div>
        <button className={buttonClass} disabled={busy || !snapshot.configured} onClick={() => void banking.sync(connection.id)}><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />{busy ? 'Consultando…' : 'Sincronizar dados'}</button>
      </div>
      <dl className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3"><div><dt>Última leitura bem-sucedida</dt><dd>{dateLabel(connection.lastSuccessfulSyncAt??connection.lastFetchedAt)}</dd></div><div><dt>Atualização no provedor</dt><dd>{dateLabel(connection.providerUpdatedAt)}</dd></div><div><dt>Autorização até</dt><dd>{dateLabel(connection.consentExpiresAt)}</dd></div></dl>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500"><span>Última tentativa: {dateLabel(connection.lastAttemptAt??connection.lastFetchedAt)} · Leitura: {connection.syncMode==='incremental'?'janela com sobreposição':'histórico completo'}</span><button type="button" className="underline" disabled={busy||!snapshot.configured} onClick={()=>void banking.sync(connection.id,true)}>Reconferir histórico completo</button></div>
      {connection.lastError && <p role="alert" className="mt-2 text-sm text-rose-600">{connection.lastError}</p>}
    </article>)}</div>
    {snapshot.accounts.length > 0 && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{snapshot.accounts.map((account) => <article key={account.id} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950">
      <p className="text-sm font-medium">{account.institution?.name??snapshot.connections.find(c=>c.id===account.itemId)?.label} · {account.name}</p><p className="text-xs text-slate-500">Instituição: {account.institution?.code?`COMPE ${account.institution.code}`:account.institution?.source==='account.name'?'nome reportado pela conta':'identificação pendente'}</p><p className="text-xs text-slate-500">{account.type === 'CREDIT' ? 'Saldo de cartão — não é dinheiro disponível' : 'Saldo informado pelo banco'}</p>
      <p className="mt-2 text-xl font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: account.currencyCode }).format(account.balanceCents / 100)}</p>
    </article>)}</div>}
    <BankProductsPanel snapshot={snapshot} onShowInvestments={onShowInvestments} />
    <p className="text-xs text-slate-500">As movimentações pendentes ficam visíveis, mas não entram no resultado liquidado. Transferências próprias precisam de classificação explícita. Backup bancário não contém suas chaves.</p>
  </section>;
}
