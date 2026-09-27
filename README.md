# Notes Studio

A local-first markdown workspace. Two kinds of thing, mapped straight onto the
disk: a **section** is a folder, a **page** is a markdown file. Pages can sit at
any level, and the tree goes four levels deep. In development the whole site is
editable in the browser; a production build is strictly read-only.

```bash
npm install
npm run dev      # http://localhost:5173  — editable
npm run build    # dist/  — read-only static site
npm run preview  # serve the built site
```

Or just double-click `start.bat`.

---

## How content is stored

```text
content/
  01-getting-started/                 ← section     (folder + _meta.json)
    01-basics/                        ← section     (folder + _meta.json)
      01-the-editor/                  ← section     (folder + _meta.json)
        01-welcome.md                 ← page        (markdown + frontmatter)
        assets/
          welcome-screenshot.png      ← images pasted into pages here
      02-a-loose-note.md              ← a page can sit at any level
```

* The `NN-` prefix is the sort order. It is rewritten automatically whenever you
  reorder something, so the folder listing always matches the sidebar.
* A page may live at any level. A section only nests while there is room left —
  the tree is four levels deep at most.
* `_meta.json` holds a section's `title`, `description`, `icon` and `hue`.
* Page frontmatter holds `title`, `description`, `tags` and `updated`.
* Routes use slug paths without the numeric prefixes
  (`#/p/getting-started/basics/the-editor/welcome`), so reordering never breaks a link.

Everything is plain text — `git diff` stays readable.

---

## Editing

Flip the header toggle to **Editing** (development builds only).

### Blocks

The page is a column of markdown blocks. The one you are working in shows its raw
markdown; every other block stays rendered, so the page always looks like the page.

| Action | Result |
| --- | --- |
| Click any block | Edit it, with the caret near where you clicked |
| `Enter` | Split the block / continue a list or quote |
| `Shift`+`Enter` | Line break inside the same block |
| `Tab` / `Shift`+`Tab` | Nest or un-nest a list item, renumbering it |
| `Backspace` at the start | Merge into the block above (or strip its marker) |
| `↑` / `↓` at the edges | Move between blocks |
| Drag the ⠿ handle | Reorder blocks |
| Click the ⠿ handle | Turn into…, duplicate, copy markdown, move, delete |
| `Esc` | Stop editing the block |

Nested ordered lists restart at 1, and indenting uses the parent item's content
column so the nesting is real markdown rather than a flat list that merely looks
indented in the source.

Newlines render where you typed them, the way GitHub comments behave — a single
line break in the source is a line break on the page, not a collapsed space.
Blank lines still start a new block.

### Typing shortcuts

`# `…`###### `, `- `, `* `, `1. `, `- [ ] `, `> `, `---`, ` ``` ` + `Enter`,
`|a|b|` + `Enter`, and `/` for the block menu. Inline: `**bold**`, `*italic*`,
`~~strike~~`, `` `code` ``, `[text](url)`.

Keyboard: <kbd>Ctrl</kbd>+<kbd>B</kbd>, <kbd>Ctrl</kbd>+<kbd>I</kbd>,
<kbd>Ctrl</kbd>+<kbd>E</kbd>, <kbd>Ctrl</kbd>+<kbd>K</kbd>,
<kbd>Shift</kbd>+<kbd>Enter</kbd> (line break),
<kbd>Ctrl</kbd>+<kbd>Enter</kbd> (new block), <kbd>Ctrl</kbd>+<kbd>S</kbd> (save now).

### Block types

* **Headings, lists, task lists, quotes** — styled live while you type.
* **Callouts** — a quote starting with `[!TIP]`, `[!NOTE]`, `[!WARNING]`,
  `[!DANGER]` or `[!IMPORTANT]`.
* **Code** — fenced, with a language box and syntax highlighting.
* **Mermaid** — source on the left, diagram rendering live on the right.
* **Tables** — edited as a real grid: `Tab` across, `Enter` down, per-column
  alignment, add/remove rows and columns. Saved as standard GFM pipe tables.
* **Images** — see below.
* **Dividers** and raw **HTML** (`<details>` toggles and friends).

### Pasting

* **Screenshot / image file** → uploaded to `assets/` beside the page and inserted.
* **Markdown** → split into real blocks and rendered immediately.
* **Rich text from a web page** (`text/html`) → converted to markdown.
* **A URL over a selection** → `[selection](url)`. On its own → an autolink.
* Images can also be dropped onto a block.

### Images

Size is stored in the markdown title slot so it round-trips through any other tool:

```markdown
![Alt text](./assets/diagram.png "=520x")
```

`=520x` is width only, `=520x300` sets both, `=60%x` works too. Drag the corner
handle to resize, use the 25 / 50 / 75 / Full presets, type an exact value, or open
the image full screen (also available to readers, with zoom).

### Markdown mode

The **Markdown** tab swaps the block editor for the whole document as source, with
a live preview beside it. Pasting images works there too.

Editing a `.md` file in another editor while the site is open works as well — the
page and the sidebar refresh themselves.

### Organising

In the sidebar every row can be dragged: drop **between** rows to reorder, or
**onto** a section to move inside it. Each row's `…` menu adds a page or a
section, renames, duplicates, imports markdown files and deletes. Double-click a
row to rename it inline. Files and folders on disk follow immediately.

Import any `.md` file with the **Import** button (or a folder's `…` menu) — its
first `# Heading` becomes the page title.

The navigation itself collapses with the button at the far left of the header, or
<kbd>Ctrl</kbd>+<kbd>\\</kbd>. On a wide screen the column closes and the page
reflows to full width; on a narrow one it slides over the content. The choice is
remembered.

---

## Production

`npm run build` writes `dist/`, including `dist/content/**` with every markdown file
and image so the site serves them statically. The editing API, toolbars, sidebar
controls and edit toggle are all compiled out — `import.meta.env.DEV` gates them —
so the published site is read-only.

The build uses a relative base and a hash router, so `dist/` can be opened from a
file share, GitHub Pages, or any static host without configuration.

---

## Checks

```bash
npm run typecheck
npm run smoke:api    # dev server API (needs `npm run dev` on port 5199)
npm run smoke:ui     # real browser: editing, pasting, dragging, resizing
npm run smoke:drag   # native drag-and-drop and empty-block selection
npm run smoke:lists  # list continuation, nesting and renumbering
npm run smoke:menus  # pop-up menus paint above the page
npm run smoke:nav    # the left navigation collapses and overlays correctly
npm run smoke:watch  # edits made outside the browser flow through
npm run smoke:prod   # production build is read-only (needs `npm run preview`)
```

The browser checks use `puppeteer-core` with the Chrome or Edge already installed
on the machine.
