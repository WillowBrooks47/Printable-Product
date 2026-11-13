const test = require('node:test');
const assert = require('node:assert/strict');
const PDFLib = require('pdf-lib');
const JSZip = require('jszip');
const core = require('../site/lib/core.js');
const pkg = require('../site/lib/packager.js').create({ PDFLib, JSZip, core });

async function samplePdf(w, h, pages = 3) {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([w, h]);
    p.drawText('Page ' + (i + 1), { x: 72, y: h - 100, size: 24, font });
  }
  return doc.save();
}

test('resizePdf converts A4 to Letter and leaves Letter alone', async () => {
  const a4 = await samplePdf(595.28, 841.89);
  const out = await PDFLib.PDFDocument.load(await pkg.resizePdf(a4, 'LETTER', { title: 'X' }));
  assert.equal(out.getPageCount(), 3);
  assert.deepEqual(out.getPage(0).getSize(), { width: 612, height: 792 });
  const kept = await PDFLib.PDFDocument.load(await pkg.resizePdf(a4, 'KEEP'));
  assert.ok(Math.abs(kept.getPage(0).getSize().width - 595.28) < 0.01);
});

test('resizePdf handles empty pages', async () => {
  const doc = await PDFLib.PDFDocument.create();
  doc.addPage([595.28, 841.89]);
  const out = await PDFLib.PDFDocument.load(await pkg.resizePdf(await doc.save(), 'LETTER'));
  assert.deepEqual(out.getPage(0).getSize(), { width: 612, height: 792 });
});

test('resizePdf keeps landscape pages landscape', async () => {
  const land = await samplePdf(842, 595, 1);
  const out = await PDFLib.PDFDocument.load(await pkg.resizePdf(land, 'LETTER'));
  assert.deepEqual(out.getPage(0).getSize(), { width: 792, height: 612 });
});

test('buildPreview limits pages', async () => {
  const pdf = await samplePdf(612, 792, 5);
  const r = await pkg.buildPreview(pdf, { shopName: 'Bright Minds', maxPages: 3 });
  assert.equal(r.pages, 3);
  assert.equal((await PDFLib.PDFDocument.load(r.bytes)).getPageCount(), 3);
});

test('buildReadMe adds clickable links and survives unusual characters', async () => {
  const bytes = await pkg.buildReadMe({
    title: 'Fraction Strips → Grade 3 ✓',
    settings: { shopName: 'Bright Minds', storeUrl: 'https://www.teacherspayteachers.com/store/x', thankYou: 'Thanks! 😀', pageSize: 'A4' },
    copyUrl: 'https://docs.google.com/document/d/abc/copy'
  });
  const doc = await PDFLib.PDFDocument.load(bytes);
  assert.ok(Math.abs(doc.getPage(0).getSize().width - 595.28) < 0.01);
  const info = await pkg.inspect(bytes);
  assert.ok(info.reduce((n, p) => n + p.links, 0) >= 3);
});

test('buildPackage builds the ZIP without the preview', async () => {
  const pdf = await samplePdf(612, 792, 4);
  const r = await pkg.buildPackage({
    pdfBytes: pdf,
    docx: { name: 'x.docx', bytes: new Uint8Array([80, 75, 3, 4]) },
    productName: 'Fraction Strips: Grade 3',
    settings: { shopName: 'Bright Minds' },
    googleLink: 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit',
    previewPages: 2,
    outputs: {}
  });
  assert.deepEqual(r.files.map((f) => f.key), ['zip', 'pdf', 'docx', 'readme', 'preview']);
  assert.match(r.copyUrl, /\/copy$/);
  const zip = await JSZip.loadAsync(r.files[0].bytes);
  assert.deepEqual(Object.keys(zip.files).sort(), [
    'Fraction Strips Grade 3 - Editable.docx',
    'Fraction Strips Grade 3 - Print Ready.pdf',
    'Fraction Strips Grade 3 - Read Me First.pdf'
  ]);
  assert.equal(r.files.find((f) => f.key === 'preview').note, 'First 2 of 4 pages');
});
