interface D1Result<T=unknown>{results:T[];success:boolean;meta:{changes:number;[key:string]:unknown};}
interface D1PreparedStatement{bind(...values:unknown[]):D1PreparedStatement;run<T=unknown>():Promise<D1Result<T>>;first<T=unknown>(column?:string):Promise<T|null>;all<T=unknown>():Promise<D1Result<T>>;raw<T=unknown>():Promise<T[]>;}
interface D1Database{prepare(query:string):D1PreparedStatement;batch<T=unknown>(statements:D1PreparedStatement[]):Promise<D1Result<T>[]>;exec(query:string):Promise<{count:number;duration:number}>;}
interface Fetcher{fetch(request:Request):Promise<Response>}
declare module 'cloudflare:workers'{export const env:{DB:D1Database;KEY_ENCRYPTION_SECRET:string;[key:string]:unknown};}
