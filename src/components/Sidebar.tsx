import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useToast } from './Toast';
import { AnchoredMenu } from './AnchoredMenu';
import { useTreeActions, useWorkspace } from '../lib/workspace';
import {
  KIND_LABEL,
  MAX_DEPTH,
  canHoldChildren,
  canHoldSection,
  depthOfKey,
  sectionDepth,
  type NodeKind,
  type TreeNode,
} from '../lib/types';
import {
  IconChevronRight,
  IconFilePlus,
  IconFolderPlus,
  IconMore,
  IconPlus,
  IconSearch,
  IconUpload,
  SectionIcon,
} from './Icons';

/* ---------------- helpers ---------------- */

function countPages(node: TreeNode): number {
  if (node.kind === 'page') return 1;
  return node.children.reduce((n, c) => n + countPages(c), 0);
}

function matches(node: TreeNode, query: string): boolean {
  if (!query) return true;
  if (node.title.toLowerCase().includes(query)) return true;
  if (node.description.toLowerCase().includes(query)) return true;
  if (node.tags.some((t) => t.toLowerCase().includes(query))) return true;
  return node.children.some((c) => matches(c, query));
}

interface DropSpot {
  key: string;
  mode: 'before' | 'after' | 'inside';
}

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { tree, editMode, editable, parentsOf, byKey } = useWorkspace();
  const actions = useTreeActions();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropSpot | null>(null);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const importParent = useRef<string>('');

  const currentKey = useMemo(() => {
    const m = location.pathname.match(/^\/(?:p|f)\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : '';
  }, [location.pathname]);

  // Open every ancestor of whatever is on screen.
  useEffect(() => {
    if (!currentKey) return;
    const parts = currentKey.split('/');
    const patch: Record<string, boolean> = {};
    for (let i = 1; i <= parts.length; i++) patch[parts.slice(0, i).join('/')] = true;
    setExpanded((s) => ({ ...s, ...patch }));
  }, [currentKey]);

  useEffect(() => {
    scrollRef.current?.querySelector('.nav-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [location.pathname]);

  const query = filter.trim().toLowerCase();

  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await fn();
      } catch (error) {
        toast((error as Error).message || `${label} failed`);
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  const addChild = (parent: TreeNode | null, kind: NodeKind) =>
    run('Create', async () => {
      const parentKey = parent?.key ?? '';
      const key = await actions.create(parentKey, kind, kind === 'page' ? 'New page' : 'New section');
      setExpanded((s) => ({ ...s, [parentKey]: true, [key]: true }));
      setRenaming(key);
      if (kind === 'page') navigate(`/p/${key}`);
      setMenu(null);
    });

  const rename = (key: string, title: string) =>
    run('Rename', async () => {
      const next = await actions.rename(key, title);
      setRenaming(null);
      if (currentKey === key || currentKey.startsWith(`${key}/`)) {
        const suffix = currentKey.slice(key.length);
        const prefix = location.pathname.startsWith('/p/') ? '/p/' : '/f/';
        navigate(`${prefix}${next}${suffix}`, { replace: true });
      }
    });

  const remove = (node: TreeNode) => {
    const what = node.kind === 'page' ? 'page' : 'section and everything inside it';
    if (!window.confirm(`Delete the ${what} “${node.title}”? This removes the files from disk.`)) return;
    void run('Delete', async () => {
      await actions.remove(node.key);
      setMenu(null);
      if (currentKey === node.key || currentKey.startsWith(`${node.key}/`)) navigate('/');
    });
  };

  const moveBy = (node: TreeNode, delta: number) =>
    run('Move', async () => {
      const parents = parentsOf(node.key);
      const parent = parents[parents.length - 1];
      const siblings = parent ? parent.children : tree;
      const index = siblings.findIndex((s) => s.key === node.key);
      const next = Math.max(0, Math.min(siblings.length - 1, index + delta));
      if (next === index) return;
      await actions.move(node.key, parent?.key ?? '', next);
      setMenu(null);
    });

  const canDrop = useCallback(
    (sourceKey: string, targetParentKey: string): boolean => {
      const source = byKey.get(sourceKey);
      if (!source) return false;
      if (targetParentKey === sourceKey || targetParentKey.startsWith(`${sourceKey}/`)) return false;
      if (!canHoldChildren(targetParentKey)) return false;
      if (source.kind === 'page') return true;
      // A section has to bring its own sub-sections with it.
      return canHoldSection(targetParentKey) && depthOfKey(targetParentKey) + 1 + sectionDepth(source) <= MAX_DEPTH - 2;
    },
    [byKey],
  );

  const spotFor = useCallback(
    (node: TreeNode, e: React.DragEvent, sourceKey: string): DropSpot => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const offset = rect.height ? (e.clientY - rect.top) / rect.height : 0.5;
      const canNest = node.kind !== 'page' && canDrop(sourceKey, node.key);
      const mode: DropSpot['mode'] = canNest
        ? offset < 0.25
          ? 'before'
          : offset > 0.75
            ? 'after'
            : 'inside'
        : offset < 0.5
          ? 'before'
          : 'after';
      return { key: node.key, mode };
    },
    [canDrop],
  );

  const performDrop = (spot: DropSpot, sourceKey: string | null) => {
    setDrag(null);
    setDrop(null);
    if (!sourceKey) return;
    const target = byKey.get(spot.key);
    if (!target) return;

    let parentKey: string;
    let index: number;
    if (spot.mode === 'inside') {
      parentKey = target.key;
      index = target.children.length;
    } else {
      const parents = parentsOf(target.key);
      const parent = parents[parents.length - 1];
      parentKey = parent?.key ?? '';
      const siblings = parent ? parent.children : tree;
      index = siblings.findIndex((s) => s.key === target.key) + (spot.mode === 'after' ? 1 : 0);
    }
    if (!canDrop(sourceKey, parentKey)) {
      toast('That folder cannot hold this item');
      return;
    }
    void run('Move', async () => {
      const next = await actions.move(sourceKey, parentKey, index);
      setExpanded((s) => ({ ...s, [parentKey]: true }));
      if (currentKey === sourceKey || currentKey.startsWith(`${sourceKey}/`)) {
        const suffix = currentKey.slice(sourceKey.length);
        const prefix = location.pathname.startsWith('/p/') ? '/p/' : '/f/';
        navigate(`${prefix}${next}${suffix}`, { replace: true });
      }
    });
  };

  const onImportFiles = async (files: File[]) => {
    const parentKey = importParent.current;
    await run('Import', async () => {
      let last = '';
      for (const file of files) {
        last = await actions.importMarkdown(parentKey, file.name, await file.text());
      }
      setExpanded((s) => ({ ...s, [parentKey]: true }));
      if (last) navigate(`/p/${last}`);
      toast(files.length > 1 ? `${files.length} pages imported` : 'Page imported');
    });
  };

  /* ---------------- row rendering ---------------- */

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    if (!matches(node, query)) return null;
    const isOpen = query ? true : (expanded[node.key] ?? false);
    const dropping = drop?.key === node.key ? drop.mode : null;
    const pages = countPages(node);

    const commonProps = {
      draggable: editMode && !renaming,
      onDragStart: (e: React.DragEvent) => {
        e.stopPropagation();
        e.dataTransfer.setData('text/ns-node', node.key);
        e.dataTransfer.effectAllowed = 'move';
        setDrag(node.key);
      },
      onDragEnd: () => {
        setDrag(null);
        setDrop(null);
      },
      onDragOver: (e: React.DragEvent) => {
        if (!drag || drag === node.key) return;
        e.preventDefault();
        e.stopPropagation();
        setDrop(spotFor(node, e, drag));
      },
      onDrop: (e: React.DragEvent) => {
        if (!drag || drag === node.key) return;
        e.preventDefault();
        e.stopPropagation();
        // Recomputed from the event so a fast drag that never settled on a
        // dragover still lands where the pointer is.
        performDrop(spotFor(node, e, drag), drag);
      },
    };

    const menuButton = editMode && (
      <button
        className="nav-kebab"
        type="button"
        title="Options"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setMenu({ key: node.key, x: Math.min(rect.left, window.innerWidth - 220), y: rect.bottom + 4 });
        }}
      >
        <IconMore size={14} />
      </button>
    );

    const label =
      renaming === node.key ? (
        <input
          className="nav-rename"
          autoFocus
          defaultValue={node.title}
          onFocus={(e) => e.target.select()}
          onClick={(e) => e.preventDefault()}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value && value !== node.title) void rename(node.key, value);
            else setRenaming(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setRenaming(null);
            }
          }}
        />
      ) : null;

    if (node.kind === 'page') {
      return (
        <div key={node.key} className={`nav-row-wrap${dropping ? ` drop-${dropping}` : ''}`} {...commonProps}>
          {label ?? (
            <>
              <NavLink
                to={`/p/${node.key}`}
                draggable={false}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}${depth >= 2 ? ' nav-item-deep' : ''}`}
                onClick={onNavigate}
                onDoubleClick={(e) => {
                  if (!editMode) return;
                  e.preventDefault();
                  setRenaming(node.key);
                }}
                title={node.title}
              >
                <span className="ni-text">{node.title}</span>
              </NavLink>
              {menuButton}
            </>
          )}
        </div>
      );
    }

    const isSection = depth === 0;

    return (
      <div key={node.key} className={`nav-node nav-depth-${depth}`}>
        {/* The drag handlers live on the row, not the whole node: a node's box
            also covers its expanded children, which would make the
            before/inside/after split meaningless. */}
        <div className={`nav-row-wrap${dropping ? ` drop-${dropping}` : ''}`} {...commonProps}>
          {label ?? (
            <>
              <button
                className={`${isSection ? 'nav-section-btn' : 'nav-group-btn'}${
                  currentKey === node.key || currentKey.startsWith(`${node.key}/`) ? ' has-current' : ''
                }`}
                style={isSection ? ({ ['--sec-hue' as string]: node.hue } as React.CSSProperties) : undefined}
                aria-expanded={isOpen}
                type="button"
                draggable={false}
                onClick={() => setExpanded((s) => ({ ...s, [node.key]: !isOpen }))}
                onDoubleClick={() => editMode && setRenaming(node.key)}
              >
                {isSection ? (
                  <span className="ns-icon">
                    <SectionIcon name={node.icon} size={14} />
                  </span>
                ) : (
                  <IconChevronRight size={12} className="ng-caret" />
                )}
                <span className={isSection ? 'ns-title' : 'ng-title'}>{node.title}</span>
                <span className={isSection ? 'ns-count' : 'ng-count'}>{pages}</span>
                {isSection && <IconChevronRight size={14} className="ns-caret" />}
              </button>
              {menuButton}
            </>
          )}
        </div>

        {isOpen && (
          <div className={isSection ? 'nav-items' : 'nav-group-items'}>
            {node.children.map((child) => renderNode(child, depth + 1))}
            {editMode && canHoldChildren(node.key) && (
              <div className="nav-add-row">
                <button className="nav-add" type="button" onClick={() => void addChild(node, 'page')}>
                  <IconPlus size={12} /> Page
                </button>
                {canHoldSection(node.key) && (
                  <button className="nav-add" type="button" onClick={() => void addChild(node, 'section')}>
                    <IconPlus size={12} /> Section
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const menuNode = menu ? byKey.get(menu.key) : null;

  return (
    <aside className={`sidebar${open ? ' open' : ''}${busy ? ' busy' : ''}`} aria-label="Workspace navigation">
      <div className="sidebar-head">
        <div className="sidebar-filter">
          <IconSearch size={14} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter pages…"
            aria-label="Filter pages"
          />
        </div>
        {editMode && (
          <div className="sidebar-actions">
            <button className="btn btn-ghost" type="button" onClick={() => void addChild(null, 'section')}>
              <IconFolderPlus size={14} /> Section
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => void addChild(null, 'page')}>
              <IconFilePlus size={14} /> Page
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                importParent.current = '';
                importInput.current?.click();
              }}
              title="Import markdown files into the workspace root"
            >
              <IconUpload size={14} /> Import
            </button>
          </div>
        )}
      </div>

      <input
        ref={importInput}
        type="file"
        accept=".md,.markdown,.txt,text/markdown"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void onImportFiles(files);
        }}
      />

      <div
        className="sidebar-scroll"
        ref={scrollRef}
        onDragOver={(e) => {
          if (drag) e.preventDefault();
        }}
        onDrop={() => {
          if (drop && drag) performDrop(drop, drag);
        }}
      >
        {tree.length === 0 && (
          <div className="sidebar-empty">
            <p>No content yet.</p>
            {editMode ? (
              <button className="btn btn-primary" type="button" onClick={() => void addChild(null, 'section')}>
                <IconPlus size={14} /> Create the first section
              </button>
            ) : (
              <p className="faint">Add markdown under <code>content/</code>.</p>
            )}
          </div>
        )}
        {tree.map((node) => renderNode(node, 0))}
        {query && !tree.some((n) => matches(n, query)) && (
          <div className="sidebar-empty faint">Nothing matches “{filter}”.</div>
        )}
      </div>

      {menu && menuNode && (
        <AnchoredMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <div className="nav-menu">
            <div className="nav-menu-title">{KIND_LABEL[menuNode.kind]}</div>
            {menuNode.kind === 'section' && canHoldChildren(menuNode.key) && (
              <button type="button" onClick={() => void addChild(menuNode, 'page')}>
                <IconFilePlus size={13} /> New page
              </button>
            )}
            {menuNode.kind === 'section' && canHoldSection(menuNode.key) && (
              <button type="button" onClick={() => void addChild(menuNode, 'section')}>
                <IconFolderPlus size={13} /> New section
              </button>
            )}
            {menuNode.kind === 'section' && canHoldChildren(menuNode.key) && (
              <button
                type="button"
                onClick={() => {
                  importParent.current = menuNode.key;
                  setMenu(null);
                  importInput.current?.click();
                }}
              >
                <IconUpload size={13} /> Import markdown…
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setRenaming(menuNode.key);
                setMenu(null);
              }}
            >
              Rename
            </button>
            {menuNode.kind === 'page' && (
              <button
                type="button"
                onClick={() =>
                  void run('Duplicate', async () => {
                    const key = await actions.duplicate(menuNode.key);
                    setMenu(null);
                    navigate(`/p/${key}`);
                  })
                }
              >
                Duplicate
              </button>
            )}
            <button type="button" onClick={() => void moveBy(menuNode, -1)}>
              Move up
            </button>
            <button type="button" onClick={() => void moveBy(menuNode, 1)}>
              Move down
            </button>
            <button type="button" className="danger" onClick={() => remove(menuNode)}>
              Delete
            </button>
          </div>
        </AnchoredMenu>
      )}

      {!editable && <div className="sidebar-foot faint">Read-only build</div>}
    </aside>
  );
}
