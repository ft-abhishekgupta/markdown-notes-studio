---
title: Structure
description: Sections and pages — folders and files, nothing else.
tags: [structure, navigation]
updated: 2026-09-15
---

There are only two kinds of thing here, and they map straight onto the disk: a **section** is a folder, a **page** is a markdown file.

```text
content/
  01-getting-started/          ← section  (folder)
    01-basics/                 ← section  (folder)
      01-the-editor/           ← section  (folder)
        01-welcome.md          ← page     (file)
        assets/                ← images pasted into pages here
      02-a-loose-note.md       ← a page can sit at any level
```

## Rules

1. Sections are folders, pages are `.md` files.
2. A page can live at **any** level — directly in a section or right at the root.
3. The tree goes four levels deep at most, so a section only nests while there is room left for its contents.
4. The `NN-` prefix is the sort order and is rewritten automatically.
5. `_meta.json` holds the display title, description, icon and hue of a section.

## Reorganising

In edit mode every row in the sidebar can be dragged. Drop **between** two rows to reorder them, or **onto** a section to move inside it. Sections carry everything they contain with them, and a page takes its images along too.

The `…` menu on each row adds a page or a section, renames, duplicates, imports and deletes.

> [!TIP]
> Double-click any row to rename it inline.
