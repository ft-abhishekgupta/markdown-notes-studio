import fs from 'node:fs';
import path from 'node:path';

/* ============================================================
   Content tree model

   The folder layout on disk is exactly what you see in the nav:
   sections are folders, pages are markdown files, and a page can sit
   at any level.

     content/<section>/<section>/<section>/<page>.md

   Every folder and page file is prefixed with a two digit order
   (`01-`, `02-`, …) so the order is visible, diffable and stable.
   Display titles live in `_meta.json` (sections) or the markdown
   frontmatter (pages) so they can contain any characters.
   ============================================================ */

export type NodeKind = 'section' | 'page';

/** Levels the tree may occupy, counting both sections and pages. */
export const MAX_DEPTH = 4;

/** Deepest index a section may sit at — it still needs room for a child. */
export const MAX_SECTION_DEPTH = MAX_DEPTH - 2;

/** Folder name used for images pasted into a page. */
export const ASSET_DIR = 'assets';

export interface Heading {
  depth: number;
  text: string;
  id: string;
}

export interface TreeNode {
  kind: NodeKind;
  /** Stable route key — slug path with the numeric order prefixes removed. */
  key: string;
  /** Real path relative to the content root (pages include the `.md`). */
  path: string;
  /** Directory the node lives in, relative to the content root. */
  dir: string;
  slug: string;
  order: number;
  title: string;
  description: string;
  icon: string;
  hue: number;
  tags: string[];
  updated: string;
  words: number;
  minutes: number;
  headings: Heading[];
  children: TreeNode[];
}

const ACRONYMS: Record<string, string> = {
  api: 'API', apis: 'APIs', sql: 'SQL', html: 'HTML', css: 'CSS', js: 'JavaScript',
  ts: 'TypeScript', ui: 'UI', ux: 'UX', ai: 'AI', ml: 'ML', db: 'DB', os: 'OS',
  cs: 'CS', io: 'IO', http: 'HTTP', json: 'JSON', yaml: 'YAML', md: 'MD',
  faq: 'FAQ', todo: 'TODO', pdf: 'PDF', url: 'URL',
};

const MINOR = new Set(['and', 'or', 'the', 'of', 'for', 'in', 'to', 'a', 'an', 'on', 'with', 'vs']);

export function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (ACRONYMS[lower]) return ACRONYMS[lower];
      if (i > 0 && MINOR.has(lower)) return lower;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ') || slug;
}

export function slugify(text: string): string {
  const out = String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[`*_~[\]()'"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return out || 'untitled';
}

export function headingId(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[`*_~[\]()]/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'section'
  );
}

export function splitOrder(name: string): { order: number; slug: string } {
  const m = name.match(/^(\d+)[-_](.*)$/);
  return m ? { order: parseInt(m[1], 10), slug: m[2] } : { order: 999, slug: name };
}

export function withOrder(order: number, slug: string): string {
  return `${String(order).padStart(2, '0')}-${slug}`;
}

/* ---------------- frontmatter ---------------- */

