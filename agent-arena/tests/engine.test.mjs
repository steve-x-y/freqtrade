import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,execute,equity,defaults,validateDecision,backtest,indicators} from '../lib/engine.ts';
const buy={action:'BUY',allocation:.3,confidence:.8,reason:'Test decision',source:'test'};
const sell={...buy,action:'SELL'};
const hold={...buy,action:'HOLD'};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('buy and sell accounting conserves balances and includes both fees',()=>{
 const a=initial().agents[0];const b=execute(a,buy,100,1,defaults);close(a.cash,6988);close(a.quantity,3000/100.05);close(a.basis,3012);close(a.fees,12);
 const s=execute(a,sell,110,2,defaults);close(a.cash,10000+s.realized);close(a.realized,s.realized);assert.equal(a.quantity,0);assert.equal(a.closed,1);assert.equal(a.wins,1);close(a.fees,b.fee+s.fee);
});
test('risk cap limits exposure and repeated targets do not drain cash',()=>{
 const a=initial().agents[0];execute(a,{...buy,allocation:1},100,1,defaults);
 assert.ok(a.quantity*100<=3500);for(let i=0;i<100;i++)execute(a,{...buy,allocation:1},100,2+i,defaults);
 assert.ok(a.cash>=6400);assert.ok(a.quantity*100/equity(a,100)<.351);
});
test('stop loss closes at observed price including gap and fees',()=>{
 const a=initial().agents[0];execute(a,buy,100,1,defaults);const trade=execute(a,hold,80,2,defaults);
 assert.equal(trade.action,'SELL');assert.equal(trade.source,'Risk manager');assert.ok(trade.price<80);assert.equal(a.quantity,0);assert.ok(a.realized<0);
});
test('drawdown liquidation permanently blocks re-entry',()=>{
 const a=initial().agents[0];execute(a,buy,100,1,defaults);execute(a,hold,50,2,defaults);assert.equal(a.halted,true);assert.equal(a.quantity,0);
 assert.equal(execute(a,buy,100,3,defaults),null);assert.equal(a.quantity,0);
});
test('invalid model responses and invalid prices cannot execute',()=>{
 for(const d of [{...buy,allocation:NaN},{...buy,allocation:3},{...buy,confidence:-1},{...buy,action:'SHORT'},{...buy,reason:''}])assert.throws(()=>validateDecision(d,'test'));
 const a=initial().agents[0];assert.throws(()=>execute(a,buy,NaN,1,defaults));assert.equal(a.cash,10000);
});
test('flat data yields neutral RSI and no invented gain',()=>{
 const candles=Array.from({length:100},(_,i)=>({time:i*300000,open:100,high:100,low:100,close:100,volume:1}));
 assert.equal(indicators(candles).rsi,50);const result=backtest(candles,defaults);assert.equal(result.trades.length,0);assert.ok(result.agents.every(a=>a.cash===10000));
});
test('future price changes cannot alter past backtest fills',()=>{
 const candles=Array.from({length:120},(_,i)=>({time:i*300000,open:100+i,high:101+i,low:99+i,close:100.5+i,volume:1}));
 const first=backtest(candles,defaults),changed=candles.map((c,i)=>i<90?c:{...c,open:c.open*2,high:c.high*2,low:c.low*2,close:c.close*2});
 const second=backtest(changed,defaults),cutoff=90*300000;
 assert.deepEqual(first.trades.filter(t=>t.time<cutoff),second.trades.filter(t=>t.time<cutoff));
 for(const t of first.trades){const bar=candles.find(c=>c.time===t.time);close(t.price,bar.open*(t.action==='BUY'?1.0005:.9995));}
});
test('single bot cannot mutate inactive portfolios',()=>{
 const candles=Array.from({length:100},(_,i)=>({time:i*300000,open:100+i,high:101+i,low:99+i,close:100.5+i,volume:1}));
 const r=backtest(candles,{...defaults,mode:'single',selected:'atlas'});assert.ok(r.agents.filter(a=>a.id!=='atlas').every(a=>a.cash===10000&&a.quantity===0&&a.trades===0));
});
