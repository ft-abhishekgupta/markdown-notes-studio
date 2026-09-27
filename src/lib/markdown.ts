/* ============================================================
   Markdown helpers shared by the renderer and the editor
   ============================================================ */

export interface Frontmatter {
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(raw: string): Frontmatter {
  const normalized = (raw ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
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
    data[key] = value.replace(/^["']|["']$/g, '');
  }
  return { data, body };
}

export function headingSlug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[`*_~[\]()]/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'section'
  );
}

function yamlScalar(value: string): string {
  if (value === '') return "''";
  if (/^[\w .,/#&+-]+$/.test(value) && !/^[#>-]/.test(value)) return value;
  return `'${value.replace(/'/g, "''")}'`;
}

/** Mirrors the frontmatter the dev server writes, so the client cache stays accurate. */
export function buildFrontmatter(data: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      lines.push(`${key}: [${value.map((v) => yamlScalar(String(v))).join(', ')}]`);
    } else {
      lines.push(`${key}: ${yamlScalar(String(value))}`);
    }
  }
  return lines.length ? `---\n${lines.join('\n')}\n---\n\n` : '';
}

export interface DocHeading {
  depth: number;
  text: string;
  id: string;
}

export function collectHeadings(body: string): DocHeading[] {
  const out: DocHeading[] = [];
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
    let id = headingSlug(text);
    if (seen.has(id)) {
      const n = (seen.get(id) as number) + 1;
      seen.set(id, n);
      id = `${id}-${n}`;
    } else {
      seen.set(id, 0);
    }
    out.push({ depth: h[1].length, text, id });
  }
  return out;
}

/* ---------------- blocks ---------------- */

export type BlockKind =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'quote'
  | 'code'
  | 'mermaid'
  | 'table'
  | 'divider'
  | 'image'
  | 'html';

const HR = /^\s{0,3}(?:(-)\s*\1\s*\1[\s-]*|(\*)\s*\2\s*\2[\s*]*|(_)\s*\3\s*\3[\s_]*)$/;
const HEADING = /^\s{0,3}(#{1,6})\s+/;
/** Matches a single fence line — always test it against one line, never a whole block. */
const FENCE = /^(\s*)(```+|~~~+)\s*(.*)$/;
/** A line that opens a block-level HTML element, e.g. `<details>`. */
const HTML_OPEN = /^\s{0,3}<([a-zA-Z][\w-]*)(?:\s[^>]*)?>/;
/** Tags that never wrap a block of markdown on their own line. */
const INLINE_TAGS = new Set([
  'a', 'abbr', 'b', 'br', 'code', 'em', 'i', 'img', 'input', 'kbd', 'mark',
  'q', 's', 'small', 'span', 'strong', 'sub', 'sup', 'u', 'wbr', 'hr',
]);

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstLine(text: string): string {
  return (text ?? '').replace(/\r\n/g, '\n').split('\n')[0] ?? '';
}

/**
 * Splits a markdown document into editable blocks. Fenced code, tables and
 * lists stay in one piece; headings and rules always stand alone.
 */
export function splitBlocks(markdown: string): string[] {
  const lines = (markdown ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join('\n').replace(/\s+$/, '');
    buffer = [];
    if (text.trim()) blocks.push(text);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(FENCE);

    if (fence) {
      flush();
      const closer = fence[2][0] === '`' ? /^\s*```+\s*$/ : /^\s*~~~+\s*$/;
      const body = [line];
      i++;
      while (i < lines.length) {
        body.push(lines[i]);
        if (closer.test(lines[i])) break;
        i++;
      }
      blocks.push(body.join('\n'));
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    // `<details>` and friends wrap markdown that contains blank lines. Keeping
    // the whole element in one block is what makes it editable and makes the
    // edit and read views agree.
    const html = line.match(HTML_OPEN);
    if (html && !INLINE_TAGS.has(html[1].toLowerCase()) && !/\/>\s*$/.test(line)) {
      const tag = html[1].toLowerCase();
      const openRe = new RegExp(`<${escapeRe(tag)}(?=[\\s/>])`, 'gi');
      const closeRe = new RegExp(`</${escapeRe(tag)}\\s*>`, 'gi');
      const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;
      let depth = count(line, openRe) - count(line, closeRe);

      if (depth > 0) {
        // Only swallow the following lines when the element really closes below.
        let end = -1;
        let probe = depth;
        for (let j = i + 1; j < lines.length; j++) {
          probe += count(lines[j], openRe) - count(lines[j], closeRe);
          if (probe <= 0) {
            end = j;
            break;
          }
        }
        if (end !== -1) {
          flush();
          blocks.push(lines.slice(i, end + 1).join('\n').replace(/\s+$/, ''));
          i = end;
          continue;
        }
      }
    }

    if (HEADING.test(line) || HR.test(line)) {
      flush();
      blocks.push(line.trimEnd());
      continue;
    }

    buffer.push(line);
  }

  flush();
  return blocks;
}

