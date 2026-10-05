
document.getElementById('print').addEventListener('click',()=>window.print());
const focusButtons=[...document.querySelectorAll('[data-focus]')];
for(const button of focusButtons)button.addEventListener('click',()=>{
 const focus=button.dataset.focus;
 for(const item of focusButtons)item.setAttribute('aria-pressed',String(item===button));
 document.getElementById('delivery-zone').classList.toggle('dim',focus==='platform');
 document.getElementById('platform-zone').classList.toggle('dim',focus==='delivery');
 document.getElementById('architecture-note').textContent=focus==='delivery'?'التركيز على حزمة المعرفة والتمثيلات وتخصيص النيات والتطبيق وأدلة الأثر. محركات سلسبيل السابقة اعتماد تشغيلي خارج الملفات المسلّمة.':focus==='platform'?'التركيز على قدرات سلسبيل المملوكة وقيمتها المؤسسية. استعمال المخرجات لا ينقل ملكية التنفيذ أو النماذج.':'المخطط الكامل ظاهر. لا يعني ظهور مكوّن أنه جديد أو أنه ضمن ملفات التسليم.';
});

function revealFlowTarget(){const id=decodeURIComponent(location.hash.slice(1));const target=document.getElementById(id);if(!target)return;for(let parent=target.parentElement;parent;parent=parent.parentElement){if(parent.tagName==='DETAILS')parent.open=true;}requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));}
window.addEventListener('hashchange',revealFlowTarget);if(location.hash)revealFlowTarget();
window.addEventListener('beforeprint',()=>document.querySelectorAll('#architecture-full-details, #architecture-full-details details').forEach(el=>{el.dataset.printOpen=String(el.open);el.open=true;}));
window.addEventListener('afterprint',()=>document.querySelectorAll('[data-print-open]').forEach(el=>{el.open=el.dataset.printOpen==='true';delete el.dataset.printOpen;}));
