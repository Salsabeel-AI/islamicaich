const kinds=new Set(['lexical','tafsir_excerpt','statistics']);
let readerSerial=0;
export function normalizeInternalCitation(citation){
 if(!citation||citation.kind!=='salsabeel-evidence'||!/^E[1-9]\d*$/.test(citation.id||'')||typeof citation.title!=='string'||citation.title.length>512||!kinds.has(citation.source_identity?.kind)||!Number.isSafeInteger(citation.referenceNumber)||citation.referenceNumber<1||citation.referenceNumber>160||!Array.isArray(citation.quoted_spans)||!citation.quoted_spans.length||citation.quoted_spans.length>16)return null;
 if(citation.quoted_spans.some(span=>!span||typeof span.text!=='string'||!span.text.length||span.text.length>1200||typeof span.span_id!=='string'||!new RegExp('^'+citation.id+':S[1-9]\\d*$').test(span.span_id)))return null;
 return {id:citation.id,kind:citation.kind,title:citation.title,referenceNumber:citation.referenceNumber,source_identity:{kind:citation.source_identity.kind},quoted_spans:citation.quoted_spans.map(({span_id,text})=>({span_id,text})),truncated:citation.truncated===true};
}
export function renderInternalCitation(document,raw){
 const citation=normalizeInternalCitation(raw);if(!citation)return null;
 const item=document.createElement('li');item.className='internal-citation';item.dataset.evidenceId=citation.id;item.value=citation.referenceNumber;
 const details=document.createElement('details'),summary=document.createElement('summary');
 details.id='salsabeel-source-'+(++readerSerial);
 const link=document.createElement('a');link.href='#'+details.id;link.textContent='اقرأ المصدر: '+citation.title;
 link.addEventListener('click',()=>{details.open=true;});item.append(link);
 summary.textContent='النص المسترجع من المصدر';details.append(summary);
 for(const span of citation.quoted_spans){const quote=document.createElement('blockquote');quote.dataset.spanId=span.span_id;quote.textContent=span.text;details.append(quote);}
 const note=document.createElement('p');
 note.textContent=citation.source_identity.kind==='statistics'?'نتيجة أداة سلسبيل: قرائن إحصائية، وليست حكمًا تفسيريًا أو شرعيًا.':citation.truncated?'مقتطف مسترجع من المصدر، وليس النص الكامل.':'المقاطع المسترجعة من المصدر التي استندت إليها الإجابة.';
 details.append(note);item.append(details);return item;
}
