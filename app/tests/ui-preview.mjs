import {createApp} from '../src/server.mjs';
import {randomUUID} from 'node:crypto';
const template=`اختبار قوالب العرض الأصلية — بيانات اختبار للواجهة فقط.

آية الكرسي (البقرة: ٢٥٥). وحديث (البخاري: ١).

\`\`\`barq-more
تفاصيل النص
${'هذا نص طويل لاختبار الفتح والإغلاق. '.repeat(18)}
\`\`\`

\`\`\`barq-roots
{"roots":[{"root":"علم"}]}
\`\`\`

\`\`\`barq-refs
{"refs":[{"name":"سلسبيل — مصدر خارجي","url":"https://barq.salsabeel.ai/","body":"barq.salsabeel.ai"},{"name":"آية الكرسي","type":"quran","surah":2,"ayah":255},{"name":"مرجع نصي للاختبار","body":"نص مرجعي للتأكد من نافذة المصدر."}]}
\`\`\`

\`\`\`barq-card
{"buttons":[{"label":"اختبار المتابعة","value":"تابع الاختبار"}]}
\`\`\`
`;
const app=await createApp({getKey:async()=>'sals_'+'a'.repeat(64),fetchImpl:async(url,opts)=>{if(!url.includes('/developer/'))return fetch(url,opts); const body=JSON.parse(opts.body);return Response.json({service:'fata',answer:'UI fixture',conversation_id:body.conversation_id||randomUUID(),presentation:{version:1,template:body.message==='تابع الاختبار'?'نجح إرسال زر المتابعة عبر المسار نفسه.':template}});}});
app.listen(8793,'127.0.0.1',()=>console.log('UI TEST ONLY http://127.0.0.1:8793'));
