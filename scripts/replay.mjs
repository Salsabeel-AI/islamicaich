// Explicitly initiated, sequential evaluation against the reviewer's local app.
// No API key is read here: configure the server as described in docs/SETUP_AR.md.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const base=new URL(process.argv[2]||'http://127.0.0.1:8791');
if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw Error('Use your local app only.');
const cases=JSON.parse(await readFile(new URL('../evaluation/questions.json',import.meta.url),'utf8'));
const results=[];
for(const row of cases){
  const session=await fetch(new URL('/api/session',base));
  if(!session.ok)throw Error(`Session HTTP ${session.status}`);
  const cookie=session.headers.get('set-cookie')?.split(';')[0];
  if(!cookie)throw Error('Expected a new isolated session.');
  const started=Date.now();let result;
  try{
    const response=await fetch(new URL('/api/chat',base),{method:'POST',headers:{
      'Content-Type':'application/json',Origin:base.origin,Cookie:cookie},
      body:JSON.stringify({message:row.question,request_id:crypto.randomUUID()}),signal:AbortSignal.timeout(240000)});
    result={http_status:response.status,response:await response.json()};
  }catch(e){result={error:e.name};}
  results.push({...row,recorded_at_utc:new Date().toISOString(),seconds:(Date.now()-started)/1000,...result});
  console.log(`${row.id}: ${result.http_status||result.error}`);
}
const out=new URL('../runtime-results/',import.meta.url);await mkdir(out,{recursive:true});
await writeFile(new URL(`replay-${Date.now()}.json`,out),JSON.stringify(results,null,2));
console.log('Saved locally to runtime-results (ignored by Git). Review content and references manually.');
