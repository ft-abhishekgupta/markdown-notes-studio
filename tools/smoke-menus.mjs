#!/usr/bin/env node
/**
 * Pop-up menus must paint above everything on the page.
 *
 * The sidebar is `position: sticky`, which creates a stacking context, so a
 * menu rendered inside it is trapped no matter how high its z-index is. These
 * checks use elementFromPoint — what the user can actually click — rather than
 * trusting computed z-index values.
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
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${String(detail).slice(0, 150)}` : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fixture = await createFixture(base);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

/** Is every corner+centre of the menu actually the topmost element? */
const menuIsOnTop = (selector) =>
  page.evaluate((sel) => {
    const menu = document.querySelector(sel);
    if (!menu) return { ok: false, why: 'menu missing' };
    const r = menu.getBoundingClientRect();
    const points = [
      [r.left + 6, r.top + 6],
      [r.right - 6, r.top + 6],
      [r.left + 6, r.bottom - 6],
      [r.right - 6, r.bottom - 6],
      [r.left + r.width / 2, r.top + r.height / 2],
    ];
    for (const [x, y] of points) {
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(menu === hit || menu.contains(hit))) {
        return { ok: false, why: `covered at ${Math.round(x)},${Math.round(y)} by ${hit?.className || hit?.tagName}` };
      }
    }
    return { ok: true, why: `${Math.round(r.width)}x${Math.round(r.height)}` };
  }, selector);

const inViewport = (selector) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    if (!r) return false;
    return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
  }, selector);

try {
  await page.goto(`${base}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.setItem('ns:edit', 'on'));
  await page.goto(`${base}/#/p/${fixture.pageKey}`, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.editor-blocks .blk', { timeout: 10000 });

  /* ---------- sidebar node menu ---------- */
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      document.querySelectorAll('.nav-section-btn, .nav-group-btn').forEach((b) => {
        if (b.getAttribute('aria-expanded') === 'false') b.click();
      });
    });
    await sleep(200);
  }

  const pageRow = await page.evaluate(() =>
    [...document.querySelectorAll('.nav-row-wrap')].findIndex((r) => (r.textContent ?? '').trim().startsWith('Fixture Page')),
  );
  check('fixture row found in the sidebar', pageRow >= 0, `${pageRow}`);

  await page.evaluate((i) => {
    const row = document.querySelectorAll('.nav-row-wrap')[i];
    row.scrollIntoView({ block: 'center' });
    row.querySelector('.nav-kebab')?.click();
  }, pageRow);
  await page.waitForSelector('.nav-menu', { timeout: 5000 });
  await sleep(200);

  check('sidebar menu escapes the sidebar stacking context', await page.evaluate(() => document.querySelector('body > .anchored-menu .nav-menu') !== null));
  const navTop = await menuIsOnTop('.nav-menu');
  check('sidebar menu paints above the page content', navTop.ok, navTop.why);
  check('sidebar menu is fully inside the viewport', await inViewport('.nav-menu'));

  await page.keyboard.press('Escape');
  await sleep(200);
  check('Escape closes the sidebar menu', (await page.$('.nav-menu')) === null);

  /* ---------- a row near the bottom must flip up, not overflow ---------- */
  const lastRow = await page.evaluate(() => document.querySelectorAll('.nav-row-wrap').length - 1);
  await page.evaluate((i) => {
    const row = document.querySelectorAll('.nav-row-wrap')[i];
    row.scrollIntoView({ block: 'end' });
    row.querySelector('.nav-kebab')?.click();
  }, lastRow);
  await page.waitForSelector('.nav-menu', { timeout: 5000 });
  await sleep(200);
  check('a menu near the bottom stays on screen', await inViewport('.nav-menu'));
  const lowTop = await menuIsOnTop('.nav-menu');
  check('a menu near the bottom still paints on top', lowTop.ok, lowTop.why);
  await page.keyboard.press('Escape');
  await sleep(200);

  /* ---------- block menu inside the editor ---------- */
  await page.evaluate(() => {
    const blk = document.querySelector('.blk');
    blk.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    blk.querySelector('.blk-grip')?.click();
  });
  await page.waitForSelector('.blk-menu', { timeout: 5000 });
  await sleep(200);
  check('block menu renders in the portal', await page.evaluate(() => document.querySelector('body > .anchored-menu .blk-menu') !== null));
  const blkTop = await menuIsOnTop('.blk-menu');
  check('block menu paints above the sticky toolbar', blkTop.ok, blkTop.why);
  check('block menu is fully inside the viewport', await inViewport('.blk-menu'));

  /* ---------- "turn into" list opens in the same portal ---------- */
  await page.evaluate(() => [...document.querySelectorAll('.blk-menu button')][0].click());
  await page.waitForSelector('.slash-menu', { timeout: 5000 });
  await sleep(200);
  const insertTop = await menuIsOnTop('.slash-menu');
  check('insert list paints above the page', insertTop.ok, insertTop.why);
  check('insert list is fully inside the viewport', await inViewport('.slash-menu'));

  await page.evaluate(() => document.querySelector('.menu-backdrop')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  await sleep(250);
  check('clicking the backdrop closes the menu', (await page.$('.anchored-menu')) === null);

  check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (error) {
  check('run completed', false, error.stack ?? String(error));
} finally {
  await browser.close();
  await destroyFixture(base);
}

console.log(results.join('\n'));
console.log(failures ? `\n${failures} FAILURE(S)` : '\nMenus paint above the page');
process.exit(failures ? 1 : 0);
