import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('private app opens safely when browser denies even reading localStorage',async()=>{
 const saved=Object.getOwnPropertyDescriptor(globalThis,'window');const vite=await createServer({configFile:false,plugins:[react()],server:{middlewareMode:true,hmr:false,ws:false,watch:{ignored:['**/*']}}});
 try {
  globalThis.window={location:{protocol:'https:'},get localStorage(){throw new DOMException('Storage blocked','SecurityError')}};
  const {default:App}=await vite.ssrLoadModule('/src/App.tsx');assert.match(renderToStaticMarkup(createElement(App)),/Dados compartilhados no PC/);
 }finally{if(saved)Object.defineProperty(globalThis,'window',saved);else delete globalThis.window;await vite.close();}
});

test('category text stays local while typing and commits only a valid final value',async()=>{
 const cells=[];let cursor=0;const saved=Object.getOwnPropertyDescriptor(globalThis,'__categoryHooks');
 globalThis.__categoryHooks={useState(initial){const i=cursor++;if(!(i in cells))cells[i]=initial;return[cells[i],value=>cells[i]=typeof value==='function'?value(cells[i]):value]},useRef(initial){const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i]},useEffect:fn=>fn(),useMemo:fn=>fn()};
 const vite=await createServer({configFile:false,plugins:[{name:'category-hooks',enforce:'pre',resolveId(id){if(id==='virtual:category-hooks')return '\0'+id},load(id){if(id==='\0virtual:category-hooks')return ['useState','useRef','useEffect','useMemo'].map(name=>'export const '+name+'=(...args)=>globalThis.__categoryHooks.'+name+'(...args);').join('\n')},transform(code,id){if(id.endsWith('/CategoryManagerModal.tsx'))return code.replace("from 'react'","from 'virtual:category-hooks'")}},react()],server:{middlewareMode:true,hmr:false,ws:false,watch:{ignored:['**/*']}}});
 try {
  const {CategoryTextInput}=await vite.ssrLoadModule('/src/components/CategoryManagerModal.tsx');assert.equal(typeof CategoryTextInput,'function');const commits=[];
  const render=()=>{cursor=0;return CategoryTextInput({value:'Original',label:'Nome',required:true,onCommit:v=>commits.push(v)})};
  let input=render();input.props.onFocus();input.props.onChange({target:{value:''}});input=render();assert.equal(input.props.value,'');assert.equal(commits.length,0);
  input.props.onChange({target:{value:'Renomeada'}});input=render();assert.equal(commits.length,0);input.props.onBlur();assert.deepEqual(commits,['Renomeada']);
  input=render();input.props.onFocus();input.props.onChange({target:{value:'   '}});input=render();input.props.onBlur();assert.deepEqual(commits,['Renomeada']);assert.equal(render().props.value,'Original');
 }finally{await vite.close();if(saved)Object.defineProperty(globalThis,'__categoryHooks',saved);else delete globalThis.__categoryHooks;}
});
