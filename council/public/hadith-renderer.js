import {localHadithTarget} from './hadith-identity.js';

// Native DOM only. Source text never passes through HTML or custom Markdown.
export function normalizeHadithCitation(citation){
 if(!citation||citation.kind!=='hadith'||typeof citation.id!=='string'||!/^E[1-9]\d*$/.test(citation.id)||typeof citation.title!=='string'||citation.title.length>512||!Number.isSafeInteger(citation.referenceNumber)||citation.referenceNumber<1||citation.referenceNumber>160||!Array.isArray(citation.quoted_spans)||!citation.quoted_spans.length||citation.quoted_spans.length>16||citation.quoted_spans.some(span=>!span||typeof span.text!=='string'||span.text.length>1200||typeof span.span_id!=='string'||!new RegExp('^'+citation.id+':S[1-9]\\d*$').test(span.span_id)))return null;
 const target=!citation.bindingIssue&&localHadithTarget(citation.source_identity);
 return {id:citation.id,title:citation.title,kind:'hadith',referenceNumber:citation.referenceNumber,source_identity:citation.source_identity,...(target&&citation.readerPath===target.readerPath?{readerPath:target.readerPath}:{}),quoted_spans:citation.quoted_spans.map(({span_id,text})=>({span_id,text})),truncated:citation.truncated===true,coverage:citation.coverage,metadata:citation.metadata,...(citation.bindingIssue?{bindingIssue:citation.bindingIssue}:{})};
}
export function renderHadithCitation(document,raw){
 const citation=normalizeHadithCitation(raw);if(!citation)return null;
 const item=document.createElement('li');item.className='hadith-citation';item.dataset.evidenceId=citation.id;item.value=citation.referenceNumber;
 const heading=document.createElement('span');heading.textContent=citation.title;item.append(heading);
 const target=localHadithTarget(citation.source_identity);
 const hasReader=target&&citation.readerPath===target.readerPath;
 if(hasReader){
  const button=document.createElement('button');button.type='button';button.className='barq-ref';
  button.dataset.hadithSlug=target.slug;button.dataset.hadithNum=String(target.number);button.dataset.hadithScheme='local';
  button.textContent='اقرأ سجل برق '+target.number;button.setAttribute('aria-label',button.textContent+' — '+citation.title);item.append(button);
 }
 const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='النص المسترجع الذي استندت إليه الإجابة';details.append(summary);
 for(const span of citation.quoted_spans){const quote=document.createElement('blockquote');quote.dataset.spanId=span.span_id;quote.textContent=span.text;details.append(quote);}
 const note=document.createElement('p');note.textContent=(citation.truncated?'المعروض جزء من النص المسترجع. ':'')+(citation.metadata?.matchType==='approximate'?'مطابقة البحث تقريبية. ':'')+(hasReader?'هذه المقاطع محفوظة من نتيجة الأداة؛ زر القراءة يفتح السجل الحالي.':'هذه المقاطع محفوظة من نتيجة الأداة؛ لا يتوفر لها رابط قراءة موثّق.');details.append(note);item.append(details);
 return item;
}
