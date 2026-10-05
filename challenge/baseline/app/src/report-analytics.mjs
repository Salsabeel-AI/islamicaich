import {appendFile, mkdir, readdir, readFile, unlink, writeFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {isIP} from 'node:net';
import geoip from 'geoip-lite';

const loopback = ip => ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip);
export function visitorInfo(req, lookup=geoip.lookup) {
 const peer=req.socket.remoteAddress||'';
 // Only the local YARP hop is trusted. Its rightmost value is its direct peer,
 // never a user-supplied leftmost X-Forwarded-For or a country header.
 const forwarded=String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim();
 const candidate=loopback(peer)&&isIP(forwarded)?forwarded:peer;
 const ip=candidate.replace(/^::ffff:/,'');
 const ua=String(req.headers['user-agent']||'').slice(0,512);
 let source='direct-or-unavailable';
 try {const u=new URL(req.headers.referer); if(['http:','https:'].includes(u.protocol)) source=u.hostname;} catch {}
 const local=loopback(ip)||/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)||/^(fc|fd|fe80:)/i.test(ip);
 const automated=/bot|crawler|spider|headless|curl|powershell|node|undici|python|monitor/i.test(ua)||!ua;
 return {ip:isIP(ip)?ip:null,country:local?null:lookup(ip)?.country||null,source,
  browser:/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Other',
  device:/iPad|Tablet/i.test(ua)?'Tablet':/Mobi|Android|iPhone/i.test(ua)?'Mobile':'Desktop/other',
  classification:local?'local':automated?'automated':'unclassified',
  language:String(req.headers['accept-language']||'').split(',')[0].slice(0,32)};
}
export async function createReportAnalytics(directory) {
 const dir=resolve(directory); await mkdir(dir,{recursive:true});
 let queue=Promise.resolve(),pending=0,lastCleanup='';
 return {
  record(req,path) {
   if(pending>=100) {console.warn('Report analytics queue full');return;}
   const event={time:new Date().toISOString(),report:path.replace(/\/$/,''),...visitorInfo(req)};
   pending++;
   queue=queue.then(async()=>{
    const day=event.time.slice(0,10);
    if(lastCleanup!==day){
     const cutoff=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
     for(const name of await readdir(dir)) if(/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)&&name.slice(0,10)<cutoff){
      const target=resolve(dir,name);if(dirname(target)===dir)await unlink(target);
     }
     lastCleanup=day;
    }
    await appendFile(resolve(dir,day+'.jsonl'),JSON.stringify(event)+'\n');
    await writeDashboard(dir);
   }).catch(()=>console.warn('Report analytics write failed')).finally(()=>pending--);
  },
  flush:()=>queue
 };
}
const esc=s=>String(s??'غير متاح').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function writeDashboard(directory) {
 const events=[];
 for(const name of (await readdir(directory)).filter(n=>/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort()) {
  for(const line of (await readFile(resolve(directory,name),'utf8')).split('\n')) {try{events.push(JSON.parse(line));}catch{}}
 }
 const rows=events.filter(e=>e.classification==='unclassified');
 const groups=new Map(); for(const e of rows){const g=groups.get(e.report)||{views:0,ips:new Set()};g.views++;if(e.ip)g.ips.add(e.ip);groups.set(e.report,g);}
 const html=`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>إحصاءات التقارير — خاص</title><style>body{font:17px system-ui;max-width:1200px;margin:40px auto;padding:20px;background:#10142c;color:#eee}table{width:100%;border-collapse:collapse;margin:25px 0}td,th{padding:12px;border-bottom:1px solid #454b6c;text-align:right}p{line-height:1.9;color:#bdc5e4}a{color:#95e2d2}</style><h1>إحصاءات التقارير — عرض خاص على الخادم</h1><p>آخر تحديث: ${esc(new Date().toISOString())} · حفظ التفاصيل لمدة ٣٠ يومًا. أعد فتح الملف أو تحديثه لعرض آخر نسخة.</p><p>طلبات الصفحات: ${events.length} · بعد استبعاد المحلي والآلي المعروف: ${rows.length}. الأرقام المتبقية ليست ضمانًا لزيارات بشرية. العناوين الفريدة تقريب للشبكات وليست عدد الأشخاص؛ قد يشترك عدة زوار في عنوان واحد أو يتغير عنوان الزائر.</p><table><tr><th>التقرير</th><th>مرات الفتح</th><th>عناوين IP الفريدة</th></tr>${[...groups].map(([name,g])=>`<tr><td>${esc(name)}</td><td>${g.views}</td><td>${g.ips.size}</td></tr>`).join('')}</table><h2>أحدث ٢٠٠ طلب — بما فيها الاختبارات</h2><p>الدولة تقدير من قاعدة GeoLite2 المحلية؛ قد تكون دولة VPN أو وكيل. مصدر الزيارة اسم الموقع المُحيل فقط؛ «غير متاح» لا يعني بالضرورة فتحًا مباشرًا. لا تُسجّل الأسئلة أو المفاتيح أو ملفات الارتباط.</p><table><tr><th>الوقت UTC</th><th>التقرير</th><th>IP</th><th>الدولة</th><th>المصدر</th><th>المتصفح / الجهاز</th><th>التصنيف</th></tr>${events.slice(-200).reverse().map(e=>`<tr>${[e.time,e.report,e.ip,e.country,e.source,e.browser+' / '+e.device,e.classification].map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table><p>Country data: GeoLite2 by <a href="https://www.maxmind.com">MaxMind</a>, distributed with geoip-lite. هذا الملف خاص ولا يُنشر ضمن التقارير.</p></html>`;
 await writeFile(resolve(directory,'dashboard.html'),html);
 return {requests:events.length,unclassified:rows.length};
}
