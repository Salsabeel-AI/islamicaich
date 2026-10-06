import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// This server reviews shipped browser assets. It deliberately has no network
// client, provider key, proxy, model endpoint, fake answer, or hosted session.
const files = new Map([
  ['index.html', 'text/html'], ['app.js', 'text/javascript'],
  ['genesis.js', 'text/javascript'], ['genesis.css', 'text/css'],
  ['hadith-identity.js', 'text/javascript'], ['hadith-renderer.js', 'text/javascript'],
  ['handoffs.js', 'text/javascript'], ['stream-ui.js', 'text/javascript'],
  ['style.css', 'text/css'], ['judge-guide.html', 'text/html'],
  ['judge-guide.css', 'text/css'], ['README.md', 'text/plain'],
]);
const review = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>معاينة مصدر مجلس سلسبيل</title><style>body{margin:0;background:#102722;color:#f2eedf;font-family:Tahoma,sans-serif}header{padding:20px;line-height:1.8}h1{font-size:23px;margin:0}p{margin:6px 0}a{color:#ecd795}iframe{display:block;width:100%;height:82vh;border:0;background:white}</style><header><h1>معاينة كود الواجهة المنشورة</h1><p>هذه معاينة محلية للواجهة؛ إرسال الأسئلة وفتح نصوص المراجع يحتاجان خدمة سلسبيل المستضافة. لا توجد إجابات تجريبية مصطنعة أو مفاتيح في هذه النسخة.</p><p><a href="https://islamicaich.salsabeel.ai/" target="_blank" rel="noopener noreferrer">افتح المجلس الحي للشخصيات الثلاث ↗</a> · <a href="/index.html">افتح الواجهة وحدها</a></p></header><iframe title="الواجهة العامة المطابقة للنسخة المثبتة" src="/index.html"></iframe></html>`;

function send(res, status, type, body, head = false) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { 'Content-Type': type + '; charset=utf-8', 'Content-Length': bytes.length,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(head ? undefined : bytes);
}

export async function handleRequest(req, res) {
  if (!/^(127\.0\.0\.1|localhost)(?::\d+)?$/.test(req.headers.host || '')) {
    return send(res, 403, 'application/json', JSON.stringify({ error: 'LOCAL_REVIEW_ONLY' }));
  }
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch { return send(res, 400, 'application/json', '{"error":"INVALID_PATH"}'); }
  if (pathname.startsWith('/api/')) {
    return send(res, 503, 'application/json', JSON.stringify({ error: 'HOSTED_COUNCIL_REQUIRED',
      message: 'معاينة واجهة فقط؛ استخدم المجلس الحي لإرسال الأسئلة وفتح المراجع.',
      live_demo: 'https://islamicaich.salsabeel.ai/' }));
  }
  if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, 'application/json', '{"error":"METHOD_NOT_ALLOWED"}');
  const head = req.method === 'HEAD';
  if (pathname === '/') return send(res, 200, 'text/html', review, head);
  const name = pathname.slice(1), type = files.get(name);
  if (!type) return send(res, 404, 'application/json', '{"error":"NOT_FOUND"}', head);
  try { return send(res, 200, type, await readFile(new URL('./public/' + name, import.meta.url)), head); }
  catch { return send(res, 500, 'application/json', '{"error":"ASSET_UNAVAILABLE"}', head); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8793);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid PORT');
  http.createServer((req, res) => { void handleRequest(req, res); }).listen(port, '127.0.0.1', () => {
    console.log(`Council source review: http://127.0.0.1:${port}`);
    console.log('Local UI only. Live answers: https://islamicaich.salsabeel.ai/');
  });
}
