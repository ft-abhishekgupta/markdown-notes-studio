import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { buildSearchIndex, scanTree } from './content-tree';
import {
  ApiError,
  opCreateNode,
  opDeleteNode,
  opDuplicateNode,
  opImportPage,
  opMoveNode,
  opRenameNode,
  opSavePage,
  opUpdateMeta,
  opUploadAsset,
} from './notes-api';

const TREE_ID = 'virtual:notes-tree';
const RESOLVED_TREE_ID = '\0' + TREE_ID;
const SEARCH_ID = 'virtual:notes-search';
const RESOLVED_SEARCH_ID = '\0' + SEARCH_ID;

const API_PREFIX = '/__notes/api/';
const CONTENT_PREFIX = '/content/';

const MIME: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

const SERVEABLE = new Set(Object.keys(MIME));

function collectFiles(dir: string, base = ''): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full, rel));
    else if (SERVEABLE.has(path.extname(entry.name).toLowerCase())) out.push(rel);
  }
  return out;
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      // Generous cap so a pasted screenshot always fits, but not unbounded.
      if (data.length > 64 * 1024 * 1024) reject(new Error('Payload too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export interface NotesContentOptions {
  /** Content folder, relative to the Vite project root. */
  dir?: string;
}

export function notesContent(options: NotesContentOptions = {}): Plugin {
  const dirName = options.dir ?? 'content';
  let root = '';
  let contentRoot = '';
  let server: ViteDevServer | null = null;
  /** Suppresses the reload the plugin would otherwise trigger on its own writes. */
  let selfWriteUntil = 0;

  const invalidate = () => {
    if (!server) return;
    for (const id of [RESOLVED_TREE_ID, RESOLVED_SEARCH_ID]) {
      const mod = server.moduleGraph.getModuleById(id);
      if (mod) server.moduleGraph.invalidateModule(mod);
    }
  };

  return {
    name: 'notes-content',

    config(userConfig) {
      // Chokidar keeps an open handle on every directory it watches, and on
      // Windows that makes renaming a content folder fail with EPERM. The
      // plugin watches the tree itself with a single recursive fs.watch.
      const resolved = path.resolve(userConfig.root ?? process.cwd(), dirName).replace(/\\/g, '/');
      return { server: { watch: { ignored: [resolved, `${resolved}/**`] } } };
    },

    configResolved(config) {
      root = config.root;
      contentRoot = path.resolve(root, dirName);
    },

    resolveId(id) {
      if (id === TREE_ID) return RESOLVED_TREE_ID;
      if (id === SEARCH_ID) return RESOLVED_SEARCH_ID;
      return null;
    },

    load(id) {
      if (id === RESOLVED_TREE_ID) {
        const tree = scanTree(contentRoot);
        return `export const tree = ${JSON.stringify(tree)};\nexport default tree;`;
      }
      if (id === RESOLVED_SEARCH_ID) {
        return `export const searchIndex = ${JSON.stringify(buildSearchIndex(contentRoot))};\nexport default searchIndex;`;
      }
      return null;
    },

    /** Ship every markdown file and image into `dist/content` for the static site. */
    generateBundle() {
      for (const rel of collectFiles(contentRoot)) {
        if (rel.endsWith('_meta.json')) continue;
        this.emitFile({
          type: 'asset',
          fileName: `content/${rel}`,
          source: fs.readFileSync(path.join(contentRoot, rel)),
        });
      }
    },

    configureServer(devServer) {
      server = devServer;
      fs.mkdirSync(contentRoot, { recursive: true });

      // A single recursive watcher on the root only keeps one directory handle,
      // so renaming and moving folders underneath it stays possible.
      let watcher: fs.FSWatcher | null = null;
      let notifyTimer: NodeJS.Timeout | null = null;
      try {
        watcher = fs.watch(contentRoot, { recursive: true }, (_event, filename) => {
          invalidate();
          // Edits made through the in-browser editor already updated the UI;
          // reloading would throw away the caret. External edits do refresh.
          if (Date.now() < selfWriteUntil) return;
          if (notifyTimer) clearTimeout(notifyTimer);
          notifyTimer = setTimeout(() => {
            devServer.ws.send({
              type: 'custom',
              event: 'notes:external-change',
              data: { file: String(filename ?? '').replace(/\\/g, '/') },
            });
          }, 120);
        });
      } catch {
        /* recursive watching is unavailable on this platform — editing still works */
      }
      devServer.httpServer?.once('close', () => {
        if (notifyTimer) clearTimeout(notifyTimer);
        watcher?.close();
      });

      devServer.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];

        /* ---- raw content (markdown + images) ---- */
        if (url.startsWith(CONTENT_PREFIX)) {
          let rel: string;
          try {
            rel = decodeURIComponent(url.slice(CONTENT_PREFIX.length));
          } catch {
            res.statusCode = 400;
            res.end('Bad path');
            return;
          }
          const file = path.resolve(contentRoot, rel);
          if (file !== contentRoot && !file.startsWith(contentRoot + path.sep)) {
            res.statusCode = 403;
            res.end('Forbidden');
            return;
          }
          if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-store');
          res.end(fs.readFileSync(file));
          return;
        }

        /* ---- editing API ---- */
        if (!url.startsWith(API_PREFIX)) return next();

        const action = url.slice(API_PREFIX.length);
        void (async () => {
          const send = (status: number, payload: unknown) => {
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(payload));
          };
          try {
            const raw = req.method === 'POST' ? await readBody(req) : '{}';
            const input = raw ? JSON.parse(raw) : {};
            // Only writes should mute the external-change notification; a
            // read-only tree fetch must not swallow someone else's edit.
            const mutating = action !== 'tree';
            if (mutating) selfWriteUntil = Date.now() + 1500;

            let result: unknown = {};
            switch (action) {
              case 'tree':
                break;
              case 'node/create':
                result = opCreateNode(contentRoot, input);
                break;
              case 'node/rename':
                result = opRenameNode(contentRoot, input);
                break;
              case 'node/meta':
                result = opUpdateMeta(contentRoot, input);
                break;
              case 'node/delete':
                result = opDeleteNode(contentRoot, input);
                break;
              case 'node/duplicate':
                result = opDuplicateNode(contentRoot, input);
                break;
              case 'node/move':
                result = opMoveNode(contentRoot, input);
                break;
              case 'page/save':
                result = opSavePage(contentRoot, input);
                break;
              case 'page/import':
                result = opImportPage(contentRoot, input);
                break;
              case 'asset/upload':
                result = opUploadAsset(contentRoot, input);
                break;
              default:
                send(404, { ok: false, error: `Unknown action "${action}"` });
                return;
            }

            invalidate();
            if (mutating) selfWriteUntil = Date.now() + 1500;
            send(200, { ok: true, ...(result as object), tree: scanTree(contentRoot) });
          } catch (error) {
            const message = error instanceof ApiError ? error.message : String((error as Error)?.message ?? error);
            send(error instanceof ApiError ? 400 : 500, { ok: false, error: message });
          }
        })();
      });
    },
  };
}
