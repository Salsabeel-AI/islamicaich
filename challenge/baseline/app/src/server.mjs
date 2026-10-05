import {createRequestQueue,QueueError} from './request-queue.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readerPath, sanitizeReader } from './readers.mjs';
import { projectAnswer } from './presentation.mjs';
import { createReportAnalytics } from './report-analytics.mjs';
import { readEvents } from '../public/sse.js';

const ENDPOINT = 'https://barq.salsabeel.ai/api/developer/v1/fata/chat';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TTL = 2 * 60 * 60 * 1000;
const assets = {'/favicon.svg':'favicon.svg','/favicon.ico':'favicon.ico','/':'index.html','/app.js':'app.js','/styles.css':'styles.css','/genesis.js':'genesis.js','/genesis.css':'genesis.css', ...Object.fromEntries(['pattern.svg','challenge-logo.svg','readex-arabic.woff2','readex-latin.woff2','hero.png','site-icon-1.svg'].map(name=>['/assets/'+name,'assets/'+name]))};
const mime = {ico:'image/x-icon',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml',png:'image/png',woff2:'font/woff2'};
const reportFiles = new Map([
 ['/reports/participation-plan', ['participation-plan/index.html', 'text/html; charset=utf-8']],
 ['/reports/participation-plan/', ['participation-plan/index.html', 'text/html; charset=utf-8']],
 ['/reports/participation-plan/plan.css', ['participation-plan/plan.css', 'text/css; charset=utf-8']],
 ['/reports/participation-plan/plan.js', ['participation-plan/plan.js', 'text/javascript; charset=utf-8']],
 ['/reports', ['index.html', 'text/html; charset=utf-8']],
 ['/reports/', ['index.html', 'text/html; charset=utf-8']],
 ['/reports/mentors-briefing', ['mentors-briefing/index.html', 'text/html; charset=utf-8']],
 ['/reports/mentors-briefing/', ['mentors-briefing/index.html', 'text/html; charset=utf-8']],
 ['/reports/mentors-briefing/slides.css', ['mentors-briefing/slides.css', 'text/css; charset=utf-8']],
 ['/reports/mentors-briefing/slides.js', ['mentors-briefing/slides.js', 'text/javascript; charset=utf-8']],
 ['/reports/slides.css', ['slides.css', 'text/css; charset=utf-8']],
 ['/reports/slides.js', ['slides.js', 'text/javascript; charset=utf-8']],
]);
class Failure extends Error { constructor(status, message) { super(message); this.status=status; } }
const messages = {
 invalid_key:'مفتاح الخدمة غير صالح أو منتهي. يرجى إبلاغ مسؤول التجربة.',
 invalid_api_key:'مفتاح الخدمة غير صالح. يرجى إبلاغ مسؤول التجربة.',
 quota_exhausted:'انتهى الرصيد المتاح لهذه التجربة.',
 scope_denied:'مفتاح التجربة لا يتيح خدمة الفتى.',
 account_busy:'الخدمة تعالج طلبًا آخر. أعد المحاولة بعد قليل.',
 rate_limited:'طلبات كثيرة مؤقتًا. أعد المحاولة بعد قليل.',
 request_unresolved:'لم تُحسم نتيجة الطلب. استخدم إعادة المحاولة نفسها دون إنشاء طلب جديد.',
 result_expired:'انتهت مدة حفظ نتيجة هذا الطلب لدى الخدمة.',
};
async function defaultKey() {
 if (process.env.SALSABEEL_API_KEY_FILE) return (await readFile(process.env.SALSABEEL_API_KEY_FILE,'utf8')).trim().replace(/^\uFEFF/,'');
 return process.env.SALSABEEL_API_KEY?.trim() ?? '';
}
async function readJson(stream, limit=32768) {
 const parts=[];let size=0;
 for await(const chunk of stream) { size+=chunk.length; if(size>limit) throw new Failure(413,'حجم البيانات أكبر من الحد المسموح.'); parts.push(chunk); }
 try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw new Failure(400,'تعذر قراءة الطلب.'); }
}
export async function createApp({getKey=defaultKey,fetchImpl=fetch,publicOrigin=process.env.PUBLIC_ORIGIN||'',answerLimit=Number(process.env.SESSION_ANSWER_LIMIT||10),timeoutMs=200000,queueWaitMs=120000,maxWaiting=8,reportAnalytics=null}={}) {
 if (!Number.isInteger(answerLimit)||answerLimit<0||answerLimit>100) throw new Error('SESSION_ANSWER_LIMIT must be 0..100 (0 = unlimited)');
 if(publicOrigin && !/^https?:\/\/[^/]+$/.test(publicOrigin)) throw new Error('PUBLIC_ORIGIN must be an exact origin');
 const files=new Map(await Promise.all(Object.entries(assets).map(async([url,name])=>[url,await readFile(new URL('../public/'+name,import.meta.url))])));
 files.set('/sse.js',await readFile(new URL('../public/sse.js',import.meta.url)));
 const sessions=new Map();const queue=createRequestQueue({maxWaiting,waitMs:queueWaitMs});
 const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; connect-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'");
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  try {
   const origin=publicOrigin||`http://127.0.0.1:${server.address().port}`;
   if(req.headers.host!==new URL(origin).host) throw new Failure(403,'عنوان غير مسموح.');
   const path=(req.url||'').split('?')[0];
   if ((req.method==='GET'||req.method==='HEAD') && reportFiles.has(path)) {
    const [name,type]=reportFiles.get(path);
    const report=await readFile(new URL('../public/reports/'+name,import.meta.url));
    if(req.method==='GET'&&type.startsWith('text/html')&&reportAnalytics) res.once('finish',()=>{try{reportAnalytics.record(req,path);}catch{console.warn('Report analytics unavailable');}});
    res.writeHead(200,{'Content-Type':type});
    return res.end(req.method==='HEAD'?undefined:report);
   }
   if(req.method==='GET'&&files.has(path)) {res.writeHead(200,{'Content-Type':mime[path.split('.').pop()]||'text/html; charset=utf-8'});return res.end(files.get(path));}
   if(req.method==='GET'&&path==='/health') {let configured=false;try{configured=/^sals_[a-f0-9]{64}$/.test(await getKey());}catch{}return json(200,{ok:true,configured,service:'fata',mode:'live'});}
   const reader=path.startsWith('/api/barq/read/')?readerPath(req.url):null;
   if(!reader&&!['/api/session','/api/chat','/api/new'].includes(path)) throw new Failure(404,'المسار غير موجود.');
   if(req.headers['sec-fetch-site']==='cross-site' || (req.method!=='GET' && req.headers.origin!==origin)) throw new Failure(403,'الطلب يجب أن يصدر من صفحة المحادثة نفسها.');
   if(((reader||path==='/api/session')&&req.method!=='GET')||(!reader&&path!=='/api/session'&&req.method!=='POST')) throw new Failure(405,'طريقة الطلب غير مدعومة.');
   const now=Date.now();for(const[id,s]of sessions) if(!s.busy&&s.expires<now)sessions.delete(id);
   let id=/(?:^|;\s*)islamicai_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
   let session=sessions.get(id);
   if(!session){if(sessions.size>=200)throw new Failure(503,'التجربة مشغولة مؤقتًا.');id=randomBytes(32).toString('hex');session={history:[],requests:new Map(),count:0,conversation:null,busy:false};sessions.set(id,session);res.setHeader('Set-Cookie',`islamicai_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200${origin.startsWith('https:')?'; Secure':''}`);}
   session.expires=now+TTL;
   if(reader){
    session.readWindow ??= {time:now,count:0,active:0};
    const reads=session.readWindow;
    if(now-reads.time>60000){reads.time=now;reads.count=0;}
    if(reads.count>=60||reads.active>=3)throw new Failure(429,'طلبات قراءة كثيرة. حاول بعد قليل.');
    reads.count++;reads.active++;
    try{
      const response=await fetchImpl('https://barq.salsabeel.ai'+reader,{redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(65000)});
      const data=await readJson(response.body,1024*1024);
      if(!response.ok)throw new Failure(502,'تعذر تحميل المرجع من سلسبيل.');
      return json(200,sanitizeReader(data));
    }finally{reads.active--;}
   }
   if(path==='/api/session')return json(200,{history:session.history,remaining:answerLimit === 0 ? null : Math.max(0,answerLimit-session.count)});
   if(path==='/api/new') {if(session.busy)throw new Failure(409,'انتظر اكتمال الإجابة.');session.history=[];session.conversation=null;session.requests.clear();return json(200,{ok:true,remaining:answerLimit === 0 ? null : Math.max(0,answerLimit-session.count)});}
   if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new Failure(415,'صيغة الطلب غير مدعومة.');
   const input=await readJson(req);
   if(!input||Object.keys(input).some(k=>!['message','request_id'].includes(k))||typeof input.message!=='string'||!input.message.trim()||input.message.length>6000||!UUID.test(input.request_id))throw new Failure(400,'اكتب سؤالًا لا يتجاوز ٦٠٠٠ حرف.');
   const message=input.message.trim();let entry=session.requests.get(input.request_id);
   if(entry&&entry.message!==message)throw new Failure(409,'هذا المعرّف مرتبط بسؤال مختلف.');
   if(entry?.result)return json(200,entry.result);
   if(session.busy)throw new Failure(429,'سؤالك السابق قيد المعالجة. انتظر اكتماله قبل إرسال سؤال آخر.');
   if(answerLimit>0&&session.count>=answerLimit)throw new Failure(429,'اكتملت حصة هذه الجلسة التجريبية.');
   let key;try{key=await getKey();}catch{}
   if(!/^sals_[a-f0-9]{64}$/.test(key||''))throw new Failure(503,'الاتصال بالفتى بانتظار إعداد مفتاح الخدمة لدى مسؤول التجربة.');
   if(session.busy)throw new Failure(429,'سؤالك السابق قيد المعالجة. انتظر اكتماله قبل إرسال سؤال آخر.');
   entry=session.requests.get(input.request_id);
   if(entry?.result)return json(200,entry.result);
   if(!entry){for(const [oldId,old] of session.requests){if(session.requests.size<40)break;if(old.result)session.requests.delete(oldId);}if(session.requests.size>=40)throw new Failure(429,'بلغت الجلسة حد المحاولات.');entry={message,upstreamId:randomUUID(),conversation:session.conversation};session.requests.set(input.request_id,entry);}
   session.busy=true;let release,wasQueued=false;const disconnected=new AbortController();
   const onClose=()=>disconnected.abort();res.once('close',onClose);
   const streaming=req.headers.accept?.includes('text/event-stream')===true;
   const emit=(event,data)=>{
    if(res.destroyed||res.writableEnded)return;
    if(!res.headersSent)res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'});
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
   };
   try {
    release=await queue.acquire({signal:disconnected.signal,onWait:()=>{wasQueued=true;if(streaming)emit('progress',{label:'طلبك في قائمة الانتظار، وسيبدأ تلقائيًا.'});}});
    if(res.destroyed)throw new QueueError('queue_cancelled');
    if(wasQueued&&streaming)emit('progress',{label:'بدأ الفتى إعداد الإجابة…'});
    const response=await fetchImpl(ENDPOINT,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':entry.upstreamId,Accept:streaming?'text/event-stream':'application/json'},body:JSON.stringify({message,...(entry.conversation?{conversation_id:entry.conversation}:{})}),signal:AbortSignal.timeout(timeoutMs)});
    let data;
    if(response.ok&&response.headers?.get('content-type')?.includes('text/event-stream')){
     for await(const part of readEvents(response.body)){
      if(part.event==='text'&&streaming&&typeof part.data?.text==='string'&&part.data.text.length<=100000){
       if(part.data.text.includes(key))throw new Failure(502,'تعذر عرض الإجابة بأمان.');
       emit('text',{text:part.data.text});
      }else if(part.event==='progress'&&streaming&&typeof part.data?.label==='string'&&part.data.label.length<200){
       emit('progress',{label:part.data.label});
      }else if(part.event==='final'){if(data)throw new Failure(502,'نتيجة مكررة.');data=part.data;}
      else if(part.event==='error')throw new Failure(503,'لم تكتمل الإجابة. أعد المحاولة بالطلب نفسه.');
     }
     if(!data)throw new Failure(503,'لم تكتمل الإجابة. أعد المحاولة بالطلب نفسه.');
    }else data=await readJson(response.body,1024*1024);
    if(!response.ok)throw new Failure([400,401,403,409,410,429].includes(response.status)?response.status:503,messages[data?.error?.code]||'تعذر إتمام الطلب لدى الفتى. أعد المحاولة بالطلب نفسه.');
    const answer=projectAnswer(data);
    if(JSON.stringify(answer).includes(key))throw new Failure(502,'تعذر عرض الإجابة بأمان.');
    if(!UUID.test(data.conversation_id||''))throw new Failure(502,'لم تُرجع الخدمة معرّف المحادثة اللازم للمتابعة.');
    session.conversation=data.conversation_id;session.count++;
    session.history.push({role:'user',text:message},{role:'assistant',...answer});
    session.history=session.history.slice(-40);
    entry.result={answer,remaining:answerLimit === 0 ? null : Math.max(0,answerLimit-session.count)};
    if(streaming){emit('final',entry.result);return res.end();}
    return json(200,entry.result);
   }catch(error){
    if(error instanceof QueueError){
     if(error.code==='queue_cancelled')return;
     throw new Failure(429,error.code==='queue_full'?'قائمة الانتظار ممتلئة مؤقتًا. أعد المحاولة بالطلب نفسه.':'انتهت مهلة الانتظار قبل بدء الإجابة. أعد المحاولة بالطلب نفسه.');
    }
    throw error;
   }finally{release?.();res.removeListener('close',onClose);session.busy=false;session.expires=Date.now()+TTL;}
  }catch(error){const failure={error:{message:error instanceof Failure?error.message:'تعذر الاتصال بالفتى. أعد المحاولة بالطلب نفسه.'}};if(res.headersSent){if(!res.destroyed&&!res.writableEnded)res.end(`event: error\ndata: ${JSON.stringify(failure)}\n\n`);}else json(error instanceof Failure?error.status:503,failure);}
 });
 server.requestTimeout=30000;
 return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 let reportAnalytics=null;
 try {reportAnalytics=await createReportAnalytics(fileURLToPath(new URL('../../private/report-analytics/',import.meta.url)));}catch{console.warn('Report analytics unavailable');}
 const app=await createApp({reportAnalytics});const port=Number(process.env.PORT||8791);const host=process.env.HOST||'127.0.0.1';
 app.listen(port,host,()=>console.log(`IslamicAI_Chat: http://${host}:${port} (Fata API, no demo responses)`));
}
