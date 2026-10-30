#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const requireFromCore = createRequire(new URL('../../packages/core/package.json', import.meta.url));
const { chromium } = requireFromCore('@playwright/test');

const [svgPath, outPath] = process.argv.slice(2);
if (!svgPath || !outPath) {
  process.stderr.write('usage: render-icon.mjs <icon.svg> <out.png>\n');
  process.exit(1);
}

const size = 1024;
const svg = readFileSync(svgPath, 'utf8');
const html = [
  '<!doctype html><meta charset="utf-8">',
  '<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>',
  svg,
].join('');

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(html);
  await page.screenshot({ path: outPath, omitBackground: true });
} finally {
  await browser.close();
}
