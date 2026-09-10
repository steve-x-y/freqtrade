import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {initial,defaults,backtest,execute,equity,intervalMinutes,strategyDecision} from '../lib/engine.ts';
import {researchDecision,roundTripFriction,DAILY_MS} from '../lib/research-strategies.ts';
import {getCandles} from '../lib/market.ts';
const s={...defaults,strategyVersion:'research-v2',feeBps:80,stopLoss:.1};
const bars=Array.from({length:500},(_,i)=>({time:i*DAILY_MS,open:100+i,high:102+i,low:99+i,close:101+i,volume:100}));
test('research timeframe and old settings remain backward compatible',()=>{
 assert.equal(intervalMinutes(defaults),5);assert.equal(intervalMinutes(s),1440);
 assert.match(initial(s).agents[0].style,/Daily/);assert.equal(initial().settings.strategyVersion,undefined);
});
test('daily research requires 201 completed candles and allows no flat-data invented entry',()=>{
 const a=initial(s).agents[0];assert.equal(researchDecision(a,bars.slice(0,200),s).action,'HOLD');
 const flat=bars.map(c=>({...c,open:100,high:100,low:100,close:100}));assert.ok(initial(s).agents.every(a=>researchDecision(a,flat,s).action==='HOLD'));
 assert.throws(()=>backtest(bars.slice(0,200),s),/Insufficient/);
});
test('three-day cooldown prevents immediate reentry after risk or strategy exit',()=>{
 const a=initial(s).agents[2],c=bars.slice(0,250),t=c.at(-1).time+DAILY_MS;
 assert.equal(researchDecision(a,c,s).action,'BUY');a.lastExit=t-2*DAILY_MS;assert.equal(researchDecision(a,c,s).action,'HOLD');a.lastExit=t-3*DAILY_MS;assert.equal(researchDecision(a,c,s).action,'BUY');
});
test('friction threshold equals exact modeled round-trip breakeven',()=>{
 const ratio=(1+.008)*(1+.0005)/((1-.008)*(1-.0005));assert.ok(Math.abs(roundTripFriction(s)-(ratio-1))<1e-12);
 const a=initial(s).agents[0];execute(a,{action:'BUY',allocation:.35,confidence:0,reason:'test',source:'test'},100,1,s);
 const fill=execute(a,{action:'SELL',allocation:0,confidence:0,reason:'test',source:'test'},100*ratio,2,s);assert.ok(Math.abs(fill.realized)<1e-8);
});
test('daily replay is causal and extra lag uses earlier signals',()=>{
 const a=backtest(bars,s),mutated=bars.map((c,i)=>i<350?c:{...c,open:10,high:10,low:10,close:10});
 const b=backtest(mutated,s);assert.deepEqual(a.trades.filter(t=>t.time<350*DAILY_MS),b.trades.filter(t=>t.time<350*DAILY_MS));
 const one=backtest(bars,{...s,mode:'single',selected:'pulse'},{lagBars:1});assert.ok(one.trades[0].time>=202*DAILY_MS);
 assert.throws(()=>backtest(bars,s,{lagBars:-1}),/lag/);
});
test('terminal liquidation reconciles cash, closed P&L and last marked equity',()=>{
 const r=backtest(bars,s,{liquidate:true});for(const a of r.agents){assert.equal(a.quantity,0);assert.ok(Math.abs(a.cash-s.capital-a.realized)<1e-7);assert.ok(Math.abs(r.history.at(-1).values[a.id]-a.cash)<1e-7);}
});
test('single research bot never trades inactive portfolios',()=>{
 const r=backtest(bars,{...s,mode:'single',selected:'pulse'},{liquidate:true});assert.ok(r.agents.filter(a=>a.id!=='pulse').every(a=>a.trades===0&&equity(a,r.price)===10000));
});
test('Kraken daily adapter requests daily candles and drops incomplete final row',async()=>{
 const original=global.fetch;let url='';global.fetch=async u=>{url=String(u);return Response.json({error:[],result:{XBTUSD:bars.map(c=>[c.time/1000,c.open,c.high,c.low,c.close,0,c.volume]),last:0}});};
 try{const data=await getCandles(1440);assert.match(url,/interval=1440/);assert.equal(data.length,499);assert.equal(data.at(-1).time,bars[498].time);await assert.rejects(()=>getCandles(60),/Unsupported/);}finally{global.fetch=original;}
});
test('frozen candidate source and protocol have not changed after development selection',()=>{
 const root=new URL('../research/',import.meta.url),selection=JSON.parse(fs.readFileSync(new URL('v2-selection.json',root)));
 const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
 assert.equal(hash(new URL('../lib/research-strategies.ts',root)),selection.strategySha256);
 assert.equal(hash(new URL('EXPERIMENT-V2.md',root)),selection.protocolSha256);assert.equal(selection.selected,'pulse');
 const results=JSON.parse(fs.readFileSync(new URL('v2-results.json',root)));assert.equal(results.selectedBeforeValidation,selection.selected);
 for(const run of [results.validation,results.final,...results.costs]){assert.equal(run.aggregate.closed,run.agents.reduce((n,a)=>n+a.closed,0));assert.equal(run.aggregate.wins,run.agents.reduce((n,a)=>n+a.wins,0));assert.ok(run.agents.every(a=>a.wins+a.losses<=a.closed));}
});
