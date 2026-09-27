/// <reference types="vite/client" />

declare module 'virtual:notes-tree' {
  import type { TreeNode } from './lib/types';
  export const tree: TreeNode[];
  export default tree;
}

declare module 'virtual:notes-search' {
  export const searchIndex: Record<string, string>;
  export default searchIndex;
}
