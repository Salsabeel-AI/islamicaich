import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.mjs';
test('reports are anonymous, isolated and retain restrictive CSP',async t=>{
 const app=await createApp({getKey:async()=>{throw Error('Report must not read key');},fetchImpl:async()=>{throw Error('Report must not call API');}});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const base=`http://127.0.0.1:${app.address().port}`;
 for(const path of ['/reports','/reports/','/reports/mentors-briefing','/reports/mentors-briefing/','/reports/mentors-briefing/slides.css','/reports/mentors-briefing/slides.js','/reports/participation-plan','/reports/participation-plan/','/reports/participation-plan/plan.css','/reports/participation-plan/plan.js']){
  const r=await fetch(base+path);assert.equal(r.status,200);assert.equal(r.headers.get('set-cookie'),null);
  assert.match(r.headers.get('content-security-policy'),/script-src 'self';/);
  const body=await r.text();assert.doesNotMatch(body,/sals_[a-f0-9]{64}|const notes=|onclick=/);
  if(path==='/reports')assert.match(body,/href="\/reports\/mentors-briefing"/);
  if(path==='/reports/participation-plan'){assert.match(body,/خطة المشاركة ومعمارية التسليم/);assert.doesNotMatch(body,/\.\.\/Docs\/|file:|[A-Z]:\\|<script>/);assert.match(body,/id="distinctive-value"/);}
  if(path==='/reports/mentors-briefing')assert.equal((body.match(/<section class="slide/g)||[]).length,3);
 }
 for(const path of ['/reports/private','/reports/internal/','/reports/achievement-and-value-memory-2026-10-03.txt','/reports/.env','/reports/%2e%2e/private/islamicaich-api-key.txt'])assert.equal((await fetch(base+path)).status,404);
 assert.equal((await fetch(base+'/reports',{method:'POST'})).status,404);
 const h=await fetch(base+'/reports',{method:'HEAD'});assert.equal(h.status,200);assert.equal(await h.text(),'');
});
