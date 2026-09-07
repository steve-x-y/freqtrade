import type { Candle } from './engine';
export async function publicKraken(path: string) {
  const r=await fetch(`https://api.kraken.com/0/public/${path}`,{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
  if(!r.ok)throw new Error(`Kraken market feed unavailable (${r.status}). Trading is paused.`);
  const j=await r.json() as {error:string[];result:Record<string,unknown>};
  if(j.error?.length)throw new Error('Kraken rejected the market-data request. Try again later.');
  return j.result;
}
export async function getCandles():Promise<Candle[]> {
  const result=await publicKraken('OHLC?pair=XBTUSD&interval=5');
  const entry=Object.entries(result).find(([key])=>key!=='last');
  if(!entry||!Array.isArray(entry[1]))throw new Error('Market feed did not include candles.');
  const candles=(entry[1] as (string|number)[][]).slice(0,-1).map(c=>({time:Number(c[0])*1000,open:Number(c[1]),high:Number(c[2]),low:Number(c[3]),close:Number(c[4]),volume:Number(c[6])}));
  if(candles.length<50||candles.some((c,i)=>![c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)||c.open<=0||c.close<=0||c.low<=0||c.high<Math.max(c.open,c.close,c.low)||c.low>Math.min(c.open,c.close)||c.volume<0||(i>0&&c.time<=candles[i-1].time)))throw new Error('Market feed contains invalid candles.');
  return candles;
}
export async function getPrice():Promise<number>{
  const result=await publicKraken('Ticker?pair=XBTUSD');
  const pair=Object.values(result)[0] as {a:string[];b:string[]};
  const bid=Number(pair?.b?.[0]),ask=Number(pair?.a?.[0]);
  if(!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<bid)throw new Error('Market quote is invalid.');
  return (bid+ask)/2;
}
