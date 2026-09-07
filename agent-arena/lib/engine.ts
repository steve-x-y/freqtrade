export type Action = 'BUY' | 'SELL' | 'HOLD';
export type Decision = { action: Action; allocation: number; confidence: number; reason: string; source: string };
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type Agent = { id: string; name: string; style: string; color: string; cash: number; quantity: number; basis: number; realized: number; fees: number; peak: number; drawdown: number; halted: boolean; trades: number; wins: number; closed: number; decision?: Decision };
export type Trade = { id: string; agent: string; time: number; action: Action; price: number; quantity: number; fee: number; realized: number; reason: string; source: string };
export type Point = { time: number; values: Record<string, number>; benchmark: number };
export type Settings = { mode: 'arena' | 'single'; selected: string; driver: 'rules' | 'ai'; capital: number; maxExposure: number; maxDrawdown: number; stopLoss: number; feeBps: number; slippageBps: number; model: string };
export type State = { settings: Settings; agents: Agent[]; running: boolean; lastCandle: number; lastTick: number; startedAt: number; benchmarkPrice: number; history: Point[]; trades: Trade[]; error: string | null; candles: Candle[]; price: number; tokens: number; aiCalls: number; cycle: number };
export const identities = [
  { id: 'atlas', name: 'Atlas', style: 'Trend following: favor sustained direction and moving-average alignment.', color: '#69a8ff' },
  { id: 'nova', name: 'Nova', style: 'Mean reversion: look for oversold conditions; exit on recovery.', color: '#d69cff' },
  { id: 'pulse', name: 'Pulse', style: 'Momentum: seek accelerating price moves with volume confirmation.', color: '#5ce6be' },
  { id: 'vex', name: 'Vex', style: 'Breakouts: enter after a confirmed range breakout; protect against failed moves.', color: '#f5bf62' },
  { id: 'sage', name: 'Sage', style: 'Capital preservation: low exposure; favor stable trends and avoid volatility.', color: '#f8859d' },
];
export const defaults: Settings = { mode: 'arena', selected: 'atlas', driver: 'rules', capital: 10000, maxExposure: 0.35, maxDrawdown: 0.1, stopLoss: 0.05, feeBps: 40, slippageBps: 5, model: '' };
export function initial(settings: Settings = defaults): State {
  return { settings: { ...settings }, agents: identities.map(a => ({ ...a, cash: settings.capital, quantity: 0, basis: 0, realized: 0, fees: 0, peak: settings.capital, drawdown: 0, halted: false, trades: 0, wins: 0, closed: 0 })), running: false, lastCandle: 0, lastTick: 0, startedAt: 0, benchmarkPrice: 0, history: [], trades: [], error: null, candles: [], price: 0, tokens: 0, aiCalls: 0, cycle: 0 };
}
export const equity = (a: Agent, price: number) => a.cash + a.quantity * price;
const avg = (xs: number[]) => xs.reduce((a,b) => a+b,0)/xs.length;
export function indicators(candles: Candle[]) {
  if (candles.length < 30) throw new Error('At least 30 completed candles are required.');
  const prices = candles.map(c=>c.close), last = prices.at(-1)!;
  const p15=prices.slice(-15),diffs = p15.slice(1).map((v,i)=>v-p15[i]);
  const gain = avg(diffs.map(x=>Math.max(x,0))), loss = avg(diffs.map(x=>Math.max(-x,0)));
  const rsi = gain===0 && loss===0 ? 50 : loss===0 ? 100 : 100-100/(1+gain/loss);
  const p20=prices.slice(-20),returns = p20.slice(1).map((p,i)=>p/p20[i]-1);
  return { last, sma10: avg(prices.slice(-10)), sma30: avg(prices.slice(-30)), rsi, momentum: last/prices.at(-6)!-1, volatility: Math.sqrt(avg(returns.map(r=>r*r))), high20: Math.max(...candles.slice(-21,-1).map(c=>c.high)), low10: Math.min(...candles.slice(-11,-1).map(c=>c.low)), volumeRatio: candles.at(-1)!.volume / Math.max(avg(candles.slice(-21,-1).map(c=>c.volume)), 0.000001) };
}
export function ruleDecision(a: Agent, candles: Candle[]): Decision {
  const x=indicators(candles); let buy=false,sell=false, allocation=.3,reason='No entry or exit condition confirmed.';
  if(a.id==='atlas'){buy=x.sma10>x.sma30*1.001 && x.last>x.sma10;sell=x.sma10<x.sma30;reason=`SMA10 ${x.sma10.toFixed(2)} vs SMA30 ${x.sma30.toFixed(2)}.`;}
  if(a.id==='nova'){buy=x.rsi<30;sell=x.rsi>60;reason=`14-period RSI ${x.rsi.toFixed(1)}; entry below 30, exit above 60.`;}
  if(a.id==='pulse'){buy=x.momentum>.004&&x.volumeRatio>1.1;sell=x.momentum<-.002;reason=`Five-bar momentum ${(x.momentum*100).toFixed(2)}%, volume ${x.volumeRatio.toFixed(2)}×.`;}
  if(a.id==='vex'){buy=x.last>x.high20;sell=x.last<x.low10;reason=`Close ${x.last.toFixed(2)}; prior 20-bar high ${x.high20.toFixed(2)}.`;}
  if(a.id==='sage'){buy=x.sma10>x.sma30&&x.last>x.sma10&&x.volatility<.003;sell=x.sma10<x.sma30||x.volatility>.006;allocation=.15;reason=`Trend ${x.sma10>x.sma30?'positive':'negative'}; volatility ${(x.volatility*100).toFixed(2)}%.`;}
  return { action: a.quantity>0 ? (sell?'SELL':'HOLD') : (buy?'BUY':'HOLD'), allocation, confidence: 0.65, reason, source: 'Rules baseline' };
}
export function validateDecision(d: unknown, source: string): Decision {
  const v=d as Record<string,unknown>;
  if(!v || !['BUY','SELL','HOLD'].includes(String(v.action)) || typeof v.allocation!=='number' || !Number.isFinite(v.allocation) || v.allocation<0 || v.allocation>1 || typeof v.confidence!=='number' || !Number.isFinite(v.confidence) || v.confidence<0 || v.confidence>1 || typeof v.reason!=='string' || !v.reason.trim()) throw new Error('Model returned an invalid trading decision. No order was executed.');
  return {action:v.action as Action,allocation:v.allocation,confidence:v.confidence,reason:v.reason.slice(0,1200),source};
}
export function execute(a: Agent, d: Decision, price: number, time: number, s: Settings): Trade | null {
  if(!Number.isFinite(price)||price<=0) throw new Error('Invalid execution price.');
  d=validateDecision(d,d.source);
  const before=equity(a,price); a.peak=Math.max(a.peak,before); a.drawdown=Math.max(a.drawdown,1-before/a.peak);
  if(1-before/a.peak>=s.maxDrawdown){ a.halted=true; d={...d,action:a.quantity>0?'SELL':'HOLD',reason:'Maximum drawdown reached. Liquidate paper position and halt.',source:'Risk manager'}; }
  else if(a.quantity>0 && price <= a.basis/a.quantity*(1-s.stopLoss)) d={...d,action:'SELL',reason:'Stop-loss threshold reached at observed execution price.',source:'Risk manager'};
  if(a.halted && d.action==='BUY') d={...d,action:'HOLD',reason:'Agent halted by drawdown limit.',source:'Risk manager'};
  a.decision=d;
  const feeRate=s.feeBps/10000, slip=s.slippageBps/10000;
  let quantity=0,fee=0,realized=0; const fill=price*(d.action==='BUY'?1+slip:1-slip);
  if(d.action==='BUY'){
    const fraction=Math.min(d.allocation,s.maxExposure);
    const target=fraction*before;
    // Enforce the target against equity AFTER execution costs, including slippage.
    const exposurePerDollar=1/(1+slip);
    const denominator=exposurePerDollar+fraction*(1+feeRate-exposurePerDollar);
    const value=Math.min(a.cash/(1+feeRate),Math.max(0,(target-a.quantity*price)/denominator));
    if(value<10) return null;
    quantity=value/fill;fee=value*feeRate;a.cash-=value+fee;a.quantity+=quantity;a.basis+=value+fee;
  }else if(d.action==='SELL'&&a.quantity>0){
    quantity=a.quantity;const value=quantity*fill;fee=value*feeRate;realized=value-fee-a.basis;
    a.cash+=value-fee;a.realized+=realized;a.quantity=0;a.basis=0;a.closed++;if(realized>0)a.wins++;
  }else return null;
  a.fees+=fee;a.trades++;a.drawdown=Math.max(a.drawdown,1-equity(a,price)/a.peak);
  return {id:`${a.id}-${time}-${a.trades}`,agent:a.id,time,action:d.action,price:fill,quantity,fee,realized,reason:d.reason,source:d.source};
}
export function mark(state: State, price: number, time: number){
  state.price=price;if(!state.benchmarkPrice){state.benchmarkPrice=price;state.startedAt=time;}
  for(const a of state.agents){a.peak=Math.max(a.peak,equity(a,price));a.drawdown=Math.max(a.drawdown,1-equity(a,price)/a.peak);}
  const fee=state.settings.feeBps/10000,slip=state.settings.slippageBps/10000;
  const benchmark=state.settings.capital/(1+fee)/(state.benchmarkPrice*(1+slip))*price;
  state.history.push({time,values:Object.fromEntries(state.agents.map(a=>[a.id,equity(a,price)])),benchmark});
  state.history=state.history.slice(-1500);
}
export function backtest(candles: Candle[], settings: Settings): State {
  if(candles.length<50) throw new Error('Insufficient market history.');
  const state=initial({...settings,driver:'rules'});
  for(let i=30;i<candles.length;i++){
    const past=candles.slice(Math.max(0,i-31),i),bar=candles[i];
    for(const a of state.agents){
      if(settings.mode==='single'&&a.id!==settings.selected) continue;
      const t=execute(a,ruleDecision(a,past),bar.open,bar.time,settings);if(t)state.trades.push(t);
    }
    mark(state,bar.open,bar.time);state.cycle++;
  }
  state.candles=candles;return state;
}
