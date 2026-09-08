// Actual route handlers with in-memory persistence and market fixtures; no network or Worker runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {initial,defaults,execute} from '../lib/engine.ts';
const nativeRequire=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..');
function harness(){
 let state=initial({...defaults,stopLoss:.5,maxDrawdown:.5}),failQuote=false,failCandles=false,locked=false;
 const q=()=>({bid:90,ask:90.01,requestedAt:Date.now(),receivedAt:Date.now()});
 const store={lock:async()=>{if(locked)throw new Error('busy');locked=true;return {token:'fixture',state:structuredClone(state),row:{connection:null}};},save:async(_id,_token,s)=>{state=structuredClone(s);locked=false;},unlock:async()=>{locked=false;}};
 const market={getQuote:async()=>{if(failQuote)throw new Error('Fixture feed unavailable');return q();},getCandles:async()=>{if(failCandles)throw new Error('Fixture candles unavailable');const t=Math.floor(Date.now()/300000)*300000;return Array.from({length:100},(_,i)=>({time:t-(100-i)*300000,open:100,high:101,low:99,close:100,volume:10}));}};
 const cache=new Map();
 function load(file){if(cache.has(file))return cache.get(file);const module={exports:{}};cache.set(file,module.exports);
 const resolve=id=>{if(id==='cloudflare:workers')return {env:{}};if(id==='@/lib/store')return store;if(id==='@/lib/market')return market;
 if(!id.startsWith('@/')&&!id.startsWith('.'))return nativeRequire(id);
 const base=id.startsWith('@/')?path.join(root,id.slice(2)):path.resolve(path.dirname(file),id);const found=[base,base+'.ts'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());return load(found);};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(resolve,module,module.exports);return module.exports;}
 const route=load(path.join(root,'app/api/arena/route.ts'));
 return {set:s=>state=structuredClone(s),state:()=>state,quoteFails:()=>failQuote=true,candlesFail:()=>failCandles=true,post:async action=>{const r=await route.POST(new Request('https://arena.test/api/arena',{method:'POST',headers:{Origin:'https://arena.test','Content-Type':'application/json','oai-authenticated-user-id':'alice'},body:JSON.stringify({action})}));return {status:r.status,body:await r.json()};}};
}
function positioned(){const s=initial({...defaults,stopLoss:.5,maxDrawdown:.5});execute(s.agents[0],{action:'BUY',allocation:.35,confidence:0,source:'fixture',reason:'fixture'},100,Date.now()-100000,s.settings);s.running=true;s.price=100;s.cycle=1;return s;}
test('route persists paused state and open position when emergency feed fails',async()=>{const h=harness();h.set(positioned());h.quoteFails();const r=await h.post('close-all');assert.equal(r.status,200);assert.equal(h.state().running,false);assert.ok(h.state().agents[0].quantity>0);assert.match(h.state().error,/positions remain open/);});
test('route cannot reset open holdings and repeated emergency close does not duplicate fills',async()=>{const h=harness();const s=positioned();s.running=false;h.set(s);assert.equal((await h.post('reset')).status,400);assert.equal((await h.post('close-all')).status,200);assert.equal(h.state().agents[0].quantity,0);const n=h.state().trades.length;await h.post('close-all');assert.equal(h.state().trades.length,n);});
test('route runs position risk checks before a candle failure and persists the exit',async()=>{const h=harness();h.set(positioned());h.candlesFail();const r=await h.post('tick');assert.equal(r.status,200);assert.equal(h.state().running,false);assert.equal(h.state().agents[0].quantity,0);assert.ok(h.state().forward.dayBlocked.includes('atlas'));assert.match(h.state().error,/candles unavailable/);assert.equal(h.state().trades.length,1);});
test('50 dollar demo starts one rules bot and resumes without overwriting a running session',async()=>{const h=harness();const r=await h.post('demo50');assert.equal(r.status,200);const s=h.state();assert.equal(s.settings.capital,50);assert.equal(s.settings.mode,'single');assert.equal(s.settings.selected,'atlas');assert.equal(s.settings.driver,'rules');assert.equal(s.running,true);assert.equal(s.trades.length,0);assert.equal((await h.post('demo50')).status,200);assert.equal(h.state().settings.capital,50);});

test('new demo archives an old session without discarding its ledger',async()=>{const h=harness();h.set(positioned());const r=await h.post('demo50-new');assert.equal(r.status,200);assert.equal(h.state().settings.capital,50);assert.equal(h.state().archives.length,1);const old=JSON.parse(h.state().archives[0].snapshot);assert.equal(old.agents[0].quantity,0);assert.equal(old.trades.length,1);});
test('failed quote during replacement preserves old holdings and does not start demo',async()=>{const h=harness();h.set(positioned());h.quoteFails();await h.post('demo50-new');assert.equal(h.state().settings.capital,10000);assert.equal(h.state().running,false);assert.ok(h.state().agents[0].quantity>0);assert.match(h.state().error,/old positions remain open/);});
