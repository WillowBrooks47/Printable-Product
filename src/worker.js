// TPT Packager on Cloudflare.
// The page and its scripts in site/ are served as static files. This Worker adds one route,
// /api/google-export, which downloads a Google Doc or Slides file shared as "Anyone with the link"
// so the page can package it. Browsers can't read Google's export links directly from another
// website, so a server has to fetch them. Files pass straight through and are never stored.

const ID_RE = /^[a-zA-Z0-9_-]{20,120}$/;
const FORMATS = { document: ['pdf', 'docx'], presentation: ['pdf'] };
const MAX_BYTES = 100 * 1024 * 1024;
const GOOGLE_HOSTS = /(^|\.)(docs\.google\.com|googleusercontent\.com)$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/google-export') return googleExport(request);
    return env.ASSETS.fetch(request);
  }
};

function fail(status, code, message) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export function exportUrl(kind, id, format) {
  if (kind === 'document') return `https://docs.google.com/document/d/${id}/export?format=${format}`;
  return `https://docs.google.com/presentation/d/${id}/export/${format}`;
}

export async function googleExport(request, fetchImpl = fetch) {
  if (request.method !== 'GET') return fail(405, 'method', 'Use GET.');
  const q = new URL(request.url).searchParams;
  const kind = q.get('kind');
  const id = q.get('id') || '';
  const format = q.get('format') || 'pdf';
  if (!FORMATS[kind] || !FORMATS[kind].includes(format)) {
    return fail(400, 'bad_request', 'Only Google Docs (PDF or Word) and Google Slides (PDF) links can be imported.');
  }
  if (!ID_RE.test(id)) return fail(400, 'bad_request', 'That link has no valid Google file ID.');

  let res;
  try {
    res = await fetchImpl(exportUrl(kind, id, format), { redirect: 'follow', headers: { 'user-agent': 'TPT-Packager' } });
  } catch (e) {
    return fail(502, 'google_unreachable', 'Google could not be reached. Try again in a minute.');
  }

  const type = (res.headers.get('content-type') || '').toLowerCase();
  let finalHost = '';
  try { finalHost = new URL(res.url).hostname; } catch (e) { /* mocked responses have no url */ }
  if (res.status === 404) {
    return fail(404, 'not_found', 'Google says this file does not exist. Check the link.');
  }
  if (!res.ok || type.includes('text/html') || (finalHost && !GOOGLE_HOSTS.test(finalHost))) {
    return fail(403, 'not_shared',
      'Google would not share this file. In the file, click Share → General access → Anyone with the link (Viewer), then try again.');
  }
  const size = Number(res.headers.get('content-length') || 0);
  if (size > MAX_BYTES) return fail(413, 'too_large', 'This file is over 100 MB. Download it from Google and upload it instead.');

  return new Response(res.body, {
    status: 200,
    headers: {
      'content-type': type || 'application/octet-stream',
      'content-disposition': res.headers.get('content-disposition') || '',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}
