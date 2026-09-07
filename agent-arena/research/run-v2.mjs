import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {backtest, defaults, equity} from '../lib/engine.ts';
const dir=import.meta.dirname;
const day=86400000;
const settings={...defaults,strategyVersion:'research-v2',stopLoss:.1,feeBps:80};
const read=(file)=>fs.readFileSync(path.join(dir,'data',file),'utf8');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function load(file){
 const raw=read(file),lines=raw.trim().split(/\r?\n/),header=lines.shift().split(',');
 assert.equal(header.join(','),'date,open,high,low,close,volume');
 const rows=lines.map(line=>{const [date,...values]=line.split(',');const [open,high,low,close,volume]=values.map(Number);return {time:Date.parse(date+'T00:00:00Z'),open,high,low,close,volume};});
 let gaps=0;for(let i=0;i<rows.length;i++){const c=rows[i];assert.ok(Object.values(c).every(Number.isFinite));assert.ok(c.open>0&&c.close>0&&c.low>0&&c.volume>=0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close));if(i){assert.ok(c.time>rows[i-1].time);if(c.time-rows[i-1].time!==day)gaps++;}}
 assert.equal(gaps,0,'Daily dataset has gaps; investigate before evaluating.');
 return {candles:rows.slice(0,-1),audit:{rawRows:rows.length,usedRows:rows.length-1,first:rows[0].time,lastUsed:rows.at(-2).time,sha256:sha(raw),invalid:0,gaps,duplicates:0,lastRowExcluded:true}};
}
const btc=load('BTCUSDT-1d.csv'),eth=load('ETHUSDT-1d.csv');
// Independent mirror comparison of historical OHLC; final source row may be incomplete.
const cross=read('BTCUSDT-crosscheck.csv').trim().split(/\r?\n/).slice(1,-1),map=new Map(btc.candles.map(c=>[new Date(c.time).toISOString().slice(0,10),c]));
let checked=0,mismatches=0;for(const line of cross){const c=line.split(','),a=map.get(c[1]);if(!a)continue;checked++;if(['open','high','low','close'].some((key,i)=>Math.abs(a[key]-Number(c[i+2]))>.011))mismatches++;}
assert.equal(mismatches,0,'Cross-mirror OHLC mismatch.');
function interval(w,n){if(!n)return null;const z=1.95996398454,p=w/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,m=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [c-m,c+m];}
function bootstrap(returns){let seed=1729;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};const values=[];for(let k=0;k<1000;k++){let log=0,n=0;while(n<returns.length){const start=Math.floor(rand()*returns.length);for(let j=0;j<14&&n<returns.length;j++,n++)log+=Math.log1p(returns[(start+j)%returns.length]);}values.push(Math.expm1(log));}values.sort((a,b)=>a-b);return [values[25],values[974]];}
function benchmark(candles,start,end,fraction,feeBps){const bars=candles.filter(c=>c.time>=start&&c.time<=end),f=feeBps/10000,slip=.0005,capital=10000,amount=capital*fraction/(1+f),q=amount/(bars[0].open*(1+slip)),cash=capital-amount*(1+f);let peak=capital,dd=0;for(const c of bars){const e=cash+q*c.open;peak=Math.max(peak,e);dd=Math.max(dd,1-e/peak);}const final=cash+q*bars.at(-1).open*(1-slip)*(1-f);dd=Math.max(dd,1-final/peak);return {return:final/capital-1,maxDrawdown:dd,entryAllocation:fraction,terminalLiquidation:true};}
function run(label,data,start,end,feeBps=80,lagBars=0,withBootstrap=false){
 const result=backtest(data.candles,{...settings,feeBps},{startTime:Date.parse(start),endTime:Date.parse(end),lagBars,liquidate:true,signalFeeBps:80});
 const actualStart=result.history[0].time,actualEnd=result.history.at(-1).time;
 const agents=result.agents.map(a=>{const closed=result.trades.filter(t=>t.agent===a.id&&t.action==='SELL'),profits=closed.reduce((v,t)=>v+Math.max(t.realized,0),0),losses=-closed.reduce((v,t)=>v+Math.min(t.realized,0),0);let streak=0,maxStreak=0;for(const t of closed){streak=t.realized<0?streak+1:0;maxStreak=Math.max(maxStreak,streak);}let previous=settings.capital;const returns=result.history.map(p=>{const r=p.values[a.id]/previous-1;previous=p.values[a.id];return r;});
 let q=0,active=0,index=0;const trades=result.trades.filter(t=>t.agent===a.id);for(const p of result.history){while(index<trades.length&&trades[index].time<=p.time){q+=trades[index].action==='BUY'?trades[index].quantity:-trades[index].quantity;index++;}if(q>1e-10)active++;}
 return {id:a.id,name:a.name,equity:equity(a,result.price),return:equity(a,result.price)/settings.capital-1,maxDrawdown:a.drawdown,closed:a.closed,wins:a.wins,winrate:a.closed?a.wins/a.closed:null,winrateWilson95:interval(a.wins,a.closed),fees:a.fees,profitFactor:losses?profits/losses:null,losses:closed.filter(t=>t.realized<0).length,expectancy:a.closed?a.realized/a.closed:null,halted:a.halted,stops:closed.filter(t=>t.reason.startsWith('Stop-loss')).length,forcedTerminalCloses:closed.filter(t=>t.reason.startsWith('Terminal')).length,maxLosingStreak:maxStreak,timeInMarket:active/result.history.length,bootstrapReturn95:withBootstrap?bootstrap(returns):null};});
 const wins=agents.reduce((s,a)=>s+a.wins,0),closed=agents.reduce((s,a)=>s+a.closed,0);
 return {label,start:new Date(actualStart).toISOString(),end:new Date(actualEnd).toISOString(),feeBps,signalFeeBps:80,slippageBps:5,lagBars,bars:result.history.length,agents,aggregate:{return:agents.reduce((s,a)=>s+a.return,0)/5,wins,closed,winrate:closed?wins/closed:null},benchmarks:{cash:0,initial35:benchmark(data.candles,actualStart,actualEnd,.35,feeBps),full:benchmark(data.candles,actualStart,actualEnd,1,feeBps)}};
}
const stage=process.argv[2];
if(stage==='develop'){
 const runs=[2018,2019,2020,2021].map(y=>run(String(y),btc,`${y}-01-01`,`${y}-12-31`));
 const median=xs=>{const a=[...xs].sort((a,b)=>a-b);return (a[1]+a[2])/2;};
 const ranked=runs[0].agents.map(a=>{const rows=runs.map(r=>r.agents.find(b=>b.id===a.id));return {id:a.id,score:median(rows.map(a=>a.return))-.5*Math.max(...rows.map(a=>a.maxDrawdown)),positiveYears:rows.filter(a=>a.return>0).length,closed:rows.reduce((s,a)=>s+a.closed,0)};}).sort((a,b)=>b.score-a.score);
 const top=ranked[0],selected=top.score>0&&top.positiveYears>=2&&top.closed>=5?top.id:'cash';
 const output={generatedAt:new Date().toISOString(),protocolSha256:sha(fs.readFileSync(path.join(dir,'EXPERIMENT-V2.md'))),strategySha256:sha(fs.readFileSync(path.join(dir,'../lib/research-strategies.ts'))),audit:{btc:btc.audit,eth:eth.audit,crossCheck:{checked,mismatches,fields:'OHLC',independentMirror:'Ruhguevara/Algorithmic_trading blob cafaaeca41df4e0ae65ee28a25a383a4b862ba39'}},settings,ranked,selected,development:runs};
 fs.writeFileSync(path.join(dir,'v2-selection.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({ranked,selected,audit:output.audit},null,2));
}else if(stage==='evaluate'){
 const selection=JSON.parse(fs.readFileSync(path.join(dir,'v2-selection.json'),'utf8'));
 assert.equal(selection.strategySha256,sha(fs.readFileSync(path.join(dir,'../lib/research-strategies.ts'))),'Strategy changed after selection.');
 assert.equal(selection.protocolSha256,sha(fs.readFileSync(path.join(dir,'EXPERIMENT-V2.md'))),'Protocol changed after selection.');
 const end=new Date(btc.candles.at(-1).time).toISOString();
 const validation=run('BTC validation 2022–2023',btc,'2022-01-01','2023-12-31',80,0,true);
 const final=run('BTC final chronological test',btc,'2024-01-01',end,80,0,true);
 const costs=[10,40,80,120].map(f=>run(`BTC final fee ${f}bps`,btc,'2024-01-01',end,f));
 const lag=run('BTC final extra one-day execution lag',btc,'2024-01-01',end,80,1);
 const external=run('ETH external-market robustness',eth,'2024-01-01',new Date(eth.candles.at(-1).time).toISOString(),80,0,true);
 const years=[2022,2023,2024,2025,2026].map(y=>run(`${y} independently funded`,btc,`${y}-01-01`,`${y}-12-31`));
 const checks=final.agents.map(a=>{const v=validation.agents.find(v=>v.id===a.id),stress=costs.at(-1).agents.find(v=>v.id===a.id);return {id:a.id,positiveValidation:v.return>0,positiveFinal:a.return>0,validationTradesAtLeast10:v.closed>=10,finalTradesAtLeast10:a.closed>=10,profitFactorAbove1:(a.profitFactor??0)>1&&(v.profitFactor??0)>1,positiveHighCost:stress.return>0};});
 const accepted=checks.filter(c=>Object.entries(c).every(([k,v])=>k==='id'||v===true)).map(c=>c.id);
 const output={generatedAt:new Date().toISOString(),selectionFileSha256:sha(fs.readFileSync(path.join(dir,'v2-selection.json'))),selectedBeforeValidation:selection.selected,settings,audit:selection.audit,validation,final,costs,lag,external,years,checks,acceptedForFurtherPaperResearch:accepted,aiTested:false,liveTested:false};
 fs.writeFileSync(path.join(dir,'v2-results.json'),JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify({selected:selection.selected,validation:validation.agents,final:final.agents,costs:costs.map(r=>({fee:r.feeBps,aggregate:r.aggregate})),accepted,external:external.aggregate},null,2));
}else throw new Error('Usage: node research/run-v2.mjs develop | evaluate');
