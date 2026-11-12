---
id: installation
title: Install the skills
sidebar_label: Installation
description: "Add the Cosyte skills to Claude Code, OpenAI Codex, Cursor or any agent that reads Agent Skills or AGENTS.md."
---

# Install the skills

Every method below comes from the tool's own documentation, read on 2026-11-07; the repository's
[SOURCES.md](https://github.com/cosyte/agent-skills/blob/main/SOURCES.md) has the links. We have
checked the file layout against those documents, but we have not yet run an install in each tool.
Tell us in an [issue](https://github.com/cosyte/agent-skills/issues) if one does not work as
written.

Installing a skill does not install a package. When an agent uses a skill, the skill tells it which
`@cosyte` package to add to your project, and the agent runs that install itself.

Most methods copy the skill folders, so start with a clone:

```bash
git clone https://github.com/cosyte/agent-skills.git
```

## Claude Code

As a plugin, from inside a Claude Code session:

```text
/plugin marketplace add cosyte/agent-skills
/plugin install cosyte@cosyte
```

Or from your shell:

```bash
claude plugin marketplace add cosyte/agent-skills
claude plugin install cosyte@cosyte
```

Plugin skills are namespaced, so the HL7 skill runs as `/cosyte:cosyte-hl7`. Claude also loads a
skill on its own when your request matches its description. The repository root is both the
marketplace (`.claude-plugin/marketplace.json`) and the plugin (`.claude-plugin/plugin.json` plus
`skills/`). The plugin sets no `version`, so Claude Code takes its version from the commit and an
update follows `main`.

Or copy the folders. For every project on your machine:

```bash
mkdir -p ~/.claude/skills && cp -R agent-skills/skills/* ~/.claude/skills/
```

For one project, committed so your team gets them, run this from the project root:

```bash
mkdir -p .claude/skills && cp -R /path/to/agent-skills/skills/* .claude/skills/
```

## OpenAI Codex

Codex reads `SKILL.md` folders from `.agents/skills` in the repository (from the working directory
up to the repository root) and from `$HOME/.agents/skills` for your user.

```bash
mkdir -p ~/.agents/skills && cp -R agent-skills/skills/* ~/.agents/skills/
```

For one repository, copy into `.agents/skills/` at its root instead. Codex picks up new skills on
its own; restart it if one does not appear.

## Cursor

Cursor loads `SKILL.md` folders from `.agents/skills/` and `.cursor/skills/` in a project and from
`~/.agents/skills/` and `~/.cursor/skills/` for your user. It also reads the Claude and Codex skill
folders. The same copy commands work:

```bash
mkdir -p .cursor/skills && cp -R /path/to/agent-skills/skills/* .cursor/skills/
```

We also ship one project rule per skill in `.cursor/rules/`. They are generated from the skills,
set to `alwaysApply: false`, and carry the skill's description, so the agent pulls a rule in when
it is relevant. They set no `globs`. Cursor does not import rules from a repository on its own, so
copy them:

```bash
mkdir -p .cursor/rules && cp /path/to/agent-skills/.cursor/rules/*.mdc .cursor/rules/
```

Use the skills or the rules; you do not need both.

## Other agents

Any agent that follows the Agent Skills format can load the folders in `skills/`; check that
agent's documentation for its skills directory. For an agent that reads `AGENTS.md`, see
[Add the routing summary to AGENTS.md](./add-the-routing-summary.md).

## The MCP server

`@cosyte/cli` ships a local MCP server, `cosyte-mcp`. The skills do not need it. The
[cosyte-cli page](./cosyte-cli.md) shows how to register it in Claude Code, Codex and Cursor.

## Next

Follow the [Quickstart](./quickstart.md) to see a skill at work, or browse the
[skills](./intro.md#the-skills).
