// build-dist.mjs - czysty katalog deployu (dist/) TYLKO z narzedziem.
// Wyklucza pliki wewnetrzne: PRD, recording/, README, CLI (src/*.mjs), testy, panel, output.
// Flatten: index.html + app.js ida do roota, sciezki ../ -> ./ => czysty URL <domena>/.
// Zasady bez zmian: silnik src/lib/* 1:1, tylko syntetyczne fixtures, zero zaleznosci.
import { mkdirSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// index.html bez zmian (referuje ./app.js, style inline)
cpSync(join(ROOT, 'web/index.html'), join(DIST, 'index.html'));

// app.js: ../ -> ./  (po splaszczeniu do roota importy ES i fetch wskazuja rodzenstwo)
const app = readFileSync(join(ROOT, 'web/app.js'), 'utf8').replaceAll('../', './');
writeFileSync(join(DIST, 'app.js'), app);

// silnik + style + syntetyczne fixtures (potrzebne w runtime przegladarki)
cpSync(join(ROOT, 'src/lib'), join(DIST, 'src/lib'), { recursive: true });
cpSync(join(ROOT, 'templates'), join(DIST, 'templates'), { recursive: true });
cpSync(join(ROOT, 'fixtures'), join(DIST, 'fixtures'), { recursive: true });

// fonty: report.css odwoluje sie do nich sciezka wzgledna "fonts/..." liczona
// od base URI dokumentu (index.html), nie od pliku report.css -> musza siedziec
// obok splaszczonego index.html, czyli w dist/fonts (nie dist/templates/fonts).
cpSync(join(ROOT, 'web/fonts'), join(DIST, 'fonts'), { recursive: true });

console.log('dist/ zbudowany (deploy-ready):');
console.log('  index.html, app.js (../ -> ./)');
console.log('  src/lib/*.js, templates/report.css, fixtures/**, fonts/**');