export interface Frontmatter {
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(raw: string): Frontmatter {
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---')) return { data: {}, body: normalized };
  const end = normalized.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: normalized };
  const block = normalized.slice(4, end);
  const body = normalized.slice(end + 4).replace(/^\n/, '');
  const data: Record<string, unknown> = {};
  for (const line of block.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      continue;
    }
    value = value.replace(/^["']|["']$/g, '');
    data[key] = value;
  }
  return { data, body };
}

function yamlScalar(value: string): string {
  if (value === '') return "''";
  if (/^[\w .,/#&+-]+$/.test(value) && !/^[#>-]/.test(value)) return value;
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildFrontmatter(data: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}: [${value.map((v) => yamlScalar(String(v))).join(', ')}]`);
    } else {
      lines.push(`${key}: ${yamlScalar(String(value))}`);
    }
  }
  return lines.length ? `---\n${lines.join('\n')}\n---\n\n` : '';
}

/** Rewrites (or adds) the frontmatter block of a markdown document. */
export function applyFrontmatter(raw: string, data: Record<string, unknown>): string {
  const { body } = parseFrontmatter(raw);
  return buildFrontmatter(data) + body.replace(/^\n+/, '');
}

/* ---------------- analysis ---------------- */

export function toSearchText(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_|~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractHeadings(body: string): Heading[] {
  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  let inFence = false;
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (!h) continue;
    const text = h[2].replace(/\s*#+\s*$/, '').trim();
    if (!text) continue;
    let id = headingId(text);
    if (seen.has(id)) {
      const n = (seen.get(id) as number) + 1;
      seen.set(id, n);
      id = `${id}-${n}`;
    } else {
      seen.set(id, 0);
    }
    headings.push({ depth: h[1].length, text, id });
  }
  return headings;
}

/* ---------------- folder meta ---------------- */

export interface FolderMeta {
  title?: string;
  description?: string;
  icon?: string;
  hue?: number;
}

export function readFolderMeta(dir: string): FolderMeta {
  const file = path.join(dir, '_meta.json');
  try {
    if (!fs.existsSync(file)) return {};
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof parsed === 'object' && parsed ? (parsed as FolderMeta) : {};
  } catch {
    return {};
  }
}

export function writeFolderMeta(dir: string, meta: FolderMeta) {
  const file = path.join(dir, '_meta.json');
  const clean: FolderMeta = {};
  if (meta.title) clean.title = meta.title;
  if (meta.description) clean.description = meta.description;
  if (meta.icon) clean.icon = meta.icon;
  if (typeof meta.hue === 'number') clean.hue = meta.hue;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(clean, null, 2) + '\n', 'utf8');
}

/** Deterministic hue so every section gets a distinct but stable colour. */
export function hueFromKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % 360;
}

const DEFAULT_ICONS = ['book', 'sparkles', 'cube', 'network', 'database', 'server', 'shield', 'pulse', 'browser', 'puzzle'];

export function iconFromKey(key: string): string {
  return DEFAULT_ICONS[hueFromKey(key) % DEFAULT_ICONS.length];
}

/* ---------------- scanning ---------------- */

function readDirSorted(dir: string) {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => !e.name.startsWith('.') && e.name !== ASSET_DIR && e.name !== '_meta.json')
    .map((e) => ({ entry: e, ...splitOrder(e.isDirectory() ? e.name : e.name.replace(/\.md$/i, '')) }))
    .filter((e) => e.entry.isDirectory() || /\.md$/i.test(e.entry.name))
    .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.slug.localeCompare(b.slug)));
}

function buildPage(contentRoot: string, relFile: string, parentKey: string, order: number, slug: string): TreeNode {
  const abs = path.join(contentRoot, relFile);
  let raw = '';
  try {
    raw = fs.readFileSync(abs, 'utf8');
  } catch {
    raw = '';
  }
  const { data, body } = parseFrontmatter(raw);
  const searchText = toSearchText(body);
  const words = searchText ? searchText.split(' ').filter(Boolean).length : 0;
  const key = parentKey ? `${parentKey}/${slug}` : slug;
  return {
    kind: 'page',
    key,
    path: relFile.replace(/\\/g, '/'),
    dir: path.dirname(relFile).replace(/\\/g, '/'),
    slug,
    order,
    title: String(data.title ?? titleFromSlug(slug)),
    description: String(data.description ?? ''),
    icon: String(data.icon ?? 'file'),
    hue: hueFromKey(key),
    tags: Array.isArray(data.tags) ? (data.tags as string[]).map(String) : [],
    updated: String(data.updated ?? ''),
    words,
    minutes: Math.max(1, Math.round(words / 220)),
    headings: extractHeadings(body),
    children: [],
  };
}

function scanDir(contentRoot: string, relDir: string, parentKey: string, depth: number): TreeNode[] {
  if (depth >= MAX_DEPTH) return [];
  const abs = relDir ? path.join(contentRoot, relDir) : contentRoot;
  const out: TreeNode[] = [];
  for (const { entry, order, slug } of readDirSorted(abs)) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    const key = parentKey ? `${parentKey}/${slug}` : slug;
    if (entry.isDirectory()) {
      // A section at the deepest level would have nowhere to put its children.
      if (depth > MAX_SECTION_DEPTH) continue;
      const meta = readFolderMeta(path.join(abs, entry.name));
      const children = scanDir(contentRoot, rel, key, depth + 1);
      out.push({
        kind: 'section',
        key,
        path: rel,
        dir: rel,
        slug,
        order,
        title: meta.title || titleFromSlug(slug),
        description: meta.description || '',
        icon: meta.icon || iconFromKey(key),
        hue: typeof meta.hue === 'number' ? meta.hue : hueFromKey(key),
        tags: [],
        updated: '',
        words: 0,
        minutes: 0,
        headings: [],
        children,
      });
    } else {
      // Pages are allowed at any level.
      out.push(buildPage(contentRoot, rel, parentKey, order, slug));
    }
  }
  return out;
}

export function scanTree(contentRoot: string): TreeNode[] {
  if (!fs.existsSync(contentRoot)) return [];
  return scanDir(contentRoot, '', '', 0);
}

export function flattenPages(nodes: TreeNode[], acc: TreeNode[] = []): TreeNode[] {
  for (const n of nodes) {
    if (n.kind === 'page') acc.push(n);
    else flattenPages(n.children, acc);
  }
  return acc;
}

export function walk(nodes: TreeNode[], visit: (n: TreeNode, parents: TreeNode[]) => void, parents: TreeNode[] = []) {
  for (const n of nodes) {
    visit(n, parents);
    if (n.children.length) walk(n.children, visit, [...parents, n]);
  }
}

export function findByKey(nodes: TreeNode[], key: string): { node: TreeNode; parents: TreeNode[] } | null {
  let found: { node: TreeNode; parents: TreeNode[] } | null = null;
  walk(nodes, (n, parents) => {
    if (!found && n.key === key) found = { node: n, parents };
  });
  return found;
}

/** Full-text blob per page, used by the command palette. */
export function buildSearchIndex(contentRoot: string): Record<string, string> {
  const index: Record<string, string> = {};
  for (const page of flattenPages(scanTree(contentRoot))) {
    try {
      const raw = fs.readFileSync(path.join(contentRoot, page.path), 'utf8');
      index[page.key] = toSearchText(parseFrontmatter(raw).body).slice(0, 4000).toLowerCase();
    } catch {
      index[page.key] = '';
    }
  }
  return index;
}
