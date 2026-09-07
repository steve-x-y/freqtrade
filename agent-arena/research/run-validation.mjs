import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {backtest,defaults,equity} from '../lib/engine.ts';
const dir=path.dirname(new URL(import.meta.url).pathname);
const raw=fs.readFileSync(path.join(dir,'data/BTCUSDT-5m.csv'),'utf8');
const lines=raw.trim().split(/\r?\n/);const header=lines.shift().split(',');
const index=Object.fromEntries(header.map((v,i)=>[v,i]));
const candles=lines.map(line=>{const c=line.split(',');return {time:Number(c[index.dateTime]),open:Number(c[index.open]),high:Number(c[index.high]),low:Number(c[index.low]),close:Number(c[index.close]),volume:Number(c[index.volume])};});
const invalid=candles.filter((c,i)=>![c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)||c.open<=0||c.close<=0||c.low<=0||c.volume<0||c.low>Math.min(c.open,c.close)||c.high<Math.max(c.open,c.close)||(i&&c.time-candles[i-1].time!==300000));
if(invalid.length)throw new Error(`Invalid/noncontiguous candles: ${invalid.length}`);
// Drop the mirror's last row conservatively: it may have been collected before close.
const data=candles.slice(0,-1);
const z=1.959963984540054;
function wilson(w,n){if(!n)return null;const p=w/n,den=1+z*z/n,center=(p+z*z/(2*n))/den,margin=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;return [center-margin,center+margin];}
function report(label,input,feeBps){
 const result=backtest(input,{...defaults,feeBps});
 const rows=result.agents.map(a=>{
  const closed=result.trades.filter(t=>t.agent===a.id&&t.action==='SELL'),grossProfit=closed.filter(t=>t.realized>0).reduce((v,t)=>v+t.realized,0),grossLoss=-closed.filter(t=>t.realized<0).reduce((v,t)=>v+t.realized,0);
  return {id:a.id,name:a.name,closedTrades:a.closed,wins:a.wins,losses:closed.filter(t=>t.realized<0).length,breakeven:closed.filter(t=>t.realized===0).length,winrate:a.closed?a.wins/a.closed:null,winrateWilson95:wilson(a.wins,a.closed),equity:equity(a,result.price),netPnl:equity(a,result.price)-defaults.capital,return:equity(a,result.price)/defaults.capital-1,maxDrawdown:a.drawdown,fees:a.fees,profitFactor:grossLoss?grossProfit/grossLoss:null,expectancy:a.closed?a.realized/a.closed:null,halted:a.halted,haltTime:result.trades.find(t=>t.agent===a.id&&t.reason.startsWith('Maximum drawdown'))?.time??null,openBTC:a.quantity,realized:a.realized};
 });
 const closed=rows.reduce((n,a)=>n+a.closedTrades,0),wins=rows.reduce((n,a)=>n+a.wins,0);
 return {label,feeBps,slippageBps:defaults.slippageBps,bars:input.length,start:input[30].time,end:input.at(-1).time,benchmarkReturn:result.history.at(-1).benchmark/defaults.capital-1,pooledWinrate:closed?wins/closed:null,totalClosed:closed,totalWins:wins,equalCapitalReturn:rows.reduce((v,a)=>v+a.return,0)/5,agents:rows};
}
// The app's rules and parameters were fixed before obtaining this dataset.
// No parameter optimization or winner selection is performed here.
const split=Math.floor(data.length*.7);
const runs=[report('Full history · application default costs',data,40),report('First 70% · chronological diagnostic',data.slice(0,split),40),report('Last 30% · chronological holdout; fixed rules',data.slice(split-30),40),report('Full history · lower-cost sensitivity (10 bps)',data,10),report('Full history · higher-cost sensitivity (60 bps)',data,60)];
const months=[...new Set(data.map(c=>new Date(c.time).toISOString().slice(0,7)))];
const monthly=months.map(month=>{const first=data.findIndex(c=>new Date(c.time).toISOString().startsWith(month)),last=data.findLastIndex(c=>new Date(c.time).toISOString().startsWith(month));return report(month+' · fresh portfolio',data.slice(Math.max(0,first-30),last+1),40);});
const output={generatedAt:new Date().toISOString(),engine:'rules baseline only; no LLM decisions',market:'BTC/USDT',exchangeLabel:'Binance, mirrored research dataset; not Kraken live fills',timeframe:'5m',source:{repository:'fiit-ba/ML-for-arbitrage-in-cryptoexchanges',path:'dataset/Binance_data_BTCUSDT_5m.csv',gitBlobSha:'b858a91a338ae43c63711274d6d22793f754dd0a',localSha256:crypto.createHash('sha256').update(raw).digest('hex'),url:'https://github.com/fiit-ba/ML-for-arbitrage-in-cryptoexchanges/blob/main/dataset/Binance_data_BTCUSDT_5m.csv'},dataAudit:{rawRows:candles.length,rowsUsed:data.length,duplicates:0,gaps:0,invalidRows:0,lastRowExcluded:true,first:data[0].time,last:data.at(-1).time},method:{startingCapitalPerAgent:10000,maxExposure:defaults.maxExposure,maxDrawdown:defaults.maxDrawdown,stopLoss:defaults.stopLoss,fill:'next candle open plus adverse slippage',exit:'rule/risk at observation; no intrabar stop simulation; open positions marked to market',winDefinition:'closed position with realized profit strictly positive after both fees and slippage',confidenceInterval:'Wilson binomial 95%; descriptive only, trades can be dependent',monthly:'Independent freshly funded monthly diagnostics; not one continuous live account',aiTested:false,liveTradingTested:false},runs,monthly};
fs.writeFileSync(path.join(dir,'validation-results.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({dataAudit:output.dataAudit,primary:runs[0],holdout:runs[2],monthly:monthly.map(m=>({label:m.label,closed:m.totalClosed,winrate:m.pooledWinrate,return:m.equalCapitalReturn}))},null,2));
