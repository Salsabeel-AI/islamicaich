import test from 'node:test';
import assert from 'node:assert/strict';
import {describeProviderError} from './provider-errors.mjs';

const now=Date.UTC(2026,9,6,12,0,0);
function response(status=429,body={error:{code:'RateLimitReached'}},headers={}){
 return{status,ok:false,body:new Response(typeof body==='string'?body:JSON.stringify(body)).body,headers:{get:name=>headers[name]??null}};
}

for(const [status,code] of [[429,'PROVIDER_RATE_LIMITED'],[500,'PROVIDER_UNAVAILABLE'],[400,'PROVIDER_REQUEST_REJECTED']])test(`${status} preserves its explicit public error mapping`,async()=>{
 const result=await describeProviderError(response(status));assert.equal(result.code,code);assert.equal(result.metadata.provider_status,status);
});

test('generic rate limit stays unknown despite suggestive message and headers',async()=>{
 const value=await describeProviderError(response(429,{error:{code:'RateLimitReached',message:'token quota capacity requests secret provider prose'}},{'x-ratelimit-remaining-tokens':'0'}));
 assert.equal(value.metadata.rate_limit_category,'unknown');assert.equal(value.metadata.provider_code,'RateLimitReached');
 assert.doesNotMatch(JSON.stringify(value),/secret provider|message|quota capacity/);
});

test('only explicit allowlisted structured codes classify quota kind, with conflicts unknown',async()=>{
 for(const [code,category] of [['TokenRateLimitExceeded','token'],['RequestRateLimitExceeded','request'],['CapacityExceeded','capacity']]){
  const value=await describeProviderError(response(429,{error:{code:'RateLimitReached',innererror:{code}}}));assert.equal(value.metadata.rate_limit_category,category);
 }
 const conflict=await describeProviderError(response(429,{error:{code:'TokenRateLimitExceeded',innererror:{code:'RequestRateLimitExceeded'}}}));assert.equal(conflict.metadata.rate_limit_category,'unknown');
 const injected=await describeProviderError(response(429,{error:{code:'MY_PRIVATE_KEY',param:'secret',message:'TokenRateLimitExceeded'}}));assert.equal(injected.metadata.provider_code,null);assert.equal(injected.metadata.rate_limit_category,'unknown');assert.doesNotMatch(JSON.stringify(injected),/PRIVATE|secret/);
});

test('finite retry delay exposes an integer public delay without starting a retry',async()=>{
 const value=await describeProviderError(response(429,{}, {'retry-after':'2','retry-after-ms':'2501'}),{now});
 assert.equal(value.metadata.retry_after_seconds,2);assert.equal(value.metadata.retry_after_ms,2501);assert.equal(value.retryAfterSeconds,3);
 const nonRate=await describeProviderError(response(500,{}, {'retry-after':'2'}),{now});assert.equal(nonRate.retryAfterSeconds,undefined);
});

test('strict HTTP dates support past and future delays but reject normalized or distant dates',async()=>{
 const future=await describeProviderError(response(429,{}, {'retry-after':new Date(now+30000).toUTCString()}),{now});assert.equal(future.retryAfterSeconds,30);
 const past=await describeProviderError(response(429,{}, {'retry-after':new Date(now-30000).toUTCString()}),{now});assert.equal(past.retryAfterSeconds,0);
 for(const date of ['Mon, 06 Oct 2026 12:00:30 GMT','Tue, 30 Feb 2026 12:00:30 GMT','2026-10-06T12:00:30Z',new Date(now+8*86400000).toUTCString()]){
  const value=await describeProviderError(response(429,{}, {'retry-after':date}),{now});assert.equal(value.retryAfterSeconds,undefined,date);
 }
});

test('malformed, fractional, negative, nonfinite and excessive retry values are omitted',async()=>{
 for(const header of ['retry-after','retry-after-ms'])for(const raw of ['','-1','+1','1.5','1e3','0x10','Infinity','NaN','9007199254740993','1\r\nAuthorization: bad','9'.repeat(300)]){
  const value=await describeProviderError(response(429,{}, {[header]:raw}),{now});assert.equal(value.retryAfterSeconds,undefined,header+': '+raw);
 }
 const excessive=await describeProviderError(response(429,{}, {'retry-after':'604801','retry-after-ms':'604800001'}));assert.equal(excessive.retryAfterSeconds,undefined);
});

