export type NodeKind = 'section' | 'page';

/** Levels the tree may occupy, counting both sections and pages. */
export const MAX_DEPTH = 4;

/** Deepest index a section may sit at — it still needs room for a child. */
export const MAX_SECTION_DEPTH = MAX_DEPTH - 2;

export interface Heading {
  depth: number;
  text: string;
  id: string;
}

export interface TreeNode {
  kind: NodeKind;
  /** Stable route key — the slug path without the numeric order prefixes. */
  key: string;
  /** Real path under the content root (pages include the `.md` suffix). */
  path: string;
  /** Directory the node lives in, relative to the content root. */
  dir: string;
  slug: string;
  order: number;
  title: string;
  description: string;
  icon: string;
  hue: number;
  tags: string[];
  updated: string;
  words: number;
  minutes: number;
  headings: Heading[];
  children: TreeNode[];
}

export const KIND_LABEL: Record<NodeKind, string> = {
  section: 'Section',
  page: 'Page',
};

/** Depth index of a node, derived from its slug path. Root children are 0. */
export function depthOfKey(key: string): number {
  return key ? key.split('/').length - 1 : -1;
}

/** Can a child of this parent be a section, or is there no room left? */
export function canHoldSection(parentKey: string): boolean {
  return depthOfKey(parentKey) + 1 <= MAX_SECTION_DEPTH;
}

/** Can anything at all be added under this parent? */
export function canHoldChildren(parentKey: string): boolean {
  return depthOfKey(parentKey) + 1 < MAX_DEPTH;
}

/** How many section levels sit under a node. */
export function sectionDepth(node: TreeNode): number {
  let deepest = 0;
  for (const child of node.children) {
    if (child.kind === 'page') continue;
    deepest = Math.max(deepest, 1 + sectionDepth(child));
  }
  return deepest;
}
