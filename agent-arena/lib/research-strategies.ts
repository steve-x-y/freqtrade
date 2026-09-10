import type { Agent, Candle, Decision, Settings } from './engine.ts';

export const DAILY_MS = 86_400_000;
export const RESEARCH_WARMUP = 201;
export const researchStyles: Record<string, string> = {
  atlas: 'Daily trend: MA20/100 with MA200 regime and cost hysteresis.',
  nova: 'Daily filtered dip: RSI14 below 35 only in an MA50/200 uptrend.',
  pulse: 'Daily momentum: 28-day trend with MA200 regime filter.',
  vex: 'Daily breakout: prior 55-day high, prior 20-day low exit.',
  sage: 'Daily conservative consensus: two of three trend votes, half exposure.',
};
export function roundTripFriction(s: Pick<Settings, 'feeBps' | 'slippageBps'>): number {
  const f=s.feeBps/10000, p=s.slippageBps/10000;
  return ((1+f)*(1+p))/((1-f)*(1-p))-1;
}
export function researchDecision(a: Agent, candles: Candle[], s: Settings): Decision {
  const base: Decision={action:'HOLD',allocation:0,confidence:0,reason:'Daily research warmup requires 201 completed candles.',source:'Research V2 · rules, not AI'};
  if(candles.length<RESEARCH_WARMUP)return base;
  const xs=candles.slice(-RESEARCH_WARMUP), prices=xs.map(c=>c.close),last=prices.at(-1)!;
  const mean=(n:number)=>prices.slice(-n).reduce((v,p)=>v+p,0)/n;
  const m20=mean(20),m50=mean(50),m100=mean(100),m200=mean(200);
  const diffs=prices.slice(-15).slice(1).map((v,i)=>v-prices.slice(-15)[i]);
  const gain=diffs.reduce((v,d)=>v+Math.max(0,d),0),loss=diffs.reduce((v,d)=>v+Math.max(0,-d),0);
  const rsi=gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);
  const momentum=last/prices.at(-29)!-1,band=roundTripFriction(s);
  let buy=false,sell=false,reason='';
  if(a.id==='atlas') {buy=m20>m100*(1+band)&&last>m200;sell=m20<m100||last<m200*(1-band);reason=`Daily MA20/100 regime; friction band ${(band*100).toFixed(2)}%.`;}
  if(a.id==='nova') {buy=rsi<35&&last>m200&&m50>m200;sell=rsi>60||last<m200;reason=`Daily RSI ${rsi.toFixed(1)}; dip entries require a long-term uptrend.`;}
  if(a.id==='pulse') {buy=momentum>2*band&&last>m200;sell=momentum<0||last<m200*(1-band);reason=`28-day momentum ${(momentum*100).toFixed(2)}%; MA200 regime filter.`;}
  if(a.id==='vex') {const high=Math.max(...xs.slice(-56,-1).map(c=>c.high)),low=Math.min(...xs.slice(-21,-1).map(c=>c.low));buy=last>high*(1+band)&&last>m100;sell=last<low;reason='55-day breakout with a cost buffer; 20-day channel exit.';}
  if(a.id==='sage') {const votes=Number(m50>m200)+Number(momentum>band)+Number(last>m100);buy=votes>=2;sell=votes===0;reason=`Daily trend consensus ${votes}/3; half-size entry.`;}
  const decisionTime=xs.at(-1)!.time+DAILY_MS;
  if(a.quantity===0&&a.lastExit!==undefined&&decisionTime-a.lastExit<3*DAILY_MS)return {...base,reason:'Three-day cooldown after exit; no automatic re-entry.'};
  return {...base,action:a.quantity>0?(sell?'SELL':'HOLD'):(buy?'BUY':'HOLD'),allocation:s.maxExposure*(a.id==='sage'?.5:1),reason};
}
