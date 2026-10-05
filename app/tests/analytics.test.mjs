import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {visitorInfo,createReportAnalytics} from '../src/report-analytics.mjs';
import {createApp} from '../src/server.mjs';
test('IP trusts only local proxy and ignores spoofed first hop and country headers',()=>{
 const req={socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-for':'1.1.1.1, 8.8.8.8','cf-ipcountry':'XX','user-agent':'Mozilla/5.0 Chrome/120.0','referer':'https://example.com/private?secret=abc'}};
 const info=visitorInfo(req,ip=>{assert.equal(ip,'8.8.8.8');return {country:'US'};});
 assert.equal(info.ip,'8.8.8.8');assert.equal(info.country,'US');assert.equal(info.source,'example.com');assert.ok(!JSON.stringify(info).includes('secret'));
 req.socket.remoteAddress='9.9.9.9';assert.equal(visitorInfo(req,()=>null).ip,'9.9.9.9');
 req.socket.remoteAddress='127.0.0.1';req.headers['x-forwarded-for']='invalid';assert.equal(visitorInfo(req).classification,'local');
});
test('only successful report document GETs counted; data stays private and escaped',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'islamicai-analytics-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const analytics=await createReportAnalytics(dir);const app=await createApp({reportAnalytics:analytics});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const base=`http://127.0.0.1:${app.address().port}`;
 for(const p of ['/reports','/reports/mentors-briefing','/reports/mentors-briefing/slides.css','/reports/missing'])await fetch(base+p);
 await fetch(base+'/reports',{method:'HEAD'});await analytics.flush();
 const log=await readFile(join(dir,new Date().toISOString().slice(0,10)+'.jsonl'),'utf8');
 assert.equal(log.trim().split('\n').length,2);assert.ok(!log.includes('cookie'));
 for(const p of ['/reports/analytics','/private/report-analytics/dashboard.html']) assert.equal((await fetch(base+p)).status,404);
 analytics.record({socket:{remoteAddress:'127.0.0.1'},headers:{'accept-language':'<script>alert(1)</script>'}},'/reports/<script>');await analytics.flush();
 const html=await readFile(join(dir,'dashboard.html'),'utf8');assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
});
