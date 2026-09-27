#!/usr/bin/env node
/**
 * List behaviour: continuation, indenting and outdenting.
 *
 * Markdown turns the *first* item's number into the `<ol start>` value, so an
 * item that becomes the first of a nested list has to be renumbered to 1 or the
 * nested list carries on from the outer one.
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { api, createFixture, destroyFixture } from './fixture.mjs';

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const base = process.argv[2] || 'http://localhost:5199';
const results = [];
let failures = 0;
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${String(detail).slice(0, 160)}` : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fixture = await createFixture(base);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const activeValue = () => page.evaluate(() => document.querySelector('.blk.active .blk-input')?.value ?? '');

/** The list structure a reader actually sees. */
const renderedLists = () =>
  page.evaluate(() => {
    const describe = (ol) => ({
      start: Number(ol.getAttribute('start') ?? 1),
      items: [...ol.children].map((li) => (li.textContent ?? '').trim().split('\n')[0]),
      nested: [...ol.querySelectorAll(':scope > li > ol')].map(describe),
    });
    return [...document.querySelectorAll('.blk-render > .prose > ol')].map(describe);
  });

async function freshBlock() {
  await page.evaluate(() => document.querySelector('.editor-append')?.click());
  await page.waitForSelector('.blk.active .blk-input', { timeout: 5000 });
}

try {
  await page.goto(`${base}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.setItem('ns:edit', 'on'));
  await api(base, 'page/save', { key: fixture.pageKey, markdown: 'Lists below.', title: 'Fixture Page' });
  await page.goto(`${base}/#/p/${fixture.pageKey}`, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.editor-blocks .blk', { timeout: 10000 });

  /* ---------- ordered list continuation ---------- */
  await freshBlock();
  await page.keyboard.type('1. Hello');
  await page.keyboard.press('Enter');
  await sleep(120);
  check('Enter continues an ordered list', (await activeValue()) === '1. Hello\n2. ', JSON.stringify(await activeValue()));

  /* ---------- Tab nests and restarts at 1 ---------- */
  await page.keyboard.press('Tab');
  await sleep(150);
  const nested = await activeValue();
  check('Tab renumbers the nested item to 1', nested === '1. Hello\n   1. ', JSON.stringify(nested));
  check('Tab indents to the parent content column', /\n {3}1\. $/.test(nested), JSON.stringify(nested));

  await page.keyboard.type('There');
  await page.keyboard.press('Enter');
  await sleep(150);
  check(
    'the nested list then continues at 2',
    (await activeValue()) === '1. Hello\n   1. There\n   2. ',
    JSON.stringify(await activeValue()),
  );

  await page.keyboard.type('Second');
  await sleep(150);
  await page.keyboard.press('Escape');
  await sleep(400);

  const lists = await renderedLists();
  const outer = lists[0];
  check('the outer list has a single item', outer && outer.items.length === 1, JSON.stringify(lists));
  check('the nested items render as a real nested list', outer?.nested?.length === 1, JSON.stringify(lists));
  check('the rendered nested list starts at 1', outer?.nested?.[0]?.start === 1, JSON.stringify(lists));
  check(
    'the nested list holds both items',
    outer?.nested?.[0]?.items.join(',') === 'There,Second',
    JSON.stringify(lists),
  );

  /* ---------- Shift+Tab pulls it back into the outer list ---------- */
  await page.evaluate(() => {
    const blk = [...document.querySelectorAll('.blk')].find((b) => (b.textContent ?? '').includes('Hello'));
    blk.querySelector('.blk-edit-hint')?.click();
  });
  await page.waitForSelector('.blk.active .blk-input', { timeout: 5000 });
  await page.evaluate(() => {
    const el = document.querySelector('.blk.active .blk-input');
    el.focus();
    const at = el.value.indexOf('Second') + 'Second'.length;
    el.setSelectionRange(at, at);
  });
  await page.keyboard.down('Shift');
  await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');
  await sleep(200);
  const outdented = await activeValue();
  check(
    'Shift+Tab renumbers into the outer list',
    outdented === '1. Hello\n   1. There\n2. Second',
    JSON.stringify(outdented),
  );

  /* ---------- Enter on an empty nested item steps out ---------- */
  await freshBlock();
  await page.keyboard.type('1. One');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Inner');
  await page.keyboard.press('Enter');
  await sleep(150);
  check('nested continuation before stepping out', (await activeValue()) === '1. One\n   1. Inner\n   2. ');
  await page.keyboard.press('Enter');
  await sleep(200);
  const steppedOut = await activeValue();
  check('empty nested item steps out and renumbers', steppedOut === '1. One\n   1. Inner\n2. ', JSON.stringify(steppedOut));

  /* ---------- a third level nests under the second ---------- */
  await freshBlock();
  await page.keyboard.type('1. Top');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Middle');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await sleep(200);
  const deep = await activeValue();
  check('a third level indents under the second', deep === '1. Top\n   1. Middle\n      1. ', JSON.stringify(deep));

  await page.keyboard.type('Leaf');
  await sleep(150);
  await page.keyboard.press('Escape');
  await sleep(400);
  const deepLists = await renderedLists();
  const top = deepLists.find((l) => l.items[0] === 'Top');
  check(
    'three levels render as three nested lists',
    top?.nested?.[0]?.nested?.[0]?.items?.[0] === 'Leaf' && top.nested[0].nested[0].start === 1,
    JSON.stringify(deepLists),
  );

  /* ---------- bullets keep their marker ---------- */
  await freshBlock();
  await page.keyboard.type('- Alpha');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await sleep(150);
  check('bullets nest without renumbering', (await activeValue()) === '- Alpha\n  - ', JSON.stringify(await activeValue()));

  /* ---------- Tab still indents plain text ---------- */
  await freshBlock();
  await page.keyboard.type('plain');
  await page.evaluate(() => {
    const el = document.querySelector('.blk.active .blk-input');
    el.setSelectionRange(0, 0);
  });
  await page.keyboard.press('Tab');
  await sleep(150);
  check('Tab still indents a non-list line', (await activeValue()) === '  plain', JSON.stringify(await activeValue()));

  check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (error) {
  check('run completed', false, error.stack ?? String(error));
} finally {
  await browser.close();
  await destroyFixture(base);
}

console.log(results.join('\n'));
console.log(failures ? `\n${failures} FAILURE(S)` : '\nList nesting behaves correctly');
process.exit(failures ? 1 : 0);
