import fs from 'node:fs';
import path from 'node:path';
import {
  ASSET_DIR,
  MAX_DEPTH,
  MAX_SECTION_DEPTH,
  applyFrontmatter,
  buildFrontmatter,
  findByKey,
  parseFrontmatter,
  readFolderMeta,
  scanTree,
  slugify,
  splitOrder,
  titleFromSlug,
  withOrder,
  writeFolderMeta,
  type NodeKind,
  type TreeNode,
} from './content-tree';

export class ApiError extends Error {}

/** Blocking sleep — the file operations below are synchronous by design. */
function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY']);

/**
 * Windows briefly locks directories that an editor, indexer or watcher has
 * open, which surfaces as EPERM/EBUSY. Retrying a few times clears it.
 */
function retry<T>(operation: () => T): T {
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return operation();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (!TRANSIENT.has(code)) throw error;
      lastError = error;
      sleep(40 + attempt * 40);
    }
  }
  throw lastError;
}

function renameSync(from: string, to: string) {
  retry(() => fs.renameSync(from, to));
}

function rmSync(target: string, options?: fs.RmOptions) {
  retry(() => fs.rmSync(target, options));
}

function abs(contentRoot: string, rel: string): string {
  const p = path.resolve(contentRoot, rel || '.');
  if (p !== contentRoot && !p.startsWith(contentRoot + path.sep)) {
    throw new ApiError('Path escapes the content root');
  }
  return p;
}

interface Located {
  node: TreeNode;
  parents: TreeNode[];
  depth: number;
}

function locate(contentRoot: string, key: string): Located {
  const tree = scanTree(contentRoot);
  const hit = findByKey(tree, key);
  if (!hit) throw new ApiError(`No node found for "${key}"`);
  return { node: hit.node, parents: hit.parents, depth: hit.parents.length };
}

/** Resolves a parent key to a directory; the empty key is the content root. */
function locateParentDir(contentRoot: string, parentKey: string): { dir: string; relDir: string; depth: number } {
  if (!parentKey) return { dir: contentRoot, relDir: '', depth: -1 };
  const { node, depth } = locate(contentRoot, parentKey);
  if (node.kind === 'page') throw new ApiError('A page cannot contain other nodes');
  return { dir: abs(contentRoot, node.dir), relDir: node.dir, depth };
}

function listEntries(dir: string): { name: string; slug: string; order: number; isDir: boolean }[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.') && e.name !== ASSET_DIR && e.name !== '_meta.json')
    .filter((e) => e.isDirectory() || /\.md$/i.test(e.name))
    .map((e) => {
      const base = e.isDirectory() ? e.name : e.name.replace(/\.md$/i, '');
      const { order, slug } = splitOrder(base);
      return { name: e.name, slug, order, isDir: e.isDirectory() };
    })
    .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.slug.localeCompare(b.slug)));
}

function uniqueSlug(dir: string, wanted: string, ignoreName?: string): string {
  const taken = new Set(listEntries(dir).filter((e) => e.name !== ignoreName).map((e) => e.slug));
  if (!taken.has(wanted)) return wanted;
  let i = 2;
  while (taken.has(`${wanted}-${i}`)) i++;
  return `${wanted}-${i}`;
}

/**
 * Rewrites every sibling so the on-disk prefixes read 01, 02, 03 … in the
 * given order. Renames go through temporary names to dodge collisions.
 */
function renumber(dir: string, order?: string[]) {
  if (!fs.existsSync(dir)) return;
  let entries = listEntries(dir);
  if (order && order.length) {
    const byName = new Map(entries.map((e) => [e.name, e]));
    const sorted: typeof entries = [];
    for (const name of order) {
      const e = byName.get(name);
      if (e) {
        sorted.push(e);
        byName.delete(name);
      }
    }
    for (const e of byName.values()) sorted.push(e);
    entries = sorted;
  }
  const stamp = `__tmp${Date.now()}__`;
  const staged: { tmp: string; final: string }[] = [];
  entries.forEach((e, i) => {
    const ext = e.isDir ? '' : '.md';
    const final = withOrder(i + 1, e.slug) + ext;
    if (final === e.name) return;
    const tmp = stamp + i + ext;
    renameSync(path.join(dir, e.name), path.join(dir, tmp));
    staged.push({ tmp, final });
  });
  for (const { tmp, final } of staged) {
    renameSync(path.join(dir, tmp), path.join(dir, final));
  }
}

function kindForDepth(depth: number): NodeKind {
  return depth >= MAX_DEPTH - 1 ? 'page' : 'section';
}

