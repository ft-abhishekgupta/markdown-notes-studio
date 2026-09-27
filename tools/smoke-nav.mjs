#!/usr/bin/env node
/** The left navigation must collapse on wide screens and overlay on narrow ones. */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));

const metrics = () =>
  page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar')?.getBoundingClientRect();
    const main = document.querySelector('.main')?.getBoundingClientRect();
    return {
      sidebar: sidebar ? Math.round(sidebar.width) : null,
      mainLeft: main ? Math.round(main.left) : null,
      mainWidth: main ? Math.round(main.width) : null,
      collapsed: !!document.querySelector('.shell.nav-collapsed'),
      overlayOpen: !!document.querySelector('.sidebar.open'),
    };
  });

try {
  /* ---------- wide screen ---------- */
  await page.setViewport({ width: 1500, height: 950 });
  await page.goto(`${base}/#/p/getting-started/basics/the-editor/welcome`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.removeItem('ns:nav'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.sidebar', { timeout: 8000 });

  const open = await metrics();
  check('sidebar visible by default on a wide screen', open.sidebar > 200 && !open.collapsed, JSON.stringify(open));

  await page.click('.menu-btn');
  await sleep(450);
  const collapsed = await metrics();
  check('toggle collapses the sidebar', collapsed.sidebar === 0 && collapsed.collapsed, JSON.stringify(collapsed));
  check('content reclaims the space', collapsed.mainWidth > open.mainWidth + 200, `${open.mainWidth} -> ${collapsed.mainWidth}`);
  check('content starts at the left edge', collapsed.mainLeft === 0, `${collapsed.mainLeft}`);

  await page.click('.menu-btn');
  await sleep(450);
  const reopened = await metrics();
  check('toggle restores the sidebar', reopened.sidebar === open.sidebar && !reopened.collapsed, JSON.stringify(reopened));

  /* ---------- keyboard shortcut ---------- */
  await page.keyboard.down('Control');
  await page.keyboard.press('Backslash');
  await page.keyboard.up('Control');
  await sleep(450);
  check('Ctrl+\\ collapses the sidebar', (await metrics()).collapsed);

  /* ---------- the choice survives a reload ---------- */
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.shell', { timeout: 8000 });
  const afterReload = await metrics();
  check('collapsed state is remembered', afterReload.collapsed && afterReload.sidebar === 0, JSON.stringify(afterReload));

  await page.click('.menu-btn');
  await sleep(450);
  check('can be reopened after a reload', !(await metrics()).collapsed);

  /* ---------- narrow screen keeps the overlay behaviour ---------- */
  await page.setViewport({ width: 700, height: 900 });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.sidebar', { timeout: 8000 });
  await sleep(300);
  const narrow = await metrics();
  check('sidebar starts hidden on a narrow screen', !narrow.overlayOpen, JSON.stringify(narrow));

  await page.click('.menu-btn');
  await sleep(400);
  check('toggle opens the overlay on a narrow screen', (await metrics()).overlayOpen);
  check('a backdrop is shown', (await page.$('.sidebar-backdrop')) !== null);

  await page.click('.sidebar-backdrop');
  await sleep(400);
  check('the backdrop closes the overlay', !(await metrics()).overlayOpen);

  check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (error) {
  check('run completed', false, error.stack ?? String(error));
} finally {
  await browser.close();
}

console.log(results.join('\n'));
console.log(failures ? `\n${failures} FAILURE(S)` : '\nThe left navigation toggles correctly');
process.exit(failures ? 1 : 0);
