#!/usr/bin/env node
/**
 * BRIMATEX — brand colour verification (zero dependencies).
 *
 * Two jobs:
 *   1. the raw --brand-* tokens in web/src/index.css still equal the official
 *      hex values from the brand guidelines
 *   2. every foreground/background pair the theme declares clears WCAG AA
 *
 * index.css referenced this file before it existed; this is that file.
 *
 * Run:  node tests/brand.check.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CSS = path.join(__dirname, '..', 'web', 'src', 'index.css');

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail++;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function group(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/* ---------- colour maths ---------- */

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => Math.round((v + m) * 255));
}

const toHex = (rgb) =>
  '#' + rgb.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase();

function relLuminance([r, g, b]) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------- parse index.css ---------- */

const css = fs.readFileSync(CSS, 'utf8');

/**
 * Reads one theme block. Semantic tokens mostly point at the raw brand tokens
 * (`--primary: var(--brand-ocean)`), so literals are collected first and the
 * aliases resolved against them afterwards — `base` supplies :root values when
 * a dark-mode alias references a token only declared there.
 */
function parseBlock(selector, base = {}) {
  const re = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`);
  const body = css.match(re)?.[1] ?? '';

  const literals = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)) {
    literals[m[1]] = hslToRgb(parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4]));
  }

  const aliases = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)/g)) {
    aliases[m[1]] = m[2];
  }

  const tokens = { ...base, ...literals };
  // An alias declared in this block always wins over the inherited value —
  // `--card-foreground: var(--brand-cloud)` in .dark must not keep :root's.
  for (let i = 0; i < 4; i++) {
    for (const [token, target] of Object.entries(aliases)) {
      if (tokens[target]) tokens[token] = tokens[target];
    }
  }

  const unresolved = Object.keys(aliases).filter((t) => !tokens[t]);
  if (unresolved.length) {
    console.log(`  \x1b[33m!\x1b[0m رموز لم تُحلّ في ${selector}: ${unresolved.join(', ')}`);
  }
  return tokens;
}

const light = parseBlock(':root');
const dark = parseBlock('\\.dark', light);

/* ---------- 1. official palette ---------- */

const OFFICIAL = {
  '--brand-ocean': ['#282868', 'Dark Ocean'],
  '--brand-violet': ['#666BB1', 'Blue Violet'],
  '--brand-porcelain': ['#9DC9CF', 'Porcelain'],
  '--brand-nebula': ['#D9E3E2', 'Nebula'],
  '--brand-cloud': ['#F1F0EC', 'Cloud Dancer'],
  '--brand-sun': ['#DEE337', 'Sun Glare'],
};

group('1. ألوان الهوية الرسمية');
for (const [token, [hex, name]] of Object.entries(OFFICIAL)) {
  const got = light[token];
  if (!got) {
    check(`${name} معرَّف`, false, `${token} مفقود`);
    continue;
  }
  const gotHex = toHex(got);
  // Allow a single step of HSL rounding per channel.
  const target = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const drift = Math.max(...got.map((v, i) => Math.abs(v - target[i])));
  check(`${name} ${hex}`, drift <= 1, `الناتج ${gotHex} (انحراف ${drift})`);
}

/* ---------- 2. contrast ---------- */

// [background, foreground, label, minimum]
const PAIRS = [
  ['--background', '--foreground', 'نص الصفحة', 4.5],
  ['--card', '--card-foreground', 'نص البطاقة', 4.5],
  ['--popover', '--popover-foreground', 'نص القائمة المنسدلة', 4.5],
  ['--primary', '--primary-foreground', 'الزر الأساسي', 4.5],
  ['--secondary', '--secondary-foreground', 'الزر الثانوي', 4.5],
  ['--muted', '--muted-foreground', 'النص الخافت', 4.5],
  ['--accent', '--accent-foreground', 'نداء الفعل', 4.5],
  ['--destructive', '--destructive-foreground', 'زر الخطر', 4.5],
  ['--success', '--success-foreground', 'زر النجاح', 4.5],
  ['--background', '--highlight', 'النص المميَّز', 4.5],
  // UI components (borders, focus rings) need 3:1, not 4.5:1
  ['--background', '--input', 'حدود الحقول', 3],
  ['--background', '--ring', 'حلقة التركيز', 3],
];

for (const [themeName, tokens] of [['الفاتح', light], ['الداكن', dark]]) {
  group(`2. التباين — الوضع ${themeName} (WCAG AA)`);
  for (const [bgTok, fgTok, label, min] of PAIRS) {
    const bg = tokens[bgTok] ?? light[bgTok];
    const fg = tokens[fgTok] ?? light[fgTok];
    if (!bg || !fg) {
      check(label, false, `رمز مفقود (${bgTok} أو ${fgTok})`);
      continue;
    }
    const ratio = contrast(bg, fg);
    check(
      `${label} — ${ratio.toFixed(2)}:1 (الحد ${min})`,
      ratio >= min,
      `${toHex(fg)} على ${toHex(bg)}`
    );
  }
}

/* ---------- 3. Sun Glare guard ---------- */

group('3. قيود Sun Glare');
const sun = light['--brand-sun'];
const white = [255, 255, 255];
const ocean = light['--brand-ocean'];
if (sun && ocean) {
  check(
    'Sun Glare غير صالح نصاً على الأبيض (متوقع)',
    contrast(sun, white) < 3,
    `${contrast(sun, white).toFixed(2)}:1`
  );
  check(
    'Sun Glare خلفيةً مع Dark Ocean فوقه',
    contrast(sun, ocean) >= 4.5,
    `${contrast(sun, ocean).toFixed(2)}:1`
  );
}

/* ---------- report ---------- */

console.log('\n' + '─'.repeat(52));
console.log(
  `\x1b[1mالنتيجة:\x1b[0m ${fail === 0 ? '\x1b[32m' : ''}${pass} ناجح\x1b[0m / ${pass + fail}` +
    (fail ? ` — \x1b[31m${fail} فاشل\x1b[0m` : '')
);
if (fail) {
  console.log('\n\x1b[31mالفاشل:\x1b[0m');
  failures.forEach((f) => console.log('  • ' + f));
}
console.log('─'.repeat(52));

process.exit(fail === 0 ? 0 : 1);
