import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const nativeRequire=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..');
const cache=new Map();
function load(file){
 if(cache.has(file))return cache.get(file);
 if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'));
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};cache.set(file,module.exports);
 const resolve=id=>{if(!id.startsWith('@/'))return nativeRequire(id);const base=path.join(root,id.slice(2)),candidate=[base,base+'.ts',base+'.tsx',base+'.json'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());if(!candidate)throw new Error(`Missing authored import: ${id}`);return load(candidate);};
 new Function('require','module','exports',code)(resolve,module,module.exports);return module.exports;
}
test('research report server-renders complete numeric results, warnings and evidence links',()=>{
 const Page=load(path.join(root,'app/research/page.tsx')).default;
 const html=renderToStaticMarkup(React.createElement(Page));
 for(const expected of ['lang="id"','+5.25%','46.43%','+1.95%','75.00%','0 / 5','Pulse −10,01%','Tidak ada kandidat lolos semua gerbang','href="/"','https://www.kraken.com/features/fee-schedule'])assert.ok(html.includes(expected),`Missing ${expected}`);
 assert.equal((html.match(/<h2>/g)||[]).length,9);
 assert.ok(html.includes('/blob/codex/agent-arena-20260907/agent-arena/research/v2-results.json'));
 assert.ok(!html.includes('undefined'));assert.ok(!html.includes('NaN'));
});
