/** Bounded UTF-8 SSE decoding, shared by the server relay and browser. */
export async function* readEvents(stream) {
 const decoder=new TextDecoder();let buffer='',size=0;
 for await(const chunk of stream){
  size+=chunk.byteLength;if(size>4*1024*1024)throw new Error('Stream too large');
  buffer+=decoder.decode(chunk,{stream:true});
  let match;
  while((match=/\r?\n\r?\n/.exec(buffer))){
   const frame=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);
   let event='message';const data=[];
   for(const line of frame.split(/\r?\n/)){
    if(line.startsWith('event:'))event=line.slice(6).trim();
    if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''));
   }
   if(data.length)yield {event,data:JSON.parse(data.join('\n'))};
  }
  if(buffer.length>1024*1024)throw new Error('Stream frame too large');
 }
 buffer+=decoder.decode();
 if(buffer.trim())throw new Error('Incomplete stream frame');
}
