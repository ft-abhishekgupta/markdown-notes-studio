import { cloneElement, createContext, isValidElement, memo, useContext, useState, type ReactElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import { Mermaid } from './Mermaid';
import { useLightbox } from './Lightbox';
import { copyText } from '../lib/utils';
import { cssLength, parseSizeTitle } from '../lib/markdown';
import { resolveAssetUrl } from '../lib/api';
import { IconCopy, IconCheck, IconAlert, IconInfo, IconZap, IconTarget, IconFlame, IconExpand } from './Icons';

/** Directory of the page being rendered, so relative image paths resolve. */
const AssetDirCtx = createContext('');

export function AssetDirProvider({ dir, children }: { dir: string; children: ReactNode }) {
  return <AssetDirCtx.Provider value={dir}>{children}</AssetDirCtx.Provider>;
}

export function useAssetDir() {
  return useContext(AssetDirCtx);
}

function HighlightedCodeBlock({ language, children, plain }: { language: string; children: ReactNode; plain: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (await copyText(plain)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };
  return (
    <div className="code-block">
      <div className="code-block-head">
        <span className="code-lang">{language || 'text'}</span>
        <button className={`code-copy${copied ? ' copied' : ''}`} onClick={onCopy} type="button">
          {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

const CALLOUT_ICONS: Record<string, ReactNode> = {
  tip: <IconZap size={17} />,
  warning: <IconAlert size={17} />,
  danger: <IconFlame size={17} />,
  note: <IconInfo size={17} />,
  key: <IconTarget size={17} />,
};

const CALLOUT_LABELS: Record<string, string> = {
  tip: 'Tip',
  warning: 'Watch out',
  danger: 'Careful',
  note: 'Note',
  key: 'Key idea',
};

const ALIAS: Record<string, string> = {
  tip: 'tip',
  success: 'tip',
  info: 'note',
  note: 'note',
  warning: 'warning',
  caution: 'warning',
  danger: 'danger',
  error: 'danger',
  important: 'key',
  key: 'key',
  remember: 'key',
  gotcha: 'danger',
  pitfall: 'danger',
};

function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  const el = node as { props?: { children?: unknown } };
  if (el.props?.children !== undefined) return textOf(el.props.children);
  return '';
}

function Blockquote({ children }: { children?: ReactNode }) {
  const raw = textOf(children).trimStart();
  const gh = raw.match(/^\[!([A-Za-z ]+)\]\s*/);
  const inline = raw.match(/^([A-Za-z ]{3,16}):\s/);
  const keyword = (gh?.[1] ?? inline?.[1] ?? '').trim().toLowerCase();
  const kind = ALIAS[keyword];

  if (!kind) return <blockquote>{children}</blockquote>;

  // Drop the `[!TIP]` / `Tip:` marker from the first piece of text, however
  // deeply react-markdown nested it. When the marker sat on its own line the
  // hard break it left behind goes too.
  let stripped = false;
  let dropBreak = false;
  const strip = (node: ReactNode): ReactNode => {
    if (Array.isArray(node)) {
      const out: ReactNode[] = [];
      for (const child of node) {
        if (dropBreak && isValidElement(child) && child.type === 'br') {
          dropBreak = false;
          continue;
        }
        out.push(strip(child));
      }
      return out;
    }
    if (stripped) return node;
    if (typeof node === 'string') {
      if (!node.trim()) return node;
      stripped = true;
      const next = node.replace(/^\s*\[![A-Za-z ]+\]\s*/, '').replace(/^\s*[A-Za-z ]{3,16}:\s*/, '');
      if (!next.trim()) dropBreak = true;
      return next;
    }
    if (isValidElement(node)) {
      const inner = (node.props as { children?: ReactNode })?.children;
      if (inner === undefined) return node;
      return cloneElement(node as ReactElement<{ children?: ReactNode }>, { children: strip(inner) });
    }
    return node;
  };

  const body = strip(children);

  return (
    <div className={`callout ${kind}`}>
      <span className="callout-icon">{CALLOUT_ICONS[kind]}</span>
      <div className="callout-body">
        <div className="callout-title">{CALLOUT_LABELS[kind]}</div>
        {body}
      </div>
    </div>
  );
}

interface ImgProps {
  src?: string;
  alt?: string;
  title?: string;
  width?: string | number;
  height?: string | number;
}

/** Renders an image with the `"=600x400"` size hint and a click-to-zoom overlay. */
export function MarkdownImage({ src = '', alt = '', title = '', width, height }: ImgProps) {
  const dir = useAssetDir();
  const lightbox = useLightbox();
  const url = resolveAssetUrl(src, dir);
  const size = parseSizeTitle(title);
  const w = cssLength(size.width) ?? (width !== undefined ? String(width) : undefined);
  const h = cssLength(size.height) ?? (height !== undefined ? String(height) : undefined);

  return (
    <span className="md-image" style={{ width: w }}>
      <img
        src={url}
        alt={alt}
        title={size.caption || undefined}
        style={{ width: w ? '100%' : undefined, height: h }}
        loading="lazy"
        onClick={() => lightbox.open(url, alt)}
      />
      <button className="md-image-zoom" type="button" onClick={() => lightbox.open(url, alt)} aria-label="View full screen">
        <IconExpand size={14} />
      </button>
      {size.caption && <span className="md-image-caption">{size.caption}</span>}
    </span>
  );
}

function HeadingAnchor({ id }: { id: string }) {
  return (
    <a
      className="heading-anchor"
      href={`#${id}`}
      aria-label="Jump to this section"
      onClick={(e) => {
        // A bare `#id` href would be swallowed by the hash router.
        e.preventDefault();
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}
    >
      #
    </a>
  );
}

export interface MarkdownProps {
  children: string;
  /** Skips heading anchors — used for previews and nested renders. */
  compact?: boolean;
}

function MarkdownInner({ children, compact = false }: MarkdownProps) {
  const dir = useAssetDir();
  return (
    <div className="prose">
      <ReactMarkdown
        // `remark-breaks` makes a single newline a real line break, the way
        // GitHub comments behave. Without it Shift+Enter would silently
        // collapse into a space and the render would not match the editor.
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw, rehypeSlug, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        urlTransform={(url) => url}
        components={{
          pre({ children }) {
            const child = Array.isArray(children) ? children[0] : children;
            const el = child as { props?: { className?: string; children?: ReactNode } } | undefined;
            const className = el?.props?.className ?? '';
            const lang = /language-([\w+-]*)/.exec(className)?.[1] ?? '';
            const plain = textOf(el?.props?.children).replace(/\n$/, '');
            if (lang === 'mermaid') return <Mermaid code={plain} />;
            return (
              <HighlightedCodeBlock language={lang} plain={plain}>
                {children}
              </HighlightedCodeBlock>
            );
          },
          table({ children }) {
            return (
              <div className="table-wrap">
                <table>{children}</table>
              </div>
            );
          },
          blockquote({ children }) {
            return <Blockquote>{children}</Blockquote>;
          },
          img(props) {
            return <MarkdownImage {...(props as ImgProps)} />;
          },
          h2({ children, id }) {
            return (
              <h2 id={id}>
                {!compact && id && <HeadingAnchor id={id} />}
                {children}
              </h2>
            );
          },
          h3({ children, id }) {
            return (
              <h3 id={id}>
                {!compact && id && <HeadingAnchor id={id} />}
                {children}
              </h3>
            );
          },
          a({ href, children }) {
            const external = /^https?:/i.test(href ?? '');
            return (
              <a
                href={external || (href ?? '').startsWith('#') ? href : resolveAssetUrl(href ?? '', dir)}
                target={external ? '_blank' : undefined}
                rel={external ? 'noreferrer noopener' : undefined}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownInner);
