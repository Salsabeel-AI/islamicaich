import sanitizeHtml from 'sanitize-html';
const PREFIX='/api/barq/read/';
export function readerPath(raw) {
 try {
  const url=new URL(raw,'https://islamicaich.salsabeel.ai');
  if(url.origin!=='https://islamicaich.salsabeel.ai'||!url.pathname.startsWith(PREFIX))return null;
  const path=decodeURIComponent(url.pathname.slice(PREFIX.length));
  let allowed=[];
  const verse=/^(ayah|tafsir\/ayman)\/([1-9]\d{0,2})\/([1-9]\d{0,2})(?:\/action\/(qiraat|surah_metadata))?$/.exec(path);
  if(verse){if(+verse[2]>114||+verse[3]>286||(verse[4]&&verse[1]==='ayah'))return null;}
  else if(/^hadith-reference\/[a-z]{3,12}\/[1-9]\d{0,4}[a-z]?$/.test(path)){}
  else if(/^hadith\/[a-z]{3,12}\/[1-9]\d{0,4}[a-z]?$/.test(path)){allowed=['scheme'];if(/[a-z]$/.test(path)&&url.searchParams.get('scheme')!=='published')return null;}
  else if(/^root\/[ء-ي]{2,15}$/.test(path))allowed=['derive'];
  else if(/^attest\/[a-zA-Z0-9_ء-ي]{2,24}\/[ء-ي][ء-ي0-9 ()]{1,39}$/.test(path))allowed=['start','tk','root','diac'];
  else if(/^poetry\/(poetry|poetry_attr|الشعر|المنسوب)\/[0-9]{1,12}$/.test(path))allowed=['start'];
  else return null;
  for(const [key,value] of url.searchParams){
   if(!allowed.includes(key)||url.searchParams.getAll(key).length!==1)return null;
   if(key==='scheme'&&!/^(local|published)$/.test(value))return null;
   if(key==='start'&&!/^\d{1,5}$/.test(value))return null;
   if(key==='derive'&&!/^(1|true)$/.test(value))return null;
   if(key==='root'&&!/^[ء-ي]{2,6}$/.test(value))return null;
   if(['tk','diac'].includes(key)&&! /^[ء-يً-ْٰـ0-9\- ]{1,64}$/.test(value))return null;
  }
  return url.pathname+url.search;
 }catch{return null;}
}

export function sanitizeReader(data) {
 if(Array.isArray(data))return data.map(sanitizeReader);
 if(data&&typeof data==='object')return Object.fromEntries(Object.entries(data).map(([key,value])=>[key,key==='html'&&typeof value==='string'?sanitizeHtml(value,{
 allowedTags:['div','span','p','br','strong','b','em','i','ul','ol','li','table','thead','tbody','tr','td','th','a','h2','h3','h4','blockquote','details','summary'],
 allowedAttributes:{'*':['class','dir'],'a':['href','title'],'span':['class','dir','role','tabindex','data-root','data-surah','data-ayah','data-attest-source','data-attest-surface','data-attest-diac','data-attest-root']},allowedSchemes:['https'],allowProtocolRelative:false,
 }):sanitizeReader(value)]));
 return data;
}
