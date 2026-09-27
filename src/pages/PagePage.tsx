import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AssetDirProvider, Markdown } from '../components/Markdown';
import { PageEditor } from '../components/editor/PageEditor';
import { loadMarkdown, useWorkspace } from '../lib/workspace';
import { collectHeadings, parseFrontmatter } from '../lib/markdown';
import { IconArrowRight, IconChevronRight } from '../components/Icons';

/**
 * Scrolls to a heading without touching the URL. The app runs on a hash router,
 * so a plain `#id` href would replace the route and land on "page not found".
 */
function scrollToHeading(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function useActiveHeading(ids: string[]) {
  const [active, setActive] = useState('');
  useEffect(() => {
    if (!ids.length) return;
    const onScroll = () => {
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 140) current = id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [ids.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  return active;
}

export function PagePage() {
  const params = useParams();
  const key = decodeURIComponent(params['*'] ?? '');
  const { byKey, parentsOf, neighbours, editMode, revision, refresh } = useWorkspace();
  const node = byKey.get(key);

  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState('');
  const loadedFor = useRef('');
  const retried = useRef('');

  useEffect(() => {
    if (!node) return;
    const token = `${node.key}:${revision}`;
    if (loadedFor.current === token) return;
    let cancelled = false;
    if (loadedFor.current.split(':')[0] !== node.key) setRaw(null);
    setError('');
    loadMarkdown(node)
      .then((text) => {
        if (cancelled) return;
        loadedFor.current = token;
        retried.current = '';
        setRaw(text);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        // The file may have been moved or renamed in another tab, or on disk.
        // Resync the tree once and let the effect run again with the new path.
        if (retried.current !== node.key) {
          retried.current = node.key;
          void refresh();
          return;
        }
        setError(e.message);
        setRaw('');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.key, revision]);

  const parsed = useMemo(() => parseFrontmatter(raw ?? ''), [raw]);
  const headings = useMemo(() => collectHeadings(parsed.body).filter((h) => h.depth <= 3), [parsed.body]);
  const activeHeading = useActiveHeading(headings.map((h) => h.id));

  if (!node || node.kind !== 'page') {
    return (
      <div className="wrap">
        <div className="empty">
          <h3>Page not found</h3>
          <p>
            Nothing lives at <code>{key || '/'}</code>. Pick a page from the sidebar or press <kbd>Ctrl</kbd> <kbd>K</kbd>.
          </p>
        </div>
      </div>
    );
  }

  const trail = parentsOf(node.key);
  const { prev, next } = neighbours(node.key);

  if (raw === null) {
    return (
      <div className="topic-layout">
        <div className="topic-main">
          <div className="skeleton-title" />
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
          {error && <div className="empty">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <AssetDirProvider dir={node.dir}>
      <div className={`topic-layout${editMode ? ' is-editing' : ''}`}>
        <div className="topic-main page">
          <div className="breadcrumb">
            <Link to="/">Home</Link>
            {trail.map((p) => (
              <span key={p.key} style={{ display: 'contents' }}>
                <IconChevronRight size={12} />
                <Link to={`/f/${p.key}`}>{p.title}</Link>
              </span>
            ))}
          </div>

          {editMode ? (
            <PageEditor node={node} initialMarkdown={raw} />
          ) : (
            <>
              <div className="topic-head">
                <h1 className="topic-title">{String(parsed.data.title ?? node.title)}</h1>
                {parsed.data.description ? <p className="topic-desc">{String(parsed.data.description)}</p> : null}
              </div>
              <Markdown>{parsed.body}</Markdown>
            </>
          )}

          {(prev || next) && !editMode && (
            <nav className="pager" aria-label="Page navigation">
              {prev ? (
                <Link className="pager-card" to={`/p/${prev.key}`}>
                  <span className="pager-label">Previous</span>
                  <span className="pager-title">{prev.title}</span>
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link className="pager-card next" to={`/p/${next.key}`}>
                  <span className="pager-label">Next</span>
                  <span className="pager-title">{next.title}</span>
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>

        <aside className="toc" aria-label="On this page">
          {headings.length > 0 && (
            <>
              <div className="toc-title">On this page</div>
              <ul className="toc-list">
                {headings.map((h) => (
                  <li key={h.id}>
                    <a
                      className={`depth-${h.depth}${activeHeading === h.id ? ' active' : ''}`}
                      href={`#${h.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        scrollToHeading(h.id);
                      }}
                    >
                      {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
          {next && (
            <div className="toc-actions">
              <Link className="btn" to={`/p/${next.key}`}>
                <IconArrowRight size={14} /> {next.title}
              </Link>
            </div>
          )}
        </aside>
      </div>
    </AssetDirProvider>
  );
}
