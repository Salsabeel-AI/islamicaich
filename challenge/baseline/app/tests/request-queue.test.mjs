import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequestQueue} from '../src/request-queue.mjs';
import {createApp} from '../src/server.mjs';
import {readEvents} from '../public/sse.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const result=()=>Response.json({service:'fata',answer:'جواب محفوظ',conversation_id:randomUUID(),citations:[]});
async function setup(t,options){
 const app=await createApp({getKey:async()=> 'sals_'+'a'.repeat(64),...options});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));
 t.after(()=>{app.closeAllConnections();return new Promise(r=>app.close(r));});
 const base=`http://127.0.0.1:${app.address().port}`;
 const session=async()=> (await fetch(base+'/api/session')).headers.get('set-cookie').split(';')[0];
 const send=(cookie,input,stream=false,signal)=>fetch(base+'/api/chat',{method:'POST',signal,headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json',Accept:stream?'text/event-stream':'application/json'},body:JSON.stringify(input)});
 return {session,send};
}
test('FIFO is bounded and release is idempotent',async()=>{
 const q=createRequestQueue({maxWaiting:2,waitMs:1000});const a=await q.acquire();
 const b=q.acquire(),c=q.acquire();await assert.rejects(q.acquire(),{code:'queue_full'});
 a();a();const rb=await b;assert.deepEqual(q.snapshot(),{active:true,waiting:1});
 rb();const rc=await c;rc();assert.deepEqual(q.snapshot(),{active:false,waiting:0});
});
test('cancelled and expired waiters do not occupy the next slot',async()=>{
 const q=createRequestQueue({waitMs:15});const release=await q.acquire();
 const abort=new AbortController();const cancelled=q.acquire({signal:abort.signal});abort.abort();
 await assert.rejects(cancelled,{code:'queue_cancelled'});
 await assert.rejects(q.acquire(),{code:'queue_timeout'});release();
 const again=await q.acquire();again();assert.equal(q.snapshot().waiting,0);
});
test('two sessions queue with SSE progress; duplicates do not call upstream twice',async t=>{
 const gate=deferred(),entered=deferred();let calls=0,concurrent=0,max=0;
 const app=await setup(t,{fetchImpl:async()=>{calls++;concurrent++;max=Math.max(max,concurrent);if(calls===1){entered.resolve();await gate.promise;}concurrent--;return result();}});
 const a=await app.session(),b=await app.session();const ia={message:'الأول',request_id:randomUUID()},ib={message:'الثاني',request_id:randomUUID()};
 const first=app.send(a,ia);await entered.promise;
 const waiting=await app.send(b,ib,true);const events=readEvents(waiting.body);const progress=await events.next();
 assert.match(progress.value.data.label,/الانتظار/);assert.equal(calls,1);
 assert.equal((await app.send(b,ib)).status,429);
 gate.resolve();assert.equal((await first).status,200);
 const rest=[];for await(const e of events)rest.push(e);
 assert.ok(rest.some(e=>e.event==='final'));assert.equal(max,1);assert.equal(calls,2);
 assert.equal((await app.send(b,ib)).status,200);assert.equal(calls,2);
});
test('queued timeout releases the session without spending an upstream call',async t=>{
 const gate=deferred(),entered=deferred();let calls=0;
 const app=await setup(t,{queueWaitMs:20,fetchImpl:async()=>{calls++;if(calls===1){entered.resolve();await gate.promise;}return result();}});
 const a=await app.session(),b=await app.session();const input={message:'انتظار',request_id:randomUUID()};
 const first=app.send(a,{message:'الأول',request_id:randomUUID()});await entered.promise;
 const timeout=await app.send(b,input);assert.equal(timeout.status,429);assert.match((await timeout.json()).error.message,/مهلة الانتظار/);assert.equal(calls,1);
 gate.resolve();await first;assert.equal((await app.send(b,input)).status,200);assert.equal(calls,2);
});
test('upstream failure releases slot for next session',async t=>{
 const gate=deferred(),entered=deferred();let calls=0;
 const app=await setup(t,{fetchImpl:async()=>{if(++calls===1){entered.resolve();await gate.promise;throw new Error('upstream unavailable');}return result();}});
 const a=await app.session(),b=await app.session();const first=app.send(a,{message:'أ',request_id:randomUUID()});await entered.promise;
 const waiting=await app.send(b,{message:'ب',request_id:randomUUID()},true);const stream=readEvents(waiting.body);await stream.next();
 gate.resolve();assert.equal((await first).status,503);const events=[];for await(const event of stream)events.push(event);
 assert.ok(events.some(e=>e.event==='final'));assert.equal(calls,2);
});
test('disconnect while queued removes the waiter before upstream execution',async t=>{
 const gate=deferred(),entered=deferred();let calls=0;
 const app=await setup(t,{fetchImpl:async()=>{if(++calls===1){entered.resolve();await gate.promise;}return result();}});
 const a=await app.session(),b=await app.session();const input={message:'ب',request_id:randomUUID()};
 const first=app.send(a,{message:'أ',request_id:randomUUID()});await entered.promise;
 const abort=new AbortController();const waiting=await app.send(b,input,true,abort.signal);
 const events=readEvents(waiting.body);await events.next();abort.abort();
 await assert.rejects(events.next());
 // Allow the local TCP close event to reach the isolated HTTP server.
 await new Promise(r=>setTimeout(r,15));
 gate.resolve();await first;await new Promise(r=>setTimeout(r,15));assert.equal(calls,1);
 assert.equal((await app.send(b,input)).status,200);assert.equal(calls,2);
});
