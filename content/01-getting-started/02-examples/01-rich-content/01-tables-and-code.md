---
title: Tables and code
description: Sample blocks to check styling and the grid table editor.
tags: [sample, code, tables]
updated: 2026-09-15
---

## A table

Click the table in edit mode to get a real grid: tab across cells, enter to add rows, and per-column alignment.

| Block | Shortcut | Notes |
| --- | --- | --- |
| Heading | `## ` | Six levels |
| Code | ` ``` ` | Syntax highlighted |
| Table | `\|a\|b\|` | Edited as a grid |
| Diagram | `/mermaid` | Rendered live |

## Code

```typescript
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

```bash
npm run dev
```

## Quotes and callouts

> Plain quotes look like this.

> [!IMPORTANT]
> Callouts carry a keyword marker and pick up a colour.

---

## Lists

1. First
2. Second
   - Nested bullet
   - Another one
3. Third
