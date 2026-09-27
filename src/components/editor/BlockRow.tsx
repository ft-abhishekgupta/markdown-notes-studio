import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Markdown } from '../Markdown';
import { blockKind, headingLevel, parseImage } from '../../lib/markdown';
import { CodeBlockEditor } from './CodeBlockEditor';
import { TableEditor } from './TableEditor';
import { ImageBlockEditor } from './ImageBlockEditor';
import { IconGrip, IconPlus, IconMore } from '../Icons';
import type { BlockItem } from './blockTypes';

export type CaretPos = number | 'start' | 'end';

/** Best-effort mapping from a click in rendered output back to the markdown source. */
function caretFromClick(host: HTMLElement, markdown: string): CaretPos {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 'end';
  const range = selection.getRangeAt(0);
  if (!host.contains(range.startContainer)) return 'end';
  const pre = document.createRange();
  pre.selectNodeContents(host);
  try {
    pre.setEnd(range.startContainer, range.startOffset);
  } catch {
    return 'end';
  }
  const rendered = pre.toString();
  if (!rendered) return 'start';
  for (let n = Math.min(18, rendered.length); n >= 3; n--) {
    const probe = rendered.slice(-n);
    const at = markdown.indexOf(probe);
    if (at >= 0) return at + probe.length;
  }
  return Math.min(markdown.length, rendered.length);
}

export interface BlockHandlers {
  onChange: (text: string) => void;
  onActivate: (pos?: CaretPos) => void;
  onDeactivate: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onDrop: (e: React.DragEvent) => void;
  onInsertAfter: () => void;
  onOpenMenu: (anchor: HTMLElement) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onReplaceImage: () => void;
  registerRef: (el: HTMLTextAreaElement | null) => void;
}

export function BlockRow({
  block,
  active,
  caret,
  caretToken,
  dropSide,
  dragging,
  handlers,
  children,
}: {
  block: BlockItem;
  active: boolean;
  caret: CaretPos;
  caretToken: number;
  dropSide: 'above' | 'below' | null;
  dragging: boolean;
  handlers: BlockHandlers;
  children?: ReactNode;
}) {
  const kind = blockKind(block.text);
  const level = headingLevel(block.text);
  // While someone is still typing ```` ```ts ```` the block is not a code block
  // yet — swapping to the fenced editor mid-word would swallow the language.
  const incompleteFence = (kind === 'code' || kind === 'mermaid') && !block.text.includes('\n');
  const editKind = incompleteFence ? 'paragraph' : kind;
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [block.text, active]);

  useEffect(() => {
    if (!active) return;
    const el = areaRef.current;
    if (!el) return;
    el.focus({ preventScroll: false });
    const pos = caret === 'end' ? el.value.length : caret === 'start' ? 0 : Math.min(caret, el.value.length);
    el.setSelectionRange(pos, pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, caretToken]);

  const isRichEditor = active && (editKind === 'code' || editKind === 'mermaid' || editKind === 'table' || editKind === 'image');

  const body = (() => {
    if (active && (editKind === 'code' || editKind === 'mermaid')) {
      return (
        <CodeBlockEditor
          markdown={block.text}
          onChange={handlers.onChange}
          onExit={handlers.onDeactivate}
          registerRef={(el) => {
            areaRef.current = el;
            handlers.registerRef(el);
          }}
        />
      );
    }
    if (active && editKind === 'table') {
      return <TableEditor markdown={block.text} onChange={handlers.onChange} onExit={handlers.onDeactivate} />;
    }
    if (active && editKind === 'image') {
      return <ImageBlockEditor markdown={block.text} onChange={handlers.onChange} onReplace={handlers.onReplaceImage} />;
    }
    if (active) {
      return (
        <textarea
          ref={(el) => {
            areaRef.current = el;
            handlers.registerRef(el);
          }}
          className={`blk-input blk-${editKind}${level ? ` blk-h${level}` : ''}`}
          value={block.text}
          rows={1}
          spellCheck
          placeholder={"Write something, or press '/' for blocks…"}
          onChange={(e) => handlers.onChange(e.target.value)}
          onKeyDown={handlers.onKeyDown}
          onPaste={handlers.onPaste}
          onDrop={handlers.onDrop}
        />
      );
    }
    if (!block.text.trim()) {
      return (
        <div
          className="blk-empty"
          onMouseDown={(e) => {
            e.preventDefault();
            handlers.onActivate('end');
          }}
        >
          Empty block — click to write, or press <kbd>/</kbd> for blocks
        </div>
      );
    }
    return (
      <div
        className="blk-render"
        onMouseUp={(e) => {
          // Interactive bits of the rendered output keep working: toggling a
          // <details>, ticking a task box, copying a code block, following a link.
          if ((e.target as HTMLElement).closest('summary, a, button, input, label')) return;
          const pos = caretFromClick(e.currentTarget, block.text);
          handlers.onActivate(pos);
        }}
        // Clicking an image while editing should select it, not open the viewer.
        onClickCapture={
          kind === 'image'
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                handlers.onActivate('end');
              }
            : undefined
        }
      >
        <Markdown compact>{block.text}</Markdown>
      </div>
    );
  })();

  const imageInfo = kind === 'image' ? parseImage(block.text) : null;

  return (
    <div
      ref={rootRef}
      className={`blk blk-kind-${kind}${level ? ` blk-level-${level}` : ''}${active ? ' active' : ''}${
        isRichEditor ? ' rich' : ''
      }${dragging ? ' is-dragging' : ''}${dropSide ? ` drop-${dropSide}` : ''}`}
      data-block-id={block.id}
      onDragOver={handlers.onDragOver}
      onDrop={handlers.onDrop}
    >
      <div className="blk-gutter">
        <button
          className="blk-gbtn"
          type="button"
          title="Insert a block below"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handlers.onInsertAfter}
        >
          <IconPlus size={13} />
        </button>
        {/* A span, not a button: Chromium will not start a native drag from a
            button, and preventing mousedown would cancel the drag entirely. */}
        <span
          className="blk-gbtn blk-grip"
          role="button"
          tabIndex={-1}
          aria-label="Move block or open block options"
          title="Drag to move · click for options"
          draggable
          onDragStart={(e) => {
            if (rootRef.current) e.dataTransfer.setDragImage(rootRef.current, 12, 12);
            handlers.onDragStart(e);
          }}
          onDragEnd={handlers.onDragEnd}
          onClick={(e) => handlers.onOpenMenu(e.currentTarget)}
        >
          <IconGrip size={13} />
        </span>
      </div>

      <div className="blk-body">{body}</div>

      {!active && (
        <button
          className="blk-edit-hint"
          type="button"
          title="Edit this block"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handlers.onActivate('end')}
        >
          <IconMore size={13} />
        </button>
      )}

      {imageInfo && !active && <span className="blk-badge">image{imageInfo.width ? ` · ${imageInfo.width}` : ''}</span>}
      {children}
    </div>
  );
}
