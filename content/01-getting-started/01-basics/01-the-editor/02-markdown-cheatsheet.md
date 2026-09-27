---
title: Markdown cheat sheet
description: Every shortcut the editor understands, in one page.
tags: [markdown, reference]
updated: 2026-09-15
---

## Typing shortcuts

These work exactly as you type them — the block re-renders as soon as you move on.

| Type this | You get |
| --- | --- |
| `# ` … `###### ` | Headings one to six |
| `- ` or `* ` | Bullet list |
| `1. ` | Numbered list |
| `- [ ] ` | Task list |
| `> ` | Quote |
| ` ``` ` + Enter | Code block |
| `---` | Divider |
| `\|a\|b\|` + Enter | Table |
| `/` | Block menu |

## Line breaks

<kbd>Enter</kbd> starts a new block. <kbd>Shift</kbd> <kbd>Enter</kbd> adds a line break inside the block you are already in, and the break shows up in the rendered page exactly where you typed it:

This line
and this line
are one block with two breaks.

## Inline

`**bold**`, `*italic*`, `~~strikethrough~~`, `` `code` ``, `[link](https://example.com)`.

Keyboard: <kbd>Ctrl</kbd> <kbd>B</kbd>, <kbd>Ctrl</kbd> <kbd>I</kbd>, <kbd>Ctrl</kbd> <kbd>E</kbd>, <kbd>Ctrl</kbd> <kbd>K</kbd>.

## Callouts

> [!NOTE]
> Blockquotes that start with `[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!DANGER]` or `[!IMPORTANT]` render as coloured callouts.

> [!WARNING]
> They are still valid markdown everywhere else.

## Task list

- [x] Install the workspace
- [ ] Write the first real page
- [ ] Delete the sample content

## Images

Images accept a size tag in the title slot, so a resize survives the round trip:

```markdown
![A diagram](./assets/diagram.png "=520x")
```

`=520x` is width only, `=520x300` sets both, and `=60%x` works too. Drag the corner handle on a selected image to write it for you.
