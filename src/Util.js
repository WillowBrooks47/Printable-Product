/**
 * Pure helper functions (no Google services) so they can be unit-tested in Node.
 * In Apps Script every file shares one global scope, so these are plain globals.
 */

var PAGE_SIZES = {
  LETTER: { w: 612, h: 792, label: 'US Letter (8.5 × 11 in)' },
  A4: { w: 595.28, h: 841.89, label: 'A4 (210 × 297 mm)' }
};

/** Minimum safe margin for home/school printers, in points (0.5 in). */
var MIN_SAFE_MARGIN_PT = 36;

function describePageSize(widthPt, heightPt) {
  for (var key in PAGE_SIZES) {
    var s = PAGE_SIZES[key];
    if (near(widthPt, s.w) && near(heightPt, s.h)) return s.label;
    if (near(widthPt, s.h) && near(heightPt, s.w)) return s.label + ', landscape';
  }
  return (widthPt / 72).toFixed(2) + ' × ' + (heightPt / 72).toFixed(2) + ' in (custom)';
}

function near(a, b) {
  return Math.abs(a - b) < 2;
}

/** Returns the page size key ('LETTER' | 'A4') matching the given dimensions, or null. */
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
  var landscape = currentW > currentH;
  return landscape ? { w: s.h, h: s.w } : { w: s.w, h: s.h };
}

function marginIssues(m) {
  var issues = [];
  ['top', 'bottom', 'left', 'right'].forEach(function (side) {
    if (typeof m[side] === 'number' && m[side] < MIN_SAFE_MARGIN_PT) {
      issues.push(
        capitalize(side) + ' margin is ' + (m[side] / 72).toFixed(2) +
        ' in. Many printers clip anything closer than 0.5 in to the edge.'
      );
    }
  });
  return issues;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cleanFileName(name) {
  var cleaned = String(name || '')
    .replace(/[\\/:*?"<>|#%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trim();
  return cleaned || 'Untitled';
}

/** Link that forces a buyer to make their own copy of a Google Doc. */
function forceCopyUrl(docId) {
  return 'https://docs.google.com/document/d/' + docId + '/copy';
}

function stamp(date) {
  var d = date || new Date();
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + p(d.getMinutes());
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
    if (saved[k] !== undefined && saved[k] !== null && saved[k] !== '') out[k] = saved[k];
  }
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = {
    PAGE_SIZES: PAGE_SIZES,
    MIN_SAFE_MARGIN_PT: MIN_SAFE_MARGIN_PT,
    describePageSize: describePageSize,
    matchPageSize: matchPageSize,
    targetDimensions: targetDimensions,
    marginIssues: marginIssues,
    cleanFileName: cleanFileName,
    forceCopyUrl: forceCopyUrl,
    stamp: stamp,
    defaultTerms: defaultTerms,
    mergeSettings: mergeSettings
  };
}
