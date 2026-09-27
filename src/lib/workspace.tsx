import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import initialTree from 'virtual:notes-tree';
import { IS_EDITABLE, api, fetchPageMarkdown } from './api';
import type { NodeKind, TreeNode } from './types';

/* ============================================================
   Workspace state — the live content tree plus every mutation
   ============================================================ */

const pageCache = new Map<string, string>();

export function cachedMarkdown(key: string): string | undefined {
  return pageCache.get(key);
}

export function putMarkdown(key: string, markdown: string) {
  pageCache.set(key, markdown);
}

export async function loadMarkdown(node: TreeNode): Promise<string> {
  const hit = pageCache.get(node.key);
  if (hit !== undefined) return hit;
  const raw = await fetchPageMarkdown(node);
  pageCache.set(node.key, raw);
  return raw;
}

export interface WorkspaceValue {
  tree: TreeNode[];
  pages: TreeNode[];
  byKey: Map<string, TreeNode>;
  parentsOf: (key: string) => TreeNode[];
  neighbours: (key: string) => { prev?: TreeNode; next?: TreeNode };
  editable: boolean;
  editMode: boolean;
  setEditMode: (on: boolean) => void;
  applyTree: (tree: TreeNode[] | undefined) => void;
  refresh: () => Promise<void>;
  /** Monotonic counter bumped whenever the tree changes, for effect deps. */
  revision: number;
}

const Ctx = createContext<WorkspaceValue | null>(null);

function flatten(nodes: TreeNode[], out: TreeNode[] = []): TreeNode[] {
  for (const n of nodes) {
    if (n.kind === 'page') out.push(n);
    else flatten(n.children, out);
  }
  return out;
}

function indexTree(nodes: TreeNode[]) {
  const byKey = new Map<string, TreeNode>();
  const parents = new Map<string, TreeNode[]>();
  const walk = (list: TreeNode[], trail: TreeNode[]) => {
    for (const n of list) {
      byKey.set(n.key, n);
      parents.set(n.key, trail);
      if (n.children.length) walk(n.children, [...trail, n]);
    }
  };
  walk(nodes, []);
  return { byKey, parents };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [tree, setTree] = useState<TreeNode[]>(initialTree);
  const [revision, setRevision] = useState(0);
  const [editMode, setEditModeState] = useState<boolean>(() => {
    if (!IS_EDITABLE) return false;
    try {
      return localStorage.getItem('ns:edit') === 'on';
    } catch {
      return false;
    }
  });

  const applyTree = useCallback((next: TreeNode[] | undefined) => {
    if (!next) return;
    setTree(next);
    setRevision((r) => r + 1);
  }, []);

  const refresh = useCallback(async () => {
    if (!IS_EDITABLE) return;
    try {
      const res = await api.tree();
      pageCache.clear();
      applyTree(res.tree);
    } catch {
      /* dev server not reachable — keep the current tree */
    }
  }, [applyTree]);

  const setEditMode = useCallback((on: boolean) => {
    if (!IS_EDITABLE) return;
    setEditModeState(on);
    try {
      localStorage.setItem('ns:edit', on ? 'on' : 'off');
    } catch {
      /* private mode */
    }
  }, []);

  // Markdown files edited outside the browser should still show up instantly.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!import.meta.hot) return;
    const handler = () => {
      void refreshRef.current();
    };
    import.meta.hot.on('notes:external-change', handler);
    return () => {
      import.meta.hot?.off('notes:external-change', handler);
    };
  }, []);

  const { byKey, parents } = useMemo(() => indexTree(tree), [tree]);
  const pages = useMemo(() => flatten(tree), [tree]);

  const parentsOf = useCallback((key: string) => parents.get(key) ?? [], [parents]);

  const neighbours = useCallback(
    (key: string) => {
      const i = pages.findIndex((p) => p.key === key);
      if (i === -1) return {};
      return { prev: pages[i - 1], next: pages[i + 1] };
    },
    [pages],
  );

  const value = useMemo<WorkspaceValue>(
    () => ({
      tree,
      pages,
      byKey,
      parentsOf,
      neighbours,
      editable: IS_EDITABLE,
      editMode: IS_EDITABLE && editMode,
      setEditMode,
      applyTree,
      refresh,
      revision,
    }),
    [tree, pages, byKey, parentsOf, neighbours, editMode, setEditMode, applyTree, refresh, revision],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}

/* ============================================================
   Mutations
   ============================================================ */

export function useTreeActions() {
  const { applyTree } = useWorkspace();

  return useMemo(
    () => ({
      async create(parentKey: string, kind: NodeKind, title: string) {
        const res = await api.createNode(parentKey, kind, title);
        applyTree(res.tree);
        return res.key as string;
      },
      async rename(key: string, title: string) {
        const res = await api.renameNode(key, title);
        const cached = pageCache.get(key);
        pageCache.delete(key);
        if (cached !== undefined && res.key) pageCache.set(res.key, cached);
        applyTree(res.tree);
        return res.key as string;
      },
      async updateMeta(key: string, meta: { description?: string; icon?: string; hue?: number }) {
        const res = await api.updateMeta(key, meta);
        pageCache.delete(key);
        applyTree(res.tree);
        return res.key as string;
      },
      async remove(key: string) {
        const res = await api.deleteNode(key);
        pageCache.delete(key);
        applyTree(res.tree);
      },
      async duplicate(key: string) {
        const res = await api.duplicateNode(key);
        applyTree(res.tree);
        return res.key as string;
      },
      async move(key: string, parentKey: string, index: number) {
        const res = await api.moveNode(key, parentKey, index);
        const cached = pageCache.get(key);
        pageCache.delete(key);
        if (cached !== undefined && res.key) pageCache.set(res.key, cached);
        applyTree(res.tree);
        return res.key as string;
      },
      async importMarkdown(parentKey: string, name: string, markdown: string) {
        const res = await api.importPage(parentKey, name, markdown);
        applyTree(res.tree);
        return res.key as string;
      },
    }),
    [applyTree],
  );
}
