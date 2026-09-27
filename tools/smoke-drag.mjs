#!/usr/bin/env node
/**
 * Real drag-and-drop, driven through Chrome's own drag pipeline rather than
 * synthetic events — this is what catches a `preventDefault` on mousedown
 * silently cancelling a native drag.
 *
 * Runs entirely inside a throwaway "Smoke Fixture" section.
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { api, createFixture, destroyFixture, pathOf } from './fixture.mjs';

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
const PAGE_URL = `${base}/#/p/${fixture.pageKey}`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));

const centreOf = async (selector, index = 0) => {
  const box = await page.evaluate(
    (sel, i) => {
      const el = document.querySelectorAll(sel)[i];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, height: r.height };
    },
    selector,
    index,
  );
  if (!box) throw new Error(`No usable box for ${selector}[${index}]`);
  return box;
};

/** Waits until the sidebar stops adding rows, so measurements cannot go stale. */
async function settleRows() {
  let previous = -1;
  for (let i = 0; i < 12; i++) {
    const count = await page.evaluate(() => document.querySelectorAll('.nav-row-wrap').length);
    if (count === previous) return count;
    previous = count;
    await sleep(200);
  }
  return previous;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

/**
 * Full native drag: dragstart at `from`, dragover + drop at `to`.
 * `expect` optionally asserts which row is highlighted before the drop lands.
 */
async function realDrag(from, to, expect) {
  const data = await withTimeout(page.mouse.drag(from, to), 15000, 'dragstart');
  await page.mouse.dragEnter(to, data);
  await page.mouse.dragOver(to, data);
  let indicator = 'n/a';
  if (expect) {
    await page
      .waitForFunction(
        (t) => (document.querySelector('.nav-row-wrap.drop-inside')?.textContent ?? '').trim().startsWith(t),
        { timeout: 3000 },
        expect,
      )
      .catch(() => {});
    indicator = await page.evaluate(
      () => (document.querySelector('.nav-row-wrap.drop-inside')?.textContent ?? 'none').trim(),
    );
  }
  await page.mouse.drop(to, data);
  await page.mouse.up();
  return indicator;
}

/** Collapses everything except the fixture, so its rows are few and on screen. */
async function focusSidebarOnFixture() {
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      document.querySelectorAll('.nav-section-btn').forEach((b) => {
        const title = b.querySelector('.ns-title')?.textContent ?? '';
        const wanted = title === 'Smoke Fixture' || title === 'Drag Target Section';
        const open = b.getAttribute('aria-expanded') === 'true';
        if (wanted !== open) b.click();
      });
    });
    await sleep(200);
  }
  // Only the fixture's own groups exist now, so this expands just those.
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      document.querySelectorAll('.nav-group-btn').forEach((b) => {
        if (b.getAttribute('aria-expanded') === 'false') b.click();
      });
    });
    await sleep(200);
  }
  await settleRows();
}

/** Measures a sidebar row, making sure it is actually on screen first. */
async function centreOfRow(index) {
  await page.evaluate((i) => {
    document.querySelectorAll('.nav-row-wrap')[i]?.scrollIntoView({ block: 'center' });
  }, index);
  await sleep(250);
  const box = await centreOf('.nav-row-wrap', index);
  const height = await page.evaluate(() => window.innerHeight);
  if (box.y < 60 || box.y > height - 20) throw new Error(`sidebar row ${index} is off screen at y=${box.y}`);
  return box;
}

const rowNamed = (title) =>
  page.evaluate(
    (t) => [...document.querySelectorAll('.nav-row-wrap')].findIndex((r) => (r.textContent ?? '').trim().startsWith(t)),
    title,
  );

