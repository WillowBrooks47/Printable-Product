const test = require('node:test');
const assert = require('node:assert/strict');
const u = require('../src/Util.js');

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

test('marginIssues flags margins under 0.5 in', () => {
  assert.equal(u.marginIssues({ top: 72, bottom: 72, left: 72, right: 72 }).length, 0);
  const issues = u.marginIssues({ top: 18, bottom: 72, left: 36, right: 20 });
  assert.equal(issues.length, 2);
  assert.match(issues[0], /^Top margin is 0.25 in/);
});

test('cleanFileName strips unsafe characters', () => {
  assert.equal(u.cleanFileName('Fractions: Grade 3/4 *Bundle*'), 'Fractions Grade 3 4 Bundle');
  assert.equal(u.cleanFileName('   '), 'Untitled');
  assert.equal(u.cleanFileName(null), 'Untitled');
});

test('forceCopyUrl builds the /copy link', () => {
  assert.equal(u.forceCopyUrl('abc123'), 'https://docs.google.com/document/d/abc123/copy');
});

test('mergeSettings ignores empty saved values', () => {
  assert.deepEqual(u.mergeSettings({ a: '', b: 'x' }, { a: 'A', b: 'B', c: 'C' }), { a: 'A', b: 'x', c: 'C' });
});

test('defaultTerms names the shop', () => {
  assert.match(u.defaultTerms('Bright Minds'), /copyrighted by Bright Minds/);
});
