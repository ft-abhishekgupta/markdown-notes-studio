---
title: Welcome
description: A two minute tour of the editor and where your words end up.
tags: [start, editor]
updated: 2026-09-15
---

This workspace is a folder of plain markdown files. The website is just a nice way to read and write them — nothing is hidden in a database. EDITED-MARKER

### Shortcut Heading

```ts
const answer = 42;
```

## Reading vs editing

The header has a **Reading / Editing** toggle. It only appears when you run the site with `npm run dev`. A production build is always read-only.

> [!TIP]
> Press <kbd>Ctrl</kbd> <kbd>K</kbd> anywhere to search every page.

## Writing

Click any paragraph to edit it in place. The block you are editing shows its raw markdown; everything else stays rendered, so the page always looks like the page.

- Type `## ` for a heading, `- ` for a list, `> ` for a quote
- Type ` ``` ` then <kbd>Enter</kbd> for a code block
- Type `/` on an empty line for the full block menu
- Press <kbd>Shift</kbd> <kbd>Enter</kbd> for a line break inside the same block
- Paste a screenshot straight from the clipboard and it is written next to this file

## Where things are saved

| What you do | What happens on disk |
| --- | --- |
| Edit a page | The `.md` file is rewritten |
| Add a section | A numbered folder appears under `content/` |
| Paste an image | A file lands in `assets/` beside the page |
| Reorder anything | The numeric filename prefixes are renumbered |

Everything is ordinary text, so `git diff` stays readable.

| Column A | Column B | Column C |
| -------- | -------- | -------- |
| cell-one |          |          |
|          |          |          |
|          |          |          |
