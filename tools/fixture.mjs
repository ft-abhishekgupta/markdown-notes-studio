/**
 * Shared throwaway content for the browser suites.
 *
 * The tests used to edit the bundled sample pages, which broke as soon as
 * somebody renamed or moved them in their own session. Every suite now builds
 * its own section and deletes it again, so a run never touches real notes.
 */

export const FIXTURE_TITLE = 'Smoke Fixture';
export const FIXTURE_KEY = 'smoke-fixture';

export async function api(base, action, body = {}) {
  const res = await fetch(`${base}/__notes/api/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error || `${action} failed with ${res.status}`);
  return json;
}

export function findKey(tree, key) {
  for (const node of tree ?? []) {
    if (node.key === key) return node;
    const hit = findKey(node.children ?? [], key);
    if (hit) return hit;
  }
  return null;
}

/** Real on-disk path of a node, so tests never hard-code numeric prefixes. */
export function pathOf(tree, key) {
  return findKey(tree, key)?.path ?? '';
}

export async function destroyFixture(base) {
  try {
    await api(base, 'node/delete', { key: FIXTURE_KEY });
  } catch {
    /* nothing to clean up */
  }
}

export const FIXTURE_PAGE_MD = [
  'Intro paragraph with an EDIT-TARGET marker.',
  '',
  '## Reading vs editing',
  '',
  'A second paragraph that explains the toggle.',
  '',
  '> [!TIP]',
  '> Press Ctrl K anywhere to search every page.',
  '',
  '| Block | Shortcut |',
  '| --- | --- |',
  '| Heading | `##` |',
  '| List | `-` |',
  '',
  '## Writing',
  '',
  '- first bullet',
  '- second bullet',
  '',
  '## Where things are saved',
  '',
  'Closing paragraph.',
].join('\n');

/**
 * Builds `Smoke Fixture › Fixture Category › Fixture Topic › Fixture Page`
 * plus a sibling page and a second section for move tests.
 *
 * "Fixture Category" and "Fixture Topic" are just nested sections — the tree
 * only has sections and pages — but the names are kept so the suites read
 * clearly about which level they are exercising.
 */
export async function createFixture(base) {
  await destroyFixture(base);

  const section = await api(base, 'node/create', { parentKey: '', kind: 'section', title: FIXTURE_TITLE });
  const category = await api(base, 'node/create', {
    parentKey: section.key,
    kind: 'section',
    title: 'Fixture Category',
  });
  const topic = await api(base, 'node/create', { parentKey: category.key, kind: 'section', title: 'Fixture Topic' });
  const other = await api(base, 'node/create', { parentKey: category.key, kind: 'section', title: 'Second Topic' });
  const page = await api(base, 'node/create', { parentKey: topic.key, kind: 'page', title: 'Fixture Page' });
  const sibling = await api(base, 'node/create', { parentKey: topic.key, kind: 'page', title: 'Sibling Page' });

  const saved = await api(base, 'page/save', {
    key: page.key,
    markdown: FIXTURE_PAGE_MD,
    title: 'Fixture Page',
    description: 'Throwaway page used by the smoke suites.',
    tags: ['smoke'],
  });

  return {
    sectionKey: section.key,
    categoryKey: category.key,
    topicKey: topic.key,
    otherTopicKey: other.key,
    pageKey: page.key,
    siblingKey: sibling.key,
    tree: saved.tree,
    /** Latest on-disk path of the main fixture page. */
    async filePath() {
      const { tree } = await api(base, 'tree');
      return pathOf(tree, page.key);
    },
  };
}

export async function savePage(base, key, markdown, meta = {}) {
  return api(base, 'page/save', { key, markdown, title: meta.title ?? 'Fixture Page', ...meta });
}
