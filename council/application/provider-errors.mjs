const BODY_LIMIT=16384,MAX_RETRY_MS=7*24*60*60*1000;
const requestHeaders=['apim-request-id','x-request-id','x-ms-request-id','request-id'];
const rateHeaders=['x-ratelimit-limit-requests','x-ratelimit-limit-tokens','x-ratelimit-remaining-requests','x-ratelimit-remaining-tokens','x-ratelimit-reset-requests','x-ratelimit-reset-tokens'];
// Structured codes only. Generic rate limiting does not identify a quota kind.
const codes=new Map([
 ['RateLimitReached','unknown'],['TooManyRequests','unknown'],['rate_limit_exceeded','unknown'],
 ['TokenRateLimitExceeded','token'],['TokensPerMinuteLimitExceeded','token'],
 ['RequestRateLimitExceeded','request'],['RequestsPerMinuteLimitExceeded','request'],
 ['CapacityExceeded','capacity'],['InsufficientCapacity','capacity'],['ServiceOverloaded','capacity'],
 ['InvalidRequest','unknown'],['BadRequest','unknown'],['invalid_request_error','unknown'],['InternalServerError','unknown'],
 ['content_filter','unknown'],['ResponsibleAIPolicyViolation','unknown'],
]);

function header(response,name,secrets){try{const value=response.headers?.get(name);return typeof value==='string'&&value.length<=256&&!secrets.some(secret=>typeof secret==='string'&&secret&&value.includes(secret))?value:null;}catch{return null;}}
function number(value,max=Number.MAX_SAFE_INTEGER){
 if(typeof value!=='string'||value.length>16||!/^\d+$/.test(value))return null;
 const parsed=Number(value);return Number.isSafeInteger(parsed)&&parsed>=0&&parsed<=max?parsed:null;
}
function requestId(value,secrets){
 if(typeof value!=='string'||! /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))return null;
 if(/bearer|sals_|sk-|secret|password|api.?key|github_pat_|gh[pousr]_|xox[baprs]-/i.test(value)||/^eyJ[A-Za-z0-9_-]+\./.test(value)||/^(?:AKIA|ASIA)[A-Z0-9]{16}$/.test(value)||secrets.some(secret=>typeof secret==='string'&&secret&&value.includes(secret)))return null;
 return value;
}
function retrySeconds(value,now){
 const numeric=number(value,MAX_RETRY_MS/1000);if(numeric!==null)return numeric;
 if(typeof value!=='string'||! /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value))return null;
 const date=Date.parse(value);if(!Number.isFinite(date)||new Date(date).toUTCString()!==value||!Number.isFinite(now))return null;
 const delay=Math.max(0,date-now);return delay<=MAX_RETRY_MS?delay/1000:null;
}

async function boundedErrorBody(response){
 let reader;
 try{
  if(!response.body?.getReader)return{state:'unavailable'};
  reader=response.body.getReader();let size=0;const chunks=[];
  while(true){
   const {value,done}=await reader.read();if(done)break;
   if(!(value instanceof Uint8Array)){await reader.cancel().catch(()=>{});return{state:'invalid'};}
   size+=value.byteLength;if(size>BODY_LIMIT){await reader.cancel().catch(()=>{});return{state:'oversize'};}
   chunks.push(value);
  }
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return{state:'parsed',value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))};
 }catch{return{state:'invalid'};}
 finally{try{reader?.releaseLock()}catch{}}
}

export async function describeProviderError(response,{now=Date.now(),secrets=[]}={}){
 const body=await boundedErrorBody(response),error=body.value?.error;
 const structured=[error?.code,error?.innererror?.code,error?.inner_error?.code].filter(code=>typeof code==='string'&&codes.has(code));
 const categories=new Set(structured.map(code=>codes.get(code)).filter(category=>category!=='unknown'));
 const metadata={provider_status:Number.isInteger(response.status)&&response.status>=400&&response.status<=599?response.status:null,provider_code:structured[0]||null,rate_limit_category:categories.size===1?[...categories][0]:'unknown',error_body_state:body.state};
 const seconds=retrySeconds(header(response,'retry-after',secrets),now),milliseconds=number(header(response,'retry-after-ms',secrets),MAX_RETRY_MS);
 if(seconds!==null)metadata.retry_after_seconds=seconds;
 if(milliseconds!==null)metadata.retry_after_ms=milliseconds;
 const requestIds={},rateLimits={};
 for(const name of requestHeaders){const value=requestId(header(response,name,secrets),secrets);if(value!==null)requestIds[name]=value;}
 for(const name of rateHeaders){const value=number(header(response,name,secrets));if(value!==null)rateLimits[name]=value;}
 if(Object.keys(requestIds).length)metadata.request_ids=requestIds;
 if(Object.keys(rateLimits).length)metadata.rate_limits=rateLimits;
 return{code:response.status===429?'PROVIDER_RATE_LIMITED':response.status===400?'PROVIDER_REQUEST_REJECTED':'PROVIDER_UNAVAILABLE',metadata,
  ...(response.status===429&&(seconds!==null||milliseconds!==null)?{retryAfterSeconds:Math.ceil(Math.max(seconds??0,(milliseconds??0)/1000))}:{}),
 };
}
