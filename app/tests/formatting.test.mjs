import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
const built=buildSync({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import Markdown from './src/genesis/Markdown';export const render=(text)=>renderToStaticMarkup(React.createElement(Markdown,{content:text}));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',jsx:'automatic',write:false});
const {createRequire}=await import('node:module');
const compiled={exports:{}};new Function('module','exports','require',Buffer.from(built.outputFiles[0].contents).toString())(compiled,compiled.exports,createRequire(import.meta.url));
const {render}=compiled.exports;
test('soft line breaks and literal bullets retain Genesis paragraph formatting and references',()=>{
 const html=render('الأحاديث\n• الشاهد الأول (البخاري: ١)\n• الشاهد الثاني\nالخلاصة');
 assert.match(html,/whitespace-pre-wrap/);assert.match(html,/unicode-bidi:plaintext/);
 assert.match(html,/\n• الشاهد الثاني\nالخلاصة/);assert.match(html,/barq-ref/);
});
test('cards retain multiline text and buttons while Markdown lists and tables keep their structure',()=>{
 const card=render('```barq-card\n'+JSON.stringify({text:'السطر الأول\nالسطر الثاني',buttons:[{label:'متابعة',value:'تابع'}]})+'\n```');
 assert.match(card,/<p class="[^"]*whitespace-pre-wrap[^"]*">السطر الأول\nالسطر الثاني<\/p>/);
 assert.match(card,/<button[^>]+>متابعة<\/button>/);
 const html=render('- الأول\n- الثاني\n\n| العمود |\n| --- |\n| القيمة |');
 assert.match(html,/<ul>/);assert.match(html,/<li>الأول<\/li>/);assert.match(html,/<table>/);
});
