const test = require('node:test');
const assert = require('node:assert/strict');
const u = require('../site/lib/core.js');

test('describePageSize recognizes Letter, A4 and landscape', () => {
  assert.equal(u.describePageSize(612, 792), 'US Letter (8.5 × 11 in)');
  assert.equal(u.describePageSize(792, 612), 'US Letter (8.5 × 11 in), landscape');
  assert.equal(u.describePageSize(595.3, 841.9), 'A4 (210 × 297 mm)');
  assert.match(u.describePageSize(500, 700), /custom/);
});

test('targetDimensions keeps orientation', () => {
  assert.deepEqual(u.targetDimensions('LETTER', 595, 842), { w: 612, h: 792 });
  assert.deepEqual(u.targetDimensions('LETTER', 842, 595), { w: 792, h: 612 });
  assert.equal(u.targetDimensions('KEEP', 1, 1), null);
});

test('fitInside centers a smaller-aspect page', () => {
  const f = u.fitInside(595.28, 841.89, 612, 792);
  assert.ok(f.scale < 1);
  assert.ok(Math.abs(f.y) < 0.01);
  assert.ok(f.x > 0);
});

test('cleanFileName strips unsafe characters and extensions', () => {
  assert.equal(u.cleanFileName('Fractions: Grade 3/4 *Bundle*'), 'Fractions Grade 3 4 Bundle');
  assert.equal(u.cleanFileName('Fraction Strips.pdf'), 'Fraction Strips');
  assert.equal(u.cleanFileName('   '), 'Untitled');
  assert.equal(u.cleanFileName(null), 'Untitled');
});

test('forceCopyUrl builds /copy links from Google links', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
  assert.equal(u.forceCopyUrl('https://docs.google.com/document/d/' + id + '/edit?usp=sharing'),
    'https://docs.google.com/document/d/' + id + '/copy');
  assert.equal(u.forceCopyUrl('https://docs.google.com/presentation/u/0/d/' + id + '/edit'),
    'https://docs.google.com/presentation/d/' + id + '/copy');
  assert.equal(u.forceCopyUrl('https://example.com/nope'), null);
  assert.equal(u.forceCopyUrl(''), null);
});

test('mergeSettings ignores empty and unknown saved values', () => {
  assert.deepEqual(u.mergeSettings({ a: '', b: 'x', z: 'q' }, { a: 'A', b: 'B', c: 'C' }), { a: 'A', b: 'x', c: 'C' });
});

test('defaultTerms names the shop', () => {
  assert.match(u.defaultTerms('Bright Minds'), /copyrighted by Bright Minds/);
});

test('wrapText wraps by width and keeps line breaks', () => {
  const m = (s) => s.length;
  assert.deepEqual(u.wrapText('aa bb cc dd', 5, m), ['aa bb', 'cc dd']);
  assert.deepEqual(u.wrapText('one\ntwo', 10, m), ['one', 'two']);
  assert.deepEqual(u.wrapText('abcdefgh', 3, m), ['abc', 'def', 'gh']);
});

test('sanitizeForFont maps arrows and replaces unknown characters', () => {
  const ascii = (ch) => ch.charCodeAt(0) < 128;
  assert.equal(u.sanitizeForFont('Go → now ✓ 😀', ascii), 'Go -> now v ?');
});

test('scanPixels finds blank pages and edge ink', () => {
  const w = 20, h = 20;
  const white = new Uint8ClampedArray(w * h * 4).fill(255);
  assert.deepEqual(u.scanPixels(white, w, h, 4), { blank: true, edgeInk: false });
  const center = white.slice(); const i = (10 * w + 10) * 4; center[i] = center[i + 1] = center[i + 2] = 0;
  assert.deepEqual(u.scanPixels(center, w, h, 4), { blank: false, edgeInk: false });
  const edge = white.slice(); const j = (10 * w + 0) * 4; edge[j] = edge[j + 1] = edge[j + 2] = 0;
  assert.deepEqual(u.scanPixels(edge, w, h, 4), { blank: false, edgeInk: true });
});

test('printFindings reports the right problems', () => {
  const ok = { w: 612, h: 792, links: 0, blank: false, edgeInk: false };
  assert.equal(u.printFindings([ok, ok]).issues.length, 0);
  const r = u.printFindings([ok, { ...ok, links: 2, edgeInk: true }, { ...ok, blank: true }]);
  const text = r.issues.map((i) => i.text).join(' | ');
  assert.match(text, /0\.5 in of the edge on page 2/);
  assert.match(text, /2 links on page 2/);
  assert.match(text, /Blank page 3\. A blank last page/);
  assert.match(u.printFindings([{ ...ok, w: 500, h: 700 }]).issues[0].text, /Custom page size/);
});

test('pageList collapses ranges', () => {
  assert.equal(u.pageList([1, 2, 3, 5]), 'pages 1–3, 5');
  assert.equal(u.pageList([4]), 'page 4');
});