try {
  await page.setDragInterception(true);

  await page.goto(`${base}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.setItem('ns:edit', 'on'));

  await api(base, 'page/save', {
    key: fixture.pageKey,
    markdown: 'Alpha block\n\nBeta block\n\nGamma block',
    title: 'Fixture Page',
  });
  await page.goto(PAGE_URL, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.editor-blocks .blk', { timeout: 8000 });

  /* ---------- empty block is selectable ---------- */
  await page.evaluate(() => document.querySelector('.editor-append')?.click());
  await page.waitForSelector('.blk-empty, .blk.active .blk-input', { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.blk-empty', { timeout: 5000 });
  const emptyBox = await centreOf('.blk-empty');
  await page.mouse.click(emptyBox.x, emptyBox.y);
  await sleep(250);
  check(
    'clicking an empty block opens it for editing',
    await page.evaluate(() => !!document.querySelector('.blk.active .blk-input')),
  );
  await page.keyboard.type('Delta block');
  await sleep(200);
  check(
    'typing into the selected empty block works',
    await page.evaluate(() => document.querySelector('.blk.active .blk-input')?.value === 'Delta block'),
  );

  /* ---------- drag a block with the real drag pipeline ---------- */
  const orderBefore = await page.evaluate(() =>
    [...document.querySelectorAll('.blk')].map((b) => (b.textContent ?? '').trim().slice(0, 5)),
  );

  const firstBlock = await centreOf('.blk', 0);
  await page.mouse.move(firstBlock.x, firstBlock.y);
  await sleep(150);
  const grip = await centreOf('.blk-grip', 0);
  const third = await centreOf('.blk', 2);
  check('drag handle is reachable', !!grip, JSON.stringify(grip));

  await realDrag(grip, { x: third.x, y: third.y + third.height * 0.35 });
  await sleep(500);

  const orderAfter = await page.evaluate(() =>
    [...document.querySelectorAll('.blk')].map((b) => (b.textContent ?? '').trim().slice(0, 5)),
  );
  check(
    'native drag reorders blocks',
    orderAfter[0] !== orderBefore[0] && orderAfter.indexOf('Alpha') > 0,
    `${orderBefore.join('|')}  ->  ${orderAfter.join('|')}`,
  );

  await sleep(1400);
  const savedPath = await fixture.filePath();
  const saved = await (await fetch(`${base}/content/${savedPath}`, { cache: 'no-store' })).text();
  check('reordered blocks persisted', saved.indexOf('Beta') < saved.indexOf('Alpha'), saved.split('---').pop().trim().replace(/\n+/g, ' / '));

  /* ---------- drag a page to another topic in the sidebar ---------- */
  await focusSidebarOnFixture();
  const pageRow = await rowNamed('Fixture Page');
  const topicRow = await rowNamed('Second Topic');
  check('sidebar rows located', pageRow >= 0 && topicRow >= 0, `${pageRow} -> ${topicRow}`);

  const source = await centreOfRow(pageRow);
  const target = await centreOfRow(topicRow);
  await page.mouse.move(source.x, source.y);
  await sleep(150);
  const pageIndicator = await realDrag({ x: source.x, y: source.y }, { x: target.x, y: target.y }, 'Second Topic');
  check('drop-inside indicator lands on the target topic', pageIndicator.startsWith('Second Topic'), pageIndicator);
  await sleep(1600);

  const { tree: afterPageMove } = await api(base, 'tree');
  check(
    'native drag moves a page into another topic',
    !!pathOf(afterPageMove, `${fixture.otherTopicKey}/fixture-page`),
    pathOf(afterPageMove, `${fixture.otherTopicKey}/fixture-page`) || 'not moved',
  );

  /* ---------- drag a folder row (its wrapper contains a button) ---------- */
  await api(base, 'node/create', { parentKey: '', kind: 'section', title: 'Drag Target Section' });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.sidebar-scroll', { timeout: 8000 });
  await focusSidebarOnFixture();

  const categoryRow = await rowNamed('Fixture Category');
  const sectionRow = await rowNamed('Drag Target Section');
  check('throwaway folder rows located', categoryRow >= 0 && sectionRow >= 0, `${categoryRow} -> ${sectionRow}`);

  const categoryBox = await centreOfRow(categoryRow);
  const sectionBox = await centreOfRow(sectionRow);
  await page.mouse.move(categoryBox.x, categoryBox.y);
  await sleep(150);
  const folderIndicator = await realDrag(
    { x: categoryBox.x, y: categoryBox.y },
    { x: sectionBox.x, y: sectionBox.y },
    'Drag Target Section',
  );
  check('drop-inside indicator lands on the target folder', folderIndicator.startsWith('Drag Target Section'), folderIndicator);
  await sleep(1600);

  const targetDir = fs.readdirSync('content').find((d) => d.endsWith('drag-target-section'));
  const nested = targetDir ? fs.readdirSync(`content/${targetDir}`).filter((n) => n !== '_meta.json') : [];
  check(
    'native drag moves a folder into a section',
    nested.some((n) => n.endsWith('fixture-category')),
    `${targetDir}: ${nested.join(', ') || '(empty)'}`,
  );

  check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (error) {
  check('run completed', false, error.stack ?? String(error));
} finally {
  await browser.close();
  await destroyFixture(base);
  try {
    await api(base, 'node/delete', { key: 'drag-target-section' });
  } catch {
    /* already gone */
  }
}

console.log(results.join('\n'));
console.log(failures ? `\n${failures} FAILURE(S)` : '\nDrag and empty-block selection work');
process.exit(failures ? 1 : 0);
