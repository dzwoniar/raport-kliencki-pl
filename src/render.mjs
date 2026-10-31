// render.mjs — metrics.json => report.html (HERO), opcjonalnie report.pdf.
// Uzycie: node src/render.mjs <katalog-cyklu>   (katalog zawiera metrics.json)

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderReportHtml } from './lib/reportHtml.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CSS_PATH = path.join(SCRIPT_DIR, '..', 'templates', 'report.css');
const FONTS_DIR = path.join(SCRIPT_DIR, '..', 'web', 'fonts');

// Sciezki "fonts/*.woff2" w report.css sa wzgledne wobec base URI DOKUMENTU, nie pliku CSS.
// W webie dokument stoi obok katalogu fonts/, wiec dziala. Raport z CLI laduje gdziekolwiek
// (output/<klient>/<cykl>/), gdzie fontow nie ma — i po cichu spadalby na Courier/Impact.
// Deliverable dla klienta ma byc JEDNYM przenosnym plikiem, wiec tu wtapiamy fonty w CSS.
async function inlineFonts(css) {
  const refs = [...css.matchAll(/url\('fonts\/([^']+\.woff2)'\)/g)];
  const seen = new Map();
  for (const [, file] of refs) {
    if (seen.has(file)) continue;
    const b64 = (await readFile(path.join(FONTS_DIR, file))).toString('base64');
    seen.set(file, `url(data:font/woff2;base64,${b64}) format('woff2')`);
  }
  return css.replace(
    /url\('fonts\/([^']+\.woff2)'\)\s*format\('woff2'\)/g,
    (whole, file) => seen.get(file) ?? whole,
  );
}

// PDF jest best-effort. HERO to report.html; jesli Playwright nie jest zainstalowany,
// raport i tak jest gotowy — do PDF wystarczy Drukuj -> Zapisz jako PDF (A4) w przegladarce.
async function tryPdf(htmlPath, pdfPath) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    try {
      ({ chromium } = await import('playwright-core'));
    } catch {
      return { ok: false, reason: 'brak pakietu playwright' };
    }
  }
  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.resolve(htmlPath)).href, { waitUntil: 'load' });
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    await browser.close();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

async function main() {
  const cycleDir = process.argv[2];
  if (!cycleDir) {
    console.error('Podaj katalog cyklu, np. `node src/render.mjs output/klient-demo/cycle-2026-06`.');
    process.exitCode = 1;
    return;
  }

  const metrics = JSON.parse(await readFile(path.join(cycleDir, 'metrics.json'), 'utf8'));
  const css = await inlineFonts(await readFile(CSS_PATH, 'utf8'));
  const html = renderReportHtml(metrics, css);

  const htmlPath = path.join(cycleDir, 'report.html');
  await writeFile(htmlPath, html, 'utf8');
  console.log(`OK: report.html -> ${htmlPath}`);

  const pdfPath = path.join(cycleDir, 'report.pdf');
  const pdf = await tryPdf(htmlPath, pdfPath);
  if (pdf.ok) {
    console.log(`OK: report.pdf  -> ${pdfPath}`);
  } else {
    console.log(`PDF: pominieto (${pdf.reason}). Otworz report.html i uzyj Drukuj -> Zapisz jako PDF (A4).`);
  }
}

main();
