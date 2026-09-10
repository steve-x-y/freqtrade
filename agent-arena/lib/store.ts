import { env } from 'cloudflare:workers';
import { initial, type State } from './engine';
export type Row={owner:string;state:string;version:number;lock_token:string|null;lock_until:number;connection:string|null};
export function database(){if(!env.DB)throw new Error('Saved portfolios are temporarily unavailable.');return env.DB;}
export async function ensure(owner:string){
  const db=database();
  await db.prepare('INSERT OR IGNORE INTO arenas (owner,state) VALUES (?,?)').bind(owner,JSON.stringify(initial())).run();
  const row=await db.prepare('SELECT * FROM arenas WHERE owner=?').bind(owner).first<Row>();
  if(!row)throw new Error('Could not load your arena.');return row;
}
export async function lock(owner:string){
  await ensure(owner);const token=crypto.randomUUID(),now=Date.now();
  const result=await database().prepare('UPDATE arenas SET lock_token=?,lock_until=? WHERE owner=? AND lock_until<?').bind(token,now+120000,owner,now).run();
  if(!result.meta.changes)throw new Error('A cycle is already running. Please wait for it to finish.');
  const row=await ensure(owner);return {row,token,state:JSON.parse(row.state) as State};
}
export async function save(owner:string,token:string,state:State,connection?:string|null){
  const result=connection===undefined?
    await database().prepare('UPDATE arenas SET state=?,version=version+1,lock_token=NULL,lock_until=0 WHERE owner=? AND lock_token=? AND lock_until>?').bind(JSON.stringify(state),owner,token,Date.now()).run():
    await database().prepare('UPDATE arenas SET state=?,connection=?,version=version+1,lock_token=NULL,lock_until=0 WHERE owner=? AND lock_token=? AND lock_until>?').bind(JSON.stringify(state),connection,owner,token,Date.now()).run();
  if(!result.meta.changes)throw new Error('Cycle expired. Results were not saved. Refresh before continuing.');
}
export async function unlock(owner:string,token:string){await database().prepare('UPDATE arenas SET lock_token=NULL,lock_until=0 WHERE owner=? AND lock_token=?').bind(owner,token).run();}
