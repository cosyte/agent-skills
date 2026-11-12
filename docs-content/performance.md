---
id: performance
title: Performance
sidebar_label: Performance
description: "What a Cosyte skill costs an agent: the context it reads to choose a skill and the text it loads when one applies."
---

# Performance

A skill runs no code, so it has no throughput or latency of its own. What it costs is context: the
text an agent reads. The speed of the code an agent writes with a skill is the package's, and each
package's documentation on [docs.cosyte.com](https://docs.cosyte.com/) has its own performance
page.

## What a skill costs

- **Before any skill loads**, an agent reads the `name` and `description` of every installed
  skill. A description is at most 1,024 characters, which the repository check enforces.
- **When a skill applies**, the agent reads the body of its `SKILL.md`. The check holds each body
  under 500 lines, the limit the Agent Skills specification recommends.
- **Only when it needs them**, the agent opens a skill's `references/` files. They cost nothing
  until then.

Installing all 16 skills adds 16 descriptions to what an agent reads up front. If your project uses
only a few formats, copy only those skill folders, plus `cosyte` if you want the router.

## How to measure it yourself

The sizes are the files themselves. From a clone of the repository:

```bash
wc -l skills/*/SKILL.md
wc -c skills/*/SKILL.md
```

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
