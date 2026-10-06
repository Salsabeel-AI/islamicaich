import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { handleRequest } from '../preview.mjs';
import { normalizeInternalCitation } from '../public/internal-renderer.js';

async function request(url, method = 'GET', host = '127.0.0.1:8793') {
  const result = {};
  await handleRequest({ url, method, headers: { host } }, {
    writeHead(status, headers) { result.status = status; result.headers = headers; },
    end(body) { result.body = body === undefined ? '' : body.toString(); },
  });
  return result;
}

test('public snapshot contains only the recorded files, all with exact provenance hashes', async () => {
  const record = JSON.parse(await readFile(new URL('../provenance.json', import.meta.url), 'utf8'));
  assert.deepEqual((await readdir(new URL('../public/', import.meta.url))).sort(), record.files.map(f => f.file).sort());
  for (const file of record.files) {
    const bytes = await readFile(new URL('../public/' + file.file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.file);
    assert.equal(bytes.length, file.bytes);
    const text = bytes.toString();
    assert.doesNotMatch(text, /(?:sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sourceMappingURL=)/);
  }
  assert.deepEqual((await readdir(new URL('../application/', import.meta.url))).sort(), record.application_files.map(f => f.file.slice('application/'.length)).sort());
  for (const file of record.application_files) {
    const bytes = await readFile(new URL('../' + file.file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.file);
    assert.equal(bytes.length, file.bytes);
    if (file.exact_source_bytes) assert.equal(file.sha256, file.source_sha256, file.file);
    assert.doesNotMatch(bytes.toString(), /(?:GenesisChat|\.env\b|from ['"]\.\/runtime|from ['"]\.\/contract|function mockedRuntime)/);
  }
});

test('review landing explicitly separates live inference from the exact browser asset', async () => {
  const landing = await request('/');
  assert.equal(landing.status, 200);
  assert.match(landing.body, /معاينة محلية/);
  assert.match(landing.body, /https:\/\/islamicaich\.salsabeel\.ai\//);
  const raw = await request('/index.html');
  assert.equal(raw.body, await readFile(new URL('../public/index.html', import.meta.url), 'utf8'));
});

test('local requests never fake session readiness, model answers, or reader data', async () => {
  for (const route of ['/api/access', '/api/chat', '/api/barq/read/ayah/49/11', '/api/services']) {
    const response = await request(route, 'POST');
    assert.equal(response.status, 503);
    const data = JSON.parse(response.body);
    assert.equal(data.error, 'HOSTED_COUNCIL_REQUIRED');
    assert.equal(Object.hasOwn(data, 'answer'), false);
    assert.equal(response.headers['Set-Cookie'], undefined);
  }
});

test('allowlist does not expose server files, private paths, dotfiles or traversal', async () => {
  for (const path of ['/preview.mjs', '/package.json', '/.env', '/private/agents.json', '/../preview.mjs', '/%2e%2e%2fpreview.mjs', '/index.html/extra']) {
    assert.equal((await request(path)).status, 404, path);
  }
  assert.equal((await request('/', 'GET', 'untrusted.example:8793')).status, 403);
  assert.equal((await request('/index.html', 'POST')).status, 405);
});

test('HEAD preserves asset content length without sending its content', async () => {
  const get = await request('/app.js'), head = await request('/app.js', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.headers['Content-Length'], get.headers['Content-Length']);
  assert.equal(head.body, '');
});

test('native source module is served and rejects cross-source or malformed citation records', async () => {
  const asset = await request('/internal-renderer.js');
  assert.equal(asset.status, 200);
  const citation = {id:'E1',kind:'salsabeel-evidence',title:'مصدر اختبار',referenceNumber:1,
    source_identity:{kind:'lexical'},quoted_spans:[{span_id:'E1:S1',text:'نص المقطع المسترجع'}]};
  assert.equal(normalizeInternalCitation(citation).quoted_spans[0].text, citation.quoted_spans[0].text);
  assert.equal(normalizeInternalCitation({...citation,quoted_spans:[{span_id:'E2:S1',text:'من مصدر آخر'}]}),null);
  assert.equal(normalizeInternalCitation({...citation,source_identity:{kind:'unverified'}}),null);
  assert.equal(normalizeInternalCitation({...citation,quoted_spans:[]}),null);
});
