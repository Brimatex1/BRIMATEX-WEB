#!/usr/bin/env node
// The product photos shipped with the site - src/lib/productPhotos.js
//
// What it guards: every name in src/data/product-photos.json points at a file
// that is really there (a missing one would 404 on every card), the match
// ignores case and spaces, and a photo uploaded from the dashboard still wins
// over the shipped one.
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
const entries = Object.entries(MAP).filter(([name]) => !name.startsWith('//'));

group('Every mapped photo exists');
check('the map is not empty', entries.length > 0);
for (const [name, file] of entries) {
  const onDisk = path.join(__dirname, '..', 'src', 'public', 'images', 'products', file);
  check(`${name} → ${file}`, fs.existsSync(onDisk) && fs.statSync(onDisk).size > 1000, 'missing or empty');
  check(`${name} is found by photoFor`, photoFor(name) === PHOTO_PREFIX + file, String(photoFor(name)));
}

group('Matching');
const [firstName, firstFile] = entries[0];
check('case and spaces do not matter', photoFor(`  ${firstName.toUpperCase()} `) === PHOTO_PREFIX + firstFile);
check('an unknown product has none', photoFor('No Such Mattress') === null);
check('no name, no photo', photoFor(undefined) === null && photoFor('') === null);

group('A dashboard upload wins');
(async () => {
  const productOverrides = require('../src/lib/productOverrides');
  const { withOverrides } = require('../src/lib/catalogue');
  const original = productOverrides.getAllOverrides;
  const product = { id: 999001, name: firstName, price: 100 };

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