/** How many section levels sit under a node (0 for a section with no sub-sections). */
function folderDepthOf(node: TreeNode): number {
  let deepest = 0;
  for (const child of node.children) {
    if (child.kind === 'page') continue;
    deepest = Math.max(deepest, 1 + folderDepthOf(child));
  }
  return deepest;
}

const STARTER_BODY = `Start writing here. Type **Markdown** and it renders as you go —
\`##\` for a heading, \`-\` for a list, \`\`\`\` \`\`\` \`\`\`\` for code, or use the toolbar.
`;

/* ============================================================
   Operations
   ============================================================ */

export function opCreateNode(
  contentRoot: string,
  input: { parentKey?: string; kind?: NodeKind; title?: string; markdown?: string },
): { key: string } {
  const { dir, relDir, depth } = locateParentDir(contentRoot, input.parentKey ?? '');
  const childDepth = depth + 1;
  const kind = input.kind ?? kindForDepth(childDepth);
  if (childDepth >= MAX_DEPTH) {
    throw new ApiError(`Nothing can be nested more than ${MAX_DEPTH} levels deep`);
  }
  if (kind === 'section' && childDepth > MAX_SECTION_DEPTH) {
    throw new ApiError(`A section here would leave no room for its contents — add a page instead`);
  }
  const title = (input.title || '').trim() || (kind === 'page' ? 'Untitled page' : 'New section');
  const slug = uniqueSlug(dir, slugify(title));
  const order = listEntries(dir).length + 1;

  fs.mkdirSync(dir, { recursive: true });

  if (kind === 'page') {
    const file = path.join(dir, withOrder(order, slug) + '.md');
    const body = input.markdown ?? STARTER_BODY;
    fs.writeFileSync(
      file,
      buildFrontmatter({ title, description: '', tags: [], updated: today() }) + body.replace(/^\n+/, ''),
      'utf8',
    );
  } else {
    const folder = path.join(dir, withOrder(order, slug));
    fs.mkdirSync(folder, { recursive: true });
    writeFolderMeta(folder, { title });
  }

  renumber(dir);
  const parentKey = input.parentKey ?? '';
  return { key: parentKey ? `${parentKey}/${slug}` : slug };
}

export function opRenameNode(contentRoot: string, input: { key: string; title: string }): { key: string } {
  const { node, parents } = locate(contentRoot, input.key);
  const title = (input.title || '').trim();
  if (!title) throw new ApiError('A title is required');

  const parentDir = abs(contentRoot, path.dirname(node.path));
  const currentName = path.basename(node.path);
  const newSlug = uniqueSlug(parentDir, slugify(title), currentName);
  const ext = node.kind === 'page' ? '.md' : '';
  const newName = withOrder(node.order, newSlug) + ext;
  const from = abs(contentRoot, node.path);
  const to = path.join(parentDir, newName);

  if (from !== to) renameSync(from, to);

  if (node.kind === 'page') {
    const raw = fs.readFileSync(to, 'utf8');
    const { data } = parseFrontmatter(raw);
    fs.writeFileSync(to, applyFrontmatter(raw, { ...data, title, updated: today() }), 'utf8');
  } else {
    writeFolderMeta(to, { ...readFolderMeta(to), title });
  }

  renumber(parentDir);
  const parentKey = parents.map((p) => p.slug).join('/');
  return { key: parentKey ? `${parentKey}/${newSlug}` : newSlug };
}

export function opUpdateMeta(
  contentRoot: string,
  input: { key: string; description?: string; icon?: string; hue?: number },
): { key: string } {
  const { node } = locate(contentRoot, input.key);
  const target = abs(contentRoot, node.path);
  if (node.kind === 'page') {
    const raw = fs.readFileSync(target, 'utf8');
    const { data } = parseFrontmatter(raw);
    if (input.description !== undefined) data.description = input.description;
    fs.writeFileSync(target, applyFrontmatter(raw, { ...data, updated: today() }), 'utf8');
  } else {
    const meta = readFolderMeta(target);
    if (input.description !== undefined) meta.description = input.description;
    if (input.icon !== undefined) meta.icon = input.icon;
    if (input.hue !== undefined) meta.hue = input.hue;
    writeFolderMeta(target, meta);
  }
  return { key: node.key };
}

