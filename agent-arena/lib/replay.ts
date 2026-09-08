import { initial, execute, equity, strategyDecision, mark, type Candle, type Settings, type Agent, type State, type Decision } from './engine.ts';
export type RiskPolicy='reference'|'fixed10'|'risk1';
export type PathOrder='high-first'|'low-first';
const hold:Decision={action:'HOLD',allocation:0,confidence:0,reason:'Intrabar risk observation.',source:'OHLC replay'};
export function allocationCap(s:Settings, policy:RiskPolicy){
 const f=s.feeBps/10000,l=s.slippageBps/10000;
 const friction=(1+f)*(1+l)/((1-f)*(1-l))-1;
 return Math.min(s.maxExposure,policy==='reference'?s.maxExposure:policy==='fixed10'?.1:.01/(s.stopLoss+friction));
}
export function replaySegment(a:Agent, from:number, to:number, time:number, s:Settings){
 // Ascending prices only update the peak. Descending prices may cross a barrier.
 let observed=to;let crossed=false;
 if(a.quantity>0&&to<from){
  const stop=a.basis/a.quantity*(1-s.stopLoss);
  const drawdown=(a.peak*(1-s.maxDrawdown)-a.cash)/a.quantity;
  const barrier=Math.max(stop,drawdown);
  if(barrier<=from&&barrier>=to){ observed=barrier;crossed=true; }
 }
 const t=execute(a,crossed?{...hold,action:'SELL',reason:'Intrabar risk barrier crossed.',source:'Risk manager'}:hold,observed,time,s);
 if(1-equity(a,observed)/a.peak>=s.maxDrawdown-1e-12)a.halted=true;
 return t;
}
export function replay(candles:Candle[],s:Settings,policy:RiskPolicy,order:PathOrder,start:number,end:number):State{
 const state=initial({...s,driver:'rules'});
 const execution={...s,maxExposure:allocationCap(s,policy)};
 for(let i=201;i<candles.length;i++){
  const c=candles[i];if(c.time<start||c.time>end)continue;
  if(!Object.values(c).every(Number.isFinite)||c.low<=0||c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close))throw new Error('Invalid OHLC');
  const past=candles.slice(i-201,i);
  const nodes=order==='high-first'?[c.open,c.high,c.low,c.close]:[c.open,c.low,c.high,c.close];
  for(const a of state.agents){
   if(s.mode==='single'&&a.id!==s.selected)continue;
   // Check opening gaps before a strategy can enter or exit.
   const gap=execute(a,hold,c.open,c.time,execution);if(gap)state.trades.push(gap);
   const d=strategyDecision(a,past,{...s,feeBps:80});
   const t=execute(a,d,c.open,c.time,execution);if(t)state.trades.push(t);
   for(let j=1;j<nodes.length;j++){const fill=replaySegment(a,nodes[j-1],nodes[j],c.time+j,execution);if(fill)state.trades.push(fill);}
  }
  mark(state,c.close,c.time);state.cycle++;
 }
 if(state.history.length){
  for(const a of state.agents){const t=execute(a,{...hold,action:'SELL',reason:'Terminal liquidation.'},state.price,state.history.at(-1)!.time+4,execution);if(t)state.trades.push(t);}
  state.history.at(-1)!.values=Object.fromEntries(state.agents.map(a=>[a.id,equity(a,state.price)]));
 }
 return state;
}
