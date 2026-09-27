import { joinBlocks, splitBlocks } from '../../lib/markdown';

export interface BlockItem {
  id: string;
  text: string;
}

let seq = 0;

export function newBlockId(): string {
  seq += 1;
  return `b${Date.now().toString(36)}${seq.toString(36)}`;
}

export function toBlocks(markdown: string): BlockItem[] {
  const parts = splitBlocks(markdown ?? '');
  const list = parts.length ? parts : [''];
  return list.map((text) => ({ id: newBlockId(), text }));
}

export function fromBlocks(blocks: BlockItem[]): string {
  return joinBlocks(blocks.map((b) => b.text));
}

export function makeBlocks(texts: string[]): BlockItem[] {
  return texts.map((text) => ({ id: newBlockId(), text }));
}

/* ---------------- markdown tables ---------------- */

export type Align = '' | 'left' | 'center' | 'right';

export interface TableModel {
  header: string[];
  align: Align[];
  rows: string[][];
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|\s*$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return '';
}

export function parseTable(markdown: string): TableModel {
  const lines = (markdown ?? '').trim().split('\n').filter((l) => l.trim());
  if (lines.length < 2) return { header: ['Column A', 'Column B'], align: ['', ''], rows: [['', '']] };
  const header = splitRow(lines[0]);
  const align = splitRow(lines[1]).map(alignOf);
  const rows = lines.slice(2).map(splitRow);
  const columns = Math.max(header.length, align.length, ...rows.map((r) => r.length), 1);
  const pad = (cells: string[]) => Array.from({ length: columns }, (_, i) => cells[i] ?? '');
  return { header: pad(header), align: pad(align) as Align[], rows: rows.map(pad) };
}

export function serializeTable(model: TableModel): string {
  const columns = model.header.length;
  const escape = (cell: string) => cell.replace(/\n+/g, ' ').replace(/(?<!\\)\|/g, '\\|').trim();
  const widths = Array.from({ length: columns }, (_, i) =>
    Math.max(3, escape(model.header[i] ?? '').length, ...model.rows.map((r) => escape(r[i] ?? '').length)),
  );
  const divider = model.align
    .slice(0, columns)
    .map((a, i) => {
      const w = widths[i];
      if (a === 'center') return `:${'-'.repeat(Math.max(1, w - 2))}:`;
      if (a === 'right') return `${'-'.repeat(Math.max(1, w - 1))}:`;
      if (a === 'left') return `:${'-'.repeat(Math.max(1, w - 1))}`;
      return '-'.repeat(w);
    })
    .map((c, i) => c.padEnd(widths[i]));
  const line = (cells: string[]) =>
    `| ${Array.from({ length: columns }, (_, i) => escape(cells[i] ?? '').padEnd(widths[i])).join(' | ')} |`;
  return [line(model.header), `| ${divider.join(' | ')} |`, ...model.rows.map(line)].join('\n');
}

export function emptyTable(columns = 3, rows = 2): TableModel {
  return {
    header: Array.from({ length: columns }, (_, i) => `Column ${String.fromCharCode(65 + i)}`),
    align: Array.from({ length: columns }, () => '' as Align),
    rows: Array.from({ length: rows }, () => Array.from({ length: columns }, () => '')),
  };
}
