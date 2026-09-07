import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { initial, identities, execute, ruleDecision, mark, backtest, type State } from '@/lib/engine';
import { ensure, lock, save, unlock } from '@/lib/store';
import { getCandles, getPrice } from '@/lib/market';
import { checkConnection, encrypt, decrypt, aiDecision, providers } from '@/lib/ai';
export const dynamic='force-dynamic';
const settingsSchema=z.object({mode:z.enum(['arena','single']),selected:z.enum(['atlas','nova','pulse','vex','sage']),driver:z.enum(['rules','ai']),capital:z.number().min(100).max(1000000),maxExposure:z.number().min(.01).max(.95),maxDrawdown:z.number().min(.01).max(.5),stopLoss:z.number().min(.005).max(.5),feeBps:z.number().min(0).max(200),slippageBps:z.number().min(0).max(200),model:z.string().max(150)}).strict();
function owner(request:Request){const id=request.headers.get('oai-authenticated-user-id');if(!id)throw new Error('Sign in with ChatGPT to access your saved arena.');return id;}
function secret(){return (env as unknown as Record<string,string>).KEY_ENCRYPTION_SECRET;}
function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
async function summary(value:string|null,id:string){if(!value)return null;const c=await decrypt(value,secret(),id);return {provider:c.provider,name:providers[c.provider].name,models:c.models};}
export async function GET(request:Request){
  try{const id=owner(request),row=await ensure(id);return json({state:JSON.parse(row.state),connection:await summary(row.connection,id),busy:row.lock_until>Date.now()});}
  catch(e){return json({error:e instanceof Error?e.message:'Could not load arena.'},request.headers.get('oai-authenticated-user-id')?503:401);}
}
export async function POST(request:Request){
  let id='',token='';
  try{
    id=owner(request);
    const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)return json({error:'Invalid request origin.'},403);
    if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'JSON required.'},415);
    const text=await request.text();if(text.length>12000)return json({error:'Request too large.'},413);
    const body=JSON.parse(text);
    const locked=await lock(id);token=locked.token;let state=locked.state;let connectionValue=locked.row.connection;
    if(body.action==='connect'){
      const p=z.object({provider:z.enum(['xai','deepseek','openrouter']),key:z.string().min(10).max(1000)}).parse(body.connection);
      if(state.running)throw new Error('Pause trading before changing the AI connection.');
      const c=await checkConnection(p.provider,p.key);connectionValue=await encrypt(c,secret(),id);
      state.settings.model='';state.settings.driver='rules';
    }else if(body.action==='disconnect'){
      state.running=false;state.settings.driver='rules';state.settings.model='';connectionValue=null;
    }else if(body.action==='configure'){
      const settings=settingsSchema.parse(body.settings);
      if(state.running||state.cycle>0)throw new Error('Start a new session before changing trading settings. Export the current session first.');
      if(settings.driver==='ai'){
        if(!connectionValue)throw new Error('Connect an AI provider first.');
        const c=await decrypt(connectionValue,secret(),id);if(!c.models.includes(settings.model))throw new Error('Choose a model supplied by your AI provider.');
      }
      state=initial(settings);
    }else if(body.action==='reset'){
      if(state.running)throw new Error('Pause trading before starting a new session.');
      state=initial(state.settings);
    }else if(body.action==='start'){
      if(state.settings.driver==='ai'&&(!connectionValue||!state.settings.model))throw new Error('Connect AI and select a model first.');
      state.running=true;state.error=null;
    }else if(body.action==='pause'){state.running=false;
    }else if(body.action==='market'){
      state.candles=await getCandles();state.price=await getPrice();
    }else if(body.action==='backtest'){
      const candles=await getCandles();const result=backtest(candles,state.settings);
      await unlock(id,token);token='';return json({backtest:result});
    }else if(body.action==='tick'){
      if(!state.running)throw new Error('Start the session before running a cycle.');
      if(Date.now()-state.lastTick<25000)throw new Error('Wait 30 seconds between cycle checks.');
      state.lastTick=Date.now();
      try{
        const candles=await getCandles(),last=candles.at(-1)!;
        if(Date.now()-(last.time+100000)>420000 || last.time>Date.now())throw new Error('Market candles are stale. No orders were executed.');
        state.candles=candles;
        if(last.time>state.lastCandle){
          const active=state.agents.filter(a=>state.settings.mode==='arena'||a.id===state.settings.selected);
          const c=state.settings.driver==='ai'&&connectionValue?await decrypt(connectionValue,secret(),id):null;
          // All agents receive one immutable completed-candle snapshot. Model calls run concurrently.
          const results=await Promise.allSettled(active.map(a=>c&&!a.halted?aiDecision(a,candles,state.settings,c):Promise.resolve({decision:ruleDecision(a,candles),tokens:0})));
          const price=await getPrice(),time=Date.now();
          for(let i=0;i<active.length;i++){
            const result=results[i];
            if(result.status==='rejected'){
              const decision={action:'HOLD' as const,allocation:0,confidence:0,reason:result.reason instanceof Error?result.reason.message:'AI request failed.',source:'Provider error'};
              const t=execute(active[i],decision,price,time,state.settings);if(t)state.trades.push(t);
            }else{
              state.tokens+=result.value.tokens;if(c&&!active[i].halted)state.aiCalls++;
              const t=execute(active[i],result.value.decision,price,time,state.settings);if(t)state.trades.push(t);
            }
          }
          state.lastCandle=last.time;state.cycle++;mark(state,price,time);
          state.trades=state.trades.slice(-1000);state.error=null;
          if(active.every(a=>a.halted))state.running=false;
        }else{
          // Risk checks still run between decision candles while the browser is active.
          const price=await getPrice(),time=Date.now();
          for(const a of state.agents.filter(a=>state.settings.mode==='arena'||a.id===state.settings.selected)){
            const previous=a.decision;
            const t=execute(a,{action:'HOLD',allocation:0,confidence:0,reason:'Between-candle risk check.',source:'Risk manager'},price,time,state.settings);
            if(t)state.trades.push(t);else if(previous&&!a.halted)a.decision=previous;
          }
          mark(state,price,time);state.trades=state.trades.slice(-1000);
        }
      }catch(e){state.error=e instanceof Error?e.message:'Market cycle failed.';state.running=false;}
    }else throw new Error('Unknown action.');
    await save(id,token,state,connectionValue);token='';return json({state,connection:await summary(connectionValue,id)});
  }catch(e){return json({error:e instanceof z.ZodError?'Check your settings. One or more values are invalid.':e instanceof Error?e.message:'Request failed.'},id?400:401);}
  finally{if(token)await unlock(id,token);}
}
