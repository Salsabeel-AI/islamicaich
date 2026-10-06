const video=document.querySelector('video'),toggle=document.querySelector('#music'),status=document.querySelector('#status');
const params=new URLSearchParams(location.search);let music=params.get('music')!=='off',switching=false;
const file=()=>`/final/film-r10-${music?'music':'voice'}.mp4?v=15`;
function label(){const text=music?'إيقاف الموسيقى مع استمرار الراوي':'تشغيل الموسيقى مع الراوي';toggle.setAttribute('aria-pressed',String(music));toggle.setAttribute('aria-label',text);toggle.title=text;}
label();
if(!music)video.src=file();
const initial=Number(params.get('t'));if(Number.isFinite(initial)&&initial>0)video.addEventListener('loadedmetadata',()=>{video.currentTime=Math.min(initial,video.duration-.1);},{once:true});
toggle.addEventListener('click',()=>{
 if(switching)return;
 switching=true;toggle.disabled=true;
 const at=video.currentTime,playing=!video.paused,rate=video.playbackRate,volume=video.volume,muted=video.muted;
 music=!music;label();
 video.addEventListener('loadedmetadata',()=>{video.currentTime=Math.min(at,video.duration-.1);video.playbackRate=rate;video.volume=volume;video.muted=muted;switching=false;toggle.disabled=false;if(playing)video.play().catch(()=>{status.textContent='اضغط تشغيل لمتابعة المشاهدة.';});},{once:true});
 video.src=file();video.load();
});
video.addEventListener('error',()=>{switching=false;toggle.disabled=false;status.textContent='تعذّر تحميل الفيديو. أعد المحاولة أو افتح رابط التحميل أدناه.';});
document.querySelectorAll('[data-time]').forEach(b=>b.addEventListener('click',()=>{if(switching)return;video.currentTime=Number(b.dataset.time);video.play().catch(()=>{});video.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}));
video.addEventListener('timeupdate',()=>{const list=[...document.querySelectorAll('.chapters [data-time]')];list.forEach((b,i)=>b.setAttribute('aria-current',String(video.currentTime>=Number(b.dataset.time)&&(!list[i+1]||video.currentTime<Number(list[i+1].dataset.time)))));});
document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',async()=>{const text=b.dataset.copy;try{await navigator.clipboard.writeText(text);status.textContent='نُسخ السؤال. افتح «جرّب برق» والصقه في المحادثة.';}catch{status.textContent='انسخ السؤال الظاهر ثم الصقه في المحادثة.';}}));
document.querySelector('#share').addEventListener('click',async()=>{const url=new URL("/final/",location.origin);url.search='';if(!music)url.searchParams.set('music','off');if(video.currentTime>0)url.searchParams.set('t',Math.floor(video.currentTime));try{await navigator.clipboard.writeText(url.href);status.textContent='نُسخ رابط المشاهدة مع موضع الفيديو وخيار الموسيقى.';}catch{status.textContent='رابط المشاهدة: '+url.href;}});
