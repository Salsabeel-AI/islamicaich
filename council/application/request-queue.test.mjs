import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestQueue} from './request-queue.mjs';
test('second request waits and starts after first release, FIFO',async()=>{
 const queue=createRequestQueue();const first=await queue.acquire();const order=[];
 const second=queue.acquire({onWait:p=>assert.equal(p,1)}).then(release=>{order.push(2);return release});
 const third=queue.acquire({onWait:p=>assert.equal(p,2)}).then(release=>{order.push(3);return release});
 assert.deepEqual(order,[]);assert.equal(queue.snapshot().waiting,2);first();const release2=await second;
 assert.deepEqual(order,[2]);release2();(await third)();assert.deepEqual(order,[2,3]);assert.equal(queue.snapshot().active,false);
});
test('disconnected waiter is removed without consuming a slot',async()=>{
 const queue=createRequestQueue();const first=await queue.acquire();const control=new AbortController();
 const waiting=queue.acquire({signal:control.signal});control.abort();await assert.rejects(waiting,{code:'queue_cancelled'});
 assert.equal(queue.snapshot().waiting,0);first();(await queue.acquire())();assert.equal(queue.snapshot().active,false);
});
test('queue timeout removes only the timed-out request',async()=>{
 const queue=createRequestQueue({waitMs:15});const first=await queue.acquire();
 await assert.rejects(queue.acquire(),{code:'queue_timeout'});assert.equal(queue.snapshot().active,true);assert.equal(queue.snapshot().waiting,0);first();
});
test('bounded queue rejects overload without dropping accepted waiter',async()=>{
 const queue=createRequestQueue({maxWaiting:1});const first=await queue.acquire();const waiting=queue.acquire();
 await assert.rejects(queue.acquire(),{code:'queue_full'});first();(await waiting)();assert.equal(queue.snapshot().active,false);
});
test('double release cannot create extra execution slots',async()=>{
 const queue=createRequestQueue();const first=await queue.acquire();const waiting=queue.acquire();first();first();const second=await waiting;
 assert.equal(queue.snapshot().active,true);second();assert.equal(queue.snapshot().active,false);
});
test('a failed operation releases admission for the next request',async()=>{
 const queue=createRequestQueue();const first=await queue.acquire();const waiting=queue.acquire();
 try{throw Error('provider error')}catch{}finally{first()}
 const second=await waiting;assert.equal(queue.snapshot().active,true);second();assert.equal(queue.snapshot().active,false);
});
