import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { initial, strategyDecision, intervalMinutes, backtest } from '@/lib/engine';
import { ensure, lock, save, unlock } from '@/lib/store';
import { getCandles, getPrice, getQuote } from '@/lib/market';
import { checkConnection, encrypt, decrypt, aiDecision, providers } from '@/lib/ai';
import {observe,forwardFill,finishObservation,closeAllPaper} from '@/lib/forward';
import {startDemo50} from '@/lib/demo-session';
export const dynamic='force-dynamic';
const settingsSchema=z.object({mode:z.enum(['arena','single']),selected:z.enum(['atlas','nova','pulse','vex','sage']),driver:z.enum(['rules','ai']),capital:z.number().min(50).max(1000000),maxExposure:z.number().min(.01).max(.95),maxDrawdown:z.number().min(.01).max(.5),stopLoss:z.number().min(.005).max(.5),feeBps:z.number().min(0).max(200),slippageBps:z.number().min(0).max(200),model:z.string().max(150),strategyVersion:z.enum(['baseline','research-v2']).optional()}).strict();
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
      if(state.running||state.cycle>0||state.trades.length>0||state.forward?.observations)throw new Error('Start a new session before changing trading settings. Export the current session first.');
      if(settings.driver==='ai'){
        if(!connectionValue)throw new Error('Connect an AI provider first.');
        const c=await decrypt(connectionValue,secret(),id);if(!c.models.includes(settings.model))throw new Error('Choose a model supplied by your AI provider.');
      }
      state={...initial(settings),archives:state.archives};
    }else if(body.action==='reset'){
      if(state.running)throw new Error('Pause trading before starting a new session.');
      if(state.agents.some(a=>a.quantity>0))throw new Error('Close all paper positions before clearing the session.');
      state={...initial(state.settings),archives:state.archives};
    }else if(body.action==='demo50'){
      state=startDemo50(state);
    }else if(body.action==='demo50-new'){
      if((state.archives?.length??0)>=20)throw new Error('Archive limit reached. Export sessions before clearing this workspace.');
      // Close first; never discard holdings if a quote is unavailable.
      if(state.agents.some(a=>a.quantity>0)){
        state.running=false;
        try{const q=await getQuote();closeAllPaper(state,q,Date.now());}
        catch(e){state.error='Could not start $50: old positions remain open. '+(e instanceof Error?e.message:'Market unavailable.');await save(id,token,state,connectionValue);token='';return json({state,connection:await summary(connectionValue,id)});}
      }
      state=startDemo50(state,true);
    }else if(body.action==='start'){
      if(state.settings.driver==='ai'&&(!connectionValue||!state.settings.model))throw new Error('Connect AI and select a model first.');
      if(state.agents.filter(a=>state.settings.mode==='arena'||a.id===state.settings.selected).every(a=>a.halted))throw new Error('All selected agents are halted. Review and export this session.');
      state.running=true;state.error=null;
    }else if(body.action==='close-all'){
      state.running=false;
      try{const q=await getQuote();closeAllPaper(state,q,Date.now());}
      catch(e){state.error='Session paused; positions remain open. '+(e instanceof Error?e.message:'Unable to fetch an executable quote.');}
    }else if(body.action==='pause'){state.running=false;
    }else if(body.action==='market'){
      state.candles=await getCandles(intervalMinutes(state.settings));state.price=await getPrice();
    }else if(body.action==='backtest'){
      const candles=await getCandles(intervalMinutes(state.settings));const result=backtest(candles,state.settings);
      await unlock(id,token);token='';return json({backtest:result});
    }else if(body.action==='tick'){
      if(!state.running)throw new Error('Start the session before running a cycle.');
      if(Date.now()-state.lastTick<25000)throw new Error('Wait 30 seconds between cycle checks.');
      state.lastTick=Date.now();
      try{
        // Protect existing positions before candle/model requests can fail or stall.
        const riskQuote=await getQuote(),riskTime=Date.now(),initialBlock=observe(state,riskQuote,riskTime);
        for(const a of state.agents.filter(a=>state.settings.mode==='arena'||a.id===state.settings.selected)){
          forwardFill(state,a,{action:'HOLD',allocation:0,confidence:0,reason:'Pre-decision risk check.',source:'Risk manager'},riskQuote,riskTime,initialBlock);
        }
        finishObservation(state,riskQuote,riskTime);
        const duration=intervalMinutes(state.settings)*60000;
        const candles=await getCandles(intervalMinutes(state.settings)),last=candles.at(-1)!;
        if(Date.now()-(last.time+duration)>duration+120000 || last.time+duration>Date.now())throw new Error('Market candles are stale or incomplete. No orders were executed.');
        state.candles=candles;
        if(last.time>state.lastCandle){
          const active=state.agents.filter(a=>state.settings.mode==='arena'||a.id===state.settings.selected);
          const c=state.settings.driver==='ai'&&connectionValue?await decrypt(connectionValue,secret(),id):null;
          // All agents receive one immutable completed-candle snapshot. Model calls run concurrently.
          const results=await Promise.allSettled(active.map(a=>c&&!a.halted?aiDecision(a,candles,state.settings,c):Promise.resolve({decision:strategyDecision(a,candles,state.settings),tokens:0})));
          const quote=await getQuote(),time=Date.now(),entryBlock=observe(state,quote,time)||initialBlock;
          state.forward!.lastBlock=entryBlock;
          for(let i=0;i<active.length;i++){
            const result=results[i];
            if(result.status==='rejected'){
              const decision={action:'HOLD' as const,allocation:0,confidence:0,reason:result.reason instanceof Error?result.reason.message:'AI request failed.',source:'Provider error'};
              forwardFill(state,active[i],decision,quote,time,entryBlock);
            }else{
              state.tokens+=result.value.tokens;if(c&&!active[i].halted)state.aiCalls++;
              forwardFill(state,active[i],result.value.decision,quote,time,entryBlock);
            }
          }
          state.lastCandle=last.time;state.cycle++;finishObservation(state,quote,time);
          state.trades=state.trades.slice(-1000);state.error=null;
          if(active.every(a=>a.halted))state.running=false;
        }else{
          // Risk checks still run between decision candles while the browser is active.
          const quote=await getQuote(),time=Date.now(),entryBlock=observe(state,quote,time)||initialBlock;
          state.forward!.lastBlock=entryBlock;
          for(const a of state.agents.filter(a=>state.settings.mode==='arena'||a.id===state.settings.selected)){
            const previous=a.decision;
            const t=forwardFill(state,a,{action:'HOLD',allocation:0,confidence:0,reason:'Between-candle risk check.',source:'Risk manager'},quote,time,entryBlock);
            if(!t&&previous&&!a.halted&&!state.forward?.dayBlocked.includes(a.id))a.decision=previous;
          }
          finishObservation(state,quote,time);
        }
      }catch(e){state.error=e instanceof Error?e.message:'Market cycle failed.';state.running=false;}
    }else throw new Error('Unknown action.');
    await save(id,token,state,connectionValue);token='';return json({state,connection:await summary(connectionValue,id)});
  }catch(e){return json({error:e instanceof z.ZodError?'Check your settings. One or more values are invalid.':e instanceof Error?e.message:'Request failed.'},id?400:401);}
  finally{if(token)await unlock(id,token);}
}
