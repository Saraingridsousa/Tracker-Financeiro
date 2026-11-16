import type { BackupPayload, AssetPosition, InvestmentOrder } from '../src/types/finance';
export type SharedPayload = BackupPayload & { assets: AssetPosition[]; investmentOrders: InvestmentOrder[] };
export interface SharedEnvelope { revision:number; payload:SharedPayload|null }
export interface SharedStatus extends SharedEnvelope { ready:boolean;busy:boolean;error:string;draft:SharedPayload|null }
export interface SharedApi { load():Promise<SharedEnvelope>;save(revision:number,payload:SharedPayload):Promise<SharedEnvelope> }
export function createSharedApi(fetcher?:typeof fetch):SharedApi;
export class FinanceState {
 constructor(api:SharedApi,options?:{persistDraft?:(payload:SharedPayload|null)=>void;recovery?:SharedPayload|null});
 state:SharedStatus;
 subscribe(listener:(state:SharedStatus)=>void):()=>void;
 load(discard?:boolean):Promise<boolean>;
 discardAndReload():Promise<boolean>;
 set<K extends Exclude<keyof SharedPayload,'exportedAt'>>(field:K,update:SharedPayload[K]|((value:SharedPayload[K])=>SharedPayload[K])):void;
 replace(payload:SharedPayload):void;
 restore(text:string):void;
}
