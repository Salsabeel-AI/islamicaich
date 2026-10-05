import {readerPath,sanitizeReader} from '../src/readers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/server.mjs';
import {readEvents} from '../public/sse.js';
import {renderText,projectAnswer,publicTemplate} from '../src/presentation.mjs';
const key='sals_'+'a'.repeat(64);
test('SSE relays a real partial before final, then caches one completed answer',async t=>{
 let release;const gate=new Promise(r=>release=r);let calls=0;
 const a=await setup(t,{fetchImpl:async(_url,options)=>{
  calls++;assert.equal(options.headers.Accept,'text/event-stream');
  const encoder=new TextEncoder();
  return new Response(new ReadableStream({async start(controller){
   controller.enqueue(encoder.encode('event: progress\ndata: '+JSON.stringify({label:'تفكير عميق'})+'\n\n'));
   controller.enqueue(encoder.encode('event: text\ndata: '+JSON.stringify({text:'إجابة أولية'})+'\n\n'));
   await gate;
   controller.enqueue(encoder.encode('event: final\ndata: '+JSON.stringify({service:'fata',answer:'إجابة نهائية',conversation_id:randomUUID(),citations:[]})+'\n\n'));controller.close();
  }}),{headers:{'Content-Type':'text/event-stream'}});
 }});
 const cookie=await a.session(),input={message:'سؤال',request_id:randomUUID()};
 const response=await fetch(a.base+'/api/chat',{method:'POST',headers:{Cookie:cookie,Origin:a.base,'Content-Type':'application/json',Accept:'text/event-stream'},body:JSON.stringify(input)});
 const stream=readEvents(response.body);const progress=await stream.next();assert.equal(progress.value.event,'progress');assert.equal(progress.value.data.label,'تفكير عميق');const first=await stream.next();
 assert.equal(first.value.event,'text');assert.equal(first.value.data.text,'إجابة أولية');
 const state=await(await fetch(a.base+'/api/session',{headers:{Cookie:cookie}})).json();assert.equal(state.history.length,0);
 release();const final=await stream.next();assert.equal(final.value.event,'final');assert.equal((await stream.next()).done,true);
 assert.equal((await a.send(cookie,input)).status,200);assert.equal(calls,1);
});
test('SSE decoder preserves split UTF-8 and rejects unfinished frames',async()=>{
 const bytes=new TextEncoder().encode('event: text\r\ndata: {"text":"حديث"}\r\n\r\n');
 async function* chunks(){for(const b of bytes)yield Uint8Array.of(b);}
 const events=[];for await(const e of readEvents(chunks()))events.push(e);
 assert.equal(events[0].data.text,'حديث');
 async function* broken(){yield new TextEncoder().encode('data: {"text":');}
 await assert.rejects(async()=>{for await(const e of readEvents(broken()))void e;});
});
test('partial stream without final records no answer and retry retains its key',async t=>{
 const ids=[];let calls=0;
 const a=await setup(t,{fetchImpl:async(_url,o)=>{
  ids.push(o.headers['Idempotency-Key']);calls++;
  if(calls===1)return new Response('event: text\ndata: {"text":"جزء"}\n\n',{headers:{'Content-Type':'text/event-stream'}});
  return Response.json({service:'fata',answer:'اكتملت',conversation_id:randomUUID(),citations:[]});
 }});
 const cookie=await a.session(),input={message:'سؤال',request_id:randomUUID()};
 const r=await fetch(a.base+'/api/chat',{method:'POST',headers:{Cookie:cookie,Origin:a.base,'Content-Type':'application/json',Accept:'text/event-stream'},body:JSON.stringify(input)});
 assert.match(await r.text(),/event: error/);
 const state=await(await fetch(a.base+'/api/session',{headers:{Cookie:cookie}})).json();assert.equal(state.history.length,0);
 assert.equal((await a.send(cookie,input)).status,200);assert.equal(ids[0],ids[1]);
});
async function setup(t,options={}) {
 const calls=[];
 const app=await createApp({getKey:async()=>key,fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,body,id:options.headers['Idempotency-Key']});return Response.json({service:'fata',answer:'جواب **موثق** [المصدر](https://example.org/source)',conversation_id:body.conversation_id||randomUUID(),presentation:{version:1,sections:[{title:'المزيد',body:'نص طويل'}],references:[],limited:false},citations:[]});},...options});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const base=`http://127.0.0.1:${app.address().port}`;
 const session=async()=>{const r=await fetch(base+'/api/session');return r.headers.get('set-cookie').split(';')[0];};
 const send=(cookie,body,origin=base)=>fetch(base+'/api/chat',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 return {base,session,send,calls};
}
test('Fata only; removed routes do not exist; configuration never exposes credentials',async t=>{
 const a=await setup(t);for(const path of ['/admin','/login','/api/atlas/search','/.env'])assert.equal((await fetch(a.base+path)).status,404);
 const h=await(await fetch(a.base+'/health')).text();assert.ok(!h.includes(key));assert.equal(JSON.parse(h).mode,'live');
});
test('sessions isolate conversations; retry is idempotent; reset does not reset allowance',async t=>{
 const a=await setup(t,{answerLimit:2}),c1=await a.session(),c2=await a.session();
 const input={message:'مرحبا',request_id:randomUUID()};assert.equal((await a.send(c1,input)).status,200);
 assert.equal((await a.send(c1,input)).status,200);assert.equal(a.calls.length,1);
 assert.equal((await a.send(c1,{...input,message:'تغيير'})).status,409);
 assert.equal((await a.send(c1,{message:'تابع',request_id:randomUUID()})).status,200);assert.ok(a.calls[1].body.conversation_id);
 await a.send(c2,{message:'بداية',request_id:randomUUID()});assert.equal(a.calls[2].body.conversation_id,undefined);
 const body=await(await fetch(a.base+'/api/session',{headers:{Cookie:c2}})).text();assert.ok(!body.includes('conversation_id'));assert.ok(!body.includes('تابع'));
 await fetch(a.base+'/api/new',{method:'POST',headers:{Cookie:c1,Origin:a.base}});
 assert.equal((await a.send(c1,{message:'مجددا',request_id:randomUUID()})).status,429);
});
test('reject foreign origins and client-supplied conversation IDs',async t=>{
 const a=await setup(t),cookie=await a.session(),body={message:'سؤال',request_id:randomUUID()};
 assert.equal((await a.send(cookie,body,'https://evil.example')).status,403);
 assert.equal((await a.send(cookie,{...body,conversation_id:randomUUID()})).status,400);assert.equal(a.calls.length,0);
});
test('missing key returns an honest setup error; no fake answer',async t=>{
 const a=await setup(t,{getKey:async()=>''});const r=await a.send(await a.session(),{message:'سؤال',request_id:randomUUID()});assert.equal(r.status,503);assert.equal(a.calls.length,0);
});
test('sanitizer preserves links, tables, details; blocks executable HTML and credential links',()=>{
 const s=renderText('<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a>\n\n[مصدر](https://example.org)\n\n[secret](https://example.org/?token=secret)\n\n|أ|ب|\n|---|---|\n|1|2|\n\n<details><summary>المزيد</summary>دليل</details>');
 assert.ok(s.includes('<table>'));assert.ok(s.includes('<details>'));assert.ok(s.includes('href="https://example.org/"'));assert.doesNotMatch(s,/<script|<img|onerror|javascript:|token=secret/);
});
test('failed upstream retry keeps upstream idempotency key',async t=>{
 const ids=[];let n=0;const a=await setup(t,{fetchImpl:async(url,o)=>{ids.push(o.headers['Idempotency-Key']);if(!n++)throw new Error('offline');return Response.json({service:'fata',answer:'تم',conversation_id:randomUUID()});}});
 const c=await a.session(),body={message:'سؤال',request_id:randomUUID()};assert.equal((await a.send(c,body)).status,503);assert.equal((await a.send(c,body)).status,200);assert.equal(ids[0],ids[1]);
});

