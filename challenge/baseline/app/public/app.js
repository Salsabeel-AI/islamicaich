import {renderGenesis,clearGenesis} from '/genesis.js';
import {readEvents} from '/sse.js';
const $=s=>document.querySelector(s);
const history=$('#messages'),input=$('#message'),error=$('#error');let pending=null,busy=false;
function html(parent,content){const el=document.createElement('div');el.className='answer';el.innerHTML=content;parent.append(el);return el;}
function showMessage(item){
 $('#welcome').hidden=true;
 const article=document.createElement('article');article.className='message '+item.role;
 const label=document.createElement('div');label.className='message-label';label.textContent=item.role==='user'?'أنت':'برق الفتى · سلسبيل';article.append(label);
 if(item.role==='user'){const p=document.createElement('div');p.textContent=item.text;article.append(p);}else{
  if(item.template){const el=document.createElement('div');el.className='answer';article.append(el);renderGenesis(el,item.template);}else {
  html(article,item.html);
  for(const s of item.sections||[]){const block=document.createElement('section');block.className='more';const title=document.createElement('strong');title.textContent=s.title;block.append(title);const body=html(block,s.html);body.classList.add('preview');const btn=document.createElement('button');btn.textContent='المزيد ▾';btn.setAttribute('aria-expanded','false');btn.onclick=()=>{const expanded=body.classList.toggle('preview');btn.textContent=expanded?'المزيد ▾':'أقلّ ▴';btn.setAttribute('aria-expanded',String(!expanded));};block.append(btn);article.append(block);}
  for(const ref of item.references||[]){const d=document.createElement('details');d.className='reference';const summary=document.createElement('summary');summary.textContent=ref.title;d.append(summary);html(d,ref.html);if(ref.url){const a=document.createElement('a');a.href=ref.url;a.textContent='قراءة المصدر';a.target='_blank';a.rel='noopener noreferrer';d.append(a);}article.append(d);}
  for(const ref of item.citations||[]){const p=document.createElement('p'),a=document.createElement('a');a.href=ref.url;a.textContent=ref.title;a.target='_blank';a.rel='noopener noreferrer';p.append(a);article.append(p);}
  for(const card of item.cards||[]){const choices=document.createElement('div');choices.className='fata-choices';for(const option of card.buttons||[]){const button=document.createElement('button');button.type='button';button.textContent=option.label;button.disabled=busy;button.onclick=()=>{if(busy||pending)return;input.value=option.value;send();};choices.append(button);}article.append(choices);}
  }
  if(item.limited){const p=document.createElement('p');p.className='limited';p.textContent='تحتوي الإجابة الأصلية على عناصر إضافية لا يتيحها عقد الخدمة الحالي.';article.append(p);}
  const copy=document.createElement('button');copy.className='copy';copy.textContent='نسخ الإجابة';copy.onclick=async()=>{try{await navigator.clipboard.writeText(article.querySelector('.answer').innerText);copy.textContent='تم النسخ';}catch{copy.textContent='تعذر النسخ';}};article.append(copy);
 }history.append(article);return article;
}
let progressTimer=null,explicitProgress=false;
function setBusy(value){
 busy=value;explicitProgress=false;for(const b of document.querySelectorAll('.fata-choices button,[data-question]'))b.disabled=value;
 $('#send').disabled=value;$('#new').disabled=value;input.disabled=value;$('#retry').disabled=value;
 history.setAttribute('aria-busy',String(value));
 const status=$('#status');clearInterval(progressTimer);progressTimer=null;status.replaceChildren();status.hidden=!value;
 if(value){
  const spinner=document.createElement('span');spinner.className='progress-spinner';spinner.setAttribute('aria-hidden','true');
  const text=document.createElement('span');text.className='progress-label';text.textContent='الفتى يُعدّ إجابتك…';
  const elapsed=document.createElement('span');elapsed.className='progress-time';elapsed.setAttribute('aria-hidden','true');
  status.append(spinner,text,elapsed);const started=Date.now();
  progressTimer=setInterval(()=>{const seconds=Math.floor((Date.now()-started)/1000);elapsed.textContent=`${seconds.toLocaleString('ar')} ث`;if(seconds>=20&&!explicitProgress)text.textContent='ما زلنا ننتظر إجابة الفتى؛ بعض الأسئلة تحتاج وقتًا أطول…';},1000);
  status.scrollIntoView({behavior:'smooth',block:'nearest'});
 }
}
function setProgress(label){
 if(!busy||typeof label!=='string'||!label.trim()||label.length>=200)return;
 const text=document.querySelector('#status .progress-label');
 if(text){explicitProgress=true;text.textContent=label;}
}
async function request(path,body){
 const streaming=path==='/api/chat';let draft=null;
 try{
 const r=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json',...(streaming?{Accept:'text/event-stream'}:{})}:{},...(body?{body:JSON.stringify(body)}:{})});
 if(r.ok&&r.headers.get('content-type')?.includes('text/event-stream')){
  let result;
  for await(const part of readEvents(r.body)){
   if(part.event==='text'&&typeof part.data?.text==='string'){
    if(!draft){draft=document.createElement('article');draft.className='message assistant';draft.setAttribute('aria-label','إجابة قيد الإعداد');history.append(draft);}
    draft.textContent=part.data.text;
   }else if(part.event==='progress'&&typeof part.data?.label==='string'&&part.data.label.length<200){
    setProgress(part.data.label);
   }else if(part.event==='final')result=part.data;
   else if(part.event==='error')throw new Error(part.data?.error?.message||'لم تكتمل الإجابة. أعد المحاولة بالطلب نفسه.');
  }
  if(!result)throw new Error('انقطع البث. أعد المحاولة بالطلب نفسه.');
  return result;
 }
 const data=await r.json();if(!r.ok)throw new Error(data.error?.message||'تعذر إتمام الطلب.');return data;
 }finally{draft?.remove();}
}
async function send(retry=false){if(busy)return;if(!retry&&pending){error.querySelector('span').textContent='أعد محاولة السؤال السابق أو ابدأ محادثة جديدة.';error.hidden=false;return;}if(!retry){const message=input.value.trim();if(!message)return;pending={message,request_id:crypto.randomUUID()};showMessage({role:'user',text:message});input.value='';}if(!pending)return;error.hidden=true;setBusy(true);try{const result=await request('/api/chat',pending);const article=showMessage({role:'assistant',...result.answer});pending=null;$('#connection').textContent=result.remaining===null?'برق الفتى · طلبات بلا سقف عددي':`برق الفتى · متبقٍ ${result.remaining} إجابات لهذه الجلسة`;article.scrollIntoView({behavior:'smooth',block:'start'});}catch(e){error.querySelector('span').textContent=e.message;error.hidden=false;}finally{setBusy(false);input.focus();}}
$('#composer').onsubmit=e=>{e.preventDefault();send();};$('#retry').onclick=()=>send(true);
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}});
for(const btn of document.querySelectorAll('[data-question]'))btn.onclick=()=>{if(busy||pending)return;input.value=btn.dataset.question;send();};
$('#new').onclick=async()=>{if(busy)return;try{await request('/api/new',{});clearGenesis();history.replaceChildren();pending=null;error.hidden=true;$('#welcome').hidden=false;input.value='';input.focus();}catch(e){error.querySelector('span').textContent=e.message;error.hidden=false;}};
try{const [health,session]=await Promise.all([request('/health'),request('/api/session')]);for(const item of session.history)showMessage(item);$('#connection').textContent=health.configured?(session.remaining===null?'برق الفتى · طلبات بلا سقف عددي':`برق الفتى · متبقٍ ${session.remaining} إجابات لهذه الجلسة`):'بانتظار إعداد اتصال الخدمة';}catch{$('#connection').textContent='تعذر الوصول إلى خادم المحادثة';}

window.addEventListener('fata-choice',e=>{if(busy||pending||typeof e.detail!=='string')return;input.value=e.detail;send();});
