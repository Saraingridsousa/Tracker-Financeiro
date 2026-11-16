import { parseLegacyBackup } from './legacyBackup.mjs';

function complete(payload) {
  const valid=parseLegacyBackup(JSON.stringify(payload));
  if(!Array.isArray(valid.assets)||!Array.isArray(valid.investmentOrders)) throw new Error('Documento compartilhado inválido: carteira incompleta.');
  return valid;
}
function envelope(body) {
  if(!body || !Number.isSafeInteger(body.revision) || body.revision<0 || (body.revision===0 ? body.payload!==null : !body.payload)) throw new Error('Resposta compartilhada inválida.');
  return {revision:body.revision,payload:body.payload===null?null:complete(body.payload)};
}
export function createSharedApi(fetcher=fetch) {
  async function request(path,init={}) {
    let response;try {response=await fetcher(path,{credentials:'same-origin',...init});}catch{throw new Error('PC indisponível. Confira se está ligado e conectado à rede privada.');}
    const body=await response.json().catch(()=>null);
    if(!response.ok) throw new Error(typeof body?.error==='string'?body.error:'Não foi possível acessar os dados compartilhados.');
    return body;
  }
  return {
    load:async()=>envelope(await request('/api/shared-state')),
    save:async(revision,payload)=>{
      complete(payload);
      const session=await request('/api/session');
      if(typeof session?.csrfToken!=='string'||!session.csrfToken) throw new Error('Sessão inválida. Reabra o aplicativo.');
      const result=envelope(await request('/api/shared-state',{method:'POST',headers:{'Content-Type':'application/json','X-Tracker-CSRF':session.csrfToken},body:JSON.stringify({revision,payload})}));
      if(result.revision!==revision+1) throw new Error('Revisão compartilhada inválida. Preserve o rascunho e recarregue.');
      return result;
    },
  };
}

export class FinanceState {
  constructor(api, {persistDraft=()=>{}, recovery=null}={}) {
    this.api=api;this.persistDraft=persistDraft;this.listeners=new Set();this.generation=0;this.queued=false;
    this.state={revision:0,payload:null,ready:false,busy:false,error:recovery?'Há um rascunho não confirmado neste navegador. Exporte-o antes de recarregar.':'',draft:recovery};
  }
  subscribe(listener) { this.listeners.add(listener);return()=>this.listeners.delete(listener); }
  publish(patch) {this.state={...this.state,...patch};for(const listener of this.listeners)listener(this.state);}
  async load(discard=false) {
    if(this.state.busy || (this.state.ready && this.state.draft && !discard))return false;
    const generation=++this.generation;
    try {
      const next=envelope(await this.api.load());if(generation!==this.generation)return false;
      if(discard) {try{this.persistDraft(null);}catch{/* Stale recovery remains explicit on next visit. */}}
      this.publish({...next,ready:true,...(discard?{draft:null,error:''}:this.state.draft?{}:{error:''})});return true;
    }catch(error){if(generation===this.generation)this.publish({ready:true,error:error instanceof Error?error.message:'Não foi possível ler os dados do PC.'});return false;}
  }
  discardAndReload() {return this.load(true);}
  assertWritable() {
    if(!this.state.ready)throw new Error('Aguarde a leitura dos dados do PC.');
    if(this.state.draft && !this.queued)throw new Error('Exporte o rascunho pendente e recarregue antes de editar.');
    if(this.state.error)throw new Error('Recarregue os dados antes de editar.');
  }
  set(field,update) {
    this.assertWritable();
    if(!this.state.payload)throw new Error('Inicialize explicitamente os dados compartilhados.');
    if(!['transactions','categories','rules','assets','investmentOrders'].includes(field))throw new Error('Campo inválido.');
    const next=structuredClone(this.queued?this.state.draft:this.state.payload);
    next[field]=typeof update==='function'?update(next[field]):update;
    this.stage(next);
  }
  replace(payload) {this.assertWritable();this.stage(complete(payload));}
  restore(text) {
    const payload=parseLegacyBackup(text);
    const current=this.state.payload;
    this.replace({...payload,assets:payload.assets??current?.assets??[],investmentOrders:payload.investmentOrders??current?.investmentOrders??[]});
  }
  stage(payload) {
    const already=this.queued;this.queued=true;++this.generation;
    this.publish({draft:structuredClone(payload),busy:true});
    if(!already)queueMicrotask(()=>void this.flush());
  }
  async flush() {
    this.queued=false;
    try {
      const draft=complete({...this.state.draft,exportedAt:new Date().toISOString()});
      this.publish({draft});
      this.persistDraft(draft); // Persist before sending, including an acknowledgement lost on tab close.
      const next=envelope(await this.api.save(this.state.revision,draft));
      this.publish({...next,draft:null,error:''});
      try{this.persistDraft(null);}catch{/* A retained recovery copy is never auto-applied. */}
    }catch(error){this.publish({error:error instanceof Error?error.message:'Gravação não confirmada. Exporte o rascunho.'});}
    finally{this.publish({busy:false});}
  }
}
