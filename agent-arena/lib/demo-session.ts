import {defaults,initial,type State} from './engine.ts';
export const isDemo50=(s:State)=>s.settings.capital===50&&s.settings.mode==='single'&&s.settings.selected==='atlas'&&s.settings.driver==='rules'&&(s.settings.strategyVersion??'baseline')==='baseline'&&s.settings.feeBps===80;
export function startDemo50(state:State,replace=false):State{
 if(isDemo50(state)&&!replace){
  if(state.agents.find(a=>a.id==='atlas')?.halted)throw new Error('Atlas reached its drawdown halt. Archive this session before starting a new one.');
  state.running=true;state.error=null;return state;
 }
 const used=state.running||state.cycle>0||state.trades.length>0||!!state.forward?.observations||state.agents.some(a=>a.quantity>0);
 if(used&&!replace)throw new Error('Archive the current session before starting the $50 session.');
 if(state.agents.some(a=>a.quantity>0))throw new Error('Close all paper positions before archiving this session.');
 const archives=state.archives??[];
 if(used){
  if(archives.length>=20)throw new Error('Archive limit reached. Export sessions before clearing this workspace.');
  const {archives:ignored,...snapshot}=state;
  archives.push({time:Date.now(),snapshot:JSON.stringify(snapshot)});
 }
 const next=initial({...defaults,mode:'single',selected:'atlas',capital:50,driver:'rules',strategyVersion:'baseline',feeBps:80});
 next.archives=archives;next.running=true;return next;
}
