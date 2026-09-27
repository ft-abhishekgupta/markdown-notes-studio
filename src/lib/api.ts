import type { NodeKind, TreeNode } from './types';

/* ============================================================
   Dev-server API client

   Every mutation returns the freshly scanned tree so the UI can
   stay in sync without a page reload.
   ============================================================ */

export const IS_EDITABLE = import.meta.env.DEV;

const API = '/__notes/api/';

export interface ApiResult {
  ok: boolean;
  key?: string;
  url?: string;
  file?: string;
  bytes?: number;
  tree?: TreeNode[];
  error?: string;
}

async function call(action: string, body: unknown = {}): Promise<ApiResult> {
  if (!IS_EDITABLE) throw new Error('This build is read-only');
  const res = await fetch(API + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let payload: ApiResult;
  try {
    payload = (await res.json()) as ApiResult;
  } catch {
    throw new Error(`Server returned ${res.status}`);
  }
  if (!res.ok || !payload.ok) throw new Error(payload.error || `Server returned ${res.status}`);
  return payload;
}

export const api = {
  tree: () => call('tree'),
  createNode: (parentKey: string, kind: NodeKind, title: string) =>
    call('node/create', { parentKey, kind, title }),
  renameNode: (key: string, title: string) => call('node/rename', { key, title }),
  updateMeta: (key: string, meta: { description?: string; icon?: string; hue?: number }) =>
    call('node/meta', { key, ...meta }),
  deleteNode: (key: string) => call('node/delete', { key }),
  duplicateNode: (key: string) => call('node/duplicate', { key }),
  moveNode: (key: string, parentKey: string, index: number) => call('node/move', { key, parentKey, index }),
  savePage: (key: string, markdown: string, meta: { title?: string; description?: string; tags?: string[] }) =>
    call('page/save', { key, markdown, ...meta }),
  importPage: (parentKey: string, name: string, markdown: string) =>
    call('page/import', { parentKey, name, markdown }),
  uploadAsset: (key: string, data: string, mime: string, name?: string) =>
    call('asset/upload', { key, data, mime, name }),
};

/* ---------------- static content fetching ---------------- */

/** Base the app is served from — `/` in dev, `./` in a relative production build. */
export const BASE = import.meta.env.BASE_URL || '/';

export function contentUrl(relPath: string): string {
  const clean = relPath.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  return `${BASE}${BASE.endsWith('/') ? '' : '/'}content/${clean}`;
}

/** Resolves a markdown image source against the folder its page lives in. */
export function resolveAssetUrl(src: string, pageDir: string): string {
  if (!src) return src;
  if (/^(https?:|data:|blob:|#|mailto:)/i.test(src)) return src;
  if (src.startsWith('/')) return src;
  const parts = `${pageDir}/${src}`.split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return contentUrl(stack.join('/'));
}

export async function fetchPageMarkdown(node: TreeNode): Promise<string> {
  const res = await fetch(contentUrl(node.path), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load ${node.path}`);
  return res.text();
}
