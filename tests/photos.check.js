#!/usr/bin/env node
// The product photos shipped with the site - src/lib/productPhotos.js
//
// What it guards: every Odoo product id in src/data/product-photos.json points
// at a file that is really there (a missing one would 404 on every card), the
// match is on the id - a renamed product keeps its photo - and a photo
// uploaded from the dashboard still wins over the shipped one.
//
// Runs with the rest: npm test
const fs = require('fs');
const path = require('path');
const { photoFor, PHOTO_PREFIX } = require('../src/lib/productPhotos');

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function group(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'product-photos.json'), 'utf8'));
const entries = Object.entries(MAP)
  .filter(([key]) => !key.startsWith('//'))
  .map(([key, entry]) => [key, entry.file, entry.product]);

group('Every mapped photo exists');
check(
  'none are put straight into src/public (the build deletes them)',
  !fs.existsSync(path.join(__dirname, '..', 'src', 'public', 'images', 'products')) ||
    fs.readdirSync(path.join(__dirname, '..', 'src', 'public', 'images', 'products')).every((f) =>
      fs.existsSync(path.join(__dirname, '..', 'web', 'public', 'images', 'products', f))
    )
);
check('the map is not empty', entries.length > 0);
for (const [key, file, label] of entries) {
  check(`${label}: keyed by an Odoo id`, /^\d+$/.test(key), key);
  // The source: the web build copies it into src/public, which it empties first.
  const onDisk = path.join(__dirname, '..', 'web', 'public', 'images', 'products', file);
  check(`${label} → ${file}`, fs.existsSync(onDisk) && fs.statSync(onDisk).size > 1000, 'missing or empty');
  check(`${label} is found by photoFor`, photoFor({ templateId: Number(key) }) === PHOTO_PREFIX + file, String(photoFor({ templateId: Number(key) })));
}

group('Matching');
const [firstKey, firstFile] = entries[0];
const templateId = Number(firstKey);
check('a renamed product keeps its photo', photoFor({ templateId, name: 'مرتبة باسم جديد' }) === PHOTO_PREFIX + firstFile);
check('an unknown product has none', photoFor({ templateId: 1, name: 'No Such Mattress' }) === null);
check('no id, no photo', photoFor(undefined) === null && photoFor({ name: 'Classic Mattress' }) === null);

group('A dashboard upload wins');
(async () => {
  const productOverrides = require('../src/lib/productOverrides');
  const { withOverrides } = require('../src/lib/catalogue');
  const original = productOverrides.getAllOverrides;
  const product = { id: 999001, templateId, name: 'أي اسم', price: 100 };

  productOverrides.getAllOverrides = async () => ({});
  const [plain] = await withOverrides([product]);
  check('no override → the shipped photo', plain.image === PHOTO_PREFIX + firstFile, String(plain.image));

  productOverrides.getAllOverrides = async () => ({
    [product.id]: { iconKeys: [], description: '', enabled: true, imageUrl: '/uploads/products/x.webp' },
  });
  const [uploaded] = await withOverrides([product]);
  check('an upload → the upload', uploaded.image === '/uploads/products/x.webp', String(uploaded.image));

  productOverrides.getAllOverrides = async () => ({
    [product.id]: { iconKeys: [], description: '', enabled: false, imageUrl: null },
  });
  const [overriddenNoImage] = await withOverrides([product]);
  check('an override with no upload → the shipped photo', overriddenNoImage.image === PHOTO_PREFIX + firstFile);

  productOverrides.getAllOverrides = original;

  console.log('\n' + '─'.repeat(52));
  if (fail === 0) {
    console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass}`);
  } else {
    console.log(`\x1b[1mالنتيجة:\x1b[0m \x1b[32m${pass} ناجح\x1b[0m / ${pass + fail} — \x1b[31m${fail} فاشل\x1b[0m`);
    console.log('\n\x1b[31mالاختبارات الفاشلة:\x1b[0m');
    failures.forEach((f) => console.log('  • ' + f));
  }
  console.log('─'.repeat(52) + '\n');
  process.exit(fail === 0 ? 0 : 1);
})();
