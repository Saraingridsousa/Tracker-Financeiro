import type {BankingSnapshot,ProductState} from '../types/banking';
const money=(cents:number,currencyCode:string)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:currencyCode}).format(cents/100);
const states:Record<ProductState['state'],string>={available:'Dados retornados',empty:'Nenhum dado retornado nesta consulta',unavailable:'Não disponibilizado pela conexão',error:'Falha na leitura; dados anteriores preservados'};
export function BankProductsPanel({snapshot,onShowInvestments}:{snapshot:BankingSnapshot;onShowInvestments?:()=>void}) {
 const products=snapshot.products??{bills:[],investments:[]};
 if(!snapshot.connections.length)return null;
 return <section aria-label="Faturas e investimentos conectados" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
  <h3 className="text-lg font-semibold">Faturas e investimentos conectados</h3>
  <p className="text-sm text-slate-500">Informações de consulta. Faturas não geram uma segunda despesa; investimentos conectados ficam separados da carteira manual.</p>
  <details><summary className="cursor-pointer text-sm font-medium">Faturas e diagnóstico por conexão</summary>
  {snapshot.connections.map(connection=><article key={connection.id} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
   <h4 className="font-medium">{connection.label}</h4>
   <p className="text-xs text-slate-500">Faturas: {connection.productStates?.bills?states[connection.productStates.bills.state]:'Ainda não consultadas'} · Investimentos: {connection.productStates?.investments?states[connection.productStates.investments.state]:'Ainda não consultados'}</p>
   {connection.productStates?.bills?.accounts?.map(result=><p key={result.accountId} className="text-xs text-slate-500">Faturas · {snapshot.accounts.find(a=>a.id===result.accountId)?.name??'Cartão'}: {states[result.state]}</p>)}
   {products.bills.filter(b=>b.itemId===connection.id).map(b=><div key={b.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950"><span>Fatura · vencimento {b.dueDate.split('-').reverse().join('/')}<small className="block text-slate-500">{snapshot.accounts.find(a=>a.id===b.accountId)?.name} · consulta {b.observedAt?new Date(b.observedAt).toLocaleString('pt-BR'):'não informada'}</small></span><strong>{money(b.totalAmountCents,b.currencyCode)}</strong></div>)}
   {onShowInvestments ? <button type="button" className="text-sm text-cyan-700 underline dark:text-cyan-300" onClick={onShowInvestments}>Ver posições na aba Investimentos</button> : <p className="text-xs text-slate-500">Posições disponíveis na aba Investimentos.</p>}

  </article>)}
  </details>
 </section>;
}
