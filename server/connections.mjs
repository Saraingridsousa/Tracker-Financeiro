import {readFileSync} from 'node:fs';
export function readConnectionsFile(file,{optional=false}={}){
 let text;try{text=readFileSync(file,'utf8')}catch(error){if(optional&&error.code==='ENOENT')return[];throw new Error('Não foi possível ler o mapeamento privado de conexões.')}
 let rows;try{rows=JSON.parse(text)}catch{throw new Error('Mapeamento privado de conexões inválido: use uma lista JSON de itemId e label.')}
 if(!Array.isArray(rows)||rows.length>5||rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['itemId','label'].includes(k))||typeof r.itemId!=='string'||!/^\b[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}\b$/i.test(r.itemId)||typeof r.label!=='string'||!r.label.trim()||r.label.length>120)||new Set(rows.map(r=>r.itemId.toLowerCase())).size!==rows.length)throw new Error('Mapeamento privado de conexões inválido. Confira UUIDs, nomes e limite de cinco itens.');
 return rows.map(({itemId,label})=>({itemId,label}));
}
