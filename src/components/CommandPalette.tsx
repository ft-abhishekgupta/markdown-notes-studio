import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../lib/workspace';
import type { TreeNode } from '../lib/types';
import { IconSearch, IconArrowRight } from './Icons';

interface Hit {
  node: TreeNode;
  trail: string;
  snippet?: string;
  score: number;
}

let indexPromise: Promise<Record<string, string>> | null = null;

function loadSearchIndex(): Promise<Record<string, string>> {
  if (!indexPromise) {
    indexPromise = import('virtual:notes-search')
      .then((m) => m.searchIndex)
      .catch(() => ({}));
  }
  return indexPromise;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pages, parentsOf, revision } = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [fullText, setFullText] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setIndex(0);
    indexPromise = null;
    void loadSearchIndex().then(setFullText);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, revision]);

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    const trailOf = (node: TreeNode) => parentsOf(node.key).map((p) => p.title).join(' › ');
    if (!q) {
      return pages.slice(0, 40).map((node) => ({ node, trail: trailOf(node), score: 0 }));
    }
    const out: Hit[] = [];
    for (const node of pages) {
      const title = node.title.toLowerCase();
      const trail = trailOf(node);
      let score = 0;
      if (title.startsWith(q)) score = 100;
      else if (title.includes(q)) score = 80;
      else if (node.tags.some((t) => t.toLowerCase().includes(q))) score = 60;
      else if (node.description.toLowerCase().includes(q)) score = 50;
      else if (trail.toLowerCase().includes(q)) score = 40;

      let snippet: string | undefined;
      const body = fullText[node.key];
      if (body) {
        const at = body.indexOf(q);
        if (at >= 0) {
          score = Math.max(score, 30);
          snippet = `…${body.slice(Math.max(0, at - 40), at + 80).trim()}…`;
        }
      }
      if (score > 0) out.push({ node, trail, snippet, score });
    }
    return out.sort((a, b) => b.score - a.score || a.node.title.localeCompare(b.node.title)).slice(0, 50);
  }, [query, pages, parentsOf, fullText]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => Math.min(hits.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && hits[index]) {
        e.preventDefault();
        navigate(`/p/${hits[index].node.key}`);
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, hits, index, navigate, onClose]);

  if (!open) return null;

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input-row">
          <IconSearch size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search page titles, tags and content…"
            aria-label="Search"
          />
        </div>
        <div className="palette-results">
          {hits.length === 0 ? (
            <div className="palette-empty">No page matches “{query}”.</div>
          ) : (
            hits.map((hit, i) => (
              <button
                key={hit.node.key}
                className={`palette-item${i === index ? ' selected' : ''}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => {
                  navigate(`/p/${hit.node.key}`);
                  onClose();
                }}
                type="button"
              >
                <div className="pi-body">
                  <div className="pi-title">{hit.node.title}</div>
                  <div className="pi-sub">{hit.snippet ?? hit.trail}</div>
                </div>
                <IconArrowRight size={15} />
              </button>
            ))
          )}
        </div>
        <div className="palette-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
