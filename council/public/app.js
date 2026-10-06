import {renderGenesis,clearGenesis} from '/genesis.js';
import {readEventStream,updateStreamText,renderStreamHTML,textLinkParts} from '/stream-ui.js';
import {normalizeHadithCitation,renderHadithCitation} from '/hadith-renderer.js';
import {HANDOFF_PREFIX,createHandoffRegistry,prepareFataHandoffs} from '/handoffs.js';
const handoffs=createHandoffRegistry(()=>crypto.randomUUID());
window.addEventListener('fata-choice',event=>{
 if(busy||typeof event.detail!=='string')return;
 if(event.detail.startsWith(HANDOFF_PREFIX)){
  const action=handoffs.resolve(event.detail);if(!action)return;
  choose(action.module,false);
  if(action.question)askSuggested(action.question);else reveal('#composer');
  return;
 }
 if(event.detail.length>6000||event.detail.startsWith('__SWITCH_'))return;
 $('#question').value=event.detail;$('#composer').requestSubmit();
});
const $=s=>document.querySelector(s),names={fata:'برق الفتى',linah:'لينة',qabas:'قبس'},history={fata:[],linah:[],qabas:[]},ids={};let selected='fata',busy=false;
const questions={
 fata:[['القرآن وتفسيره','فسر الآية 11 من سورة الحجرات','اقرأ أقوال المفسرين ومراجعها'],['اللغة والمعنى','ما معنى العدل؟','استكشف المعنى من مصادره'],['تعرّف إلى الأسرة','اعرف المزيد عن برق الصغير وعائلته','تعرّف إلى الفتى وأسرة سلسبيل']],
 linah:[['فقه العبادات','ما حكم الجمع في السفر؟','افهم الحكم وشروطه ودليله'],['فهم الفروق','ما الفرق بين الزكاة والصدقة؟','قارن الأحكام والمقاصد'],['الصلاة خطوة بخطوة','ما حكم صلاة الجنازة وما صفتها؟','تعرّف إلى الحكم وكيفية الصلاة']],
 qabas:[['المفاهيم والمعاني','ما المقصود بتوحيد الألوهية؟','اقرأ تعريفًا موثقًا من المصادر'],['فهم الاختلاف','لماذا تختلف أحكام العلماء؟','استكشف أسباب اختلاف الاجتهاد'],['مقارنة موثّقة','ما الفرق بين التفسير والتأويل؟','قارن المعاني مع مراجعها']]
};
function reveal(id){const el=$(id);el.focus({preventScroll:true});el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
function askSuggested(question){if(busy||typeof question!=='string'||!question.trim()||question.length>6000)return;$('#question').value=question;$('#composer').requestSubmit();}
let capabilitiesStarted=false;
function syncCapabilitiesLayout(){
 const section=$('#fataCapabilities'),details=section.querySelector(':scope > details'),started=history.fata.length>0;
 section.hidden=selected!=='fata';
 if(started!==capabilitiesStarted){
  if(started){$('#conversation').after(section);details.open=true;}
  else{$('#startHere').append(section);details.open=false;section.querySelectorAll('.capability-group').forEach(group=>group.open=false);}
  capabilitiesStarted=started;
 }
 section.classList.toggle('after-chat',started);
}
function setBusy(value){busy=value;$('#send').disabled=value;$('#module').disabled=value;$('#new').disabled=value;document.querySelectorAll('.persona,#suggestions button,#fataCapabilities [data-question]').forEach(button=>button.disabled=value);syncChoiceBusy();}
function syncChoiceBusy(){document.querySelectorAll('#messages .fata-choices button').forEach(button=>{if(busy&&!button.disabled){button.dataset.streamDisabled='true';button.disabled=true;}else if(!busy&&button.dataset.streamDisabled){delete button.dataset.streamDisabled;button.disabled=false;}});}
new MutationObserver(()=>{if(busy)syncChoiceBusy();}).observe($('#messages'),{childList:true,subtree:true});
function appendTextParts(el,parts){for(const part of parts){if(part.href){const link=document.createElement('a');link.textContent=part.text;link.href=part.href;link.target='_blank';link.rel='noopener noreferrer';el.append(link);}else if(part.strong){const strong=document.createElement('strong');strong.textContent=part.text;el.append(strong);}else el.append(document.createTextNode(part.text));}}
function textLinks(el,text){appendTextParts(el,textLinkParts(text));}
function renderPreview(el,text){el.classList.add('stream-rich');el.innerHTML=renderStreamHTML(text);}
// Only final, server-bound citation records may populate this list. Never infer
// sources from answer prose, inline links, tool names, or citation identifiers.
function finalSourceLinks(citations){
 const links=[],seen=new Set();
 if(!Array.isArray(citations))return links;
 for(const citation of citations){
  if(citation?.kind==='hadith'){const bound=normalizeHadithCitation(citation);if(bound&&!seen.has('hadith:'+bound.id)){seen.add('hadith:'+bound.id);links.push(bound);}continue;}
  if(!citation||typeof citation.id!=='string'||!citation.id.trim()||typeof citation.url!=='string')continue;
  let url;try{url=new URL(citation.url);}catch{continue;}
  const host=url.hostname;
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!host.includes('.')||/^(localhost$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|0\.)/.test(host)||/\.(localhost|local|internal)$/.test(host))continue;
  if(seen.has(url.href))continue;seen.add(url.href);
  const title=typeof citation.title==='string'?citation.title.trim():'';
  links.push({id:citation.id,url:url.href,title:title||'المصدر '+(links.length+1)});
 }
 return links;
}
function appendSources(el,citations,module){
 el.querySelector(':scope > .message-sources')?.remove();
 if(!['linah','qabas'].includes(module))return;
 const links=finalSourceLinks(citations);if(!links.length)return;
 const section=document.createElement('section');section.className='message-sources';section.setAttribute('aria-label','مصادر الإجابة');
 const title=document.createElement('h3');title.textContent='مصادر الإجابة';section.append(title);
 const hint=document.createElement('p');hint.className='sources-hint';hint.textContent=links.some(source=>source.kind==='hadith')?'اقرأ سجل الحديث هنا، أو اعرض النص المسترجع. الروابط الخارجية تفتح في علامة تبويب جديدة.':'تفتح الروابط في علامة تبويب جديدة.';section.append(hint);
 const list=document.createElement('ol');
 for(const source of links){if(source.kind==='hadith'){const item=renderHadithCitation(document,source);if(item)list.append(item);continue;}const item=document.createElement('li'),link=document.createElement('a');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=source.title;item.append(link);list.append(item);}
 section.append(list);el.append(section);
}
const reviewLabels={completed:'مراجعة آلية اكتملت',failed:'تعذرت المراجعة الإضافية؛ عُرضت الإجابة الأصلية.',not_run:'لم تُجرَ مراجعة إضافية ضمن هذا الطلب.'};
function finalReview(review){return review&&typeof review==='object'&&!Array.isArray(review)&&Object.hasOwn(reviewLabels,review.status)?{status:review.status}:undefined;}
function appendReview(el,review,module){
 el.querySelector(':scope > .message-review')?.remove();el.querySelector(':scope > .message-completion')?.remove();
 const bound=finalReview(review);if(!['linah','qabas'].includes(module)||!bound)return;
 const notice=document.createElement('p');notice.className='message-review';notice.dataset.reviewStatus=bound.status;notice.setAttribute('role','status');notice.textContent=reviewLabels[bound.status];
 el.querySelector(':scope > .message-content').after(notice);
}
function appendCompletion(el,module){
 if(!['linah','qabas'].includes(module)||el.querySelector(':scope > .message-completion'))return;
 const notice=document.createElement('p');notice.className='message-completion';notice.setAttribute('role','status');notice.textContent='الإجابة قيد الإكمال';el.querySelector(':scope > .message-content').after(notice);
}
function finalTemplate(message,module){
 const content=message.template||message.text;
 if(module!=='fata')return content;
 return message.displayTemplate??=prepareFataHandoffs(content,message.question,(target,question)=>handoffs.register(target,question));
}
function messageElement(message,module=selected){
 const el=document.createElement('article');el.className='message '+message.role;
 const name=document.createElement('strong');name.className='name';name.textContent=message.role==='user'?'أنت':names[module];el.append(name);
 const content=document.createElement('div');content.className='message-content';el.append(content);
 if(message.role==='user')textLinks(content,message.text);
 else if(message.incomplete){renderPreview(content,message.text);appendIncomplete(el,Boolean(message.text));}
 else if(!message.pending){renderGenesis(content,finalTemplate(message,module));appendSources(el,message.citations,module);appendReview(el,message.review,module);}
 if(message.ms&&!message.incomplete)appendElapsed(el,message.ms);
 return{el,content};
}
function appendElapsed(el,ms){const time=document.createElement('small');time.textContent=`اكتملت في ${(ms/1000).toFixed(1)} ثانية`;el.append(time);}
function appendIncomplete(el,hasText){el.querySelector(':scope > .message-completion')?.remove();el.classList.add('incomplete');const notice=document.createElement('p');notice.className='stream-incomplete';notice.setAttribute('role','status');notice.textContent=hasText?'توقفت الإجابة قبل اكتمالها. النص الظاهر جزئي وغير مكتمل.':'لم تكتمل الإجابة. يمكنك إعادة إرسال السؤال.';el.append(notice);}
function render(){syncCapabilitiesLayout();const box=$('#messages');clearGenesis();box.replaceChildren();for(const message of history[selected])box.append(messageElement(message).el);if(!box.children.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='ابدأ سؤالًا جديدًا مع '+names[selected];box.append(empty)}box.scrollTop=box.scrollHeight;}

