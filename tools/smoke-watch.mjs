#!/usr/bin/env node
/** Editing a markdown file outside the browser must refresh the open page. */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createFixture, destroyFixture } from './fixture.mjs';

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const base = process.argv[2] || 'http://localhost:5199';
const results = [];
let failures = 0;
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${String(detail).slice(0, 140)}` : ''}`);
  if (!ok) failures++;
};

const fixture = await createFixture(base);
const relative = await fixture.filePath();
const file = path.join('content', relative.replace(/\//g, path.sep));
const topicDir = path.dirname(file);
const newFile = path.join(topicDir, '02-added-outside.md');
const original = fs.readFileSync(file, 'utf8');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));

try {
  await page.goto(`${base}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.setItem('ns:edit', 'off'));
  await page.goto(`${base}/#/p/${fixture.pageKey}`, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.prose', { timeout: 8000 });

  // 1. content change picked up without touching the browser
  fs.writeFileSync(file, `${original.trimEnd()}\n\nOUTSIDE-EDIT-MARKER\n`, 'utf8');
  await page
    .waitForFunction(() => document.body.innerText.includes('OUTSIDE-EDIT-MARKER'), { timeout: 12000 })
    .catch(() => {});
  check(
    'external file edit appears in the open page',
    await page.evaluate(() => document.body.innerText.includes('OUTSIDE-EDIT-MARKER')),
  );

  // 2. a brand new file appears in the sidebar
  fs.writeFileSync(newFile, '---\ntitle: Added Outside\n---\n\nCreated by another tool.\n', 'utf8');
  await page.waitForFunction(() => document.body.innerText.includes('Added Outside'), { timeout: 12000 }).catch(() => {});
  check(
    'file created outside appears in the sidebar',
    await page.evaluate(() => document.body.innerText.includes('Added Outside')),
  );

  // 3. and disappears again when removed
  fs.rmSync(newFile, { force: true });
  await page.waitForFunction(() => !document.body.innerText.includes('Added Outside'), { timeout: 12000 }).catch(() => {});
  check(
    'file removed outside disappears',
    await page.evaluate(() => !document.body.innerText.includes('Added Outside')),
  );

  check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (error) {
  check('run completed', false, error.stack ?? String(error));
} finally {
  fs.rmSync(newFile, { force: true });
  await browser.close();
  await destroyFixture(base);
}

console.log(results.join('\n'));
console.log(failures ? `\n${failures} FAILURE(S)` : '\nExternal file changes flow through');
process.exit(failures ? 1 : 0);
