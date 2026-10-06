import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';

const names = new Map(Object.entries({
 'index.html':'text/html; charset=utf-8','watch.css':'text/css; charset=utf-8',
 'watch.js':'text/javascript; charset=utf-8','poster-r10.jpg':'image/jpeg',
 'film-r10-music.mp4':'video/mp4','film-r10-voice.mp4':'video/mp4',
 'narration-r10.txt':'text/plain; charset=utf-8'
}));
export async function serveBeta(req,res,path,root=new URL('../public/beta/2-5/',import.meta.url)) {
 const prefix=['/final','/beta/2-5'].find(value=>path===value||path.startsWith(value+'/'));
 if(!prefix)return false;
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return true;}
 const name=(path===prefix||path===prefix+'/')?'index.html':path.slice(prefix.length+1);
 if(!names.has(name)){res.writeHead(404);res.end();return true;}
 const file=new URL(name,root);let info;
 try{info=await stat(file);}catch(e){if(e.code!=='ENOENT')throw e;res.writeHead(404);res.end();return true;}
 res.setHeader('Content-Type',names.get(name));
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; media-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'");
 res.setHeader('Cache-Control',name.endsWith('.mp4')?'public, max-age=86400':'no-cache');
 let start=0,end=info.size-1,status=200;
 if(name.endsWith('.mp4')) {
  res.setHeader('Accept-Ranges','bytes');
  // Range applies to GET; HEAD always describes the complete representation.
  if(req.method==='GET'&&req.headers.range){
   const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
   if(!m||(!m[1]&&!m[2])){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return true;}
   if(!m[1]){const count=Number(m[2]);start=Math.max(0,info.size-count);}
   else{start=Number(m[1]);if(m[2])end=Math.min(Number(m[2]),end);}
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return true;}
   status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);
  }
 }
 res.writeHead(status,{'Content-Length':end-start+1});
 if(req.method==='HEAD'){res.end();return true;}
 const stream=createReadStream(file,{start,end});
 stream.on('error',()=>res.destroy());res.once('close',()=>stream.destroy());stream.pipe(res);
 return true;
}
