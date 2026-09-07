import { indicators, validateDecision, equity, type Agent, type Candle, type Settings } from './engine.ts';
export const providers = {xai:{name:'xAI / Grok',base:'https://api.x.ai/v1'},deepseek:{name:'DeepSeek',base:'https://api.deepseek.com'},openrouter:{name:'OpenRouter',base:'https://openrouter.ai/api/v1'}};
export type Connection = {provider:keyof typeof providers;key:string;models:string[]};
export async function checkConnection(provider:keyof typeof providers,key:string):Promise<Connection>{
  if(!providers[provider]||key.length<10||key.length>1000)throw new Error('Choose a provider and enter a valid API key.');
  const r=await fetch(`${providers[provider].base}/models`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error(`Provider connection failed (${r.status}). Check your API key and account.`);
  const j=await r.json() as {data:{id:string}[]};
  const models=(j.data??[]).map(m=>m.id).filter(m=>typeof m==='string').sort();
  if(!models.length)throw new Error('Provider returned no available models.');
  return {provider,key,models};
}
export async function aiDecision(a:Agent,candles:Candle[],settings:Settings,connection:Connection){
  if(!settings.model||!connection.models.includes(settings.model))throw new Error('Select an available model in settings.');
  const prompt={market:'BTC/USD spot',timeframe:'5 minutes',asOf:new Date(candles.at(-1)!.time+300000).toISOString(),indicators:indicators(candles),recentCandles:candles.slice(-30),portfolio:{cash:a.cash,btc:a.quantity,equity:equity(a,candles.at(-1)!.close),costBasis:a.basis},limits:{maxExposure:settings.maxExposure,stopLoss:settings.stopLoss,maxDrawdown:settings.maxDrawdown},lastDecision:a.decision??null};
  const r=await fetch(`${providers[connection.provider].base}/chat/completions`,{method:'POST',signal:AbortSignal.timeout(40000),headers:{Authorization:`Bearer ${connection.key}`,'Content-Type':'application/json'},body:JSON.stringify({model:settings.model,messages:[{role:'system',content:`You are ${a.name}, an independent paper-trading agent. ${a.style} Only BTC/USD spot is available. No leverage, shorts, external tools or invented news. Base decisions exclusively on supplied completed candles. BUY means target fraction of equity, SELL means close the BTC position, HOLD means do nothing. Consider round-trip fees and slippage. Output only a JSON object with action (BUY, SELL or HOLD), allocation (number 0 to ${settings.maxExposure}), confidence (number 0 to 1), reason (brief evidence-based explanation). Confidence is self-reported, not a calibrated probability.`},{role:'user',content:JSON.stringify(prompt)}],response_format:{type:'json_object'},max_tokens:600})});
  if(!r.ok)throw new Error(`AI request failed (${r.status}). No fallback trade was substituted.`);
  const j=await r.json() as {choices?:{message:{content:string}}[];usage?:{total_tokens:number}};
  const raw=j.choices?.[0]?.message?.content;if(!raw)throw new Error('AI returned no decision.');
  const decision=validateDecision(JSON.parse(raw),`${providers[connection.provider].name} / ${settings.model}`);
  return {decision,tokens:j.usage?.total_tokens??0};
}
function bytes64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes));}
function from64(s:string){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
async function keyFor(secret:string){
  if(!secret||secret.length<32)throw new Error('Secure key storage is not configured on this server.');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function encrypt(c:Connection,secret:string,owner:string){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(owner)},await keyFor(secret),new TextEncoder().encode(JSON.stringify(c)));
  return JSON.stringify({v:1,iv:bytes64(iv),data:bytes64(new Uint8Array(cipher))});
}
export async function decrypt(value:string,secret:string,owner:string):Promise<Connection>{
  const j=JSON.parse(value);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(j.iv),additionalData:new TextEncoder().encode(owner)},await keyFor(secret),from64(j.data));
  return JSON.parse(new TextDecoder().decode(plain));
}
