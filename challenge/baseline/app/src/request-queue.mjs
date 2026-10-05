// Bounded FIFO admission. One upstream request remains active at a time.
export class QueueError extends Error {
 constructor(code){super(code);this.code=code;}
}
export function createRequestQueue({maxWaiting=8,waitMs=120000}={}){
 if(!Number.isInteger(maxWaiting)||maxWaiting<0||!Number.isFinite(waitMs)||waitMs<=0)throw new Error('Invalid queue limits');
 let active=false;const waiting=[];
 function grant(){
  active=true;let released=false;
  return ()=>{
   if(released)return;released=true;
   const next=waiting.shift();
   if(next){next.clean();next.resolve(grant());}else active=false;
  };
 }
 function acquire({signal,onWait=()=>{}}={}){
  if(signal?.aborted)return Promise.reject(new QueueError('queue_cancelled'));
  if(!active)return Promise.resolve(grant());
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
 return {acquire,snapshot:()=>({active,waiting:waiting.length})};
}
