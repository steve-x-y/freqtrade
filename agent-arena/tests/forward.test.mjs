import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,defaults,equity} from '../lib/engine.ts';
import {observe,forwardFill,closeAllPaper,validateQuote} from '../lib/forward.ts';
import {getCandles,getQuote} from '../lib/market.ts';
const now=Date.parse('2026-09-08T12:00:00Z');
const quote=(bid=100,ask=100.1,t=now)=>({bid,ask,requestedAt:t,receivedAt:t});
const buy={action:'BUY',allocation:.1,confidence:0,reason:'test',source:'test'};
const hold={...buy,action:'HOLD'},sell={...buy,action:'SELL'};
const fresh=()=>initial({...defaults,maxExposure:.1,feeBps:80,stopLoss:.1});
test('forward buy fills at ask and sell at bid with fees and reconciled equity',()=>{
 const s=fresh(),a=s.agents[0],q=quote();observe(s,q,now);const b=forwardFill(s,a,buy,q,now,null);
 assert.equal(b.price,q.ask*1.0005);assert.ok(a.quantity*q.bid/equity(a,q.bid)<=.1+1e-12);
 const t=forwardFill(s,a,sell,q,now,null);assert.equal(t.price,q.bid*.9995);assert.ok(t.realized<0);assert.ok(Math.abs(a.cash-10000-a.realized)<1e-8);
});
test('wide spread blocks entries but permits liquidation',()=>{
 const s=fresh(),a=s.agents[0];observe(s,quote(),now);forwardFill(s,a,buy,quote(),now,null);
 const q=quote(100,105),block=observe(s,q,now);forwardFill(s,s.agents[1],buy,q,now,block);assert.equal(s.agents[1].quantity,0);assert.equal(s.forward.blockedEntries,1);
 assert.ok(forwardFill(s,a,sell,q,now,block));assert.equal(a.quantity,0);
});
test('stale/crossed/future quotes never mutate holdings',()=>{
 const s=fresh(),a=s.agents[0];observe(s,quote(),now);const before=JSON.stringify(a);
 for(const q of [quote(101,100),quote(100,101,now-16000),quote(100,101,now+1)])assert.throws(()=>forwardFill(s,a,buy,q,now,null),/Quote/);
 assert.equal(JSON.stringify(a),before);
});
test('monitoring gap blocks the next entry and is excluded from coverage',()=>{
 const s=fresh();observe(s,quote(),now);observe(s,quote(100,100.1,now+35000),now+35000);
 const t=now+180000,q=quote(100,100.1,t),block=observe(s,q,t);assert.match(block,/gap/);assert.equal(s.forward.monitoredMs,35000);assert.equal(s.forward.gaps,1);
 forwardFill(s,s.agents[0],buy,q,t,block);assert.equal(s.agents[0].quantity,0);
});
test('daily equity loss liquidates and persists through pause/start and serialization',()=>{
 const s=initial({...defaults,maxExposure:.35,stopLoss:.5,maxDrawdown:.5,feeBps:0,slippageBps:0});const q=quote(100,100);observe(s,q,now);forwardFill(s,s.agents[0],{...buy,allocation:.35},q,now,null);
 const down=quote(90,90,now+35000);observe(s,down,now+35000);forwardFill(s,s.agents[0],hold,down,now+35000,null);assert.equal(s.agents[0].quantity,0);assert.deepEqual(s.forward.dayBlocked,['atlas']);
 const resumed=JSON.parse(JSON.stringify(s));resumed.running=true;forwardFill(resumed,resumed.agents[0],buy,down,now+35000,null);assert.equal(resumed.agents[0].quantity,0);
 const tomorrow=now+86400000,q2=quote(100,100,tomorrow);observe(resumed,q2,tomorrow);forwardFill(resumed,resumed.agents[0],buy,q2,tomorrow,null);assert.ok(resumed.agents[0].quantity>0);
});
test('emergency closing includes all agents even in single mode and is idempotent',()=>{
 const s=fresh(),q=quote();observe(s,q,now);for(const a of s.agents)forwardFill(s,a,buy,q,now,null);
 s.settings.mode='single';s.running=true;closeAllPaper(s,q,now);assert.equal(s.running,false);assert.ok(s.agents.every(a=>a.quantity===0));const n=s.trades.length;closeAllPaper(s,q,now);assert.equal(s.trades.length,n);
});
test('failed emergency quote pauses without inventing an exit',()=>{
 const s=fresh();observe(s,quote(),now);forwardFill(s,s.agents[0],buy,quote(),now,null);s.running=true;const q=s.agents[0].quantity;
 assert.throws(()=>closeAllPaper(s,quote(0,0),now));assert.equal(s.running,false);assert.equal(s.agents[0].quantity,q);
});
test('loss caused by entry friction is liquidated immediately',()=>{
 const s=initial({...defaults,maxExposure:.95,feeBps:200,slippageBps:200,stopLoss:.5,maxDrawdown:.5});observe(s,quote(),now);forwardFill(s,s.agents[0],{...buy,allocation:.95},quote(),now,null);
 assert.equal(s.agents[0].quantity,0);assert.ok(s.forward.dayBlocked.includes('atlas'));assert.equal(s.trades.length,2);
});
test('market adapter preserves bid/ask and rejects missing candle intervals',async()=>{
 const old=global.fetch;global.fetch=async url=>Response.json({error:[],result:String(url).includes('Ticker')?{XXBTZUSD:{a:['101'],b:['100']}}:{XXBTZUSD:Array.from({length:60},(_,i)=>[(i+(i>30?1:0))*300,'100','102','99','101','0','50'])}});
 try{const q=await getQuote();assert.equal(q.ask,101);assert.equal(q.bid,100);validateQuote(q,Date.now());await assert.rejects(()=>getCandles(),/invalid/);}finally{global.fetch=old;}
});