test('concurrent requests cannot race while reading the key',async t=>{
 let release;const gate=new Promise(r=>release=r);let calls=0;
 const a=await setup(t,{getKey:async()=>{await new Promise(r=>setTimeout(r,15));return key;},fetchImpl:async()=>{calls++;await gate;return Response.json({service:'fata',answer:'تم',conversation_id:randomUUID()});}});
 const cookie=await a.session();const first=a.send(cookie,{message:'الأول',request_id:randomUUID()});
 const second=a.send(cookie,{message:'الثاني',request_id:randomUUID()});
 await new Promise(r=>setTimeout(r,80));release();const results=await Promise.all([first,second]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);assert.equal(calls,1);
});

test('unlimited local mode has no lifetime request-cache ceiling',async t=>{
 const a=await setup(t,{answerLimit:0}),cookie=await a.session();
 for(let i=0;i<42;i++){const r=await a.send(cookie,{message:'سؤال '+i,request_id:randomUUID()});assert.equal(r.status,200);assert.equal((await r.json()).remaining,null);}
});

test('operational escalation labels are public concepts, without altering Quranic vocabulary',()=>{
 assert.ok(renderText('استشرت جدي قبس').includes('التصعيد'));
 assert.ok(!renderText('تصعيد البحث إلى قبس').includes('قبس'));
 assert.ok(renderText('بشهاب قبس').includes('قبس'));
});

