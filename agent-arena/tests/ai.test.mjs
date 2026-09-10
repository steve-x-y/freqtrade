import test from 'node:test';import assert from 'node:assert/strict';
import {encrypt,decrypt,aiDecision} from '../lib/ai.ts';import {initial,defaults} from '../lib/engine.ts';
test('stored API keys are encrypted and isolated by owner',async()=>{
 const c={provider:'xai',key:'test-secret-value',models:['test-model']},secret='a'.repeat(48);
 const value=await encrypt(c,secret,'owner-a');assert.ok(!value.includes(c.key));assert.deepEqual(await decrypt(value,secret,'owner-a'),c);
 await assert.rejects(()=>decrypt(value,secret,'owner-b'));await assert.rejects(()=>decrypt(value,'b'.repeat(48),'owner-a'));
});
test('provider failure never fabricates a rule-based AI decision',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>new Response('{}',{status:429});
 const candles=Array.from({length:40},(_,i)=>({time:i*300000,open:100,high:101,low:99,close:100,volume:1}));
 try{await assert.rejects(()=>aiDecision(initial().agents[0],candles,{...defaults,model:'test-model'},{provider:'xai',key:'test',models:['test-model']}),/AI request failed/);}finally{globalThis.fetch=previous;}
});
