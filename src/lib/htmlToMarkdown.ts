/* ============================================================
   Minimal HTML → Markdown conversion for rich clipboard pastes
   ============================================================ */

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li',
  'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'tr', 'ul',
]);

function escapeInline(text: string): string {
  return text.replace(/([\\`*_[\]])/g, '\\$1');
}

function collapse(text: string): string {
  return text.replace(/[ \t\r\n]+/g, ' ');
}

interface Ctx {
  listStack: { ordered: boolean; index: number }[];
  inPre: boolean;
}

function childrenToMarkdown(node: Node, ctx: Ctx): string {
  let out = '';
  node.childNodes.forEach((child) => {
    out += nodeToMarkdown(child, ctx);
  });
  return out;
}

function tableToMarkdown(table: HTMLTableElement, ctx: Ctx): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (!rows.length) return '';
  const grid = rows.map((row) =>
    Array.from(row.querySelectorAll('th,td')).map((cell) =>
      collapse(childrenToMarkdown(cell, ctx)).replace(/\|/g, '\\|').trim(),
    ),
  );
  const columns = Math.max(...grid.map((r) => r.length));
  const pad = (cells: string[]) =>
    `| ${Array.from({ length: columns }, (_, i) => cells[i] ?? '').join(' | ')} |`;
  const head = grid[0] ?? [];
  const body = grid.slice(1);
  const divider = `| ${Array.from({ length: columns }, () => '---').join(' | ')} |`;
  return ['', pad(head), divider, ...body.map(pad), ''].join('\n');
}

function nodeToMarkdown(node: Node, ctx: Ctx): string {
  if (node.nodeType === 3) {
    const text = node.textContent ?? '';
    return ctx.inPre ? text : escapeInline(collapse(text));
  }
  if (node.nodeType !== 1) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case 'script':
    case 'style':
    case 'noscript':
    case 'head':
      return '';
    case 'br':
      return '  \n';
    case 'hr':
      return '\n\n---\n\n';
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Number(tag[1]);
      const text = collapse(childrenToMarkdown(el, ctx)).trim();
      return text ? `\n\n${'#'.repeat(level)} ${text}\n\n` : '';
    }
    case 'strong':
    case 'b': {
      const text = childrenToMarkdown(el, ctx).trim();
      return text ? `**${text}**` : '';
    }
    case 'em':
    case 'i': {
      const text = childrenToMarkdown(el, ctx).trim();
      return text ? `*${text}*` : '';
    }
    case 'del':
    case 's':
    case 'strike': {
      const text = childrenToMarkdown(el, ctx).trim();
      return text ? `~~${text}~~` : '';
    }
    case 'code': {
      if (el.closest('pre')) return el.textContent ?? '';
      const text = (el.textContent ?? '').trim();
      return text ? `\`${text}\`` : '';
    }
    case 'pre': {
      const language = (el.querySelector('code')?.className ?? '').match(/language-([\w+-]+)/)?.[1] ?? '';
      const body = (el.textContent ?? '').replace(/\n+$/, '');
      return `\n\n\`\`\`${language}\n${body}\n\`\`\`\n\n`;
    }
    case 'a': {
      const href = el.getAttribute('href') ?? '';
      const text = childrenToMarkdown(el, ctx).trim();
      if (!href || href.startsWith('javascript:')) return text;
      return text ? `[${text}](${href})` : `<${href}>`;
    }
    case 'img': {
      const src = el.getAttribute('src') ?? '';
      const alt = (el.getAttribute('alt') ?? '').replace(/[[\]]/g, '');
      return src ? `![${alt}](${src})` : '';
    }
    case 'blockquote': {
      const body = childrenToMarkdown(el, ctx).trim();
      if (!body) return '';
      return `\n\n${body
        .split('\n')
        .map((line) => `> ${line}`.trimEnd())
        .join('\n')}\n\n`;
    }
    case 'ul':
    case 'ol': {
      ctx.listStack.push({ ordered: tag === 'ol', index: Number(el.getAttribute('start') ?? 1) });
      const body = childrenToMarkdown(el, ctx);
      ctx.listStack.pop();
      return `\n\n${body.replace(/\n{3,}/g, '\n\n').trim()}\n\n`;
    }
    case 'li': {
      const level = Math.max(0, ctx.listStack.length - 1);
      const frame = ctx.listStack[ctx.listStack.length - 1];
      const marker = frame?.ordered ? `${frame.index++}. ` : '- ';
      const indent = '  '.repeat(level);
      const body = childrenToMarkdown(el, ctx).trim();
      if (!body) return '';
      const [first, ...rest] = body.split('\n');
      const tail = rest.map((line) => (line.trim() ? `${indent}  ${line.trim()}` : '')).join('\n');
      return `${indent}${marker}${first}${tail ? `\n${tail}` : ''}\n`;
    }
    case 'table':
      return tableToMarkdown(el as HTMLTableElement, ctx);
    case 'tr':
    case 'td':
    case 'th':
    case 'thead':
    case 'tbody':
      return childrenToMarkdown(el, ctx);
    default: {
      const body = childrenToMarkdown(el, ctx);
      return BLOCK_TAGS.has(tag) ? `\n\n${body.trim()}\n\n` : body;
    }
  }
}

/** Converts a clipboard HTML fragment into markdown. Returns '' when nothing useful is found. */
export function htmlToMarkdown(html: string): string {
  if (!html || typeof document === 'undefined') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript').forEach((n) => n.remove());
  const markdown = childrenToMarkdown(doc.body, { listStack: [], inPre: false });
  return markdown
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
