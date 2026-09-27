import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { makeFence } from '../../lib/markdown';
import { emptyTable, serializeTable } from './blockTypes';
import {
  IconCheckSquare,
  IconCode,
  IconDiagram,
  IconHeading,
  IconImage,
  IconInfo,
  IconLink,
  IconList,
  IconListOrdered,
  IconMinus,
  IconNote,
  IconQuote,
  IconTable,
  IconZap,
} from '../Icons';

export interface InsertOption {
  id: string;
  label: string;
  hint: string;
  icon: ReactNode;
  keywords: string;
  /** Markdown inserted for the block, or a special action handled by the editor. */
  text?: string;
  action?: 'upload-image' | 'image-url' | 'link';
  /** Caret offset inside the inserted text. */
  caret?: number;
}

export const INSERT_OPTIONS: InsertOption[] = [
  { id: 'text', label: 'Text', hint: 'Plain paragraph', icon: <IconNote size={15} />, keywords: 'paragraph body p text', text: '' },
  { id: 'h1', label: 'Heading 1', hint: '# Title', icon: <IconHeading size={15} />, keywords: 'h1 title heading #', text: '# ' },
  { id: 'h2', label: 'Heading 2', hint: '## Section', icon: <IconHeading size={15} />, keywords: 'h2 heading section ##', text: '## ' },
  { id: 'h3', label: 'Heading 3', hint: '### Sub-section', icon: <IconHeading size={15} />, keywords: 'h3 heading ###', text: '### ' },
  { id: 'ul', label: 'Bullet list', hint: '- item', icon: <IconList size={15} />, keywords: 'ul bullet list unordered -', text: '- ' },
  { id: 'ol', label: 'Numbered list', hint: '1. item', icon: <IconListOrdered size={15} />, keywords: 'ol numbered ordered list 1.', text: '1. ' },
  { id: 'task', label: 'Task list', hint: '- [ ] to do', icon: <IconCheckSquare size={15} />, keywords: 'task todo checkbox check', text: '- [ ] ' },
  { id: 'quote', label: 'Quote', hint: '> quoted text', icon: <IconQuote size={15} />, keywords: 'quote blockquote >', text: '> ' },
  { id: 'tip', label: 'Tip callout', hint: '> [!TIP]', icon: <IconZap size={15} />, keywords: 'callout tip success admonition', text: '> [!TIP]\n> ' },
  { id: 'note', label: 'Note callout', hint: '> [!NOTE]', icon: <IconInfo size={15} />, keywords: 'callout note info admonition', text: '> [!NOTE]\n> ' },
  { id: 'warning', label: 'Warning callout', hint: '> [!WARNING]', icon: <IconInfo size={15} />, keywords: 'callout warning caution admonition', text: '> [!WARNING]\n> ' },
  { id: 'danger', label: 'Danger callout', hint: '> [!DANGER]', icon: <IconInfo size={15} />, keywords: 'callout danger error admonition', text: '> [!DANGER]\n> ' },
  { id: 'code', label: 'Code block', hint: '``` fenced code', icon: <IconCode size={15} />, keywords: 'code fence snippet ```', text: makeFence('', '') },
  {
    id: 'mermaid',
    label: 'Mermaid diagram',
    hint: 'Flowcharts, sequences, ERDs',
    icon: <IconDiagram size={15} />,
    keywords: 'mermaid diagram flowchart sequence graph',
    text: makeFence('mermaid', 'flowchart LR\n  A[Start] --> B{Choice}\n  B -->|yes| C[Done]\n  B -->|no| A'),
  },
  { id: 'table', label: 'Table', hint: '3 × 2 grid', icon: <IconTable size={15} />, keywords: 'table grid rows columns |', text: serializeTable(emptyTable()) },
  { id: 'divider', label: 'Divider', hint: 'Horizontal rule', icon: <IconMinus size={15} />, keywords: 'divider rule hr line ---', text: '---' },
  { id: 'image', label: 'Image upload', hint: 'Pick a file to store beside the page', icon: <IconImage size={15} />, keywords: 'image picture photo upload png jpg', action: 'upload-image' },
  { id: 'image-url', label: 'Image from URL', hint: '![](https://…)', icon: <IconImage size={15} />, keywords: 'image url remote link picture', action: 'image-url' },
  { id: 'link', label: 'Link', hint: '[text](url)', icon: <IconLink size={15} />, keywords: 'link url anchor href', action: 'link' },
  {
    id: 'details',
    label: 'Collapsible',
    hint: '<details> toggle',
    icon: <IconNote size={15} />,
    keywords: 'details toggle collapse accordion summary',
    text: '<details>\n<summary>Show more</summary>\n\nHidden content.\n\n</details>',
  },
];

export function filterOptions(query: string): InsertOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return INSERT_OPTIONS;
  return INSERT_OPTIONS.filter((o) => `${o.label} ${o.keywords}`.toLowerCase().includes(q));
}

export function InsertMenu({
  query,
  onPick,
  onClose,
  style,
  title,
}: {
  query: string;
  onPick: (option: InsertOption) => void;
  onClose: () => void;
  style?: React.CSSProperties;
  title?: string;
}) {
  const options = useMemo(() => filterOptions(query), [query]);
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => Math.min(options.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (!options.length) return;
        e.preventDefault();
        onPick(options[index]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [options, index, onPick, onClose]);

  useEffect(() => {
    listRef.current?.querySelector('.slash-item.selected')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!options.length) {
    return (
      <div className="slash-menu" style={style}>
        <div className="slash-empty">No block matches “{query}”</div>
      </div>
    );
  }

  return (
    <div className="slash-menu" style={style} ref={listRef}>
      {title && <div className="slash-title">{title}</div>}
      {options.map((option, i) => (
        <button
          key={option.id}
          type="button"
          className={`slash-item${i === index ? ' selected' : ''}`}
          onMouseEnter={() => setIndex(i)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(option)}
        >
          <span className="slash-icon">{option.icon}</span>
          <span className="slash-body">
            <span className="slash-label">{option.label}</span>
            <span className="slash-hint">{option.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