export function opDeleteNode(contentRoot: string, input: { key: string }): { key: string } {
  const { node } = locate(contentRoot, input.key);
  const target = abs(contentRoot, node.path);
  const parentDir = path.dirname(target);

  if (node.kind === 'page') {
    // Remove the images that were pasted into this page and nobody else uses.
    const assetDir = path.join(parentDir, ASSET_DIR);
    if (fs.existsSync(assetDir)) {
      const others = listEntries(parentDir).filter((e) => !e.isDir && e.name !== path.basename(target));
      const stillUsed = new Set<string>();
      for (const other of others) {
        const raw = fs.readFileSync(path.join(parentDir, other.name), 'utf8');
        for (const m of raw.matchAll(/assets\/([^)\s"'\]]+)/g)) stillUsed.add(m[1]);
      }
      const prefix = `${node.slug}-`;
      for (const file of fs.readdirSync(assetDir)) {
        if (file.startsWith(prefix) && !stillUsed.has(file)) {
          rmSync(path.join(assetDir, file), { force: true });
        }
      }
      if (fs.readdirSync(assetDir).length === 0) rmSync(assetDir, { recursive: true, force: true });
    }
    rmSync(target, { force: true });
  } else {
    rmSync(target, { recursive: true, force: true });
  }

  renumber(parentDir);
  return { key: input.key };
}

export function opDuplicateNode(contentRoot: string, input: { key: string }): { key: string } {
  const { node, parents } = locate(contentRoot, input.key);
  if (node.kind !== 'page') throw new ApiError('Only pages can be duplicated');
  const target = abs(contentRoot, node.path);
  const parentDir = path.dirname(target);
  const slug = uniqueSlug(parentDir, `${node.slug}-copy`);
  const order = listEntries(parentDir).length + 1;
  const raw = fs.readFileSync(target, 'utf8');
  const { data } = parseFrontmatter(raw);
  const dest = path.join(parentDir, withOrder(order, slug) + '.md');
  fs.writeFileSync(dest, applyFrontmatter(raw, { ...data, title: `${node.title} (copy)`, updated: today() }), 'utf8');
  renumber(parentDir);
  const parentKey = parents.map((p) => p.slug).join('/');
  return { key: parentKey ? `${parentKey}/${slug}` : slug };
}

/** Collects the `assets/<file>` references inside a markdown document. */
function assetRefs(markdown: string): Set<string> {
  const names = new Set<string>();
  for (const m of markdown.matchAll(/(?:\.\/)?assets\/([^)\s"'\]]+)/g)) {
    try {
      names.add(decodeURIComponent(m[1]));
    } catch {
      names.add(m[1]);
    }
  }
  return names;
}

/**
 * Moves the images a page owns into its new folder so relative `./assets/…`
 * links keep working. Images still referenced by a page left behind are copied
 * rather than moved.
 */
function relocateAssets(pageFile: string, sourceDir: string, destDir: string) {
  const sourceAssets = path.join(sourceDir, ASSET_DIR);
  if (!fs.existsSync(sourceAssets)) return;
  let markdown = fs.readFileSync(pageFile, 'utf8');
  const names = assetRefs(markdown);
  if (!names.size) return;

  const leftBehind = listEntries(sourceDir)
    .filter((e) => !e.isDir)
    .map((e) => {
      try {
        return fs.readFileSync(path.join(sourceDir, e.name), 'utf8');
      } catch {
        return '';
      }
    })
    .join('\n');
  const stillUsed = assetRefs(leftBehind);
  const destAssets = path.join(destDir, ASSET_DIR);

  for (const name of names) {
    const from = path.join(sourceAssets, name);
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(destAssets, { recursive: true });
    const ext = path.extname(name);
    const stem = path.basename(name, ext);
    let target = name;
    let i = 2;
    while (fs.existsSync(path.join(destAssets, target))) target = `${stem}-${i++}${ext}`;

    if (stillUsed.has(name)) fs.copyFileSync(from, path.join(destAssets, target));
    else renameSync(from, path.join(destAssets, target));

    if (target !== name) markdown = markdown.split(`assets/${name}`).join(`assets/${target}`);
  }

  fs.writeFileSync(pageFile, markdown, 'utf8');
  if (fs.existsSync(sourceAssets) && fs.readdirSync(sourceAssets).length === 0) {
    rmSync(sourceAssets, { recursive: true, force: true });
  }
}

export function opMoveNode(
  contentRoot: string,
  input: { key: string; parentKey?: string; index?: number },
): { key: string } {
  const { node, parents } = locate(contentRoot, input.key);
  const newParentKey = input.parentKey ?? '';

  if (newParentKey === node.key || newParentKey.startsWith(node.key + '/')) {
    throw new ApiError('A node cannot be moved inside itself');
  }

  const { dir: destDir, depth: parentDepth } = locateParentDir(contentRoot, newParentKey);
  const destDepth = parentDepth + 1;

  if (destDepth >= MAX_DEPTH) {
    throw new ApiError(`Nothing can be nested more than ${MAX_DEPTH} levels deep`);
  }
  if (node.kind === 'section' && destDepth + folderDepthOf(node) > MAX_SECTION_DEPTH) {
    throw new ApiError(`That would nest sections more than ${MAX_DEPTH} levels deep`);
  }

  const from = abs(contentRoot, node.path);
  const sourceDir = path.dirname(from);
  const ext = node.kind === 'page' ? '.md' : '';
  const sameParent = path.resolve(sourceDir) === path.resolve(destDir);
  const slug = sameParent ? node.slug : uniqueSlug(destDir, node.slug);

  // Park it at the end of the destination, then renumber with the requested slot.
  const tempOrder = listEntries(destDir).length + 90;
  const destName = withOrder(tempOrder, slug) + ext;
  fs.mkdirSync(destDir, { recursive: true });
  if (from !== path.join(destDir, destName)) renameSync(from, path.join(destDir, destName));

  if (node.kind === 'page' && !sameParent) {
    relocateAssets(path.join(destDir, destName), sourceDir, destDir);
  }

  const siblings = listEntries(destDir).map((e) => e.name).filter((n) => n !== destName);
  const at = Math.max(0, Math.min(input.index ?? siblings.length, siblings.length));
  siblings.splice(at, 0, destName);
  renumber(destDir, siblings);
  if (!sameParent) renumber(sourceDir);

  const parentPath = newParentKey ? `${newParentKey}/` : '';
  void parents;
  return { key: `${parentPath}${slug}` };
}

export function opSavePage(
  contentRoot: string,
  input: { key: string; markdown: string; title?: string; description?: string; tags?: string[] },
): { key: string; bytes: number } {
  const { node } = locate(contentRoot, input.key);
  if (node.kind !== 'page') throw new ApiError('Only pages hold markdown');
  const target = abs(contentRoot, node.path);
  const previous = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  const { data } = parseFrontmatter(previous);
  const next = {
    ...data,
    title: input.title ?? data.title ?? node.title,
    description: input.description ?? data.description ?? '',
    tags: input.tags ?? data.tags ?? [],
    updated: today(),
  };
  const out = buildFrontmatter(next) + (input.markdown ?? '').replace(/^\n+/, '').replace(/\s+$/, '') + '\n';
  fs.writeFileSync(target, out, 'utf8');
  return { key: node.key, bytes: Buffer.byteLength(out) };
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
};

export function opUploadAsset(
  contentRoot: string,
  input: { key: string; data: string; mime?: string; name?: string },
): { url: string; file: string } {
  const { node } = locate(contentRoot, input.key);
  if (node.kind !== 'page') throw new ApiError('Images attach to pages');
  const pageDir = path.dirname(abs(contentRoot, node.path));
  const assetDir = path.join(pageDir, ASSET_DIR);
  fs.mkdirSync(assetDir, { recursive: true });

  const fromName = input.name ? path.extname(input.name).replace('.', '').toLowerCase() : '';
  const ext = MIME_EXT[input.mime ?? ''] || (fromName && /^[a-z0-9]{2,5}$/.test(fromName) ? fromName : 'png');
  const base = input.name ? slugify(path.basename(input.name, path.extname(input.name))) : 'image';

  let file = `${node.slug}-${base}.${ext}`;
  let i = 2;
  while (fs.existsSync(path.join(assetDir, file))) file = `${node.slug}-${base}-${i++}.${ext}`;

  const payload = String(input.data || '').replace(/^data:[^;]+;base64,/, '');
  fs.writeFileSync(path.join(assetDir, file), Buffer.from(payload, 'base64'));
  return { url: `./${ASSET_DIR}/${file}`, file };
}

export function opImportPage(
  contentRoot: string,
  input: { parentKey?: string; name?: string; markdown: string },
): { key: string } {
  const raw = String(input.markdown ?? '').replace(/\r\n/g, '\n');
  const { data, body } = parseFrontmatter(raw);
  let title = String(data.title ?? '').trim();
  let content = body;
  if (!title) {
    const h1 = content.match(/^\s*#\s+(.+)$/m);
    if (h1) {
      title = h1[1].trim();
      content = content.replace(h1[0], '').replace(/^\n+/, '');
    }
  }
  if (!title && input.name) title = titleFromSlug(slugify(path.basename(input.name, path.extname(input.name))));
  return opCreateNode(contentRoot, {
    parentKey: input.parentKey ?? '',
    kind: 'page',
    title: title || 'Imported page',
    markdown: content,
  });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