// Keep the progress DOM (including its live timer) beside this request's reply.
const progressHome=document.createComment('progress-home');$('#progress').before(progressHome);
function trackReply(el){
 const box=$('#messages'),tail=document.createElement('span');tail.className='stream-tail';tail.setAttribute('aria-hidden','true');el.append(tail);
 let following=true,ignoreScroll=false,disposed=false,frame=0,inputVersion=0;
 const input=event=>{if(event.type==='keydown'&&!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))return;inputVersion++;following=false;};
 const scroll=()=>{if(ignoreScroll||disposed)return;const rect=tail.getBoundingClientRect();following=box.scrollHeight-box.scrollTop-box.clientHeight<=2&&rect.bottom<=innerHeight+2&&rect.top>=0;};
 const listeners=[['wheel',input],['touchmove',input],['pointerdown',input],['keydown',input],['scroll',scroll]];
 for(const[type,handler]of listeners)window.addEventListener(type,handler,{capture:true,passive:true});
 function move(action){ignoreScroll=true;action();requestAnimationFrame(()=>{ignoreScroll=false;});}
 move(()=>{box.scrollTop=box.scrollHeight;el.scrollIntoView({behavior:'instant',block:'center'});});
 return{
  follow(){if(frame||!following||disposed)return;frame=requestAnimationFrame(()=>{frame=0;if(following&&!disposed)move(()=>tail.scrollIntoView({behavior:'instant',block:'nearest'}));});},
  preserveFinal(){
   const position={top:box.scrollTop,x:scrollX,y:scrollY,inputVersion};
   // React's final renderer commits asynchronously; preserve reading position
   // after layout, unless the reader has interacted in the meantime.
   cancelAnimationFrame(frame);frame=0;
   return()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{if(inputVersion===position.inputVersion){box.scrollTop=position.top;window.scrollTo({left:position.x,top:position.y,behavior:'instant'});}this.dispose();}));
  },
  dispose(){disposed=true;cancelAnimationFrame(frame);for(const[type,handler]of listeners)window.removeEventListener(type,handler,true);tail.remove();}
 };
}
function choose(module,scroll=true){if(busy||!questions[module])return;selected=module;$('#module').value=module;$('#currentName').textContent=names[module];$('#startTitle').textContent='ابدأ من هنا مع '+names[module];$('#fataCapabilities').hidden=module!=='fata';document.querySelectorAll('.persona').forEach(b=>{b.classList.toggle('selected',b.dataset.module===module);b.setAttribute('aria-pressed',String(b.dataset.module===module))});$('#suggestions').replaceChildren();for(const [topic,q,hint] of questions[module]){const b=document.createElement('button');b.type='button';b.dataset.question=q;const tag=document.createElement('span'),title=document.createElement('strong'),action=document.createElement('span');tag.className='topic';tag.textContent=topic;title.textContent=q;action.className='question-action';action.textContent=hint+' ↗';b.append(tag,title,action);b.onclick=()=>askSuggested(q);$('#suggestions').append(b)}render();if(scroll)reveal('#startHere');}
document.querySelectorAll('.persona').forEach(b=>b.onclick=()=>choose(b.dataset.module));$('#module').onchange=e=>choose(e.target.value);$('#new').onclick=()=>{if(busy)return;history[selected]=[];delete ids[selected];render();reveal('#startHere')};
for(const button of document.querySelectorAll('#fataCapabilities [data-question]')){
 const atlas=button.dataset.question.match(/^(.+?)\s*\|\s*(https:\/\/barq\.salsabeel\.ai\/Manuscripts\/atlas)$/);
 if(atlas){const link=document.createElement('a');link.className='capability-link';link.href=atlas[2];link.textContent=atlas[1]+' ↗';link.target='_blank';link.rel='noopener noreferrer';button.replaceWith(link);continue;}
 button.onclick=()=>{if(selected==='fata')askSuggested(button.dataset.question)};
}
async function ensureSession(){const r=await fetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const d=await r.json();if(!r.ok)throw Error(d.error||'SESSION_UNAVAILABLE');if(d.new_session)for(const module of Object.keys(ids))delete ids[module];$('#accessStatus').textContent='جاهز للحوار · لا تحتاج إلى مفتاح أو رمز دخول';}
const sessionErrors={PROVIDER_RATE_LIMITED:'بلغت خدمة الشخصية حدّ الاستخدام حاليًا. لم تكتمل الإجابة؛ حاول لاحقًا. هذا لا يعني نقص المصادر.',CHALLENGE_KEY_DENIED:'خدمة التحدي غير متاحة حاليًا؛ يرجى مراجعة فريق سلسبيل.',ACCESS_RATE_LIMIT:'هناك زيارات كثيرة الآن؛ أعد المحاولة بعد قليل.',QUEUE_FULL:'قائمة الانتظار ممتلئة الآن؛ يرجى المحاولة بعد قليل.',QUEUE_TIMEOUT:'طال الانتظار ولم يبدأ طلبك؛ يمكنك إعادة إرساله الآن.',TRIAL_CAPACITY:'الخدمة تستقبل عددًا كبيرًا من الطلبات؛ يرجى المحاولة بعد قليل.',TOOL_NOT_ALLOWED:'تعذّر إكمال الطلب بسبب تعارض في ربط الأداة. هذا خطأ تقني ولا يعني نقص المصادر.'};
ensureSession().catch(err=>{$('#accessStatus').textContent=sessionErrors[err.message]||'تعذّر تجهيز الاتصال؛ سنحاول عند إرسال سؤالك.'});
$('#composer').onsubmit=async event=>{
 event.preventDefault();if(busy)return;
 const message=$('#question').value.trim();if(!message)return;
 const module=selected,started=performance.now(),box=$('#messages');
 setBusy(true);$('#error').hidden=true;$('#stage').textContent='جارٍ التحضير…';$('#timer').textContent='0.0 ث';
 const user={role:'user',text:message},assistant={role:'assistant',text:'',pending:true,question:message};
 history[module].push(user,assistant);syncCapabilitiesLayout();box.querySelector('.empty')?.remove();
 box.append(messageElement(user,module).el);
 const reply=messageElement(assistant,module);reply.el.classList.add('streaming');reply.el.setAttribute('aria-busy','true');reply.content.classList.add('stream-preview');box.append(reply.el);
 reply.content.before($('#progress'));$('#progress').hidden=false;$('#question').value='';
 const view=trackReply(reply.el),tick=setInterval(()=>$('#timer').textContent=((performance.now()-started)/1000).toFixed(1)+' ث',100);
 let finalized=false,previewFrame=0;
 function paintPreview(){previewFrame=0;renderPreview(reply.content,assistant.text);if(assistant.text)appendCompletion(reply.el,module);view.follow();}
 function finish(data){
  if(finalized)return;
  if(typeof data.answer!=='string')throw Error('STREAM_INVALID_FINAL');
  finalized=true;cancelAnimationFrame(previewFrame);previewFrame=0;
  const preserve=view.preserveFinal();
  if(data.conversation_id)ids[module]=data.conversation_id;
  Object.assign(assistant,{text:data.answer,template:data.template,ms:data.elapsed_ms,citations:finalSourceLinks(data.citations),...(module!=='fata'?{review:finalReview(data.review)}:{}),pending:false});
  reply.el.classList.remove('streaming');reply.el.setAttribute('aria-busy','false');reply.content.classList.remove('stream-preview','stream-rich');
  $('#progress').hidden=true;progressHome.after($('#progress'));
  renderGenesis(reply.content,finalTemplate(assistant,module));
  appendSources(reply.el,assistant.citations,module);
  appendReview(reply.el,assistant.review,module);
  if(assistant.ms)appendElapsed(reply.el,assistant.ms);
  preserve();
 }
 try{
  await ensureSession();
  const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Accept:'text/event-stream'},body:JSON.stringify({module,message,request_id:crypto.randomUUID(),...(ids[module]?{conversation_id:ids[module]}:{})})});
  if(!response.ok){const data=await response.json();throw Error(data.error||'REQUEST_FAILED');}
  if(response.headers.get('content-type')?.includes('application/json'))finish(await response.json());
  else await readEventStream(response.body,({event,data})=>{
   if(!['progress','text','final','error'].includes(event))return;
   const value=JSON.parse(data);
   if(event==='progress'&&typeof value.label==='string')$('#stage').textContent=value.label;
   else if(event==='text'){
    assistant.text=updateStreamText(assistant.text,value);
    $('#stage').textContent='تُكتب الإجابة…';
    if(!previewFrame)previewFrame=requestAnimationFrame(paintPreview);
   }else if(event==='error')throw Error(value.error||'STREAM_FAILED');
   else if(event==='final'){finish(value);return false;}
  });
  if(!finalized)throw Error('STREAM_INCOMPLETE');
 }catch(error){
  cancelAnimationFrame(previewFrame);previewFrame=0;
  assistant.pending=false;assistant.incomplete=true;reply.el.classList.remove('streaming');reply.el.setAttribute('aria-busy','false');
  renderPreview(reply.content,assistant.text);appendIncomplete(reply.el,Boolean(assistant.text));view.dispose();
  $('#error').hidden=false;$('#error').textContent=sessionErrors[error.message]||'لم تكتمل الإجابة. رمز الخطأ: '+error.message;
 }finally{
  setBusy(false);clearInterval(tick);$('#progress').hidden=true;progressHome.after($('#progress'));
 }
};choose('fata',false);
