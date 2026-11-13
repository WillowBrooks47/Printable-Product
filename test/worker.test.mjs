import test from 'node:test';
import assert from 'node:assert/strict';
import { googleExport, exportUrl } from '../src/worker.js';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
const req = (qs, method = 'GET') => new Request('https://tpt-packager.example/api/google-export?' + qs, { method });
function fakeFetch(body, init, finalUrl) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const r = new Response(body, init);
    Object.defineProperty(r, 'url', { value: finalUrl || '' });
    return r;
  };
  fn.calls = calls;
  return fn;
}

test('exportUrl builds Docs and Slides export links', () => {
  assert.equal(exportUrl('document', ID, 'docx'), `https://docs.google.com/document/d/${ID}/export?format=docx`);
  assert.equal(exportUrl('presentation', ID, 'pdf'), `https://docs.google.com/presentation/d/${ID}/export/pdf`);
});

test('passes a shared PDF through with its file name', async () => {
  const f = fakeFetch('%PDF-1.7', { headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="Fractions.pdf"' } },
    'https://doc-0s-1c-docs.googleusercontent.com/export/abc');
  const res = await googleExport(req(`kind=document&id=${ID}&format=pdf`), f);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition'), /Fractions\.pdf/);
  assert.equal(await res.text(), '%PDF-1.7');
  assert.equal(f.calls[0], exportUrl('document', ID, 'pdf'));
});

test('reports files that are not shared', async () => {
  const f = fakeFetch('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } }, 'https://accounts.google.com/ServiceLogin');
  const res = await googleExport(req(`kind=document&id=${ID}&format=pdf`), f);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'not_shared');
});

test('reports missing files', async () => {
  const res = await googleExport(req(`kind=document&id=${ID}&format=pdf`), fakeFetch('', { status: 404 }));
  assert.equal(res.status, 404);
});

test('refuses anything but Google Docs and Slides exports', async () => {
  const never = async () => { throw new Error('should not fetch'); };
  assert.equal((await googleExport(req(`kind=spreadsheets&id=${ID}&format=pdf`), never)).status, 400);
  assert.equal((await googleExport(req(`kind=presentation&id=${ID}&format=docx`), never)).status, 400);
  assert.equal((await googleExport(req(`kind=document&id=../../etc&format=pdf`), never)).status, 400);
  assert.equal((await googleExport(req(`kind=document&id=${ID}&format=pdf`, 'POST'), never)).status, 405);
});
