import {execute,equity,mark, type State,type Agent,type Decision,type Trade} from './engine.ts';
export type Quote={bid:number;ask:number;requestedAt:number;receivedAt:number};
export const FORWARD_LIMITS={maxSpreadBps:25,maxQuoteAgeMs:15000,maxMonitorGapMs:90000,dailyLoss:.02} as const;
const hold:Decision={action:'HOLD',allocation:0,confidence:0,reason:'Forward risk check.',source:'Risk manager'};
export function validateQuote(q:Quote,now:number){
 if(![q.bid,q.ask,q.requestedAt,q.receivedAt,now].every(Number.isFinite)||q.bid<=0||q.ask<q.bid||q.requestedAt>q.receivedAt||q.receivedAt>now||now-q.requestedAt>FORWARD_LIMITS.maxQuoteAgeMs)throw new Error('Quote invalid or too old. No fill can be simulated.');
}
export function observe(state:State,q:Quote,now:number){
 validateQuote(q,now);
 const f=state.forward??={version:'bid-ask-v1',startedAt:now,lastObservation:0,observations:0,monitoredMs:0,gaps:0,maxGapMs:0,blockedEntries:0,quote:null,day:'',dayEquity:{},dayBlocked:[],lastBlock:null};
 const gap=f.observations?now-f.lastObservation:0;
 if(gap<0)throw new Error('Observation clock moved backwards.');
 if(gap>FORWARD_LIMITS.maxMonitorGapMs){f.gaps++;f.maxGapMs=Math.max(f.maxGapMs,gap);}else f.monitoredMs+=gap;
 f.lastObservation=now;f.observations++;
 const spreadBps=(q.ask-q.bid)/((q.ask+q.bid)/2)*10000;
 f.quote={bid:q.bid,ask:q.ask,receivedAt:q.receivedAt,spreadBps};
 const day=new Date(now).toISOString().slice(0,10);
 if(f.day!==day){f.day=day;f.dayEquity=Object.fromEntries(state.agents.map(a=>[a.id,equity(a,state.price||q.bid)]));f.dayBlocked=[];}
 f.lastBlock=spreadBps>FORWARD_LIMITS.maxSpreadBps?'Spread exceeds 25 bps. New entries blocked.':gap>FORWARD_LIMITS.maxMonitorGapMs?'Monitoring gap exceeds 90 seconds. New entries skipped for this check.':null;
 return f.lastBlock;
}
export function forwardFill(state:State,a:Agent,d:Decision,q:Quote,now:number,entryBlock:string|null):Trade|null{
 validateQuote(q,now);
 const f=state.forward;if(!f)throw new Error('Observe the quote before execution.');
 const opening=f.dayEquity[a.id];
 if(!Number.isFinite(opening)||opening<=0)throw new Error('Daily equity reference is invalid.');
 if(equity(a,q.bid)<=opening*(1-FORWARD_LIMITS.dailyLoss)&&!f.dayBlocked.includes(a.id))f.dayBlocked.push(a.id);
 const dailyBlocked=f.dayBlocked.includes(a.id);
 if(dailyBlocked&&d.action==='BUY')f.blockedEntries++;
 if(dailyBlocked)d={...hold,action:a.quantity>0?'SELL':'HOLD',reason:'2% daily equity loss limit. No re-entry before the next UTC day.'};
 if(d.action==='BUY'&&entryBlock){f.blockedEntries++;d={...hold,reason:entryBlock};}
 // Risk marks and sells use bid; buys use ask. Slippage remains additional.
 const t=execute(a,d,q.bid,now,state.settings,q.ask);
 if(t)state.trades.push(t);
 if(1-equity(a,q.bid)/a.peak>=state.settings.maxDrawdown-1e-12){
  a.halted=true;
  if(a.quantity>0){const close=execute(a,{...hold,action:'SELL',reason:'Drawdown limit reached after execution costs.'},q.bid,now,state.settings,q.ask);if(close)state.trades.push(close);}
 }
 // Entry costs can themselves breach the daily limit; enforce immediately.
 if(!dailyBlocked&&equity(a,q.bid)<=opening*(1-FORWARD_LIMITS.dailyLoss)){
  if(!f.dayBlocked.includes(a.id))f.dayBlocked.push(a.id);
  if(a.quantity>0){const close=execute(a,{...hold,action:'SELL',reason:'Daily loss limit reached after execution costs.'},q.bid,now,state.settings,q.ask);if(close)state.trades.push(close);}
 }
 return t;
}
export function finishObservation(state:State,q:Quote,now:number){mark(state,q.bid,now);state.trades=state.trades.slice(-1000);}
export function closeAllPaper(state:State,q:Quote,now:number){
 state.running=false;observe(state,q,now);
 for(const a of state.agents){if(a.quantity>0)forwardFill(state,a,{...hold,action:'SELL',reason:'User requested close all paper positions.'},q,now,null);}
 finishObservation(state,q,now);state.error=null;
}
export const readinessBlockers=[
 'Broker account and exchange order reconciliation are not connected.',
 'Continuous server monitoring and exchange-hosted protective orders are not deployed.',
 'The selected strategy has not passed prospective paper evaluation after all costs.',
 'Historical tests used rule decisions; real AI inference performance has not been verified.',
];
