/* TPT Packager — page logic. Everything runs in the browser; files never leave the device. */
(function () {
  'use strict';

  var core = window.TPTCore;
  var pkg = window.TPTPackager.create({ PDFLib: window.PDFLib, JSZip: window.JSZip, core: core });
  var SETTINGS_KEY = 'tptPackagerSettings.v1';
  var THUMB_LIMIT = 40;

  var $ = function (id) { return document.getElementById(id); };
  var state = {
    pdf: null,      // { name, bytes, sample }
    docx: null,     // { name, bytes }
    check: null,
    result: null,
    busy: false
  };

  if (window.pdfjsLib) {
    // The worker script is loaded with a <script> tag, so pdf.js runs it on the main thread.
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
  }

  // ---------- Settings (remembered in this browser) ----------

  var SETTING_FIELDS = ['shopName', 'storeUrl', 'thankYou', 'terms', 'pageSize'];

  function loadSettings() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    var s = core.mergeSettings(saved, core.DEFAULT_SETTINGS);
    if (!s.terms) s.terms = core.defaultTerms(s.shopName);
    return s;
  }

  function readSettings() {
    var s = {};
    SETTING_FIELDS.forEach(function (f) { s[f] = $(f).value; });
    return s;
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(readSettings())); } catch (e) { /* storage blocked */ }
  }

  function fillSettings(s) {
    SETTING_FIELDS.forEach(function (f) { $(f).value = s[f] || ''; });
    $('shopDetails').open = !s.shopName;
  }

  // ---------- Files ----------

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(new Uint8Array(r.result)); };
      r.onerror = function () { reject(new Error('Could not read ' + file.name + '.')); };
      r.readAsArrayBuffer(file);
    });
  }

  async function setPdf(file) {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      showPdfError('That file is not a PDF. In Google Docs, choose File → Download → PDF document (.pdf).');
      return;
    }
    var bytes = await readFile(file);
    state.pdf = { name: file.name, bytes: bytes, sample: false };
    $('productName').value = core.cleanFileName(file.name);
    await afterPdfChange();
  }

  async function setDocx(file) {
    if (!/\.docx$/i.test(file.name)) {
      $('docxName').textContent = 'That file is not a .docx. In Google Docs, choose File → Download → Microsoft Word (.docx).';
      $('docxDrop').classList.add('has-error');
      return;
    }
    state.docx = { name: file.name, bytes: await readFile(file) };
    renderDocx();
    clearResult();
  }

  function renderDocx() {
    $('docxDrop').classList.remove('has-error');
    $('docxDrop').classList.toggle('filled', !!state.docx);
    $('docxName').textContent = state.docx ? state.docx.name + ' · ' + formatBytes(state.docx.bytes.length) : 'Optional. Goes into the ZIP for buyers who edit in Word.';
    $('docxClear').hidden = !state.docx;
  }

  function showPdfError(msg) {
    $('pdfDrop').classList.add('has-error');
    $('pdfName').textContent = msg;
  }

  function renderPdfName() {
    $('pdfDrop').classList.remove('has-error');
    $('pdfDrop').classList.add('filled');
    var p = state.pdf;
    $('pdfName').textContent = p.sample ? 'Sample worksheet loaded. Drop your own PDF here to replace it.' : p.name + ' · ' + formatBytes(p.bytes.length);
    $('sampleTag').hidden = !p.sample;
  }

  function wireDrop(zoneId, inputId, handler) {
    var zone = $(zoneId);
    var input = $(inputId);
    input.addEventListener('change', function () {
      if (input.files[0]) handler(input.files[0]).catch(fail);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('dragging'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('dragging'); });
    });
    zone.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files[0];
      if (f) handler(f).catch(fail);
    });
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  // ---------- Print check ----------

  async function afterPdfChange() {
    renderPdfName();
    clearResult();
    $('checkBody').innerHTML = '<p class="muted">Checking every page…</p>';
    $('thumbs').innerHTML = '';
    try {
      state.check = await runPrintCheck(state.pdf.bytes);
      renderCheck();
    } catch (e) {
      state.check = null;
      $('checkBody').innerHTML = '';
      $('checkBody').appendChild(el('p', 'issue danger', 'This PDF could not be opened (' + (e.message || e) + '). If it is password-protected, remove the password and try again.'));
    }
    updateBuildState();
  }

  async function runPrintCheck(bytes) {
    var pdfjs = window.pdfjsLib;
    var doc = await pdfjs.getDocument({ data: bytes.slice(0), isEvalSupported: false, disableFontFace: false }).promise;
    var pages = [];
    var thumbs = [];
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var scale = 0.5; // 36 px per inch
    for (var n = 1; n <= doc.numPages; n++) {
      var page = await doc.getPage(n);
      var vp1 = page.getViewport({ scale: 1 });
      var vp = page.getViewport({ scale: scale });
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp, annotationMode: pdfjs.AnnotationMode ? pdfjs.AnnotationMode.ENABLE_FORMS : undefined }).promise;
      var px = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var scan = core.scanPixels(px.data, canvas.width, canvas.height, Math.round(core.MIN_SAFE_MARGIN_PT * scale) - 1);
      var annots = await page.getAnnotations();
      var links = annots.filter(function (a) { return a.subtype === 'Link' && (a.url || a.unsafeUrl); }).length;
      pages.push({ w: vp1.width, h: vp1.height, links: links, blank: scan.blank, edgeInk: scan.edgeInk });
      if (n <= THUMB_LIMIT) thumbs.push(canvas.toDataURL('image/jpeg', 0.72));
      page.cleanup();
    }
    await doc.destroy();
    var findings = core.printFindings(pages);
    findings.pages = pages;
    findings.thumbs = thumbs;
    return findings;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function renderCheck() {
    var c = state.check;
    var body = $('checkBody');
    body.innerHTML = '';
    var target = $('pageSize').value;

    var meta = el('dl', 'facts');
    [['Pages', String(c.pages.length)], ['Page size', c.pageSize], ['Exports as', target === 'KEEP' ? 'Same size as the PDF' : core.PAGE_SIZES[target].label]].forEach(function (pair) {
      var d = el('div');
      d.appendChild(el('dt', null, pair[0]));
      d.appendChild(el('dd', null, pair[1]));
      meta.appendChild(d);
    });
    body.appendChild(meta);

    var issues = c.issues.filter(function (i) {
      // A custom size is fixed automatically when a target size is chosen.
      return !(target !== 'KEEP' && /^Custom page size/.test(i.text));
    });
    var resized = target !== 'KEEP' && c.pages.some(function (p) {
      var t = core.targetDimensions(target, p.w, p.h);
      return Math.abs(t.w - p.w) > 2 || Math.abs(t.h - p.h) > 2;
    });

    if (!issues.length) {
      body.appendChild(el('p', 'issue ok', 'No print problems found.'));
    } else {
      var ul = el('ul', 'issues');
      issues.forEach(function (i) { ul.appendChild(el('li', 'issue ' + i.level, i.text)); });
      body.appendChild(ul);
    }
    if (resized) {
      body.appendChild(el('p', 'issue info', 'Pages will be scaled to ' + core.PAGE_SIZES[target].label + ' and centered. Check the print-ready PDF before uploading.'));
    }

    var strip = $('thumbs');
    strip.innerHTML = '';
    c.thumbs.forEach(function (src, i) {
      var p = c.pages[i];
      var fig = el('figure', 'thumb' + (p.edgeInk || p.blank || p.links ? ' flagged' : ''));
      var img = el('img');
      img.src = src;
      img.alt = 'Page ' + (i + 1);
      fig.appendChild(img);
      var flags = [];
      if (p.edgeInk) flags.push('edge');
      if (p.links) flags.push('link');
      if (p.blank) flags.push('blank');
      fig.appendChild(el('figcaption', null, (i + 1) + (flags.length ? ' · ' + flags.join(', ') : '')));
      strip.appendChild(fig);
    });
    if (c.pages.length > c.thumbs.length) {
      strip.appendChild(el('p', 'muted more', '+ ' + (c.pages.length - c.thumbs.length) + ' more pages checked'));
    }
  }

  // ---------- Build ----------

  function updateBuildState() {
    var ready = !!(state.pdf && state.check) && !state.busy;
    $('build').disabled = !ready;
    var link = $('googleLink').value.trim();
    var linkOk = !link || !!core.forceCopyUrl(link);
    $('googleLinkHint').classList.toggle('danger', !linkOk);
    $('googleLinkHint').textContent = linkOk
      ? (link ? 'Buyers get: ' + core.forceCopyUrl(link) : 'Optional. Paste the link to your Google Doc, Slides or Sheets file.')
      : 'That doesn\'t look like a Google Docs, Slides or Sheets link. Open the file and copy the address from the browser bar.';
  }

  function clearResult() {
    state.result = null;
    $('result').hidden = true;
    $('fileList').innerHTML = '';
  }

  async function build() {
    if (!state.pdf) return;
    state.busy = true;
    updateBuildState();
    saveSettings();
    $('status').textContent = 'Building your package…';
    $('status').className = 'status';
    try {
      var outputs = { readMe: $('outReadMe').checked, preview: $('outPreview').checked, zip: $('outZip').checked };
      var r = await pkg.buildPackage({
        pdfBytes: state.pdf.bytes,
        docx: state.docx,
        productName: $('productName').value || state.pdf.name,
        settings: readSettings(),
        googleLink: $('googleLink').value.trim(),
        previewPages: Number($('previewPages').value) || 0,
        outputs: outputs
      });
      state.result = r;
      renderResult();
      $('status').textContent = '';
    } catch (e) {
      fail(e);
    } finally {
      state.busy = false;
      updateBuildState();
    }
  }

  var WHERE = {
    zip: 'Upload to TPT as the Product file.',
    preview: 'Upload to TPT as the Preview file. Kept out of the ZIP.',
    pdf: 'Also inside the ZIP.',
    docx: 'Also inside the ZIP.',
    readme: 'Also inside the ZIP.'
  };

  function renderResult() {
    var r = state.result;
    var list = $('fileList');
    list.innerHTML = '';
    r.files.forEach(function (f) {
      var li = el('li', 'file' + (f.key === 'zip' || f.key === 'preview' ? ' primary' : ''));
      var info = el('div', 'file-info');
      info.appendChild(el('strong', null, f.label));
      info.appendChild(el('span', 'file-name', f.name + ' · ' + formatBytes(f.bytes.length)));
      var where = WHERE[f.key];
      if (f.key === 'pdf' && !$('outZip').checked) where = '';
      if (f.key !== 'zip' && f.key !== 'preview' && !$('outZip').checked) where = '';
      info.appendChild(el('span', 'file-where', [f.note, where].filter(Boolean).join('. ').replace(/\.\./g, '.')));
      var btn = el('button', f.key === 'zip' || f.key === 'preview' ? 'btn' : 'btn quiet', 'Download');
      btn.type = 'button';
      btn.addEventListener('click', function () { download(f, btn); });
      li.appendChild(info);
      li.appendChild(btn);
      list.appendChild(li);
    });

    $('copyBox').hidden = !r.copyUrl;
    if (r.copyUrl) $('copyUrl').value = r.copyUrl;
    $('result').hidden = false;
    $('result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }

  var MIME = { pdf: 'application/pdf', zip: 'application/zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

  async function download(f, btn) {
    var ext = f.name.split('.').pop().toLowerCase();
    var blob = new Blob([f.bytes], { type: MIME[ext] || 'application/octet-stream' });
    var original = btn.textContent;
    var downloads = await getDownloads();
    if (downloads) {
      try {
        await downloads.save({ filename: f.name, data: blob });
        flash(btn, 'Saved', original);
      } catch (e) {
        if (e && e.code === 'declined') return;
        if (e && e.code === 'rate_limited') { flash(btn, 'One moment…', original); return; }
        fail(new Error('This viewer could not save ' + f.name + '. Open the page in a normal browser tab to download it.'));
      }
      return;
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    flash(btn, 'Downloaded', original);
  }

  var downloadsPromise = null;
  function getDownloads() {
    // Inside a claude.ai artifact, saves go through the viewer's download prompt.
    if (!(window.claude && typeof window.claude.use === 'function')) return Promise.resolve(null);
    if (!downloadsPromise) downloadsPromise = window.claude.use('downloads').catch(function () { return null; });
    return downloadsPromise;
  }

  function flash(btn, text, original) {
    btn.textContent = text;
    setTimeout(function () { btn.textContent = original; }, 1800);
  }

  function fail(err) {
    $('status').textContent = (err && err.message) ? err.message : String(err);
    $('status').className = 'status danger';
  }

  // ---------- Sample product (so the page shows what it does on first visit) ----------

  async function makeSample() {
    var L = window.PDFLib;
    var doc = await L.PDFDocument.create();
    var bold = await doc.embedFont(L.StandardFonts.HelveticaBold);
    var reg = await doc.embedFont(L.StandardFonts.Helvetica);
    var W = 595.28, H = 841.89; // A4, so the resize step has something to do
    var ink = L.rgb(0.13, 0.15, 0.2);
    var fills = [L.rgb(0.98, 0.86, 0.55), L.rgb(0.67, 0.84, 0.95), L.rgb(0.74, 0.9, 0.74), L.rgb(0.96, 0.75, 0.78)];

    var p1 = doc.addPage([W, H]);
    p1.drawText('Fraction Strips Practice', { x: 72, y: H - 110, size: 26, font: bold, color: ink });
    p1.drawText('Name: ______________________    Date: __________', { x: 72, y: H - 145, size: 12, font: reg, color: ink });
    [1, 2, 3, 4, 6, 8].forEach(function (parts, row) {
      var y = H - 210 - row * 70;
      var w = (W - 144) / parts;
      for (var i = 0; i < parts; i++) {
        p1.drawRectangle({ x: 72 + i * w, y: y, width: w, height: 44, color: fills[row % 4], borderColor: ink, borderWidth: 1 });
        var label = parts === 1 ? '1' : '1/' + parts;
        var tw = bold.widthOfTextAtSize(label, 14);
        p1.drawText(label, { x: 72 + i * w + (w - tw) / 2, y: y + 16, size: 14, font: bold, color: ink });
      }
    });

    var p2 = doc.addPage([W, H]);
    p2.drawText('Answer Key', { x: 72, y: H - 110, size: 26, font: bold, color: ink });
    p2.drawText('Watch the video lesson: www.example.com/fractions', { x: 72, y: H - 150, size: 12, font: reg, color: L.rgb(0.1, 0.35, 0.7) });
    var annot = doc.context.register(doc.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [72, H - 154, 360, H - 138], Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: L.PDFString.of('https://www.example.com/fractions') }
    }));
    p2.node.set(L.PDFName.of('Annots'), doc.context.obj([annot]));
    p2.drawRectangle({ x: 12, y: 60, width: W - 24, height: 26, color: L.rgb(0.2, 0.45, 0.35) });
    p2.drawText('(c) Sample Shop  -  footer band set too close to the edge', { x: 22, y: 69, size: 10, font: reg, color: L.rgb(1, 1, 1) });

    doc.addPage([W, H]); // an accidental blank last page
    doc.setTitle('Fraction Strips Practice');
    return doc.save();
  }

  // ---------- Wire up ----------

  async function init() {
    fillSettings(loadSettings());
    wireDrop('pdfDrop', 'pdfInput', setPdf);
    wireDrop('docxDrop', 'docxInput', setDocx);
    renderDocx();
    $('docxClear').addEventListener('click', function () { state.docx = null; renderDocx(); clearResult(); });
    $('build').addEventListener('click', build);
    $('googleLink').addEventListener('input', function () { updateBuildState(); clearResult(); });
    $('pageSize').addEventListener('change', function () { if (state.check) renderCheck(); clearResult(); saveSettings(); });
    ['shopName', 'storeUrl', 'thankYou', 'terms'].forEach(function (f) {
      $(f).addEventListener('change', function () { saveSettings(); clearResult(); });
    });
    ['productName', 'previewPages', 'outReadMe', 'outPreview', 'outZip'].forEach(function (f) {
      $(f).addEventListener('change', clearResult);
    });
    $('resetTerms').addEventListener('click', function () {
      $('terms').value = core.defaultTerms($('shopName').value);
      saveSettings();
      clearResult();
    });
    $('copyBtn').addEventListener('click', function () {
      var input = $('copyUrl');
      var done = function () { flash($('copyBtn'), 'Copied', 'Copy'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(input.value).then(done, function () { input.select(); });
      } else {
        input.select();
      }
    });
    updateBuildState();

    try {
      state.pdf = { name: 'Fraction Strips Practice.pdf', bytes: await makeSample(), sample: true };
      $('productName').value = 'Fraction Strips Practice';
      await afterPdfChange();
    } catch (e) {
      fail(e);
    }
  }

  init();
})();
