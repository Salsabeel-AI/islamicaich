import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const actual=source.slice(source.indexOf('let progressTimer='),source.indexOf('async function request('));
function setup(){
 const node=()=>({children:[],textContent:'',setAttribute(){},replaceChildren(){this.children=[];},append(...children){this.children.push(...children);},scrollIntoView(){}});
 const status=node(),nodes=new Map([['#status',status]]);let now=0,tick=null;
 const sandbox={busy:false,input:{},history:node(),Date:{now:()=>now},
  $:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);},
  document:{querySelectorAll:()=>[],querySelector:()=>status.children.find(x=>x.className==='progress-label'),createElement:node},
  setInterval:f=>{tick=f;return 1;},clearInterval:()=>{tick=null;}};
 vm.createContext(sandbox);vm.runInContext(actual,sandbox);
 return {run:s=>vm.runInContext(s,sandbox),label:()=>status.children.find(x=>x.className==='progress-label')?.textContent,
  elapsed:ms=>{now+=ms;tick?.();},timer:()=>tick,status};
}
test('explicit queue and deep progress survive elapsed timer; final/error reset state',()=>{
 const ui=setup();ui.run('setBusy(true)');ui.run('setProgress("طلبك في قائمة الانتظار")');
 ui.elapsed(25000);assert.equal(ui.label(),'طلبك في قائمة الانتظار');
 ui.run('setProgress("تفكير عميق")');ui.elapsed(25000);assert.equal(ui.label(),'تفكير عميق');
 ui.run('setBusy(false)');assert.equal(ui.status.hidden,true);assert.equal(ui.timer(),null);
 ui.run('setProgress("stale")');assert.equal(ui.label(),undefined);
 ui.run('setBusy(true)');ui.elapsed(25000);assert.match(ui.label(),/ما زلنا ننتظر/);
});
test('blank and oversized progress cannot suppress fallback status',()=>{
 const ui=setup();ui.run('setBusy(true);setProgress(" ");setProgress("x".repeat(200))');
 ui.elapsed(25000);assert.match(ui.label(),/ما زلنا ننتظر/);
});
