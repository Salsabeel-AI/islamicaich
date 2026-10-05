import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export function publicLink(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
    if (!u.hostname.includes('.') || /localhost|\.local$|\.internal$|:|^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) return null;
    if (/sals_|bearer/i.test(decodeURIComponent(u.href)) || [...u.searchParams.keys()].some(k => /token|key|secret|password|auth/i.test(k))) return null;
    return u.href;
  } catch { return null; }
}
export function publicWording(value) {
 return String(value ?? '').replace(/استشرت جدي قبس/g, 'مراجعة إضافية عبر التصعيد').replace(/تصعيد البحث إلى قبس/g, 'متابعة البحث عبر التصعيد').replace(/\bDS4\b/g, 'التصعيد');
}
/* Residue of a fence that was cut by an inner ``` (the hosted gateway turns the evidence comment into a barq-refs fence whose JSON body may itself contain a fence):
   it starts with a fence kind followed by a LITERAL backslash-n (escaped JSON), which is never real prose. */
const FENCE_RESIDUE = /(?:^|\n)[ \t]*(?:barq-[\w-]+|vb-action|mcp-ui)\\n[\s\S]*$/;
export function publicTemplate(value) {
 let orphan=false;
 return String(value).split(/(```[\s\S]*?```)/g).map((part,i)=>{
  if(i%2===0){const cut=FENCE_RESIDUE.exec(part);if(cut){orphan=true;part=part.slice(0,cut.index);}return publicWording(part);}
  if(orphan){orphan=false;if(!/^```(?:barq-[\w-]+|vb-action|mcp-ui)/.test(part))return '';}
  const match=/^```barq-card[^\n]*\n([\s\S]*?)```$/.exec(part);
  if(match){try{const card=JSON.parse(match[1]);return '```barq-card\n'+JSON.stringify({...card,text:publicWording(card.text),buttons:(card.buttons||[]).map(b=>({...b,label:publicWording(b.label)}))})+'\n```';}catch{return '';}}
  return publicWording(part);
 }).join('');
}
export function renderText(value) {
  const text = publicWording(value).slice(0, 30000)
    .replace(/<!--[^]*?(?:-->|$)/g, '')
    .replace(/```(?:barq-[\w-]+|vb-action|mcp-ui)[^\n]*\n[^]*?(?:```|$)/g, '');
  return sanitizeHtml(marked.parse(text, { gfm: true, breaks: true }), {
    allowedTags: ['p','br','strong','em','del','blockquote','ul','ol','li','h1','h2','h3','h4','h5','h6','pre','code','table','thead','tbody','tr','th','td','hr','a','details','summary','span','div','b','i','sup','sub'],
    allowedAttributes: { a: ['href','target','rel'], span: ['class'], '*': ['dir'], ol: ['start'] },
    allowedClasses: { span: ['attest-chip'] },
    allowedSchemes: ['https'], allowProtocolRelative: false,
    transformTags: { a: (_, attrs) => {
      if (/^#barq-attest:/.test(attrs.href || '')) return { tagName: 'span', attribs: { class: 'attest-chip' } };
      const href = publicLink(attrs.href);
      return { tagName: href ? 'a' : 'span', attribs: href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {} };
    } },
  });
}
/** Streaming draft: an emphasis marker still open at the cut is hidden until its closing pair arrives. */
export function renderPartial(value) {
  let text = String(value ?? '');
  if ((text.match(/\*\*/g) || []).length % 2) { const i = text.lastIndexOf('**'); text = text.slice(0, i) + text.slice(i + 2); }
  text = text.replace(/\[[^\]\n]*$/, '').replace(/\[[^\]\n]*\]\([^)\n]*$/, '');
  return renderText(text);
}
export function projectAnswer(data) {
  if (!data || data.service !== 'fata' || typeof data.answer !== 'string' || data.answer.length > 30000) throw new Error('invalid_response');
  const p = data.presentation;
  return {
    template: p?.version === 1 && typeof p.template === 'string' ? publicTemplate(p.template).slice(0,100000) : null,
    html: renderText(p?.version === 1 && typeof p.markdown === 'string' && p.markdown ? p.markdown : data.answer), text: publicWording(data.answer),
    sections: p?.version === 1 && Array.isArray(p.sections) ? p.sections.slice(0,8).map(s => ({ title: publicWording(s.title ?? 'المزيد').slice(0,200), html: renderText(s.body) })) : [],
    references: p?.version === 1 && Array.isArray(p.references) ? p.references.slice(0,8).map(r => ({ title: String(r.title ?? '').slice(0,300), html: renderText(r.excerpt), ...(publicLink(r.url) ? {url:publicLink(r.url)} : {}) })) : [],
    citations: Array.isArray(data.citations) ? data.citations.slice(0,20).flatMap(c => {
      const url = publicLink(c?.url); return url ? [{title:String(c.title ?? 'المصدر').slice(0,300),url}] : [];
    }) : [],
    cards: p?.version === 1 && Array.isArray(p.cards) ? p.cards.slice(0,12).map(c => ({
      buttons: Array.isArray(c.buttons) ? c.buttons.slice(0,24).flatMap(b =>
        typeof b.label === 'string' && typeof b.value === 'string' && b.value.trim() && b.value.length <= 6000 && !b.switchSpec && !b.fire
          ? [{label:publicWording(b.label).slice(0,300),value:b.value}] : []) : [],
    })) : [],
    limited: Boolean(p?.limited),
  };
}
