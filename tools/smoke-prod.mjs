#!/usr/bin/env node
/**
 * Verifies that a production build renders content and exposes no editing.
 * It navigates by following the site's own links, so it works against whatever
 * content happens to be in the build.
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const base = process.argv[2] || 'http://localhost:4173';
const results = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${String(detail).slice(0, 140)}` : ''}`);
  if (!ok) failures++;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

try {
  await page.goto(`${base}/`, { waitUntil: 'networkidle0' });
  // Force the flag an editor would have left behind — it must still be ignored.
  await page.evaluate(() => localStorage.setItem('ns:edit', 'on'));
  await page.reload({ waitUntil: 'networkidle0' });

  check('home renders', (await page.$$('.node-card')).length >= 1);
  check('no edit toggle in the header', !(await page.evaluate(() => document.body.innerText.includes('Editing'))));
  check('no sidebar edit actions', (await page.$('.sidebar-actions')) === null);
  check('read-only marker shown', await page.evaluate(() => /read-only build/i.test(document.body.innerText)));

  /* ---------- open the first page the site itself links to ---------- */
  const firstPage = await page.evaluate(() => {
    const link = [...document.querySelectorAll('a[href*="#/p/"]')][0];
    return link ? link.getAttribute('href') : null;
  });
  check('site links to a page', !!firstPage, String(firstPage));

  if (firstPage) {
    await page.goto(`${base}/${firstPage.replace(/^\.?\//, '')}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.topic-main > .prose', { timeout: 10000 });
    const text = await page.evaluate(() => document.querySelector('.prose')?.textContent?.trim() ?? '');
    check('page content renders', text.length > 20, text.slice(0, 60));
    check('no block editor', (await page.$('.editor-blocks')) === null);
    check('no editor toolbar', (await page.$('.editor-toolbar')) === null);

    const edges = await page.evaluate(() => {
      const box = (sel) => {
        const r = document.querySelector(sel)?.getBoundingClientRect();
        return r ? [Math.round(r.left), Math.round(r.right)] : null;
      };
      return { head: box('.topic-head'), prose: box('.topic-main > .prose') };
    });
    check(
      'content and header share the same width',
      edges.head && edges.prose && edges.head[0] === edges.prose[0] && edges.head[1] === edges.prose[1],
      JSON.stringify(edges),
    );
  }

  /* ---------- the sidebar can still be collapsed ---------- */
  await page.click('.menu-btn');
  await sleep(450);
  check(
    'navigation toggle works in production',
    await page.evaluate(() => !!document.querySelector('.shell.nav-collapsed')),
  );

  const api = await fetch(`${base}/__notes/api/tree`, { method: 'POST', body: '{}' });
  check('editing API is absent', api.status === 404 || api.status === 405, `status ${api.status}`);

  const shipped = fs
    .readdirSync('dist/content', { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.md'));
  check('markdown shipped into dist', shipped.length > 0, `${shipped.length} files`);
  if (shipped.length) {
    const md = await fetch(`${base}/content/${shipped[0].replace(/\\/g, '/')}`);
    check('content served from dist', md.ok, `${md.status} ${shipped[0]}`);
  }

  check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (error) {
  check('run completed', false, error.stack ?? String(error));
} finally {
  await browser.close();
}

console.log(results.join('\n'));
console.log(failures ? `\n${failures} FAILURE(S)` : '\nProduction build is read-only and renders correctly');
process.exit(failures ? 1 : 0);
