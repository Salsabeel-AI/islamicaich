import Anchor from './Anchor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeBarqRefs from './rehypeBarqRefs';
import BarqMore from './BarqMore';
import BarqRefs from './BarqRefs';
import BarqRoots from './BarqRoots';
export default function Markdown({children,content}: {children?:string;content?:string;isLatestMessage?:boolean}) {
 return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeBarqRefs]} components={{
 code({className,children}) {const kind=/language-([\w-]+)/.exec(className||'')?.[1],value=String(children).replace(/\n$/,'');
  if(kind==='barq-more')return <BarqMore content={value}/>;
  if(kind==='barq-refs')return <BarqRefs content={value}/>;
  if(kind==='barq-roots')return <BarqRoots content={value}/>;
  if(kind==='barq-card'){try{const data=JSON.parse(value);return <div className="fata-choices">{data.text&&<p className="mb-3 whitespace-pre-wrap break-words">{data.text}</p>}{(data.buttons||[]).map((b:{label:string;value:string},i:number)=><button type="button" key={i} onClick={()=>window.dispatchEvent(new CustomEvent('fata-choice',{detail:b.value}))}>{b.label}</button>)}</div>}catch{return null}}
  if(kind?.startsWith('barq-')||kind==='vb-action'||kind==='mcp-ui')return null;
  return <code className={className}>{children}</code>;
 },a:Anchor,p({children}){return <p className="mb-2 whitespace-pre-wrap [unicode-bidi:plaintext]">{children}</p>},pre({children}){return <div className="code-container">{children}</div>}}}>{(children||content||'').replace(/\]\((#barq-attest:[^)]+)\)/g,(_m,href:string)=>`](${href.replace(/ /g,'%20')})`)}</ReactMarkdown>
}

