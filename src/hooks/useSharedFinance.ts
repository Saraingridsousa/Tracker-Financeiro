import { useEffect, useRef, useState } from 'react';
import { createSharedApi, FinanceState } from '../../shared/financeState.mjs';
import type { SharedPayload, SharedStatus } from '../../shared/financeState.mjs';

const RECOVERY_KEY='tracker-financeiro:shared-draft';
const initial:SharedStatus={revision:0,payload:null,ready:false,busy:false,error:'',draft:null};
export interface SharedBacking { payload:SharedPayload|null; set:FinanceState['set'] }
export function useSharedFinance(enabled:boolean) {
  const modelRef=useRef<FinanceState|null>(null);
  if(enabled && !modelRef.current) {
    let recovery:SharedPayload|null=null;
    try {const raw=window.localStorage.getItem(RECOVERY_KEY);if(raw)recovery=JSON.parse(raw) as SharedPayload;}catch{/* The first attempted write reports unavailable storage. */}
    modelRef.current=new FinanceState(createSharedApi(),{recovery,persistDraft:payload=>{
      try { if(payload)window.localStorage.setItem(RECOVERY_KEY,JSON.stringify(payload));else window.localStorage.removeItem(RECOVERY_KEY); }
      catch { throw new Error('Armazenamento do navegador indisponível. Exporte o rascunho antes de fechar esta janela.'); }
    }});
  }
  const [status,setStatus]=useState<SharedStatus>(initial);
  const model=modelRef.current;
  useEffect(()=>{
    if(!enabled || !model)return;
    const unsubscribe=model.subscribe(setStatus);setStatus(model.state);void model.load();
    const focus=()=>{void model.load();};window.addEventListener('focus',focus);
    return()=>{unsubscribe();window.removeEventListener('focus',focus);};
  },[enabled,model]);
  const backing:SharedBacking|undefined=enabled && model?{payload:status.payload,set:model.set.bind(model)}:undefined;
  return {enabled,status,model,backing};
}
export type SharedFinanceController=ReturnType<typeof useSharedFinance>;
