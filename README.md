# TPT Packager

A website for Teachers Pay Teachers sellers. Drop in a finished printable PDF and get everything a TPT listing needs:

| Output | What it is for |
| --- | --- |
| **Print-ready PDF** | The main printable, set to US Letter or A4. Pages of another size are scaled to fit and centered. |
| **Read Me First (PDF)** | Thank-you note, a clickable "make a copy" link to your Google Doc, terms of use and your store link. |
| **Watermarked preview PDF** | The first 3, 5 or 10 pages (or all of them), stamped "PREVIEW • Shop name • Full version on TPT". Upload it as the TPT preview file. |
| **TPT upload ZIP** | The printable PDF, your editable .docx (if you add one) and the Read Me in one file for the product upload. The preview is left out. |

Everything runs in the browser. Files never leave the seller's device, and there is no server, account or database.

### Print check
Every page of the PDF is checked for:
- page sizes other than US Letter or A4
- content within 0.5 in of the edge, which many classroom printers clip
- links, which don't work on paper
- blank pages, including the blank last page that trailing empty lines cause

Shop name, store link, thank-you note, terms of use and paper size are remembered in the browser, so they only need to be entered once.

## Project layout

```
site/              the website, deployed as-is (no build step)
  index.html       page and styles
  app.js           page logic: file inputs, print check, downloads
  lib/core.js      pure helpers (page sizes, wrapping, findings)
  lib/packager.js  builds the PDFs and ZIP with pdf-lib and JSZip
  _headers         security headers for Cloudflare Pages
test/              Node tests for lib/
```

PDF libraries load from cdnjs: pdf-lib 1.17.1, JSZip 3.10.1 and PDF.js 3.11.174.

## Run it locally

```bash
npm install
npm test
npm start
```

Then open http://localhost:8080.

## Deploy to Cloudflare Pages

**From the dashboard:** Workers & Pages → Create → Pages → Connect to Git → pick this repository. Leave the build command empty and set the build output directory to `site`.

**From the command line:**

```bash
npx wrangler pages deploy site --project-name tpt-packager
```

Either way the site is served at `https://tpt-packager.pages.dev`, and a custom domain can be added under the project's **Custom domains** tab.
