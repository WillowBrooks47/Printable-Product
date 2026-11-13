/**
 * TPT Packager — builds the files with pdf-lib and JSZip.
 * Libraries are passed in so this runs the same in the browser and in Node tests.
 *
 *   const pkg = TPTPackager.create({ PDFLib, JSZip, core });
 */
(function (root) {
  'use strict';

  function create(deps) {
    var PDFLib = deps.PDFLib;
    var JSZip = deps.JSZip;
    var core = deps.core;
    var PDFDocument = PDFLib.PDFDocument;
    var StandardFonts = PDFLib.StandardFonts;
    var rgb = PDFLib.rgb;
    var degrees = PDFLib.degrees;

    function safe(font, text) {
      return core.sanitizeForFont(text, function (ch) {
        try { font.encodeText(ch); return true; } catch (e) { return false; }
      });
    }

    /** Reads page sizes and link counts (no rendering). */
    async function inspect(bytes) {
      var doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      return doc.getPages().map(function (page) {
        var size = page.getSize();
        var links = 0;
        var annots = page.node.Annots && page.node.Annots();
        if (annots) {
          for (var i = 0; i < annots.size(); i++) {
            var a = annots.lookup(i);
            var sub = a && a.get && a.get(PDFLib.PDFName.of('Subtype'));
            if (sub && sub.toString() === '/Link') links++;
          }
        }
        return { w: size.width, h: size.height, links: links };
      });
    }

    /**
     * Returns a copy of the PDF with every page on the target paper size.
     * Pages already that size are copied untouched; others are scaled to fit and centered.
     */
    async function resizePdf(bytes, sizeKey, meta) {
      var src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      var out = await PDFDocument.create();
      var pages = src.getPages();
      for (var i = 0; i < pages.length; i++) {
        var p = pages[i];
        var size = p.getSize();
        var rot = (p.getRotation().angle % 360 + 360) % 360;
        var sideways = rot === 90 || rot === 270;
        var shownW = sideways ? size.height : size.width;
        var shownH = sideways ? size.width : size.height;
        var target = core.targetDimensions(sizeKey, shownW, shownH);
        var already = !target || (Math.abs(target.w - shownW) < 2 && Math.abs(target.h - shownH) < 2);
        if (already) {
          var copied = await out.copyPages(src, [i]);
          out.addPage(copied[0]);
          continue;
        }
        if (!p.node.Contents()) {
          // An empty page has nothing to embed; add a blank page at the target size.
          out.addPage([target.w, target.h]);
          continue;
        }
        if (rot !== 0) {
          // Bake the rotation in so the page is drawn the way it is viewed.
          p.setRotation(degrees(0));
        }
        var embedded = await out.embedPage(p);
        var page = out.addPage([target.w, target.h]);
        var fit = core.fitInside(shownW, shownH, target.w, target.h);
        var opts = { xScale: fit.scale, yScale: fit.scale };
        if (rot === 0) {
          opts.x = fit.x; opts.y = fit.y;
        } else if (rot === 90) {
          opts.x = fit.x; opts.y = fit.y + shownH * fit.scale; opts.rotate = degrees(-90);
        } else if (rot === 180) {
          opts.x = fit.x + shownW * fit.scale; opts.y = fit.y + shownH * fit.scale; opts.rotate = degrees(180);
        } else {
          opts.x = fit.x + shownW * fit.scale; opts.y = fit.y; opts.rotate = degrees(90);
        }
        page.drawPage(embedded, opts);
      }
      setMeta(out, meta);
      return out.save();
    }

    function setMeta(doc, meta) {
      meta = meta || {};
      if (meta.title) doc.setTitle(meta.title);
      if (meta.author) doc.setAuthor(meta.author);
      doc.setCreator('TPT Packager');
      doc.setProducer('TPT Packager');
    }

    /**
     * Watermarked preview: a red banner at the top and bottom of every page,
     * plus a faint diagonal "PREVIEW" across the middle.
     * maxPages limits how many pages are included (0 = all).
     */
    async function buildPreview(bytes, opts) {
      opts = opts || {};
      var src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      var out = await PDFDocument.create();
      var total = src.getPageCount();
      var count = opts.maxPages ? Math.min(opts.maxPages, total) : total;
      var idx = [];
      for (var i = 0; i < count; i++) idx.push(i);
      var copied = await out.copyPages(src, idx);
      var bold = await out.embedFont(StandardFonts.HelveticaBold);
      var label = safe(bold, 'PREVIEW' + (opts.shopName ? '  •  ' + opts.shopName : '') + '  •  Full version on TPT');
      var red = rgb(0.776, 0.157, 0.157);

      copied.forEach(function (page) {
        out.addPage(page);
        var rot = (page.getRotation().angle % 360 + 360) % 360;
        if (rot !== 0) page.setRotation(degrees(0)); // keep the stamp math simple; previews are view-only
        var size = page.getSize();
        var w = size.width;
        var h = size.height;
        var bandH = Math.max(20, Math.min(30, h * 0.035));
        var fontSize = Math.min(12, bandH * 0.45);
        while (fontSize > 6 && bold.widthOfTextAtSize(label, fontSize) > w - 24) fontSize -= 0.5;
        var tw = bold.widthOfTextAtSize(label, fontSize);

        [h - bandH, 0].forEach(function (y) {
          page.drawRectangle({ x: 0, y: y, width: w, height: bandH, color: rgb(1, 1, 1), opacity: 0.92 });
          page.drawText(label, { x: (w - tw) / 2, y: y + (bandH - fontSize * 0.7) / 2, size: fontSize, font: bold, color: red });
        });

        var big = Math.min(w, h) * 0.2;
        var word = 'PREVIEW';
        var ww = bold.widthOfTextAtSize(word, big);
        var angle = Math.atan2(h, w);
        var cx = w / 2 - (ww / 2) * Math.cos(angle) + (big * 0.35) * Math.sin(angle);
        var cy = h / 2 - (ww / 2) * Math.sin(angle) - (big * 0.35) * Math.cos(angle);
        page.drawText(word, { x: cx, y: cy, size: big, font: bold, color: red, opacity: 0.12, rotate: degrees(angle * 180 / Math.PI) });
      });

      setMeta(out, { title: (opts.title || 'Product') + ' - Preview', author: opts.shopName });
      return { bytes: await out.save(), pages: count, total: total };
    }

    /** One-page (or longer) Read Me First PDF: thank-you, editable link, terms, store link. */
    async function buildReadMe(opts) {
      var s = opts.settings || {};
      var doc = await PDFDocument.create();
      var font = await doc.embedFont(StandardFonts.Helvetica);
      var bold = await doc.embedFont(StandardFonts.HelveticaBold);
      var dims = s.pageSize === 'A4' ? core.PAGE_SIZES.A4 : core.PAGE_SIZES.LETTER;
      var W = dims.w;
      var H = dims.h;
      var M = 60;
      var width = W - M * 2;
      var ink = rgb(0.12, 0.14, 0.2);
      var muted = rgb(0.38, 0.4, 0.45);
      var accent = rgb(0.13, 0.36, 0.6);
      var page = doc.addPage([W, H]);
      var y = H - M;

      function ensure(space) {
        if (y - space < M) { page = doc.addPage([W, H]); y = H - M; }
      }

      function paragraph(text, o) {
        o = o || {};
        var f = o.font || font;
        var size = o.size || 11;
        var lead = size * (o.lead || 1.45);
        var t = safe(f, text);
        var lines = core.wrapText(t, width, function (str) { return f.widthOfTextAtSize(str, size); });
        lines.forEach(function (line) {
          ensure(lead);
          var lw = f.widthOfTextAtSize(line, size);
          var x = o.center ? M + (width - lw) / 2 : M;
          page.drawText(line, { x: x, y: y - size, size: size, font: f, color: o.color || ink });
          if (o.link && line) addLink(page, x, y - size - 2, lw, size + 4, o.link);
          y -= lead;
        });
        y -= o.after === undefined ? 8 : o.after;
      }

      function addLink(pg, x, yy, w, h, url) {
        var annot = doc.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [x, yy, x + w, yy + h],
          Border: [0, 0, 0],
          A: { Type: 'Action', S: 'URI', URI: PDFLib.PDFString.of(url) }
        });
        var ref = doc.context.register(annot);
        var annots = pg.node.Annots();
        if (annots) annots.push(ref);
        else pg.node.set(PDFLib.PDFName.of('Annots'), doc.context.obj([ref]));
      }

      function heading(text) {
        y -= 6;
        ensure(40);
        paragraph(text, { font: bold, size: 14, after: 4 });
        page.drawLine({ start: { x: M, y: y + 2 }, end: { x: M + width, y: y + 2 }, thickness: 0.6, color: rgb(0.8, 0.82, 0.86) });
        y -= 8;
      }

      paragraph(opts.title || 'Read Me First', { font: bold, size: 22, center: true, after: 2, lead: 1.25 });
      if (s.shopName) paragraph('by ' + s.shopName, { size: 12, center: true, color: muted, after: 14 });
      else y -= 10;
      if (s.thankYou) paragraph(s.thankYou, { size: 11.5 });

      if (opts.copyUrl) {
        heading('Your editable Google version');
        paragraph('Sign in to your Google account, then click the link below. Google will ask you to make a copy, which saves your own editable version to your Google Drive.');
        paragraph('Click here to make your editable copy', { font: bold, size: 16, center: true, color: accent, link: opts.copyUrl, after: 4 });
        paragraph('Link not working? Paste this into your browser: ' + opts.copyUrl, { size: 8.5, color: muted, link: opts.copyUrl });
      }

      heading('Terms of use');
      String(s.terms || core.defaultTerms(s.shopName)).split(/\n\s*\n/).forEach(function (para) {
        if (para.trim()) paragraph(para.trim().replace(/\s*\n\s*/g, ' '), { size: 10.5 });
      });

      if (s.storeUrl) {
        heading('Find more resources');
        paragraph(s.storeUrl, { color: accent, link: s.storeUrl });
      }

      setMeta(doc, { title: (opts.title || 'Product') + ' - Read Me First', author: s.shopName });
      return doc.save();
    }

    /** files: [{ name, data }] → Uint8Array of a ZIP */
    async function buildZip(files) {
      var zip = new JSZip();
      files.forEach(function (f) { zip.file(f.name, f.data, { binary: true }); });
      return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    }

    /**
     * Builds the whole package.
     * input: { pdfBytes, docx: {name, bytes} | null, productName, settings, googleLink, previewPages, outputs: { readMe, preview, zip } }
     * Returns { files: [{ key, label, name, bytes, note }], copyUrl }
     */
    async function buildPackage(input) {
      var s = core.mergeSettings(input.settings, core.DEFAULT_SETTINGS);
      if (!s.terms) s.terms = core.defaultTerms(s.shopName);
      var name = core.cleanFileName(input.productName);
      var outputs = input.outputs || {};
      var copyUrl = input.googleLink ? core.forceCopyUrl(input.googleLink) : null;
      var files = [];
      var zipFiles = [];

      var printable = await resizePdf(input.pdfBytes, s.pageSize, { title: name, author: s.shopName });
      var printableName = name + ' - Print Ready.pdf';
      files.push({ key: 'pdf', label: 'Print-ready PDF', name: printableName, bytes: printable });
      zipFiles.push({ name: printableName, data: printable });

      if (input.docx && input.docx.bytes) {
        var docxName = name + ' - Editable.docx';
        files.push({ key: 'docx', label: 'Editable Word file', name: docxName, bytes: input.docx.bytes });
        zipFiles.push({ name: docxName, data: input.docx.bytes });
      }

      if (outputs.readMe !== false || copyUrl) {
        var readMe = await buildReadMe({ title: name, settings: s, copyUrl: copyUrl });
        var readMeName = name + ' - Read Me First.pdf';
        files.push({ key: 'readme', label: copyUrl ? 'Read Me First, with the make-a-copy link' : 'Read Me First', name: readMeName, bytes: readMe });
        zipFiles.push({ name: readMeName, data: readMe });
      }

      if (outputs.preview !== false) {
        var prev = await buildPreview(printable, { shopName: s.shopName, title: name, maxPages: input.previewPages || 0 });
        files.push({
          key: 'preview',
          label: 'Watermarked preview',
          name: name + ' - PREVIEW.pdf',
          bytes: prev.bytes,
          note: prev.pages < prev.total ? 'First ' + prev.pages + ' of ' + prev.total + ' pages' : 'All ' + prev.total + ' pages'
        });
      }

      if (outputs.zip !== false) {
        var zipBytes = await buildZip(zipFiles);
        files.unshift({
          key: 'zip',
          label: 'TPT upload ZIP',
          name: name + ' - TPT Upload.zip',
          bytes: zipBytes,
          note: zipFiles.length + ' files: ' + zipFiles.map(function (f) { return f.name.slice(name.length + 3); }).join(', ')
        });
      }

      return { files: files, copyUrl: copyUrl, name: name };
    }

    return {
      inspect: inspect,
      resizePdf: resizePdf,
      buildPreview: buildPreview,
      buildReadMe: buildReadMe,
      buildZip: buildZip,
      buildPackage: buildPackage
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TPTPackager = api;
})(typeof self !== 'undefined' ? self : this);
