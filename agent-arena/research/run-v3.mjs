import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {defaults,equity} from '../lib/engine.ts';
import {replay} from '../lib/replay.ts';
const previous=JSON.parse(fs.readFileSync(new URL('./v2-results.json',import.meta.url)));
const rows=[];
for(const asset of ['BTC','ETH']){
 const raw=fs.readFileSync(new URL(`./data/${asset}USDT-1d.csv`,import.meta.url),'utf8');
 assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),previous.audit[asset.toLowerCase()].sha256);
 const candles=raw.trim().split(/\r?\n/).slice(1,-1).map(l=>{const [d,...v]=l.split(',');const [open,high,low,close,volume]=v.map(Number);return {time:Date.parse(d+'T00:00:00Z'),open,high,low,close,volume};});
 for(const period of ['2022–2023','2024–end'])for(const policy of ['reference','fixed10','risk1'])for(const path of ['high-first','low-first'])for(const fee of [80,120]){
  const start=Date.parse(period==='2022–2023'?'2022-01-01':'2024-01-01'),end=period==='2022–2023'?Date.parse('2023-12-31'):candles.at(-1).time;
  const state=replay(candles,{...defaults,strategyVersion:'research-v2',stopLoss:.1,feeBps:fee},policy,path,start,end);
  const agents=state.agents.map(a=>({id:a.id,return:equity(a,state.price)/defaults.capital-1,drawdown:a.drawdown,closed:a.closed,wins:a.wins,winrate:a.closed?a.wins/a.closed:null,halted:a.halted}));
  const closed=agents.reduce((s,a)=>s+a.closed,0),wins=agents.reduce((s,a)=>s+a.wins,0);
  rows.push({asset,period,policy,path,fee,start:new Date(start).toISOString().slice(0,10),end:new Date(end).toISOString().slice(0,10),return:agents.reduce((s,a)=>s+a.return,0)/5,closed,wins,winrate:closed?wins/closed:null,agents});
 }
}
const output={generatedAt:new Date().toISOString(),exploratory:true,liveTested:false,protocolSha256:crypto.createHash('sha256').update(fs.readFileSync(new URL('./EXPERIMENT-V3.md',import.meta.url))).digest('hex'),rows};
fs.writeFileSync(new URL('./v3-results.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(rows.filter(r=>r.asset==='BTC'&&r.period==='2024–end'&&r.fee===80),null,2));