export function joinBlocks(blocks: string[]): string {
  return blocks
    .map((b) => b.replace(/\s+$/, ''))
    .filter((b) => b.trim() !== '')
    .join('\n\n');
}

export function blockKind(text: string): BlockKind {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return 'paragraph';
  const fence = firstLine(trimmed).match(FENCE);
  if (fence) return /^mermaid\b/i.test(fence[3] ?? '') ? 'mermaid' : 'code';
  if (HEADING.test(trimmed)) return 'heading';
  if (HR.test(trimmed)) return 'divider';
  if (/^\s*\|/.test(trimmed) && /\n\s*\|?[\s:|-]*-[\s:|-]*\|/.test(trimmed)) return 'table';
  if (/^\s*>/.test(trimmed)) return 'quote';
  if (/^\s*(?:[-*+]|\d+[.)])\s/.test(trimmed)) return 'list';
  if (IMAGE_ONLY.test(trimmed)) return 'image';
  if (/^\s*</.test(trimmed)) return 'html';
  return 'paragraph';
}

export function headingLevel(text: string): number {
  const m = (text ?? '').match(HEADING);
  return m ? m[1].length : 0;
}

export function fenceLanguage(text: string): string {
  const m = firstLine((text ?? '').trim()).match(FENCE);
  return (m?.[3] ?? '').trim().split(/\s+/)[0] ?? '';
}

export function fenceBody(text: string): string {
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n');
  if (!FENCE.test(lines[0] ?? '')) return text ?? '';
  const body = lines.slice(1);
  if (body.length && /^\s*(```+|~~~+)\s*$/.test(body[body.length - 1])) body.pop();
  return body.join('\n');
}

export function makeFence(language: string, body: string): string {
  const safe = body.replace(/\r\n/g, '\n');
  // A body that already contains a triple backtick needs a longer fence.
  const longest = Math.max(2, ...[...safe.matchAll(/^\s*(`{3,})/gm)].map((m) => m[1].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${safe}\n${fence}`;
}

/* ---------------- images ---------------- */

const IMAGE_ONLY = /^!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+"([^"]*)")?\s*\)$/;

export interface ImageInfo {
  alt: string;
  src: string;
  title: string;
  width: string;
  height: string;
}

/** Reads a `![alt](src "=600x400")` size hint out of the title slot. */
export function parseSizeTitle(title: string): { width: string; height: string; caption: string } {
  const m = (title ?? '').trim().match(/^=(\d+%?|)x(\d+%?|)$/);
  if (m) return { width: m[1] ?? '', height: m[2] ?? '', caption: '' };
  return { width: '', height: '', caption: title ?? '' };
}

export function parseImage(text: string): ImageInfo | null {
  const m = (text ?? '').trim().match(IMAGE_ONLY);
  if (!m) return null;
  const { width, height, caption } = parseSizeTitle(m[3] ?? '');
  return { alt: m[1] ?? '', src: m[2] ?? '', title: caption, width, height };
}

export function formatImage(info: ImageInfo): string {
  const size = info.width || info.height ? `=${info.width}x${info.height}` : '';
  const title = size || info.title;
  return `![${info.alt}](${info.src}${title ? ` "${title.replace(/"/g, "'")}"` : ''})`;
}

/** Turns `600`, `50%` or `` into a CSS length. */
export function cssLength(value: string): string | undefined {
  if (!value) return undefined;
  return /%$/.test(value) ? value : `${parseInt(value, 10)}px`;
}

/* ---------------- paste heuristics ---------------- */

export const URL_ONLY = /^(https?:\/\/|www\.)[^\s]+$/i;

export function looksLikeMarkdown(text: string): boolean {
  if (!text) return false;
  if (/^\s{0,3}#{1,6}\s/m.test(text)) return true;
  if (/^\s{0,3}(```|~~~)/m.test(text)) return true;
  if (/^\s{0,3}([-*+]|\d+[.)])\s+\S/m.test(text)) return true;
  if (/^\s{0,3}>\s/m.test(text)) return true;
  if (/^\s*\|.*\|\s*$/m.test(text)) return true;
  if (/!\[[^\]]*\]\([^)]*\)/.test(text)) return true;
  if (/\[[^\]]+\]\([^)]+\)/.test(text)) return true;
  if (/\*\*[^*]+\*\*/.test(text)) return true;
  if (/\n\s*\n/.test(text)) return true;
  return false;
}

