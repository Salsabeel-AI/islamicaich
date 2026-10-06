// Bounded FIFO admission. At most `concurrency` upstream requests are active at a time (default one).
export class QueueError extends Error {
 constructor(code){super(code);this.code=code;}
}
export function createRequestQueue({maxWaiting=8,waitMs=120000,concurrency=1}={}){
 if(!Number.isInteger(maxWaiting)||maxWaiting<0||!Number.isFinite(waitMs)||waitMs<=0||!Number.isInteger(concurrency)||concurrency<1)throw new Error('Invalid queue limits');
 let running=0;const waiting=[];
 function grant(){
  running++;let released=false;
  return ()=>{
   if(released)return;released=true;running--;
   const next=waiting.shift();
   if(next){next.clean();next.resolve(grant());}
  };
 }
 function acquire({signal,onWait=()=>{}}={}){
  if(signal?.aborted)return Promise.reject(new QueueError('queue_cancelled'));
  if(running<concurrency)return Promise.resolve(grant());
  if(waiting.length>=maxWaiting)return Promise.reject(new QueueError('queue_full'));
  return new Promise((resolve,reject)=>{
   const item={resolve,clean:()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);}};
   const remove=code=>{const i=waiting.indexOf(item);if(i<0)return;waiting.splice(i,1);item.clean();reject(new QueueError(code));};
   const abort=()=>remove('queue_cancelled');
   const timer=setTimeout(()=>remove('queue_timeout'),waitMs);
   waiting.push(item);signal?.addEventListener('abort',abort,{once:true});
   try{onWait(waiting.length);}catch{remove('queue_cancelled');}
  });
 }
 return {acquire,snapshot:()=>({active:running>0,waiting:waiting.length})};
}
