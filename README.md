# TPT Packager

A Google Docs add-on for Teachers Pay Teachers sellers. Open a resource written in Google Docs, click **Build TPT package**, and get a Drive folder with everything a TPT listing needs.

| Output | What it is for |
| --- | --- |
| **Print-ready PDF** | The main printable. Page size is set to US Letter or A4 first. |
| **Editable Word (.docx)** | For buyers who customize in Word. |
| **Editable Google Doc** | A master copy, shared view-only, with a **"make a copy"** link (`…/copy`) so each buyer gets their own editable version. |
| **Read Me First (PDF)** | Thank-you note, the make-a-copy link, terms of use and a store link. |
| **Watermarked preview PDF** | Every page is marked "PREVIEW • Shop name • Full version on TPT". Upload it as the TPT preview file. |
| **TPT Upload ZIP** | The printable PDF, the .docx and the Read Me PDF in one file for the product upload. The preview is left out. |

The original document is never changed. All work happens on copies.

### Print check
Before you build, the sidebar checks the document for common print problems:
- custom or unusual page size
- margins under 0.5 in, which many classroom printers clip
- links, which don't work on paper (add a printed URL or a QR code)
- images wider than the printable area
- blank lines at the end that print an empty last page

Shop name, store link, thank-you note, terms of use and page size are saved per user, so you only enter them once.

## Install (about 5 minutes, no coding)

1. Open any Google Doc → **Extensions → Apps Script**.
2. Delete the starter code, then create three files and paste in the contents from `src/`:
   - `Code.gs` ← `src/Code.js`
   - `Util.gs` ← `src/Util.js`
   - `Sidebar.html` ← `src/Sidebar.html` (use **+ → HTML**, name it `Sidebar`)
3. **Project Settings → Show "appsscript.json" manifest file**, then replace its contents with `src/appsscript.json`.
4. Save, reload the Google Doc, and choose **Extensions → TPT Packager → Open packager**.
5. The first run asks for permission to read your Doc, create files in Drive and export PDFs. Approve it.

To use it in every Doc instead of one, deploy it as a test add-on: **Deploy → Test deployments → Google Workspace Add-on**. It can later be published privately or to the Workspace Marketplace.

### For developers (clasp)
```bash
npm install -g @google/clasp
clasp login
cp .clasp.json.example .clasp.json   # paste in your script ID
npm run push
```
To run the unit tests for the helper functions:
```bash
npm test
```

## Project layout
```
src/Code.js         Apps Script: menu, sidebar, print check, package builder
src/Util.js         Pure helpers (page sizes, margins, filenames, terms), unit-tested in Node
src/Sidebar.html    Sidebar UI
src/appsscript.json Manifest and OAuth scopes
test/               Node tests for Util.js
```

## Roadmap ideas
- Google Slides support (many TPT digital resources live in Slides)
- Answer key: build a student version with answers hidden from a "key" style
- Product cover and thumbnail generator (TPT uses square thumbnails)
- Several Docs into one bundle with a table of contents
- Bulk mode: package a whole Drive folder at once
