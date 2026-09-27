#!/usr/bin/env node
/**
 * Drives the dev server in a real browser: navigation, block editing,
 * markdown shortcuts, tables, images, pasting and layout.
 *
 * Everything happens inside a throwaway "Smoke Fixture" section, so a run
 * never touches real notes.
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
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const results = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${String(detail).slice(0, 160)}` : ''}`);
  if (!ok) failures++;
  return ok;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fixture = await createFixture(base);
const PAGE_URL = `${base}/#/p/${fixture.pageKey}`;
let filePath = await fixture.filePath();

/** Polls the fixture markdown until it satisfies the predicate (autosave is debounced). */
async function waitForFile(predicate, timeout = 10000) {
  const until = Date.now() + timeout;
  let text = '';
  while (Date.now() < until) {
    filePath = await fixture.filePath();
    text = await (await fetch(`${base}/content/${filePath}`, { cache: 'no-store' })).text();
    if (predicate(text)) return { ok: true, text };
    await sleep(200);
  }
  return { ok: false, text };
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});

try {
  /* ---------- home ---------- */
  await page.goto(`${base}/`, { waitUntil: 'networkidle0' });
  check('home renders', (await page.$$('.node-card')).length >= 1);
  check('sidebar lists sections', (await page.$$('.nav-section-btn')).length >= 1);

  /* ---------- enable edit mode ---------- */
  await page.evaluate(() => localStorage.setItem('ns:edit', 'on'));
  await page.goto(PAGE_URL, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.editor-blocks', { timeout: 10000 });
  check('editor mounted in dev', true);

  /** Appends a new empty block and focuses it. */
  const focusFreshBlock = async () => {
    await page.evaluate(() => document.querySelector('.editor-append')?.click());
    await page.waitForSelector('.blk.active .blk-input', { timeout: 5000 });
  };

  const blockCount = (await page.$$('.blk')).length;
  check('page split into blocks', blockCount >= 8, `${blockCount} blocks`);
  check('rendered table present', (await page.$('.blk-render table')) !== null);
  check('rendered callout present', (await page.$('.blk-render .callout')) !== null);
  check(
    'callout marker stripped',
    !(await page.evaluate(() => document.querySelector('.callout .callout-body')?.textContent?.includes('[!'))),
    await page.evaluate(() => document.querySelector('.callout .callout-body')?.textContent?.slice(0, 60) ?? ''),
  );

  /* ---------- four nav levels are reachable ---------- */
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      document.querySelectorAll('.nav-section-btn, .nav-group-btn').forEach((b) => {
        if (b.getAttribute('aria-expanded') === 'false') b.click();
      });
    });
    await sleep(200);
  }
  const navLevels = await page.evaluate(() =>
    ['.nav-depth-0', '.nav-depth-1', '.nav-depth-2', '.nav-item'].map((s) => document.querySelectorAll(s).length),
  );
  check('four navigation levels render', navLevels.every((n) => n > 0), navLevels.join('/'));

  /* ---------- click a paragraph, edit it ---------- */
  const firstText = await page.$('.blk-kind-paragraph .blk-render');
  await firstText.click();
  await page.waitForSelector('.blk.active .blk-input', { timeout: 5000 });
  check('clicking a block opens the markdown input', true);

  await page.keyboard.press('End');
  await page.keyboard.type(' EDITED-MARKER');
  const firstSave = await waitForFile((t) => t.includes('EDITED-MARKER'));
  check('autosave writes the edit to the .md file', firstSave.ok);
  check(
    'save status reports saved',
    await page.evaluate(() => document.querySelector('.editor-status')?.textContent?.includes('Saved') ?? false),
  );

  /* ---------- markdown shortcut: ### heading ---------- */
  await page.keyboard.press('Enter');
  await page.keyboard.type('### Shortcut Heading');
  await sleep(150);
  const headingClass = await page.evaluate(() => document.querySelector('.blk.active .blk-input')?.className ?? '');
  check('### styles the input as h3 live', headingClass.includes('blk-h3'), headingClass);

  /* ---------- markdown shortcut: code fence ---------- */
  await page.keyboard.press('Enter');
  await page.keyboard.type('```ts');
  await sleep(150);
  const stillPlain = await page.evaluate(() => document.querySelector('.blk.active .blk-input')?.value ?? '');
  check('incomplete fence stays a plain input', stillPlain === '```ts', stillPlain);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.blk.active .code-editor', { timeout: 5000 });
  await page.keyboard.type('const answer = 42;');
  check('``` + Enter creates a code block', true);
  const lang = await page.evaluate(() => document.querySelector('.blk.active .code-lang-input')?.value);
  check('fence language captured', lang === 'ts', lang);

  /* ---------- slash menu ---------- */
  await focusFreshBlock();
  await page.keyboard.type('/table');
  await page.waitForSelector('.slash-menu', { timeout: 5000 });
  check('slash menu opens and filters', (await page.$$('.slash-item')).length >= 1);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.blk.active .tbl-grid', { timeout: 5000 });
  check('table block turns into a grid editor', true);

  /* ---------- table grid editing ---------- */
  await page.evaluate(() => document.querySelector('.tbl-grid tbody .tbl-cell').focus());
  await page.keyboard.type('cell-one');
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll('.tbl-foot .btn')][0]?.click());
  await page.waitForFunction(() => document.querySelectorAll('.tbl-grid tbody tr').length === 3, { timeout: 5000 });
  check('table row added', true);

  const saved2 = await waitForFile((t) => t.includes('cell-one'));
  check('table written back as markdown', saved2.ok && /\|\s*cell-one/.test(saved2.text), saved2.text.slice(-160));
  check('code block written with its language', saved2.text.includes('```ts'), saved2.text.slice(-260));
  check('heading shortcut written as markdown', saved2.text.includes('### Shortcut Heading'));

  /* ---------- Shift+Enter is a real line break ---------- */
  await focusFreshBlock();
  await page.keyboard.type('line one');
  await page.keyboard.down('Shift');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Shift');
  await page.keyboard.type('line two');
  await sleep(200);
  const softValue = await page.evaluate(() => document.querySelector('.blk.active .blk-input')?.value ?? '');
  check('Shift+Enter stays in the same block', softValue === 'line one\nline two', JSON.stringify(softValue));

  await page.keyboard.press('Escape');
  await sleep(300);
  const breakHtml = await page.evaluate(() => {
    const blk = [...document.querySelectorAll('.blk')].find((b) => (b.textContent ?? '').includes('line one'));
    return blk?.querySelector('.blk-render p')?.innerHTML ?? '';
  });
  check('Shift+Enter renders as a line break, not a space', /<br\s*\/?>/.test(breakHtml), breakHtml);

  const breakRects = await page.evaluate(() => {
    const blk = [...document.querySelectorAll('.blk')].find((b) => (b.textContent ?? '').includes('line one'));
    const p = blk?.querySelector('.blk-render p');
    if (!p) return 0;
    const range = document.createRange();
    range.selectNodeContents(p);
    return range.getClientRects().length;
  });
  check('the two lines occupy separate lines on screen', breakRects >= 2, `${breakRects} client rects`);

  /* ---------- markdown source mode with live preview ---------- */
  await page.evaluate(() => [...document.querySelectorAll('.tb-modes button')][1].click());
  await page.waitForSelector('.editor-source-input', { timeout: 5000 });
  check('markdown mode shows source + preview', (await page.$('.editor-source-preview .prose')) !== null);

  const setSource = (value) =>
    page.evaluate((v) => {
      const ta = document.querySelector('.editor-source-input');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, v);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);

  await setSource('# Live Preview Title\n\nSome body.');
  await sleep(300);
  const previewHtml = await page.evaluate(() => document.querySelector('.editor-source-preview')?.innerHTML ?? '');
  check('preview renders while typing markdown', previewHtml.includes('Live Preview Title'));

  /* ---------- image size tag + lightbox ---------- */
  await setSource('# Images\n\n![shot](https://placehold.co/600x200/png "=320x")\n');
  await sleep(400);
  const imgWidth = await page.evaluate(() => {
    const el = document.querySelector('.editor-source-preview .md-image');
    return el ? getComputedStyle(el).width : '';
  });
  check('image size tag applied', imgWidth === '320px', imgWidth);

  await page.evaluate(() => document.querySelector('.editor-source-preview .md-image img')?.click());
  await page.waitForSelector('.lightbox', { timeout: 5000 });
  check('full screen lightbox opens', true);
  await page.keyboard.press('Escape');

  /* ---------- paste behaviours ---------- */
  await api(base, 'page/save', { key: fixture.pageKey, markdown: 'Starting point.', title: 'Fixture Page' });
  await page.goto(PAGE_URL, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.editor-blocks .blk', { timeout: 8000 });
  await (await page.$('.blk .blk-render, .blk .blk-empty')).click();
  await page.waitForSelector('.blk.active .blk-input', { timeout: 5000 });

  const pasteInto = (selector, entries, file) =>
    page.evaluate(
      (sel, pairs, fileSpec) => {
        const el = document.querySelector(sel);
        el.focus();
        const dt = new DataTransfer();
        for (const [type, value] of pairs) dt.setData(type, value);
        if (fileSpec) {
          const bytes = Uint8Array.from(atob(fileSpec.data), (c) => c.charCodeAt(0));
          dt.items.add(new File([bytes], fileSpec.name, { type: fileSpec.type }));
        }
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      },
      selector,
      entries,
      file ?? null,
    );

  await pasteInto('.blk.active .blk-input', [
    ['text/plain', '## Pasted Heading\n\n- one\n- two\n\n| a | b |\n| --- | --- |\n| 1 | 2 |'],
  ]);
  await sleep(400);
  const pastedKinds = await page.evaluate(() =>
    [...document.querySelectorAll('.blk')].map((b) => [...b.classList].find((c) => c.startsWith('blk-kind-'))),
  );
  check(
    'pasted markdown becomes real blocks',
    pastedKinds.includes('blk-kind-heading') && pastedKinds.includes('blk-kind-list') && pastedKinds.includes('blk-kind-table'),
    pastedKinds.join(','),
  );

  await focusFreshBlock();
  await page.keyboard.type('read the docs');
  await page.evaluate(() => {
    const el = document.querySelector('.blk.active .blk-input');
    el.focus();
    el.setSelectionRange(0, el.value.length);
  });
  await pasteInto('.blk.active .blk-input', [['text/plain', 'https://example.com/docs']]);
  await sleep(250);
  const linked = await page.evaluate(() => document.querySelector('.blk.active .blk-input')?.value ?? '');
  check('pasted URL wraps the selection in a link', /\[.+\]\(https:\/\/example\.com\/docs\)/.test(linked), linked);

  await focusFreshBlock();
  await pasteInto('.blk.active .blk-input', [
    ['text/plain', 'Heading two\nbold text'],
    ['text/html', '<h2>Heading two</h2><p><strong>bold</strong> text</p>'],
  ]);
  await sleep(300);
  const htmlPaste = await page.evaluate(() =>
    [...document.querySelectorAll('.blk')].map((b) => b.querySelector('textarea,.blk-render')?.textContent ?? '').join('\n'),
  );
  check('pasted HTML converts to markdown', /Heading two/.test(htmlPaste) && /\*\*bold\*\*/.test(htmlPaste));

  await focusFreshBlock();
  await pasteInto('.blk.active .blk-input', [], { name: 'pasted.png', type: 'image/png', data: PNG_B64 });
  await sleep(1400);
  filePath = await fixture.filePath();
  const assetDir = `content/${filePath.split('/').slice(0, -1).join('/')}/assets`;
  const assets = fs.existsSync(assetDir) ? fs.readdirSync(assetDir) : [];
  check('pasted image saved beside the page', assets.some((a) => a.includes('pasted')), assets.join(',') || 'no assets');
  check(
    'pasted image inserted into the document',
    await page.evaluate(() =>
      [...document.querySelectorAll('.blk img')].some((i) => (i.getAttribute('src') ?? '').includes('pasted')),
    ),
    await page.evaluate(() => [...document.querySelectorAll('.blk img')].map((i) => i.getAttribute('src')).join(' | ')),
  );

  /* ---------- sidebar CRUD ---------- */
  const sectionsBefore = (await page.$$('.nav-section-btn')).length;
  await page.evaluate(() => [...document.querySelectorAll('.sidebar-actions .btn')][0].click());
  await page.waitForSelector('.nav-rename', { timeout: 6000 });
  await page.keyboard.type('Browser Made Section');
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (n) => document.querySelectorAll('.nav-section-btn').length === n + 1,
    { timeout: 8000 },
    sectionsBefore,
  );
  const sectionTitles = await page.evaluate(() =>
    [...document.querySelectorAll('.nav-section-btn .ns-title')].map((n) => n.textContent),
  );
  check('section created from the sidebar', sectionTitles.includes('Browser Made Section'), sectionTitles.join(', '));
  check(
    'section folder on disk',
    fs.readdirSync('content').some((d) => d.endsWith('browser-made-section')),
    fs.readdirSync('content').join(', '),
  );
  await api(base, 'node/delete', { key: 'browser-made-section' });

  /* ---------- image resize handle ---------- */
  const upload = await api(base, 'asset/upload', {
    key: fixture.pageKey,
    data: PNG_B64,
    mime: 'image/png',
    name: 'resize.png',
  });
  await api(base, 'page/save', {
    key: fixture.pageKey,
    markdown: `![shot](${upload.url} "=200x")`,
    title: 'Fixture Page',
  });
  await page.goto(PAGE_URL, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.blk-kind-image', { timeout: 8000 });
  await page.click('.blk-kind-image .md-image img');
  await page.waitForSelector('.img-handle', { timeout: 6000 });
  check('clicking an image selects it instead of zooming', (await page.$('.lightbox')) === null);

  const handle = await (await page.$('.img-handle')).boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 90, handle.y + handle.height / 2, { steps: 8 });
  await page.mouse.up();
  await sleep(400);
  const widthValue = await page.evaluate(() => document.querySelector('.img-num')?.value ?? '');
  check('dragging the handle resizes the image', Number(widthValue) >= 270 && Number(widthValue) <= 310, widthValue);

  // Must be the dragged width, not the 200px it started at.
  const resized = await waitForFile((t) => /"=(2[7-9]\d|3[01]\d)x"/.test(t));
  check('size tag persisted to markdown', resized.ok, resized.text.trim().slice(-60));

  /* ---------- moving a page carries its images ---------- */
  const moved = await api(base, 'node/move', { key: fixture.pageKey, parentKey: fixture.otherTopicKey, index: 0 });
  const movedPath = pathOf(moved.tree, moved.key);
  const movedAssets = `content/${movedPath.split('/').slice(0, -1).join('/')}/assets`;
  check('its images travel with it', fs.existsSync(movedAssets) && fs.readdirSync(movedAssets).length > 0, movedPath);
  await api(base, 'node/move', { key: moved.key, parentKey: fixture.topicKey, index: 0 });

  /* ---------- layout: every edge shares one measure ---------- */
  await api(base, 'page/save', {
    key: fixture.pageKey,
    markdown: `## One\n\nBody.\n\n## Two\n\nBody.\n\n## Three\n\n${'Long body text. '.repeat(120)}`,
    title: 'Fixture Page',
  });
  await page.evaluate(() => localStorage.setItem('ns:edit', 'off'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.goto(PAGE_URL, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.topic-main > .prose', { timeout: 8000 });
  const edges = await page.evaluate(() => {
    const box = (sel) => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      return r ? [Math.round(r.left), Math.round(r.right)] : null;
    };
    return { head: box('.topic-head'), prose: box('.topic-main > .prose'), pager: box('.pager') };
  });
  const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  check(
    'content, header and pager share the same width',
    same(edges.head, edges.prose) && same(edges.prose, edges.pager),
    JSON.stringify(edges),
  );

  /* ---------- table of contents scrolls instead of routing away ---------- */
  const scrollBefore = await page.evaluate(() => Math.round(window.scrollY));
  await page.evaluate(() => [...document.querySelectorAll('.toc-list a')].pop()?.click());
  await sleep(900);
  const scrollAfter = await page.evaluate(() => Math.round(window.scrollY));
  check('a TOC link scrolls the page', scrollAfter > scrollBefore + 100, `${scrollBefore} -> ${scrollAfter}`);
  check('a TOC link keeps the route', page.url().includes(`/p/${fixture.pageKey}`), page.url());
  check(
    'a TOC link does not land on not-found',
    !(await page.evaluate(() => document.body.innerText.includes('Page not found'))),
  );

  /* ---------- sections and pages, nothing else ---------- */
  await page.evaluate(() => localStorage.setItem('ns:edit', 'on'));
  await page.goto(PAGE_URL, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.sidebar-scroll', { timeout: 8000 });
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      document.querySelectorAll('.nav-section-btn, .nav-group-btn').forEach((b) => {
        if (b.getAttribute('aria-expanded') === 'false') b.click();
      });
    });
    await sleep(200);
  }

  const openRowMenu = async (title) => {
    await page.evaluate((t) => {
      const row = [...document.querySelectorAll('.nav-row-wrap')].find((r) => (r.textContent ?? '').trim().startsWith(t));
      row?.scrollIntoView({ block: 'center' });
      row?.querySelector('.nav-kebab')?.click();
    }, title);
    await page.waitForSelector('.nav-menu', { timeout: 5000 });
    await sleep(150);
    const items = await page.evaluate(() =>
      [...document.querySelectorAll('.nav-menu button')].map((b) => (b.textContent ?? '').trim()),
    );
    const kind = await page.evaluate(() => document.querySelector('.nav-menu-title')?.textContent?.trim());
    await page.keyboard.press('Escape');
    await sleep(150);
    return { items, kind };
  };

  const topLevel = await openRowMenu('Smoke Fixture');
  check('a top level node is labelled Section', topLevel.kind === 'Section', topLevel.kind);
  check(
    'a section offers both a page and a section',
    topLevel.items.includes('New page') && topLevel.items.includes('New section'),
    topLevel.items.join(' | '),
  );

  const deepest = await openRowMenu('Fixture Topic');
  check('a nested node is also labelled Section', deepest.kind === 'Section', deepest.kind);
  check(
    'the deepest section offers a page but no further section',
    deepest.items.includes('New page') && !deepest.items.includes('New section'),
    deepest.items.join(' | '),
  );

  const pageMenu = await openRowMenu('Fixture Page');
  check('a page is labelled Page', pageMenu.kind === 'Page', pageMenu.kind);
  check(
    'a page offers no children',
    !pageMenu.items.includes('New page') && !pageMenu.items.includes('New section'),
    pageMenu.items.join(' | '),
  );

  /* ---------- a page can be created at any level ---------- */
  const levelKeys = ['', fixture.sectionKey, fixture.categoryKey, fixture.topicKey];
  const created = [];
  for (const parentKey of levelKeys) {
    const res = await api(base, 'node/create', { parentKey, kind: 'page', title: `Level ${created.length + 1}` });
    created.push(res.key);
  }
  check(
    'a page can be created at all four levels',
    created.every((k, i) => k.split('/').length === i + 1),
    created.join(' | '),
  );
  await api(base, 'node/delete', { key: created[0] });

  /* ---------- heading rhythm: compact, and identical in both modes ---------- */
  const HEADING_MD = [
    'Intro paragraph.',
    '',
    '# Heading one',
    '',
    'Body under h1.',
    '',
    '## Heading two',
    '',
    'Body under h2.',
    '',
    '### Heading three',
    '',
    'Body under h3.',
    '',
    '#### Heading four',
    '',
    'Body under h4.',
  ].join('\n');
  await api(base, 'page/save', { key: fixture.pageKey, markdown: HEADING_MD, title: 'Fixture Page' });

  /** Distance from the bottom of the paragraph above to the top of each heading. */
  const headingGaps = () =>
    page.evaluate(() => {
      const paragraphs = [...document.querySelectorAll('.prose p')].map((el) => el.getBoundingClientRect());
      return [...document.querySelectorAll('.prose h1, .prose h2, .prose h3, .prose h4')].map((h) => {
        const r = h.getBoundingClientRect();
        const above = paragraphs.filter((p) => p.bottom <= r.top + 1).sort((a, b) => b.bottom - a.bottom)[0];
        return { tag: h.tagName, gap: above ? Math.round(r.top - above.bottom) : null };
      });
    });

  await page.evaluate(() => localStorage.setItem('ns:edit', 'off'));
  await page.goto(PAGE_URL, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.topic-main > .prose h4', { timeout: 8000 });
  const readGaps = await headingGaps();

  await page.evaluate(() => localStorage.setItem('ns:edit', 'on'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.blk-render h4', { timeout: 8000 });
  const editGaps = await headingGaps();

  check(
    'heading gaps stay compact',
    readGaps.every((g) => g.gap !== null && g.gap >= 12 && g.gap <= 36),
    JSON.stringify(readGaps),
  );
  check(
    'bigger headings still get more air than smaller ones',
    readGaps[0].gap > readGaps[3].gap,
    `${readGaps[0].tag} ${readGaps[0].gap} vs ${readGaps[3].tag} ${readGaps[3].gap}`,
  );
  check(
    'reading and editing use the same heading rhythm',
    readGaps.length === editGaps.length && readGaps.every((g, i) => Math.abs(g.gap - editGaps[i].gap) <= 2),
    `${JSON.stringify(readGaps)} vs ${JSON.stringify(editGaps)}`,
  );

  /* ---------- collapsible blocks survive the block splitter ---------- */
  const DETAILS_MD = [
    'Before the toggle.',
    '',
    '<details>',
    '<summary>Show more</summary>',
    '',
    'Hidden **content** with a list:',
    '',
    '- one',
    '- two',
    '',
    '</details>',
    '',
    'After the toggle.',
  ].join('\n');
  await api(base, 'page/save', { key: fixture.pageKey, markdown: DETAILS_MD, title: 'Fixture Page' });

  await page.evaluate(() => localStorage.setItem('ns:edit', 'off'));
  await page.goto(PAGE_URL, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.topic-main > .prose details', { timeout: 8000 });
  const detailsRead = await page.evaluate(() => document.querySelector('.topic-main > .prose details')?.outerHTML ?? '');

  await page.evaluate(() => localStorage.setItem('ns:edit', 'on'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.blk-kind-html', { timeout: 8000 });
  const detailsKinds = await page.evaluate(() =>
    [...document.querySelectorAll('.blk')].map((b) => [...b.classList].find((c) => c.startsWith('blk-kind-'))),
  );
  check(
    'a <details> element stays one editable block',
    detailsKinds.filter((k) => k === 'blk-kind-html').length === 1 && detailsKinds.length === 3,
    detailsKinds.join(','),
  );
  const detailsEdit = await page.evaluate(() => document.querySelector('.blk-kind-html details')?.outerHTML ?? '');
  check('collapsible renders identically in edit and read mode', detailsEdit === detailsRead && detailsEdit !== '', detailsEdit.slice(0, 90));

  await page.click('.blk-kind-html summary');
  await sleep(250);
  check(
    'clicking the summary toggles instead of opening the editor',
    await page.evaluate(() => !!document.querySelector('.blk-kind-html details[open]') && !document.querySelector('.blk.active')),
  );

  await page.evaluate(() => document.querySelector('.blk-kind-html .blk-edit-hint')?.click());
  await sleep(300);
  check(
    'the collapsible can still be opened for editing',
    await page.evaluate(() => (document.querySelector('.blk.active .blk-input')?.value ?? '').startsWith('<details>')),
  );

  check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (error) {
  check('run completed', false, error.stack ?? String(error));
} finally {
  await browser.close();
  await destroyFixture(base);
}

console.log(results.join('\n'));
console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll UI checks passed');
process.exit(failures ? 1 : 0);