test('only six exact numeric quota headers are retained',async()=>{
 const headers={'x-ratelimit-limit-requests':'60','x-ratelimit-limit-tokens':'1000','x-ratelimit-remaining-requests':'0','x-ratelimit-remaining-tokens':'900','x-ratelimit-reset-requests':'10','x-ratelimit-reset-tokens':'20','x-ratelimit-key':'PRIVATE_DEPLOYMENT','authorization':'Bearer PRIVATE','x-custom-secret':'PRIVATE'};
 const value=await describeProviderError(response(429,{},headers));assert.equal(Object.keys(value.metadata.rate_limits).length,6);
 assert.equal(value.metadata.rate_limits['x-ratelimit-remaining-requests'],0);assert.doesNotMatch(JSON.stringify(value),/PRIVATE|authorization|x-ratelimit-key|x-custom/);
 for(const raw of ['-1','1.5','Infinity','1e6','9007199254740992','a'.repeat(300)]){
  const invalid=await describeProviderError(response(429,{}, {'x-ratelimit-limit-tokens':raw}));assert.equal(invalid.metadata.rate_limits,undefined);
 }
});

test('bounded request IDs reject injection, merged values, credential shapes and known secrets',async()=>{
 const allowed=await describeProviderError(response(429,{}, {'apim-request-id':'12345678-1234-1234-1234-123456789abc','x-request-id':'request_123:region.1'}));assert.equal(Object.keys(allowed.metadata.request_ids).length,2);
 const credentials=['a'.repeat(129),'one,two','abc\r\nAuthorization: private','Bearer-secret','sals_'+'a'.repeat(64),'sk-'+ 'a'.repeat(30),'ghp_'+ 'a'.repeat(30),'github_pat_'+ 'a'.repeat(30),'AKIA1234567890ABCDEF','eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature','opaqueKnownCredential'];
 for(const id of credentials){const value=await describeProviderError(response(429,{}, {'x-request-id':id}),{secrets:['opaqueKnownCredential']});assert.equal(value.metadata.request_ids,undefined,id);assert.ok(!JSON.stringify(value).includes(id));}
 const numericSecret=await describeProviderError(response(429,{}, {'retry-after':'123','x-ratelimit-limit-tokens':'123'}),{secrets:['123']});assert.equal(numericSecret.retryAfterSeconds,undefined);assert.equal(numericSecret.metadata.rate_limits,undefined);
});

test('error body byte limit accepts exactly 16KiB and rejects a larger valid-prefix body',async()=>{
 const json=JSON.stringify({error:{code:'RateLimitReached',message:'عربي 🌿'}}),pad=16384-Buffer.byteLength(json);
 const exact=await describeProviderError(response(429,json+' '.repeat(pad)));assert.equal(exact.metadata.error_body_state,'parsed');
 const larger=await describeProviderError(response(429,json+' '.repeat(pad+1)));assert.equal(larger.metadata.error_body_state,'oversize');assert.equal(larger.metadata.provider_code,null);
});

test('oversized chunked body is cancelled and never logs a partial JSON prefix',async()=>{
 let cancelled=0,step=0;const body=new ReadableStream({pull(controller){if(step++===0)controller.enqueue(new TextEncoder().encode('{"error":{"code":"RateLimitReached"}}'));else controller.enqueue(new Uint8Array(17000));},cancel(){cancelled++;}});
 const value=await describeProviderError({status:429,body,headers:new Headers()});assert.equal(value.code,'PROVIDER_RATE_LIMITED');assert.equal(value.metadata.error_body_state,'oversize');assert.equal(value.metadata.provider_code,null);assert.equal(cancelled,1);assert.equal(body.locked,false);
});

test('malformed JSON, UTF8 and body read failures retain HTTP classification without payloads',async()=>{
 const broken={status:429,headers:new Headers(),body:new ReadableStream({start(controller){controller.error(Error('PRIVATE_ERROR_BODY'));}})};
 const invalidUTF8={status:429,headers:new Headers(),body:new Response(Uint8Array.from([255])).body};
 for(const bad of [response(429,'PRIVATE_NON_JSON'),broken,invalidUTF8]){
  const value=await describeProviderError(bad);assert.equal(value.code,'PROVIDER_RATE_LIMITED');assert.equal(value.metadata.error_body_state,'invalid');assert.equal(value.metadata.rate_limit_category,'unknown');assert.doesNotMatch(JSON.stringify(value),/PRIVATE/);
 }
});

