import test from 'node:test';
import assert from 'node:assert/strict';
import {publicTemplate,renderText,renderPartial,projectAnswer} from '../src/presentation.mjs';
const BS='\\';
const card='```barq-card\n{"buttons":[{"label":"A","value":"a"}],"text":""}\n```';
// What the hosted gateway really returned for «ما الفرق بين ذيب وذئب»: its barq-refs fence was cut by the fence that sits inside the ref body.
// The residue holds LITERAL backslash-n and backslash-quote sequences (escaped JSON).
const cut='\n\n\nbarq-card'+BS+'n{'+BS+'"buttons'+BS+'": [{'+BS+'"label'+BS+'": '+BS+'"A'+BS+'"}]}'+BS+'n```…'+BS+'",'+BS+'"icon'+BS+'":'+BS+'"🌱'+BS+'"}]}\n```\n';
const leaked='جواب [القرآن ٣](#barq-attest:القرآن:ذئب:ذِئْب)\n\n'+card+cut;
test('fixture really contains the escaped residue', () => {
 assert.ok(leaked.includes('barq-card'+BS+'n'));
});
test('template: residue of a cut barq-refs fence is removed, real card and attest link survive',()=>{
 const t=publicTemplate(leaked);
 assert.ok(!t.includes(BS+'n'),'no literal escaped newline');assert.ok(!t.includes('icon'),'no leaked JSON');
 assert.equal((t.match(/```/g)||[]).length,2,'only the real card fence remains');
 assert.ok(t.includes('(#barq-attest:القرآن:ذئب:ذِئْب)'));assert.ok(t.includes('```barq-card\n'));
});
test('template: valid fences that follow normal prose are untouched',()=>{
 const ok='نص\n\n```barq-more\nطويل\n```\n\n'+card+'\n\n```barq-refs\n{"refs":[]}\n```\n';
 assert.equal(publicTemplate(ok),ok.replace(card,publicTemplate(card)));
});
test('html fallback: attest link is a styled chip, never a bare dead span or link',()=>{
 const h=renderText('انظر [القرآن ٣](#barq-attest:القرآن:ذئب:ذِئْب) و[موقع](https://example.org/x)');
 assert.match(h,/<span class="attest-chip">القرآن ٣<\/span>/);assert.ok(!h.includes('#barq-attest'));assert.match(h,/<a href="https:\/\/example.org\/x"/);
});
test('streaming draft hides an unfinished link and any fence',()=>{
 assert.ok(!renderPartial('قبل [القرآن ٣](#barq-att').includes('barq-att'));
 assert.ok(!renderPartial('قبل [القر').includes('['));
 assert.ok(!renderPartial('x\n```barq-card\n{"buttons":[{"lab').includes('buttons'));
 assert.match(renderPartial('قبل [القرآن ٣](#barq-attest:a:b:c) بعد'),/attest-chip/);
});
test('projectAnswer end to end: leaked template is cleaned, buttons come from cards',()=>{
 const a=projectAnswer({service:'fata',answer:'جواب',presentation:{version:1,template:leaked,markdown:'جواب',cards:[{buttons:[{label:'A',value:'a'}]}],references:[],sections:[]}});
 assert.ok(!a.template.includes('icon'));assert.deepEqual(a.cards[0].buttons,[{label:'A',value:'a'}]);
});
