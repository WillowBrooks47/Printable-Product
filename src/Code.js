/**
 * TPT Packager — a Google Docs add-on that turns a Google Doc into a
 * TPT-ready product bundle: print-ready PDF, editable Word file, an editable
 * Google Doc with a "make a copy" link, a watermarked preview, a Read Me First
 * page with terms of use, and a single ZIP to upload.
 */

var APP_NAME = 'TPT Packager';
var SETTINGS_KEY = 'tptPackagerSettings';

var DEFAULT_SETTINGS = {
  shopName: '',
  storeUrl: '',
  pageSize: 'LETTER', // LETTER | A4 | KEEP
  terms: '',
  thankYou: 'Thank you so much for your purchase! This product includes a print-ready PDF and an editable version for customizing to fit your classroom.'
};

// ---------- Menu & sidebar ----------

function onOpen() {
  DocumentApp.getUi()
    .createAddonMenu()
    .addItem('Open packager', 'showSidebar')
    .addItem('Run print check', 'showPrintCheckAlert')
    .addToUi();
}

function onInstall(e) {
  onOpen(e);
}

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle(APP_NAME);
  DocumentApp.getUi().showSidebar(html);
}

function showPrintCheckAlert() {
  var check = runPrintCheck();
  var lines = ['Page size: ' + check.pageSize, ''];
  if (check.issues.length === 0) lines.push('No print problems found.');
  check.issues.forEach(function (i) { lines.push('• ' + i); });
  DocumentApp.getUi().alert('Print check', lines.join('\n'), DocumentApp.getUi().ButtonSet.OK);
}

// ---------- Settings ----------

function getSettings() {
  var raw = PropertiesService.getUserProperties().getProperty(SETTINGS_KEY);
  var saved = raw ? JSON.parse(raw) : {};
  var s = mergeSettings(saved, DEFAULT_SETTINGS);
  if (!s.terms) s.terms = defaultTerms(s.shopName);
  return s;
}

function saveSettings(settings) {
  var clean = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    if (settings && settings[k] !== undefined) clean[k] = String(settings[k]);
  });
  PropertiesService.getUserProperties().setProperty(SETTINGS_KEY, JSON.stringify(clean));
  return getSettings();
}

/** Everything the sidebar needs when it opens. */
function getInitialState() {
  var doc = DocumentApp.getActiveDocument();
  return {
    docName: doc.getName(),
    settings: getSettings(),
    check: runPrintCheck()
  };
}

// ---------- Print check ----------

function runPrintCheck() {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();
  var issues = [];

  var w = body.getPageWidth();
  var h = body.getPageHeight();
  var pageSize = describePageSize(w, h);
  if (!matchPageSize(w, h)) {
    issues.push('Page size is custom. TPT buyers usually expect US Letter (or A4 outside the US).');
  }

  issues = issues.concat(marginIssues({
    top: body.getMarginTop(),
    bottom: body.getMarginBottom(),
    left: body.getMarginLeft(),
    right: body.getMarginRight()
  }));

  // Links don't work on paper — flag them so the seller can add a QR code or printed URL.
  var linkCount = countLinks(body);
  if (linkCount > 0) {
    issues.push(linkCount + ' link(s) found. Links will not work on paper; consider printing the URL or adding a QR code.');
  }

  // Images wider than the printable area get cropped or shrunk.
  var printable = w - body.getMarginLeft() - body.getMarginRight();
  var wide = body.getImages().filter(function (img) { return img.getWidth() > printable + 1; }).length;
  if (wide > 0) {
    issues.push(wide + ' image(s) are wider than the printable area.');
  }

  // Empty paragraphs at the end often create a blank last page.
  var trailing = countTrailingEmptyParagraphs(body);
  if (trailing >= 2) {
    issues.push(trailing + ' empty lines at the end of the document may print a blank last page.');
  }

  return { pageSize: pageSize, issues: issues };
}

function countLinks(body) {
  var count = 0;
  var found = body.findElement(DocumentApp.ElementType.TEXT);
  while (found) {
    var text = found.getElement().asText();
    var indices = text.getTextAttributeIndices();
    var lastUrl = null;
    for (var i = 0; i < indices.length; i++) {
      var url = text.getLinkUrl(indices[i]);
      if (url && url !== lastUrl) count++;
      lastUrl = url;
    }
    found = body.findElement(DocumentApp.ElementType.TEXT, found);
  }
  return count;
}

function countTrailingEmptyParagraphs(body) {
  var n = 0;
  for (var i = body.getNumChildren() - 1; i >= 0; i--) {
    var child = body.getChild(i);
    if (child.getType() !== DocumentApp.ElementType.PARAGRAPH) break;
    var p = child.asParagraph();
    if (p.getText().trim() !== '' || p.getNumChildren() > 1) break;
    n++;
  }
  return n;
}

// ---------- Build the package ----------

/**
 * @param {Object} opts
 *   productName, settings, pdf, docx, editableLink, preview, readMe, zip  (booleans for outputs)
 */
