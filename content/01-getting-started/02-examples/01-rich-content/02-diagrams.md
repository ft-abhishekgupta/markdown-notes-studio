---
title: Diagrams
description: Mermaid renders live while you type.
tags: [sample, mermaid]
updated: 2026-09-15
---

## Flowchart

```mermaid
flowchart LR
  A[Edit a block] --> B{Changed?}
  B -->|yes| C[Write the .md file]
  B -->|no| A
  C --> D[Sidebar updates]
```

## Sequence

```mermaid
sequenceDiagram
  participant Browser
  participant DevServer
  participant Disk
  Browser->>DevServer: POST /__notes/api/page/save
  DevServer->>Disk: write 01-page.md
  DevServer-->>Browser: fresh content tree
```

Editing a diagram shows the source on the left and the picture on the right.
