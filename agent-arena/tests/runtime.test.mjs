import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
test('Worker routes: auth, origin, owner isolation, market cycle, duplicate prevention and error pause',async()=>{
 let feedFails=false;
 const current=Math.floor(Date.now()/300000)*300;
 const bars=Array.from({length:101},(_,i)=>[current-(100-i)*300,String(100+i),String(102+i),String(99+i),String(101+i),'0','50',2]);
 const mf=new Miniflare({modules:true,scriptPath:root+'/dist/server/index.js',modulesRoot:root+'/dist/server',modulesRules:[{type:'ESModule',include:['**/*.js','**/*.mjs']}],compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'arena-runtime-test'},bindings:{KEY_ENCRYPTION_SECRET:'test-only-encryption-key-at-least-32-chars'},outboundService:async(request)=>{
  if(feedFails)return new Response('unavailable',{status:503});
  const url=new URL(request.url);assert.equal(url.hostname,'api.kraken.com');
  return Response.json({error:[],result:url.pathname.endsWith('OHLC')?{XXBTZUSD:bars,last:current}:{XXBTZUSD:{a:['201'],b:['200']}}});
 }});
 try{
  const db=await mf.getD1Database('DB');await db.exec((await readFile(root+'/drizzle/0000_wakeful_malice.sql','utf8')).replace(/\n/g,' '));
  const req=async(action,extra={},owner='alice',origin='https://arena.test')=>{
    const r=await mf.dispatchFetch('https://arena.test/api/arena',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'oai-authenticated-user-id':owner},body:JSON.stringify({action,...extra})});return {status:r.status,data:await r.json()};
  };
  assert.equal((await mf.dispatchFetch('https://arena.test/api/arena')).status,401);
  assert.equal((await req('start',{},'alice','https://evil.test')).status,403);
  const first=await mf.dispatchFetch('https://arena.test/api/arena',{headers:{'oai-authenticated-user-id':'alice'}});assert.equal(first.status,200);
  const page=await mf.dispatchFetch('https://arena.test/');assert.equal(page.status,200);const html=await page.text();assert.match(html,/Your agents\. One arena\./);assert.match(html,/PAPER EXECUTION/);assert.ok(!html.includes('Starter Project'));
  assert.equal((await req('start')).status,200);
  const [one,two]=await Promise.all([req('tick'),req('tick')]);assert.ok([one,two].some(r=>r.status===200));
  const saved=await (await mf.dispatchFetch('https://arena.test/api/arena',{headers:{'oai-authenticated-user-id':'alice'}})).json();
  assert.equal(saved.state.cycle,1);assert.equal(saved.state.lastCandle,(current-300)*1000);assert.ok(saved.state.trades.length>0);
  assert.ok(saved.state.trades.every(t=>t.source==='Rules baseline'));
  assert.equal((await req('tick')).status,400);
  const bob=await (await mf.dispatchFetch('https://arena.test/api/arena',{headers:{'oai-authenticated-user-id':'bob'}})).json();assert.equal(bob.state.cycle,0);assert.equal(bob.state.trades.length,0);
  await db.prepare("UPDATE arenas SET state=json_set(state,'$.lastTick',0) WHERE owner=?").bind('alice').run();
  const repeat=await req('tick');assert.equal(repeat.data.state.cycle,1);assert.equal(repeat.data.state.trades.length,saved.state.trades.length);
  const before=JSON.stringify(repeat.data.state);const bt=await req('backtest');assert.equal(bt.status,200);assert.ok(bt.data.backtest.cycle>0);
  const after=await(await mf.dispatchFetch('https://arena.test/api/arena',{headers:{'oai-authenticated-user-id':'alice'}})).json();assert.equal(JSON.stringify(after.state),before);
  await db.prepare("UPDATE arenas SET state=json_set(state,'$.lastTick',0) WHERE owner=?").bind('alice').run();feedFails=true;
  const failure=await req('tick');assert.equal(failure.data.state.running,false);assert.match(failure.data.state.error,/unavailable/);assert.equal(failure.data.state.trades.length,saved.state.trades.length);
 }finally{await mf.dispose();}
});