/* ---------------- inline formatting ---------------- */

export interface Selection {
  value: string;
  start: number;
  end: number;
}

export function wrapSelection(sel: Selection, before: string, after = before, placeholder = ''): Selection {
  const { value, start, end } = sel;
  const selected = value.slice(start, end) || placeholder;
  const already =
    value.slice(Math.max(0, start - before.length), start) === before && value.slice(end, end + after.length) === after;

  if (already) {
    const next = value.slice(0, start - before.length) + selected + value.slice(end + after.length);
    return { value: next, start: start - before.length, end: end - before.length + selected.length };
  }
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  return { value: next, start: start + before.length, end: start + before.length + selected.length };
}

/** Applies a line prefix (`## `, `- `, `> `) to every selected line, toggling it off when present. */
export function togglePrefix(sel: Selection, prefix: string, strip: RegExp): Selection {
  const { value, start, end } = sel;
  const from = value.lastIndexOf('\n', start - 1) + 1;
  const toIdx = value.indexOf('\n', end);
  const to = toIdx === -1 ? value.length : toIdx;
  const slice = value.slice(from, to);
  const lines = slice.split('\n');
  const allHave = lines.every((l) => !l.trim() || l.startsWith(prefix));
  const next = lines
    .map((l) => (allHave ? l.replace(strip, '') : l.replace(strip, '').replace(/^/, prefix)))
    .join('\n');
  const delta = next.length - slice.length;
  return { value: value.slice(0, from) + next + value.slice(to), start: from, end: end + delta };
}

export const TABLE_TEMPLATE = ['| Column A | Column B |', '| --- | --- |', '| Value | Value |'].join('\n');

export function normaliseTable(text: string): string {
  const rows = text
    .trim()
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim()),
    );
  if (rows.length < 2) return text;
  const columns = Math.max(...rows.map((r) => r.length));
  const isDivider = (cells: string[]) => cells.every((c) => /^:?-{1,}:?$/.test(c.trim()));
  const widths = Array.from({ length: columns }, (_, i) =>
    Math.max(3, ...rows.filter((r) => !isDivider(r)).map((r) => (r[i] ?? '').length)),
  );
  return rows
    .map((cells) => {
      const padded = Array.from({ length: columns }, (_, i) => cells[i] ?? '');
      if (isDivider(padded)) return `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`;
      return `| ${padded.map((c, i) => c.padEnd(widths[i])).join(' | ')} |`;
    })
    .join('\n');
}

export function tableSize(text: string): { rows: number; columns: number } {
  const lines = text.trim().split('\n');
  const columns = Math.max(1, (lines[0]?.split('|').length ?? 3) - 2);
  return { rows: Math.max(0, lines.length - 2), columns };
}
