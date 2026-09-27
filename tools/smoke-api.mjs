const BASE = process.env.NS_BASE || 'http://localhost:5199';

let failures = 0;
const results = [];

function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
  return ok;
}

async function api(action, body = {}) {
  const res = await fetch(`${BASE}/__notes/api/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function findKey(tree, key) {
  for (const node of tree) {
    if (node.key === key) return node;
    const hit = findKey(node.children ?? [], key);
    if (hit) return hit;
  }
  return null;
}

/** Real on-disk path of a node, so tests never hard-code numeric prefixes. */
function pathOf(tree, key) {
  return findKey(tree, key)?.path ?? '';
}

async function fetchContent(tree, key) {
  const p = pathOf(tree, key);
  if (!p) return { ok: false, text: async () => '', headers: new Headers() };
  return fetch(`${BASE}/content/${p}`, { cache: 'no-store' });
}

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

(async () => {
  // --- static assets ---
  const html = await fetch(`${BASE}/`);
  check('index.html served', html.ok);

  const traversal = await fetch(`${BASE}/content/%2e%2e%2f%2e%2e%2fpackage.json`);
  check('path traversal blocked', traversal.status === 403, `status ${traversal.status}`);

  // --- tree ---
  let { json: t } = await api('tree');
  const baseSections = t.tree?.length ?? 0;
  check('tree endpoint', t.ok && Array.isArray(t.tree), `${baseSections} sections`);

  // --- create a section / category / topic / page ---
  let r = await api('node/create', { parentKey: '', kind: 'section', title: 'Smoke Section' });
  check('create section', r.json.ok && r.json.key === 'smoke-section', r.json.error);
  r = await api('node/create', { parentKey: 'smoke-section', kind: 'section', title: 'Cat One' });
  check('create a nested section', r.json.ok && r.json.key === 'smoke-section/cat-one', r.json.error);
  r = await api('node/create', { parentKey: 'smoke-section/cat-one', kind: 'section', title: 'Topic One' });
  check('create a third level section', r.json.ok && r.json.key === 'smoke-section/cat-one/topic-one', r.json.error);
  r = await api('node/create', { parentKey: 'smoke-section/cat-one/topic-one', kind: 'page', title: 'Page One' });
  const pageKey = r.json.key;
  check('create page', r.json.ok && pageKey === 'smoke-section/cat-one/topic-one/page-one', r.json.error);

  // depth guard
  r = await api('node/create', { parentKey: 'smoke-section/cat-one/topic-one', kind: 'section', title: 'Too Deep' });
  check('section depth guard', r.status === 400, `status ${r.status}`);

  // --- a page may live at any level ---
  const levels = [
    ['', 'root-page'],
    ['smoke-section', 'smoke-section/level-two-page'],
    ['smoke-section/cat-one', 'smoke-section/cat-one/level-three-page'],
    ['smoke-section/cat-one/topic-one', 'smoke-section/cat-one/topic-one/level-four-page'],
  ];
  let levelsOk = true;
  const levelDetail = [];
  for (const [parentKey, expected] of levels) {
    const title = expected.split('/').pop().replace(/-/g, ' ');
    const res = await api('node/create', { parentKey, kind: 'page', title });
    if (!res.json.ok || res.json.key !== expected) levelsOk = false;
    levelDetail.push(res.json.key ?? res.json.error);
  }
  check('a page can be added at every level', levelsOk, levelDetail.join(' | '));
  await api('node/delete', { key: 'root-page' });

  // --- save markdown ---
  const body = '## Hello\n\nSome **content**.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n';
  r = await api('page/save', { key: pageKey, markdown: body, title: 'Page One', description: 'desc', tags: ['x', 'y'] });
  check('save page', r.json.ok, r.json.error);
  const saved = await (await fetchContent(r.json.tree, pageKey)).text();
  check('markdown written to disk', saved.includes('## Hello') && saved.includes('tags: [x, y]'), saved.slice(0, 80));
  check('markdown served from /content', saved.startsWith('---'), saved.slice(0, 20));
  const page = findKey(r.json.tree, pageKey);
  check('four level key resolves', !!page && page.kind === 'page', pageKey);
  check('page headings extracted', (page?.headings ?? []).length >= 1, JSON.stringify(page?.headings ?? []));

  // --- upload an image ---
  r = await api('asset/upload', { key: pageKey, data: PNG, mime: 'image/png', name: 'Shot One.png' });
  check('asset upload', r.json.ok && r.json.url === './assets/page-one-shot-one.png', r.json.url || r.json.error);
  const pageDir = pathOf(r.json.tree, pageKey).split('/').slice(0, -1).join('/');
  const img = await fetch(`${BASE}/content/${pageDir}/assets/page-one-shot-one.png`);
  check('asset served', img.ok && img.headers.get('content-type') === 'image/png');

  // --- rename ---
  r = await api('node/rename', { key: pageKey, title: 'Renamed Page' });
  check('rename page', r.json.ok && r.json.key === 'smoke-section/cat-one/topic-one/renamed-page', r.json.error);
  const renamed = await (await fetchContent(r.json.tree, r.json.key)).text();
  check('rename keeps body + title', renamed.includes('## Hello') && renamed.includes('title: Renamed Page'));

  r = await api('node/rename', { key: 'smoke-section/cat-one', title: 'Category Renamed' });
  check('rename folder', r.json.ok && r.json.key === 'smoke-section/category-renamed', r.json.error);

  // --- duplicate + reorder ---
  r = await api('node/duplicate', { key: 'smoke-section/category-renamed/topic-one/renamed-page' });
  const dupKey = r.json.key;
  check('duplicate page', r.json.ok && dupKey.endsWith('renamed-page-copy'), r.json.error);

  r = await api('node/move', { key: dupKey, parentKey: 'smoke-section/category-renamed/topic-one', index: 0 });
  check('reorder within parent', r.json.ok, r.json.error);
  let topic = findKey(r.json.tree, 'smoke-section/category-renamed/topic-one');
  check('reorder took effect', topic?.children[0]?.key.endsWith('renamed-page-copy'), topic?.children.map((c) => c.slug).join(','));
  check('renumbered on disk', topic?.children[0]?.path.includes('01-renamed-page-copy.md'), topic?.children[0]?.path);

  // --- move across parents ---
  r = await api('node/create', { parentKey: 'smoke-section', kind: 'section', title: 'Cat Two' });
  check('create a second nested section', r.json.ok, r.json.error);
  r = await api('node/move', { key: 'smoke-section/category-renamed/topic-one', parentKey: 'smoke-section/cat-two', index: 0 });
  check('move topic to another category', r.json.ok && r.json.key === 'smoke-section/cat-two/topic-one', r.json.error);

  // invalid move: section with 2 folder levels into a category
  r = await api('node/move', { key: 'smoke-section', parentKey: 'smoke-section/cat-two' });
  check('move into self rejected', r.status === 400, `status ${r.status}`);

  // A section holding a category and a topic cannot become a category itself.
  await api('node/create', { parentKey: '', kind: 'section', title: 'Depth Target' });
  r = await api('node/move', { key: 'smoke-section', parentKey: 'depth-target' });
  check(
    'over-deep move rejected',
    r.status === 400 && /levels deep/.test(r.json.error ?? ''),
    `status ${r.status} ${r.json.error ?? ''}`,
  );
  await api('node/delete', { key: 'depth-target' });

  // --- import ---
  r = await api('page/import', {
    parentKey: 'smoke-section/cat-two/topic-one',
    name: 'notes.md',
    markdown: '# Imported Title\n\nBody text here.\n',
  });
  check('import markdown', r.json.ok && r.json.key.endsWith('imported-title'), r.json.error);
  const imported = await (await fetchContent(r.json.tree, r.json.key)).text();
  check('import strips h1 into title', imported.includes('title: Imported Title') && !imported.includes('# Imported Title'), imported.slice(0, 120));

  // --- delete ---
  r = await api('node/delete', { key: 'smoke-section' });
  check('delete section', r.json.ok, r.json.error);
  check('tree back to its original size', r.json.tree.length === baseSections, `${r.json.tree.length}`);

  console.log(results.join('\n'));
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(results.join('\n'));
  console.error('\nCRASH', e);
  process.exit(1);
});
