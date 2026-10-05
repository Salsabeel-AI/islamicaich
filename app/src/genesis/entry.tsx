import {createRoot} from 'react-dom/client';
import Markdown from './Markdown';
import InlineAyahViewer from './InlineAyahViewer';
import BarqShawahid from './BarqShawahid';
const roots=new Map<Element,ReturnType<typeof createRoot>>();
export function renderGenesis(element:Element,content:string){const root=createRoot(element);roots.set(element,root);root.render(<Markdown>{content}</Markdown>);}
export function clearGenesis(){for(const [el,root] of roots){root.unmount();roots.delete(el);}}
const popup=document.createElement('div');popup.id='genesis-popups';document.body.append(popup);createRoot(popup).render(<><InlineAyahViewer/><BarqShawahid/></>);
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target instanceof HTMLElement&&e.target.matches('.barq-ref,.barq-attest')){e.preventDefault();e.target.click();}});
