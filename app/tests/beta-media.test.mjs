import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {serveBeta} from '../src/beta-media.mjs';
test('beta media serves seeks and HEAD safely without exposing other files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'salsabeel-beta-test-'));
 await writeFile(join(dir,'film-r10-music.mp4'),'0123456789');await writeFile(join(dir,'index.html'),'<h1>beta</h1>');await writeFile(join(dir,'secret.txt'),'private');
 const root=pathToFileURL(dir+'/');
 const server=http.createServer(async(req,res)=>{try{if(!await serveBeta(req,res,req.url,root)){res.writeHead(404);res.end();}}catch{res.writeHead(500);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  let r=await fetch(base+'/beta/2-5/');assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/media-src 'self'/);assert.equal(await r.text(),'<h1>beta</h1>');
  for(const [range,body,contentRange] of [['bytes=2-5','2345','bytes 2-5/10'],['bytes=-3','789','bytes 7-9/10'],['bytes=8-','89','bytes 8-9/10'],['bytes=8-99','89','bytes 8-9/10']]){r=await fetch(base+'/beta/2-5/film-r10-music.mp4',{headers:{range}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),contentRange);assert.equal(await r.text(),body);}
  for(const range of ['bytes=20-','bytes=5-2','bytes=-0','bytes=1-2,4-5','bytes=-']){r=await fetch(base+'/beta/2-5/film-r10-music.mp4',{headers:{range}});assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),'bytes */10');await r.arrayBuffer();}
  r=await fetch(base+'/beta/2-5/film-r10-music.mp4',{method:'HEAD',headers:{range:'bytes=2-3'}});assert.equal(r.status,200);assert.equal(r.headers.get('content-length'),'10');assert.equal(await r.text(),'');
  for(const name of ['secret.txt','%2e%2e%2fsecret.txt','.env']){r=await fetch(base+'/beta/2-5/'+name);assert.equal(r.status,404);await r.arrayBuffer();}
  r=await fetch(base+'/beta/2-5/',{method:'POST'});assert.equal(r.status,405);await r.arrayBuffer();
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