test('choice transport preserves exact value and excludes model switches',()=>{
 const out=projectAnswer({service:'fata',answer:'Answer',presentation:{version:1,cards:[{buttons:[{label:'Next',value:'__NEXT__:7'},{label:'Other',value:'x',switchSpec:'other'}]}]}});
 assert.deepEqual(out.cards,[{buttons:[{label:'Next',value:'__NEXT__:7'}]}]);
});

test('reader proxy permits known read-only routes and rejects arbitrary targets',()=>{
 for(const path of ['/api/barq/read/ayah/2/255','/api/barq/read/hadith/bukhari/1','/api/barq/read/tafsir/ayman/2/255/action/qiraat','/api/barq/read/poetry/poetry/42?start=10'])assert.equal(readerPath(path),path);
 for(const path of ['https://evil.example/api/barq/read/ayah/2/255','/api/barq/read/ayah/999/1','/api/barq/read/ayah/2/255?url=http://localhost','/api/barq/read/../../admin','/api/barq/read/poetry/poetry/42?start=-1','/api/barq/read/tafsir/ayman/2/255/action/admin'])assert.equal(readerPath(path),null);
});
test('popup fetch uses fixed public origin without forwarding credentials',async t=>{
 let captured;
 const a=await setup(t,{fetchImpl:async(url,options)=>{captured={url,options};return Response.json({ok:true,text:'source'});}});
 const cookie=await a.session();const r=await fetch(a.base+'/api/barq/read/ayah/2/255',{headers:{Cookie:cookie}});
 assert.equal(r.status,200);assert.equal((await r.json()).text,'source');assert.equal(captured.url,'https://barq.salsabeel.ai/api/barq/read/ayah/2/255');assert.equal(captured.options.headers.Authorization,undefined);
 assert.equal((await fetch(a.base+'/api/barq/read/ayah/2/255',{method:'POST',headers:{Cookie:cookie,Origin:a.base}})).status,405);
});

test('reader HTML retains reference hooks but removes executable content',()=>{
 const clean=sanitizeReader({html:'<div onclick="evil()"><script>secret()</script><span class="barq-ref" data-root="علم">علم</span><a href="javascript:evil()">bad</a></div>'});
 assert.ok(clean.html.includes('data-root'));assert.doesNotMatch(clean.html,/onclick|script|secret|javascript/);
});

test('public template wording never rewrites the original action payload',()=>{
 const value='DS4 original payload';
 const rendered=publicTemplate('```barq-card\n'+JSON.stringify({buttons:[{label:'DS4',value}]})+'\n```');
 const parsed=JSON.parse(rendered.split('\n')[1]);assert.equal(parsed.buttons[0].value,value);assert.notEqual(parsed.buttons[0].label,'DS4');
});

test('Barq icons are served and public reference URLs survive the fallback representation',async t=>{
 const a=await setup(t);
 for(const path of ['/favicon.ico','/favicon.svg']){
  const r=await fetch(a.base+path);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/^image\//);assert.ok((await r.arrayBuffer()).byteLength>100);
 }
 const p=projectAnswer({service:'fata',answer:'جواب',presentation:{version:1,references:[{title:'مصدر',url:'https://dorar.net/osolfeqh/1541',excerpt:'نص'}],sections:[],limited:false}});
 assert.equal(p.references[0].url,'https://dorar.net/osolfeqh/1541');
});
