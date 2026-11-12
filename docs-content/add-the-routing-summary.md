---
id: add-the-routing-summary
title: Add the routing summary to AGENTS.md
sidebar_label: Add the routing summary
description: "Copy the Cosyte routing table into your project's AGENTS.md so any agent that reads it picks the right @cosyte package."
---

# Add the routing summary to AGENTS.md

Many agents read an `AGENTS.md` file at the root of a project: Codex, Cursor, Claude Code when the
project has no `CLAUDE.md`, and the other tools listed at [agents.md](https://agents.md). Our
repository's `AGENTS.md` opens with a routing summary written to be copied into yours. It names the
package and the skill for each kind of healthcare data, and the rules that hold for every package.

## Steps

1. Open [AGENTS.md](https://github.com/cosyte/agent-skills/blob/main/AGENTS.md) in the
   repository.
2. Copy the section headed "Which skill to use", down to the line before "Working on this
   repository". It holds the routing table and the rules for every package.
3. Paste it into your project's `AGENTS.md`, creating the file at the project root if there is
   none.
4. If you have not installed the skills themselves, install them too
   ([Installation](./installation.md)). The table names a skill for each task; without the skills
   the agent still gets the package name, but not the worked example, the API names or the known
   defects.
5. When we add a package, the table in our `AGENTS.md` gains a row. Copy the section again to pick
   it up.

## Check it

Ask your agent a question the table routes, with synthetic data, for example "Read the payment
amount from this 835 file" with a test file. The agent should name `@cosyte/x12` and, if the skills
are installed, load `cosyte-x12`.

## See also

- [cosyte](./cosyte.md): the router skill, which carries the same table for agents that load
  skills.
- [How agents use the skills](./how-agents-use-skills.md).
