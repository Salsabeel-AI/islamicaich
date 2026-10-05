
const slides=[...document.querySelectorAll('.slide')];let index=0;

function resize(){let availableHeight=innerHeight-document.querySelector(".controls").getBoundingClientRect().height;let s=Math.min(innerWidth/1600,availableHeight/900);slides.forEach(x=>{x.style.transform=`scale(${s})`;x.style.left=(innerWidth-1600*s)/2+'px';x.style.top=(availableHeight-900*s)/2+'px'})}
function go(n){index=Math.max(0,Math.min(2,n));slides.forEach((x,i)=>{x.classList.toggle('active',i===index);x.setAttribute('aria-hidden',i!==index)});document.querySelectorAll('[data-slide]').forEach(x=>x.setAttribute('aria-current',Number(x.dataset.slide)===index));document.getElementById('previous').disabled=index===0;document.getElementById('next').disabled=index===2;document.getElementById('slide-count').textContent='الشريحة '+['١','٢','٣'][index]+' من ٣';history.replaceState(null,'','#'+(index+1))}
addEventListener('resize',resize);addEventListener('keydown',e=>{if(['ArrowLeft','PageDown',' '].includes(e.key)){e.preventDefault();go(index+1)}if(['ArrowRight','PageUp'].includes(e.key)){e.preventDefault();go(index-1)}if(e.key==='Home')go(0);if(e.key==='End')go(2);});resize();go(Number(location.hash.slice(1)||1)-1);

const actions=[()=>{go(index-1)},()=>{go(0)},()=>{go(1)},()=>{go(2)},()=>{go(index+1)},()=>{document.documentElement.requestFullscreen?.()},()=>{print()}];
document.querySelectorAll("[data-action]").forEach(el=>el.addEventListener("click",actions[Number(el.dataset.action)]));
