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
  _headers         security headers Cloudflare adds to every page
test/              Node tests for lib/
wrangler.jsonc     tells Cloudflare to serve site/
```

PDF libraries load from cdnjs: pdf-lib 1.17.1, JSZip 3.10.1 and PDF.js 3.11.174.

## Run it locally

```bash
npm install
npm test
npm start
```

Then open http://localhost:8080.

## Put it on Cloudflare

This works the same way as Story Live: Cloudflare watches this GitHub repository and redeploys whenever the main branch changes. `wrangler.jsonc` tells Cloudflare to serve the `site/` folder.

1. In Cloudflare, open **Workers & Pages → Create → Import a repository**.
2. Pick **WillowBrooks47/Printable-Product**. If it isn't listed, choose **Manage GitHub access** and allow Cloudflare to see it.
3. Keep the project name **tpt-packager**, the same as `"name"` in `wrangler.jsonc`. Leave the build command empty and keep the deploy command `npx wrangler deploy`.
4. Click **Deploy**.

After about a minute the site is live at **https://tpt-packager.willowbrooks47.workers.dev**.

## Updating later

Commit changes to the main branch on GitHub, either by uploading files or by merging a pull request. Cloudflare rebuilds and deploys automatically in about a minute.