function buildPackage(opts) {
  opts = opts || {};
  var settings = saveSettings(opts.settings || {});

  var active = DocumentApp.getActiveDocument();
  var srcId = active.getId();
  var name = cleanFileName(opts.productName || active.getName());
  var srcFile = DriveApp.getFileById(srcId);

  var parents = srcFile.getParents();
  var parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var folder = parent.createFolder('TPT – ' + name + ' – ' + stamp());

  var outputs = [];
  var zipBlobs = [];

  // 1) Teacher-editable master copy, with the chosen page size applied.
  var master = srcFile.makeCopy(name + ' (Editable Google Doc)', folder);
  applyPageSize(master.getId(), settings.pageSize);
  outputs.push(fileInfo(master, 'Editable Google Doc (your master copy)'));

  // 2) Print-ready PDF
  if (opts.pdf !== false) {
    var pdf = folder.createFile(exportAs(master.getId(), 'pdf').setName(name + ' - Print Ready.pdf'));
    outputs.push(fileInfo(pdf, 'Print-ready PDF'));
    zipBlobs.push(pdf.getBlob());
  }

  // 3) Editable Word document
  if (opts.docx) {
    var docx = folder.createFile(exportAs(master.getId(), 'docx').setName(name + ' - Editable.docx'));
    outputs.push(fileInfo(docx, 'Editable Word (.docx)'));
    zipBlobs.push(docx.getBlob());
  }

  // 4) Force-copy link for Google Doc buyers
  var copyUrl = null;
  if (opts.editableLink) {
    master.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    copyUrl = forceCopyUrl(master.getId());
  }

  // 5) Read Me First (thank you, editable link, terms of use)
  if (opts.readMe !== false || copyUrl) {
    var readMe = buildReadMe(name, settings, copyUrl, folder);
    outputs.push(fileInfo(readMe, copyUrl ? 'Read Me First + editable link (PDF)' : 'Read Me First (PDF)'));
    zipBlobs.push(readMe.getBlob());
  }

  // 6) Watermarked preview (for the TPT preview upload — kept out of the ZIP)
  if (opts.preview) {
    var preview = buildPreview(master, name, settings, folder);
    outputs.push(fileInfo(preview, 'Watermarked preview PDF (upload as the TPT preview)'));
  }

  // 7) One ZIP to upload as the product file
  if (opts.zip !== false && zipBlobs.length > 0) {
    var zip = folder.createFile(Utilities.zip(zipBlobs, name + ' - TPT Upload.zip'));
    outputs.push(fileInfo(zip, 'ZIP for TPT product upload'));
  }

  return {
    folderUrl: folder.getUrl(),
    folderName: folder.getName(),
    copyUrl: copyUrl,
    outputs: outputs
  };
}

function applyPageSize(docId, sizeKey) {
  if (!sizeKey || sizeKey === 'KEEP') return;
  var doc = DocumentApp.openById(docId);
  var body = doc.getBody();
  var dims = targetDimensions(sizeKey, body.getPageWidth(), body.getPageHeight());
  if (dims) {
    body.setPageWidth(dims.w);
    body.setPageHeight(dims.h);
  }
  doc.saveAndClose();
}

function exportAs(docId, format) {
  var url = 'https://docs.google.com/document/d/' + docId + '/export?format=' + format;
  var res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Export to ' + format + ' failed (HTTP ' + res.getResponseCode() + ').');
  }
  return res.getBlob();
}

function buildReadMe(name, settings, copyUrl, folder) {
  var doc = DocumentApp.create(name + ' - Read Me First');
  var body = doc.getBody();
  var dims = targetDimensions(settings.pageSize === 'A4' ? 'A4' : 'LETTER', 612, 792);
  body.setPageWidth(dims.w).setPageHeight(dims.h);
  body.setMarginTop(54).setMarginBottom(54).setMarginLeft(54).setMarginRight(54);

  body.getChild(0).asParagraph().setText(name).setHeading(DocumentApp.ParagraphHeading.TITLE)
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  if (settings.shopName) {
    body.appendParagraph('by ' + settings.shopName).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  }

  if (settings.thankYou) body.appendParagraph(settings.thankYou);

  if (copyUrl) {
    body.appendParagraph('Your editable Google Doc').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('Sign in to your Google account, then click the link below. Google will ask you to make a copy, ' +
      'which saves your own editable version to your Google Drive.');
    var link = body.appendParagraph('→ Click here to make your editable copy');
    link.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    link.editAsText().setFontSize(18).setBold(true).setLinkUrl(copyUrl);
    body.appendParagraph('Link not working? Paste this into your browser: ' + copyUrl).editAsText().setFontSize(9);
  }

  body.appendParagraph('Terms of use').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  (settings.terms || defaultTerms(settings.shopName)).split(/\n\s*\n/).forEach(function (para) {
    body.appendParagraph(para.trim());
  });

  if (settings.storeUrl) {
    body.appendParagraph('Find more resources').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(settings.storeUrl).editAsText().setLinkUrl(settings.storeUrl);
  }

  doc.saveAndClose();
  var docFile = DriveApp.getFileById(doc.getId());
  docFile.moveTo(folder);
  var pdf = folder.createFile(exportAs(doc.getId(), 'pdf').setName(name + ' - Read Me First.pdf'));
  return pdf;
}

function buildPreview(masterFile, name, settings, folder) {
  var copy = masterFile.makeCopy(name + ' - Preview (working copy)', folder);
  var doc = DocumentApp.openById(copy.getId());
  var label = 'PREVIEW' + (settings.shopName ? ' • ' + settings.shopName : '') + ' • Full version on TPT';

  var header = doc.getHeader() || doc.addHeader();
  var hp = header.insertParagraph(0, label);
  styleWatermark(hp);

  var footer = doc.getFooter() || doc.addFooter();
  styleWatermark(footer.appendParagraph(label));

  doc.saveAndClose();
  var pdf = folder.createFile(exportAs(copy.getId(), 'pdf').setName(name + ' - PREVIEW.pdf'));
  copy.setTrashed(true);
  return pdf;
}

function styleWatermark(paragraph) {
  paragraph.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  paragraph.editAsText().setBold(true).setFontSize(14).setForegroundColor('#C62828');
}

function fileInfo(file, label) {
  return { label: label, name: file.getName(), url: file.getUrl() };
}
