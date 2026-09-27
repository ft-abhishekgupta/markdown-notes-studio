import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { putMarkdown, useWorkspace } from '../../lib/workspace';
import {
  TABLE_TEMPLATE,
  URL_ONLY,
  blockKind,
  buildFrontmatter,
  fenceBody,
  looksLikeMarkdown,
  makeFence,
  parseFrontmatter,
  splitBlocks,
  togglePrefix,
  wrapSelection,
} from '../../lib/markdown';
import { htmlToMarkdown } from '../../lib/htmlToMarkdown';
import { Markdown } from '../Markdown';
import { AnchoredMenu } from '../AnchoredMenu';
import { useToast } from '../Toast';
import { BlockRow, type BlockHandlers, type CaretPos } from './BlockRow';
import { InsertMenu, type InsertOption } from './SlashMenu';
import { fromBlocks, newBlockId, toBlocks, type BlockItem } from './blockTypes';
import type { TreeNode } from '../../lib/types';
import {
  IconBold,
  IconCheck,
  IconCode,
  IconDiagram,
  IconEye,
  IconHeading,
  IconImage,
  IconItalic,
  IconLink,
  IconList,
  IconListOrdered,
  IconMarkdown,
  IconMinus,
  IconPlus,
  IconQuote,
  IconSave,
  IconStrike,
  IconTable,
  IconTrash,
  IconArrowUp,
  IconArrowDown,
  IconCopy,
} from '../Icons';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface ActiveBlock {
  id: string;
  caret: CaretPos;
  token: number;
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/;
const QUOTE_LINE = /^(\s*>+\s?)(.*)$/;

/** Walks the list lines above `lineStart`, nearest first. */
function scanListLinesAbove(value: string, lineStart: number, visit: (m: RegExpMatchArray) => string | null): string | null {
  const lines = value.slice(0, lineStart).split('\n');
  for (let i = lines.length - 2; i >= 0; i--) {
    const line = lines[i];
    if (!line.trim()) break;
    const m = line.match(LIST_ITEM);
    if (!m) break;
    const answer = visit(m);
    if (answer !== null) return answer;
  }
  return null;
}

/**
 * Ordinal of the previous sibling list item at a given indent, or 0 when the
 * line would be the first item at that depth. Markdown turns the first item's
 * number into the `<ol start>` value, so this is what decides whether a nested
 * list restarts at 1.
 */
function previousOrdinalAt(value: string, lineStart: number, indentWidth: number): number {
  const found = scanListLinesAbove(value, lineStart, (m) => {
    const width = m[1].length;
    if (width === indentWidth) return m[2];
    if (width < indentWidth) return '';
    return null;
  });
  const n = parseInt(found ?? '', 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Indent that actually nests a line under the item above it.
 *
 * CommonMark nests by content column, not by a fixed step: under `1. Hello` the
 * child must start at column 3, under `- Alpha` at column 2. Indenting by two
 * spaces everywhere silently produces a flat list instead.
 */
function nestedIndentFor(value: string, lineStart: number, currentIndent: number): string {
  const width = scanListLinesAbove(value, lineStart, (m) => {
    const indent = m[1].length;
    if (indent === currentIndent) return String(indent + m[2].length + m[3].length);
    if (indent < currentIndent) return '';
    return null;
  });
  const parsed = parseInt(width ?? '', 10);
  return ' '.repeat(Number.isNaN(parsed) ? currentIndent + 2 : parsed);
}

/** Indent of the nearest ancestor level, used when stepping a line back out. */
function outdentIndentFor(value: string, lineStart: number, currentIndent: number): string {
  const width = scanListLinesAbove(value, lineStart, (m) =>
    m[1].length < currentIndent ? String(m[1].length) : null,
  );
  const parsed = parseInt(width ?? '', 10);
  return ' '.repeat(Number.isNaN(parsed) ? 0 : parsed);
}

/** Rewrites a list line for a new indent, renumbering ordered markers to suit. */
function relevelListLine(
  value: string,
  lineStart: number,
  match: RegExpMatchArray,
  newIndent: string,
): string {
  const [, , marker, , task, content] = match;
  const ordered = /^\d+[.)]$/.test(marker);
  const nextMarker = ordered
    ? `${previousOrdinalAt(value, lineStart, newIndent.length) + 1}${marker.slice(-1)}`
    : marker;
  return `${newIndent}${nextMarker} ${task ?? ''}${content}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;base64,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Removes the leading markdown syntax so a block can be turned into another kind. */
function plainContent(text: string): string {
  const kind = blockKind(text);
  if (kind === 'code' || kind === 'mermaid') return fenceBody(text);
  if (kind === 'divider') return '';
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^\s*>+\s?/, '')
        .replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, ''),
    )
    .join('\n')
    .trim();
}

function convertBlock(text: string, option: InsertOption): string {
  if (option.text === undefined) return text;
  const content = plainContent(text);
  switch (option.id) {
    case 'text':
      return content;
    case 'h1':
    case 'h2':
    case 'h3':
      return `${option.text}${content}`;
    case 'ul':
    case 'ol':
    case 'task':
    case 'quote':
      return content
        ? content.split('\n').map((l) => `${option.text}${l}`).join('\n')
        : option.text;
    case 'tip':
    case 'note':
    case 'warning':
    case 'danger':
      return `${option.text}${content}`;
    case 'code':
      return makeFence('', content);
    case 'mermaid':
      return content.trim() ? makeFence('mermaid', content) : option.text;
    case 'divider':
      return '---';
    default:
      return content ? `${option.text}${content}` : option.text;
  }
}

export function PageEditor({ node, initialMarkdown }: { node: TreeNode; initialMarkdown: string }) {
  const { applyTree } = useWorkspace();
  const toast = useToast();

  const parsed = useMemo(() => parseFrontmatter(initialMarkdown), [initialMarkdown]);
  const [title, setTitle] = useState(String(parsed.data.title ?? node.title));
  const [description, setDescription] = useState(String(parsed.data.description ?? ''));
  const [tagText, setTagText] = useState((Array.isArray(parsed.data.tags) ? parsed.data.tags : []).join(', '));
  const [blocks, setBlocks] = useState<BlockItem[]>(() => toBlocks(parsed.body));
  const [mode, setMode] = useState<'rich' | 'source'>('rich');
  const [source, setSource] = useState('');
  const [active, setActive] = useState<ActiveBlock | null>(null);
  const [slash, setSlash] = useState<{ id: string; query: string } | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; turn: boolean } | null>(null);
  const [state, setState] = useState<SaveState>('idle');
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; side: 'above' | 'below' } | null>(null);

  const areas = useRef(new Map<string, HTMLTextAreaElement>());
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ mode: 'insert' | 'replace'; id: string | null }>({ mode: 'insert', id: null });
  const savedRef = useRef('');
  const containerRef = useRef<HTMLDivElement>(null);

  const tags = useMemo(() => tagText.split(',').map((t) => t.trim()).filter(Boolean), [tagText]);
  const body = mode === 'source' ? source : fromBlocks(blocks);

  /* ---------------- load / reset when the page changes ---------------- */
  useEffect(() => {
    const next = parseFrontmatter(initialMarkdown);
    setTitle(String(next.data.title ?? node.title));
    setDescription(String(next.data.description ?? ''));
    setTagText((Array.isArray(next.data.tags) ? next.data.tags : []).join(', '));
    setBlocks(toBlocks(next.body));
    setMode('rich');
    setActive(null);
    setSlash(null);
    setState('idle');
    savedRef.current = JSON.stringify({
      body: next.body.trim(),
      title: String(next.data.title ?? node.title),
      description: String(next.data.description ?? ''),
      tags: Array.isArray(next.data.tags) ? next.data.tags : [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.key]);

  /* ---------------- autosave ---------------- */
  const save = useCallback(
    async (payload: { body: string; title: string; description: string; tags: string[] }) => {
      setState('saving');
      try {
        const res = await api.savePage(node.key, payload.body, {
          title: payload.title,
          description: payload.description,
          tags: payload.tags,
        });
        savedRef.current = JSON.stringify({ ...payload, body: payload.body.trim() });
        putMarkdown(
          node.key,
          buildFrontmatter({
            title: payload.title,
            description: payload.description,
            tags: payload.tags,
            updated: new Date().toISOString().slice(0, 10),
          }) + payload.body,
        );
        applyTree(res.tree);
        setState('saved');
      } catch (error) {
        setState('error');
        toast((error as Error).message || 'Could not save');
      }
    },
    [node.key, applyTree, toast],
  );

  const snapshot = useMemo(
    () => ({ body, title, description, tags }),
    [body, title, description, tags],
  );

  useEffect(() => {
    const serialized = JSON.stringify({ ...snapshot, body: snapshot.body.trim() });
    if (serialized === savedRef.current) return;
    setState('dirty');
    const timer = setTimeout(() => void save(snapshot), 750);
    return () => clearTimeout(timer);
  }, [snapshot, save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save(snapshot);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, snapshot]);

  /* ---------------- block helpers ---------------- */
  const activate = useCallback((id: string, caret: CaretPos = 'end') => {
    setActive((prev) => ({ id, caret, token: (prev?.token ?? 0) + 1 }));
  }, []);

  const indexOf = useCallback((id: string) => blocks.findIndex((b) => b.id === id), [blocks]);

  const updateBlock = useCallback((id: string, text: string) => {
    setBlocks((list) => list.map((b) => (b.id === id ? { ...b, text } : b)));
  }, []);

  const insertAfter = useCallback(
    (id: string | null, texts: string[], focusLast = true) => {
      const created = texts.map((text) => ({ id: newBlockId(), text }));
      setBlocks((list) => {
        const at = id ? list.findIndex((b) => b.id === id) : list.length - 1;
        const copy = [...list];
        copy.splice(at + 1, 0, ...created);
        return copy;
      });
      if (focusLast && created.length) activate(created[created.length - 1].id, 'end');
      return created;
    },
    [activate],
  );

  const removeBlock = useCallback(
    (id: string) => {
      setBlocks((list) => {
        if (list.length <= 1) return [{ id: newBlockId(), text: '' }];
        return list.filter((b) => b.id !== id);
      });
      const i = indexOf(id);
      const target = blocks[i - 1] ?? blocks[i + 1];
      if (target) activate(target.id, 'end');
      else setActive(null);
    },
    [blocks, indexOf, activate],
  );

  const moveBlock = useCallback((id: string, to: number) => {
    setBlocks((list) => {
      const from = list.findIndex((b) => b.id === id);
      if (from === -1) return list;
      const copy = [...list];
      const [item] = copy.splice(from, 1);
      copy.splice(Math.max(0, Math.min(to, copy.length)), 0, item);
      return copy;
    });
  }, []);

  /* ---------------- images ---------------- */
  const uploadAndInsert = useCallback(
    async (files: File[], afterId: string | null, replaceId?: string) => {
      const images = files.filter((f) => f.type.startsWith('image/'));
      if (!images.length) return;
      try {
        const urls: string[] = [];
        for (const file of images) {
          const data = await fileToBase64(file);
          const res = await api.uploadAsset(node.key, data, file.type, file.name);
          urls.push(res.url as string);
        }
        if (replaceId) {
          updateBlock(replaceId, `![](${urls[0]})`);
          activate(replaceId, 'end');
        } else {
          insertAfter(afterId, urls.map((url) => `![](${url})`));
        }
        toast(images.length > 1 ? `${images.length} images added` : 'Image added');
      } catch (error) {
        toast((error as Error).message || 'Upload failed');
      }
    },
    [node.key, insertAfter, updateBlock, activate, toast],
  );

  const pickImage = useCallback((mode: 'insert' | 'replace', id: string | null) => {
    uploadTarget.current = { mode, id };
    fileInput.current?.click();
  }, []);

  /* ---------------- inline formatting ---------------- */
  const withActiveArea = useCallback(
    (fn: (el: HTMLTextAreaElement, id: string) => void) => {
      let id = active?.id ?? null;
      if (!id) {
        id = blocks[blocks.length - 1]?.id ?? null;
        if (id) activate(id, 'end');
      }
      if (!id) return;
      const run = () => {
        const el = areas.current.get(id as string);
        if (el) fn(el, id as string);
      };
      if (areas.current.get(id)) run();
      else requestAnimationFrame(run);
    },
    [active, blocks, activate],
  );

  const applyWrap = useCallback(
    (before: string, after = before, placeholder = 'text') => {
      withActiveArea((el, id) => {
        const next = wrapSelection({ value: el.value, start: el.selectionStart, end: el.selectionEnd }, before, after, placeholder);
        updateBlock(id, next.value);
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(next.start, next.end);
        });
      });
    },
    [withActiveArea, updateBlock],
  );

  const applyPrefix = useCallback(
    (prefix: string, strip: RegExp) => {
      withActiveArea((el, id) => {
        const next = togglePrefix({ value: el.value, start: el.selectionStart, end: el.selectionEnd }, prefix, strip);
        updateBlock(id, next.value);
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(next.end, next.end);
        });
      });
    },
    [withActiveArea, updateBlock],
  );

  const insertOption = useCallback(
    (option: InsertOption, targetId: string | null, replace: boolean) => {
      setSlash(null);
      setMenu(null);
      const id = targetId ?? active?.id ?? blocks[blocks.length - 1]?.id ?? null;

      if (option.action === 'upload-image') {
        if (replace && id) {
          updateBlock(id, '');
          pickImage('replace', id);
        } else {
          pickImage('insert', id);
        }
        return;
      }
      if (option.action === 'image-url') {
        const url = window.prompt('Image URL');
        if (!url) return;
        if (replace && id) updateBlock(id, `![](${url})`);
        else insertAfter(id, [`![](${url})`]);
        return;
      }
      if (option.action === 'link') {
        const url = window.prompt('Link URL', 'https://');
        if (!url) return;
        applyWrap('[', `](${url})`, 'link text');
        return;
      }

      const text = option.text ?? '';
      if (replace && id) {
        const current = blocks.find((b) => b.id === id);
        const next = current && current.text.trim() && !current.text.startsWith('/') ? convertBlock(current.text, option) : text;
        updateBlock(id, next);
        activate(id, option.id === 'code' || option.id === 'mermaid' ? 'start' : 'end');
      } else {
        insertAfter(id, [text]);
      }
    },
    [active, blocks, insertAfter, updateBlock, activate, pickImage, applyWrap],
  );

  /* ---------------- keyboard ---------------- */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>, block: BlockItem) => {
      const el = e.currentTarget;
      const { selectionStart: start, selectionEnd: end, value } = el;
      const collapsed = start === end;
      const index = blocks.findIndex((b) => b.id === block.id);
      const mod = e.ctrlKey || e.metaKey;

      if (mod && !e.shiftKey && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'b') {
          e.preventDefault();
          applyWrap('**');
          return;
        }
        if (key === 'i') {
          e.preventDefault();
          applyWrap('*');
          return;
        }
        if (key === 'e') {
          e.preventDefault();
          applyWrap('`', '`', 'code');
          return;
        }
        if (key === 'k') {
          e.preventDefault();
          const url = window.prompt('Link URL', 'https://');
          if (url) applyWrap('[', `](${url})`, 'link text');
          return;
        }
        if (key === 'enter') {
          e.preventDefault();
          insertAfter(block.id, ['']);
          return;
        }
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setSlash(null);
        setActive(null);
        el.blur();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineEndIdx = value.indexOf('\n', start);
        const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
        const line = value.slice(lineStart, lineEnd);
        const list = line.match(LIST_ITEM);

        if (list) {
          const indent = list[1];
          if (e.shiftKey && indent.length === 0) return;
          const newIndent = e.shiftKey
            ? outdentIndentFor(value, lineStart, indent.length)
            : nestedIndentFor(value, lineStart, indent.length);
          if (newIndent.length === indent.length) return;
          const rebuilt = relevelListLine(value, lineStart, list, newIndent);
          updateBlock(block.id, value.slice(0, lineStart) + rebuilt + value.slice(lineEnd));
          const caret = Math.max(lineStart, start + (rebuilt.length - line.length));
          activate(block.id, caret);
          return;
        }

        if (e.shiftKey) {
          if (value.slice(lineStart, lineStart + 2) === '  ') {
            updateBlock(block.id, value.slice(0, lineStart) + value.slice(lineStart + 2));
            const caret = Math.max(lineStart, start - 2);
            requestAnimationFrame(() => el.setSelectionRange(caret, caret));
          }
        } else {
          updateBlock(block.id, `${value.slice(0, lineStart)}  ${value.slice(lineStart)}`);
          requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
        }
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        const trimmed = value.trim();

        // ``` or ```lang turns into a real code block.
        const fence = trimmed.match(/^(?:```|~~~)([\w+-]*)$/);
        if (fence) {
          e.preventDefault();
          updateBlock(block.id, makeFence(fence[1] ?? '', ''));
          activate(block.id, 'start');
          return;
        }

        // A single pipe row becomes a table.
        if (/^\|.*\|$/.test(trimmed) && trimmed.split('|').length > 2) {
          e.preventDefault();
          const cells = trimmed.replace(/^\||\|$/g, '').split('|').length;
          const divider = `|${' --- |'.repeat(cells)}`;
          const blank = `|${'  |'.repeat(cells)}`;
          updateBlock(block.id, [trimmed, divider, blank].join('\n'));
          activate(block.id, 'end');
          return;
        }

        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineEndIdx = value.indexOf('\n', start);
        const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
        const line = value.slice(lineStart, lineEnd);

        const list = line.match(LIST_ITEM);
        if (list && collapsed) {
          e.preventDefault();
          const [, indent, marker, , task, content] = list;
          if (!content.trim()) {
            if (indent.length > 0) {
              // Empty nested item: step it out one level and renumber for its
              // new depth rather than carrying the inner number outwards.
              const rebuilt = relevelListLine(value, lineStart, list, outdentIndentFor(value, lineStart, indent.length));
              updateBlock(block.id, value.slice(0, lineStart) + rebuilt + value.slice(lineEnd));
              activate(block.id, lineStart + rebuilt.length);
            } else {
              const before = value.slice(0, lineStart).replace(/\n$/, '');
              const after = value.slice(lineEnd).replace(/^\n/, '');
              updateBlock(block.id, before);
              insertAfter(block.id, after.trim() ? ['', after] : ['']);
            }
            return;
          }
          const nextMarker = /^\d+[.)]$/.test(marker)
            ? `${parseInt(marker, 10) + 1}${marker.slice(-1)}`
            : marker;
          const insertion = `\n${indent}${nextMarker} ${task ? '[ ] ' : ''}`;
          updateBlock(block.id, value.slice(0, start) + insertion + value.slice(start));
          activate(block.id, start + insertion.length);
          return;
        }

        const quote = line.match(QUOTE_LINE);
        if (quote && collapsed) {
          e.preventDefault();
          if (!quote[2].trim()) {
            const before = value.slice(0, lineStart).replace(/\n$/, '');
            updateBlock(block.id, before);
            insertAfter(block.id, ['']);
            return;
          }
          const insertion = `\n${quote[1]}`;
          updateBlock(block.id, value.slice(0, start) + insertion + value.slice(start));
          activate(block.id, start + insertion.length);
          return;
        }

        // Otherwise: split the block at the caret.
        e.preventDefault();
        const before = value.slice(0, start);
        const after = value.slice(end);
        updateBlock(block.id, before);
        insertAfter(block.id, [after]);
        return;
      }

      if (e.key === 'Backspace' && collapsed) {
        // Strip the block marker when the caret sits right after it.
        const markers = [/^(\s{0,3}#{1,6}\s)/, /^(\s*>+\s?)/, /^(\s*([-*+]|\d+[.)])\s(\[[ xX]\]\s)?)/];
        for (const marker of markers) {
          const m = value.match(marker);
          if (m && start === m[1].length) {
            e.preventDefault();
            updateBlock(block.id, value.slice(m[1].length));
            activate(block.id, 0);
            return;
          }
        }
        if (start === 0 && index > 0) {
          e.preventDefault();
          const prev = blocks[index - 1];
          const prevKind = blockKind(prev.text);
          if (!value.trim()) {
            removeBlock(block.id);
            return;
          }
          if (prevKind === 'divider' || prevKind === 'image' || prevKind === 'code' || prevKind === 'mermaid' || prevKind === 'table') {
            setBlocks((list) => list.filter((b) => b.id !== prev.id));
            return;
          }
          const caret = prev.text.length;
          setBlocks((list) =>
            list
              .map((b) => (b.id === prev.id ? { ...b, text: `${prev.text}${value}` } : b))
              .filter((b) => b.id !== block.id),
          );
          activate(prev.id, caret);
          return;
        }
      }

      if (e.key === 'Delete' && collapsed && start === value.length && index < blocks.length - 1) {
        const next = blocks[index + 1];
        const nextKind = blockKind(next.text);
        if (nextKind === 'paragraph' || nextKind === 'heading' || nextKind === 'list' || nextKind === 'quote') {
          e.preventDefault();
          const caret = value.length;
          setBlocks((list) =>
            list.map((b) => (b.id === block.id ? { ...b, text: `${value}${next.text}` } : b)).filter((b) => b.id !== next.id),
          );
          activate(block.id, caret);
          return;
        }
      }

      if (e.key === 'ArrowUp' && collapsed && value.lastIndexOf('\n', start - 1) === -1 && index > 0) {
        e.preventDefault();
        activate(blocks[index - 1].id, 'end');
        return;
      }
      if (e.key === 'ArrowDown' && collapsed && value.indexOf('\n', start) === -1 && index < blocks.length - 1) {
        e.preventDefault();
        activate(blocks[index + 1].id, 'start');
      }
    },
    [blocks, applyWrap, updateBlock, insertAfter, activate, removeBlock],
  );

  /* ---------------- paste ---------------- */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>, block: BlockItem) => {
      const data = e.clipboardData;
      const files = Array.from(data.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        void uploadAndInsert(files, block.id);
        return;
      }

      const el = e.currentTarget;
      const text = data.getData('text/plain') ?? '';
      const html = data.getData('text/html') ?? '';
      const { selectionStart: start, selectionEnd: end, value } = el;
      const selected = value.slice(start, end);

      if (text && URL_ONLY.test(text.trim())) {
        e.preventDefault();
        const url = text.trim().replace(/^www\./, 'https://www.');
        const replacement = selected ? `[${selected}](${url})` : `<${url}>`;
        updateBlock(block.id, value.slice(0, start) + replacement + value.slice(end));
        activate(block.id, start + replacement.length);
        return;
      }

      let markdown = '';
      if (text && looksLikeMarkdown(text)) markdown = text;
      else if (html && !text.includes('\n')) markdown = htmlToMarkdown(html) || '';
      else if (html) markdown = htmlToMarkdown(html) || (looksLikeMarkdown(text) ? text : '');

      if (!markdown) return; // let the browser paste plain text

      const parts = splitBlocks(markdown);
      if (parts.length <= 1 && !/\n/.test(markdown)) {
        e.preventDefault();
        updateBlock(block.id, value.slice(0, start) + markdown + value.slice(end));
        activate(block.id, start + markdown.length);
        return;
      }

      e.preventDefault();
      const before = value.slice(0, start);
      const after = value.slice(end);
      const [first, ...rest] = parts;
      // A pasted heading, table or fence starts its own block; a pasted
      // paragraph continues the sentence the caret is sitting in.
      const firstIsInline = blockKind(first) === 'paragraph';

      let tail: string[];
      if (before.trim() && firstIsInline) {
        updateBlock(block.id, `${before}${first}`);
        tail = rest;
      } else if (before.trim()) {
        updateBlock(block.id, before);
        tail = parts;
      } else {
        updateBlock(block.id, first);
        tail = rest;
      }
      if (after.trim()) tail = [...tail, after];
      if (tail.length) insertAfter(block.id, tail);
      else activate(block.id, 'end');
    },
    [uploadAndInsert, updateBlock, insertAfter, activate],
  );

  /* ---------------- drag & drop ---------------- */
  const handleDrop = useCallback(
    (e: React.DragEvent, block: BlockItem) => {
      // The textarea and its wrapper both listen, so only the first one acts.
      e.stopPropagation();
      const files = Array.from(e.dataTransfer.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        void uploadAndInsert(files, block.id);
        setDropTarget(null);
        return;
      }
      const id = e.dataTransfer.getData('text/ns-block') || dragging;
      if (!id || id === block.id) {
        setDropTarget(null);
        setDragging(null);
        return;
      }
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).closest('.blk')?.getBoundingClientRect();
      const below = rect ? e.clientY > rect.top + rect.height / 2 : true;
      const target = blocks.findIndex((b) => b.id === block.id);
      const from = blocks.findIndex((b) => b.id === id);
      if (from === -1 || target === -1) {
        setDropTarget(null);
        setDragging(null);
        return;
      }
      let to = below ? target + 1 : target;
      if (from < to) to -= 1;
      moveBlock(id, to);
      setDropTarget(null);
      setDragging(null);
    },
    [blocks, moveBlock, uploadAndInsert, dragging],
  );

  /* ---------------- per block handlers ---------------- */
  const handlersFor = useCallback(
    (block: BlockItem): BlockHandlers => ({
      onChange: (text) => {
        updateBlock(block.id, text);
        const match = text.match(/^\/(\S*)$/);
        setSlash(match ? { id: block.id, query: match[1] } : null);
      },
      onActivate: (pos) => activate(block.id, pos ?? 'end'),
      onDeactivate: () => setActive(null),
      onKeyDown: (e) => handleKeyDown(e, block),
      onPaste: (e) => handlePaste(e, block),
      onDrop: (e) => handleDrop(e, block),
      onInsertAfter: () => insertAfter(block.id, ['']),
      onOpenMenu: (anchor) => {
        const rect = anchor.getBoundingClientRect();
        setMenu({ id: block.id, x: rect.left, y: rect.bottom + 6, turn: false });
      },
      onDragStart: (e) => {
        e.dataTransfer.setData('text/ns-block', block.id);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(block.id);
      },
      onDragOver: (e) => {
        const isFile = Array.from(e.dataTransfer.types ?? []).includes('Files');
        if (!dragging && !isFile) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = isFile ? 'copy' : 'move';
        if (isFile) return;
        const rect = (e.currentTarget as HTMLElement).closest('.blk')?.getBoundingClientRect();
        if (!rect) return;
        setDropTarget({ id: block.id, side: e.clientY > rect.top + rect.height / 2 ? 'below' : 'above' });
      },
      onDragEnd: () => {
        setDragging(null);
        setDropTarget(null);
      },
      onReplaceImage: () => pickImage('replace', block.id),
      registerRef: (el) => {
        if (el) areas.current.set(block.id, el);
        else areas.current.delete(block.id);
      },
    }),
    [updateBlock, activate, handleKeyDown, handlePaste, handleDrop, insertAfter, dragging, pickImage],
  );

  /* ---------------- render ---------------- */
  const statusLabel: Record<SaveState, string> = {
    idle: 'All changes saved',
    dirty: 'Unsaved changes…',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed',
  };

  const menuBlock = menu ? blocks.find((b) => b.id === menu.id) : null;
  const menuIndex = menu ? blocks.findIndex((b) => b.id === menu.id) : -1;

  return (
    <div
      className="editor"
      ref={containerRef}
      onBlur={(e) => {
        const next = e.relatedTarget as HTMLElement | null;
        if (next && containerRef.current?.contains(next)) return;
        if (!next) return;
        setActive(null);
        setSlash(null);
      }}
    >
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          const { mode: uploadMode, id } = uploadTarget.current;
          e.target.value = '';
          if (!files.length) return;
          void uploadAndInsert(files, id, uploadMode === 'replace' && id ? id : undefined);
        }}
      />

      {/* ---- page meta ---- */}
      <div className="editor-meta">
        <input
          className="editor-title"
          value={title}
          placeholder="Untitled page"
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="editor-desc"
          value={description}
          placeholder="Short description shown in listings and search…"
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          className="editor-tags"
          value={tagText}
          placeholder="tags, comma, separated"
          onChange={(e) => setTagText(e.target.value)}
        />
      </div>

      {/* ---- toolbar ---- */}
      <div className="editor-toolbar">
        <div className="seg tb-modes">
          <button className={mode === 'rich' ? 'active' : ''} type="button" onClick={() => setMode('rich')}>
            <IconEye size={13} /> Live
          </button>
          <button
            className={mode === 'source' ? 'active' : ''}
            type="button"
            onClick={() => {
              setSource(fromBlocks(blocks));
              setMode('source');
              setActive(null);
            }}
          >
            <IconMarkdown size={13} /> Markdown
          </button>
        </div>

        {mode === 'rich' && (
          <>
            <span className="tb-sep" />
            <ToolButton title="Bold (Ctrl+B)" onClick={() => applyWrap('**')}>
              <IconBold size={14} />
            </ToolButton>
            <ToolButton title="Italic (Ctrl+I)" onClick={() => applyWrap('*')}>
              <IconItalic size={14} />
            </ToolButton>
            <ToolButton title="Strikethrough" onClick={() => applyWrap('~~')}>
              <IconStrike size={14} />
            </ToolButton>
            <ToolButton title="Inline code (Ctrl+E)" onClick={() => applyWrap('`', '`', 'code')}>
              <IconCode size={14} />
            </ToolButton>
            <ToolButton
              title="Link (Ctrl+K)"
              onClick={() => {
                const url = window.prompt('Link URL', 'https://');
                if (url) applyWrap('[', `](${url})`, 'link text');
              }}
            >
              <IconLink size={14} />
            </ToolButton>

            <span className="tb-sep" />
            <ToolButton title="Heading 1" onClick={() => applyPrefix('# ', /^\s{0,3}#{1,6}\s*/)}>
              <IconHeading size={14} />
              <span className="tb-sub">1</span>
            </ToolButton>
            <ToolButton title="Heading 2" onClick={() => applyPrefix('## ', /^\s{0,3}#{1,6}\s*/)}>
              <IconHeading size={14} />
              <span className="tb-sub">2</span>
            </ToolButton>
            <ToolButton title="Heading 3" onClick={() => applyPrefix('### ', /^\s{0,3}#{1,6}\s*/)}>
              <IconHeading size={14} />
              <span className="tb-sub">3</span>
            </ToolButton>

            <span className="tb-sep" />
            <ToolButton title="Bullet list" onClick={() => applyPrefix('- ', /^\s*([-*+]|\d+[.)])\s*/)}>
              <IconList size={14} />
            </ToolButton>
            <ToolButton title="Numbered list" onClick={() => applyPrefix('1. ', /^\s*([-*+]|\d+[.)])\s*/)}>
              <IconListOrdered size={14} />
            </ToolButton>
            <ToolButton title="Quote" onClick={() => applyPrefix('> ', /^\s*>+\s*/)}>
              <IconQuote size={14} />
            </ToolButton>

            <span className="tb-sep" />
            <ToolButton title="Insert image" onClick={() => pickImage('insert', active?.id ?? null)}>
              <IconImage size={14} />
            </ToolButton>
            <ToolButton
              title="Insert table"
              onClick={() => insertAfter(active?.id ?? null, [TABLE_TEMPLATE])}
            >
              <IconTable size={14} />
            </ToolButton>
            <ToolButton title="Insert code block" onClick={() => insertAfter(active?.id ?? null, [makeFence('', '')])}>
              <IconCode size={14} />
            </ToolButton>
            <ToolButton
              title="Insert Mermaid diagram"
              onClick={() => insertAfter(active?.id ?? null, [makeFence('mermaid', 'flowchart LR\n  A[Start] --> B[Done]')])}
            >
              <IconDiagram size={14} />
            </ToolButton>
            <ToolButton title="Insert divider" onClick={() => insertAfter(active?.id ?? null, ['---'])}>
              <IconMinus size={14} />
            </ToolButton>
            <ToolButton
              title="All blocks"
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setMenu({ id: active?.id ?? blocks[blocks.length - 1].id, x: rect.left, y: rect.bottom + 6, turn: true });
              }}
            >
              <IconPlus size={14} /> Block
            </ToolButton>
          </>
        )}

        <span className="tb-spacer" />
        <span className={`editor-status is-${state}`}>
          {state === 'saved' || state === 'idle' ? <IconCheck size={13} /> : <IconSave size={13} />}
          {statusLabel[state]}
        </span>
        <button className="btn" type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void save(snapshot)}>
          <IconSave size={13} /> Save
        </button>
      </div>

      {/* ---- body ---- */}
      {mode === 'rich' ? (
        <div className="editor-blocks">
          {blocks.map((block) => (
            <BlockRow
              key={block.id}
              block={block}
              active={active?.id === block.id}
              caret={active?.caret ?? 'end'}
              caretToken={active?.token ?? 0}
              dropSide={dropTarget?.id === block.id ? dropTarget.side : null}
              dragging={dragging === block.id}
              handlers={handlersFor(block)}
            >
              {slash?.id === block.id && (
                <InsertMenu
                  query={slash.query}
                  onPick={(option) => insertOption(option, block.id, true)}
                  onClose={() => setSlash(null)}
                  style={{ position: 'absolute', top: '100%', left: 34, zIndex: 80 }}
                />
              )}
            </BlockRow>
          ))}
          <button
            className="editor-append"
            type="button"
            onClick={() => insertAfter(blocks[blocks.length - 1]?.id ?? null, [''])}
          >
            <IconPlus size={14} /> Add a block
          </button>
        </div>
      ) : (
        <div className="editor-source">
          <textarea
            className="editor-source-input"
            value={source}
            spellCheck={false}
            placeholder="# Write the whole page in markdown…"
            onChange={(e) => setSource(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files ?? []).filter((f) => f.type.startsWith('image/'));
              if (!files.length) return;
              e.preventDefault();
              const el = e.currentTarget;
              const at = el.selectionStart;
              void (async () => {
                try {
                  const urls: string[] = [];
                  for (const file of files) {
                    const data = await fileToBase64(file);
                    const res = await api.uploadAsset(node.key, data, file.type, file.name);
                    urls.push(res.url as string);
                  }
                  const insertion = `\n\n${urls.map((u) => `![](${u})`).join('\n\n')}\n\n`;
                  setSource((s) => s.slice(0, at) + insertion + s.slice(at));
                } catch (error) {
                  toast((error as Error).message || 'Upload failed');
                }
              })();
            }}
          />
          <div className="editor-source-preview">
            <Markdown>{source}</Markdown>
          </div>
        </div>
      )}

      {/* ---- block menu ---- */}
      {menu && menuBlock && (
        <AnchoredMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {menu.turn ? (
            <InsertMenu
              title="Insert block"
              query=""
              onPick={(option) => insertOption(option, menu.id, false)}
              onClose={() => setMenu(null)}
            />
          ) : (
            <div className="blk-menu">
              <button type="button" onClick={() => setMenu({ ...menu, turn: true })}>
                <IconPlus size={13} /> Turn into / insert…
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(menuBlock.text);
                  setMenu(null);
                  toast('Block markdown copied');
                }}
              >
                <IconCopy size={13} /> Copy markdown
              </button>
              <button
                type="button"
                onClick={() => {
                  insertAfter(menu.id, [menuBlock.text]);
                  setMenu(null);
                }}
              >
                <IconPlus size={13} /> Duplicate
              </button>
              <button
                type="button"
                disabled={menuIndex <= 0}
                onClick={() => {
                  moveBlock(menu.id, menuIndex - 1);
                  setMenu(null);
                }}
              >
                <IconArrowUp size={13} /> Move up
              </button>
              <button
                type="button"
                disabled={menuIndex >= blocks.length - 1}
                onClick={() => {
                  moveBlock(menu.id, menuIndex + 1);
                  setMenu(null);
                }}
              >
                <IconArrowDown size={13} /> Move down
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  removeBlock(menu.id);
                  setMenu(null);
                }}
              >
                <IconTrash size={13} /> Delete block
              </button>
            </div>
          )}
        </AnchoredMenu>
      )}
    </div>
  );
}

function ToolButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button className="tb-btn" type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );
}
