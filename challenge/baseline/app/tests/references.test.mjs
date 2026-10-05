import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
const built=buildSync({entryPoints:['src/genesis/rehypeBarqRefs.ts'],bundle:true,format:'esm',write:false});
const {findRefs}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
test('decomposed Quran citation names resolve without changing their displayed text',()=>{
 for(const text of ['(آل عمران: ٣١)','(ا\u0653ل عمران: ٣١)']){
  const refs=findRefs(text);assert.equal(refs.length,1);assert.equal(refs[0].surah,3);assert.equal(refs[0].ayah,31);assert.equal(refs[0].text,text);
 }
});
