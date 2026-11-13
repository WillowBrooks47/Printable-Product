/**
 * TPT Packager — pure helpers with no browser or library dependencies,
 * so they can be unit-tested in Node. In the browser they live on window.TPTCore.
 */
(function (root) {
  'use strict';

  var PAGE_SIZES = {
    LETTER: { w: 612, h: 792, label: 'US Letter (8.5 × 11 in)' },
    A4: { w: 595.28, h: 841.89, label: 'A4 (210 × 297 mm)' }
  };

  /** Minimum safe margin for home/school printers, in points (0.5 in). */
  var MIN_SAFE_MARGIN_PT = 36;

  var DEFAULT_SETTINGS = {
    shopName: '',
    storeUrl: '',
    pageSize: 'LETTER', // LETTER | A4 | KEEP
    terms: '',
    thankYou: 'Thank you so much for your purchase! This product includes a print-ready PDF and an editable version for customizing to fit your classroom.'
  };

  function near(a, b) {
    return Math.abs(a - b) < 2;
  }

  function describePageSize(widthPt, heightPt) {
    for (var key in PAGE_SIZES) {
      var s = PAGE_SIZES[key];
      if (near(widthPt, s.w) && near(heightPt, s.h)) return s.label;
      if (near(widthPt, s.h) && near(heightPt, s.w)) return s.label + ', landscape';
    }
    return (widthPt / 72).toFixed(2) + ' × ' + (heightPt / 72).toFixed(2) + ' in (custom)';
  }

  /** Returns 'LETTER' | 'A4' for matching dimensions (either orientation), or null. */
  function matchPageSize(widthPt, heightPt) {
    for (var key in PAGE_SIZES) {
      var s = PAGE_SIZES[key];
      if ((near(widthPt, s.w) && near(heightPt, s.h)) || (near(widthPt, s.h) && near(heightPt, s.w))) return key;
    }
    return null;
  }

  /** Width/height to apply for a target size, preserving landscape orientation. */
  function targetDimensions(sizeKey, currentW, currentH) {
    var s = PAGE_SIZES[sizeKey];
    if (!s) return null;
    return currentW > currentH ? { w: s.h, h: s.w } : { w: s.w, h: s.h };
  }

  /** Scale and offset that fit a page of size (w,h) centered inside (tw,th). */
  function fitInside(w, h, tw, th) {
    var scale = Math.min(tw / w, th / h);
    return { scale: scale, x: (tw - w * scale) / 2, y: (th - h * scale) / 2 };
  }

  function cleanFileName(name) {
    var cleaned = String(name || '')
      .replace(/\.(pdf|docx?)$/i, '')
      .replace(/[\\/:*?"<>|#%]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120)
      .trim();
    return cleaned || 'Untitled';
  }

  /** Pulls the document ID out of a Google Docs/Slides/Sheets link (or a bare ID). */
  function parseGoogleFileLink(input) {
    var s = String(input || '').trim();
    if (!s) return null;
    var m = s.match(/docs\.google\.com\/(document|presentation|spreadsheets)\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,})/);
    if (m) return { kind: m[1], id: m[2] };
    m = s.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]{20,})/);
    if (m) return { kind: 'file', id: m[1] };
    if (/^[a-zA-Z0-9_-]{25,}$/.test(s)) return { kind: 'document', id: s };
    return null;
  }

  /** Link that forces a buyer to make their own copy. Returns null if the link isn't usable. */
  function forceCopyUrl(input) {
    var f = parseGoogleFileLink(input);
    if (!f || f.kind === 'file') return null;
    return 'https://docs.google.com/' + f.kind + '/d/' + f.id + '/copy';
  }

  function stamp(date) {
    var d = date || new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function defaultTerms(shopName) {
    var shop = shopName ? shopName : 'the seller';
    return [
      'This resource is licensed for use by one teacher in their own classroom, for students and families of that classroom.',
      'Copying for an entire grade level, school, or district requires an additional license for each teacher.',
      'Posting any part of this resource online (including school websites, shared drives, or resale sites) is not permitted. ' +
        'Password-protected learning platforms such as Google Classroom are fine for your own students.',
      'All content is copyrighted by ' + shop + '. Thank you for respecting the time and work that went into this product!'
    ].join('\n\n');
  }

  function mergeSettings(saved, defaults) {
    var out = {};
    var k;
    for (k in defaults) out[k] = defaults[k];
    for (k in (saved || {})) {
      if (Object.prototype.hasOwnProperty.call(defaults, k) && saved[k] !== undefined && saved[k] !== null && saved[k] !== '') {
        out[k] = String(saved[k]);
      }
    }
    return out;
  }

  /**
   * Word-wraps text to a width. `measure(str)` returns the width of str.
   * Keeps explicit line breaks; splits words longer than the width.
   */
  function wrapText(text, maxWidth, measure) {
    var lines = [];
    String(text).split('\n').forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); return; }
      var line = '';
      words.forEach(function (word) {
        while (measure(word) > maxWidth && word.length > 1) {
          var cut = word.length - 1;
          while (cut > 1 && measure(word.slice(0, cut)) > maxWidth) cut--;
          if (line) { lines.push(line); line = ''; }
          lines.push(word.slice(0, cut));
          word = word.slice(cut);
        }
        var trial = line ? line + ' ' + word : word;
        if (line && measure(trial) > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = trial;
        }
      });
      lines.push(line);
    });
    return lines;
  }

  /** Characters the standard PDF fonts can't draw, mapped to safe stand-ins. */
  var CHAR_MAP = {
    '→': '->', '←': '<-', '✓': 'v', '✔': 'v', '★': '*', '☆': '*',
    ' ': ' ', ' ': ' ', '​': '', '−': '-', '‑': '-'
  };

  /** Replaces characters the PDF font can't encode. `canEncode(ch)` decides. */
  function sanitizeForFont(text, canEncode) {
    var out = '';
    for (var ch of String(text)) {
      if (Object.prototype.hasOwnProperty.call(CHAR_MAP, ch)) { out += CHAR_MAP[ch]; continue; }
      out += canEncode(ch) ? ch : '?';
    }
    return out;
  }

  /**
   * Scans RGBA pixels of a rendered page.
   * Returns { blank, edgeInk } where edgeInk means dark pixels sit within
   * `bandPx` of any edge (content printers may clip).
   */
  function scanPixels(data, width, height, bandPx) {
    var blank = true;
    var edgeInk = false;
    var stride = 2; // sample every other pixel; plenty for print checks
    for (var y = 0; y < height; y += stride) {
      var inBandY = y < bandPx || y >= height - bandPx;
      for (var x = 0; x < width; x += stride) {
        var i = (y * width + x) * 4;
        var a = data[i + 3];
        if (a < 16) continue;
        var lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (lum < 235) {
          blank = false;
          if (inBandY || x < bandPx || x >= width - bandPx) {
            edgeInk = true;
            return { blank: blank, edgeInk: edgeInk };
          }
        }
      }
    }
    return { blank: blank, edgeInk: edgeInk };
  }

  function pageList(nums) {
    if (nums.length === 0) return '';
    var parts = [];
    var start = nums[0];
    var prev = nums[0];
    for (var i = 1; i <= nums.length; i++) {
      var n = nums[i];
      if (n === prev + 1) { prev = n; continue; }
      parts.push(start === prev ? String(start) : start + '–' + prev);
      start = prev = n;
    }
    return (nums.length === 1 ? 'page ' : 'pages ') + parts.join(', ');
  }

  /**
   * Turns raw page facts into print-check findings.
   * pages: [{ w, h, links, blank, edgeInk }]
   */
  function printFindings(pages) {
    var issues = [];
    if (!pages.length) return { pageSize: 'No pages', issues: ['The PDF has no pages.'] };

    var first = pages[0];
    var sizes = {};
    pages.forEach(function (p) { sizes[describePageSize(p.w, p.h)] = true; });
    var sizeNames = Object.keys(sizes);
    var pageSize = sizeNames.length === 1 ? sizeNames[0] : 'Mixed page sizes';

    var custom = [];
    pages.forEach(function (p, i) { if (!matchPageSize(p.w, p.h)) custom.push(i + 1); });
    if (custom.length) {
      issues.push({ level: 'warn', text: 'Custom page size on ' + pageList(custom) + '. TPT buyers expect US Letter (or A4 outside the US). Pick a page size below to fix this automatically.' });
    }
    if (sizeNames.length > 1 && !custom.length) {
      issues.push({ level: 'info', text: 'The PDF mixes page sizes or orientations: ' + sizeNames.join('; ') + '.' });
    }

    var edge = [];
    pages.forEach(function (p, i) { if (p.edgeInk) edge.push(i + 1); });
    if (edge.length) {
      issues.push({ level: 'warn', text: 'Content within 0.5 in of the edge on ' + pageList(edge) + '. Many classroom printers clip it. Widen the margins, or ignore this for borders meant to bleed.' });
    }

    var linkPages = [];
    var linkCount = 0;
    pages.forEach(function (p, i) { if (p.links) { linkPages.push(i + 1); linkCount += p.links; } });
    if (linkCount) {
      issues.push({ level: 'warn', text: linkCount + ' link' + (linkCount === 1 ? '' : 's') + ' on ' + pageList(linkPages) + '. Links don\'t work on paper, so also print the address or add a QR code.' });
    }

    var blanks = [];
    pages.forEach(function (p, i) { if (p.blank) blanks.push(i + 1); });
    if (blanks.length) {
      var last = blanks[blanks.length - 1] === pages.length;
      issues.push({ level: 'warn', text: 'Blank ' + pageList(blanks) + '.' + (last ? ' A blank last page usually comes from empty lines at the end of the document.' : '') });
    }

    return { pageSize: pageSize, firstPage: first, issues: issues };
  }

  var api = {
    PAGE_SIZES: PAGE_SIZES,
    MIN_SAFE_MARGIN_PT: MIN_SAFE_MARGIN_PT,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    describePageSize: describePageSize,
    matchPageSize: matchPageSize,
    targetDimensions: targetDimensions,
    fitInside: fitInside,
    cleanFileName: cleanFileName,
    parseGoogleFileLink: parseGoogleFileLink,
    forceCopyUrl: forceCopyUrl,
    stamp: stamp,
    defaultTerms: defaultTerms,
    mergeSettings: mergeSettings,
    wrapText: wrapText,
    sanitizeForFont: sanitizeForFont,
    scanPixels: scanPixels,
    pageList: pageList,
    printFindings: printFindings
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TPTCore = api;
})(typeof self !== 'undefined' ? self : this);
