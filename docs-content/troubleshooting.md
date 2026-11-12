---
id: troubleshooting
title: Troubleshooting
sidebar_label: Troubleshooting
description: "What to do when a Cosyte skill does not load, loads the wrong package, or an install the skill names fails."
---

# Troubleshooting

## The agent does not load a skill

- Check where the folders went. Each skill is a folder holding `SKILL.md`, and the folder itself
  must sit in the agent's skills directory: `~/.claude/skills/cosyte-hl7/SKILL.md`, not
  `~/.claude/skills/skills/cosyte-hl7/SKILL.md`. The copy commands in
  [Installation](./installation.md) copy the folders, not their parent.
- In Claude Code with the plugin, run a skill by its namespaced name to confirm it is installed:
  `/cosyte:cosyte-hl7`.
- In Codex, restart it if a new skill does not appear.
- Name the format in your request. A skill loads when the request matches its description, so
  "parse this HL7 v2 message" matches where "read this file" may not.

## The Cursor rules do not attach

Our rules set `alwaysApply: false` and no `globs`, so Cursor pulls one in only when the agent
judges it relevant from its description. Add a `globs` pattern to a copied rule if you want it
attached whenever a matching file is in context. Use the skills or the rules, not both.

## The agent picks the wrong package

Load the router, `cosyte`, or name the package in the request. The [cosyte page](./cosyte.md) has
the table the router uses. Some formats look alike: an NCPDP pharmacy claim is not an X12 837, and
HL7 v2 over a socket needs both `cosyte-mllp` and `cosyte-hl7`.

## `npx @cosyte/cli` fails

`npx @cosyte/cli ...` fails with "could not determine executable to run", because the package
ships two executables. Use `npx --package @cosyte/cli cosyte ...`. Versions 0.0.1 and 0.0.2 cannot
be installed. The [cosyte-cli page](./cosyte-cli.md) has the details.

## `@cosyte/synth` and `@cosyte/deid` 0.2 will not install together

The `@cosyte/synth` peer range for `@cosyte/deid` does not admit the 0.2 line, so npm refuses the
pair with `ERESOLVE`. Pair synth with `@cosyte/deid` 0.1, as the [cosyte-synth page](./cosyte-synth.md)
says.

## A skill seems out of date

Each skill names the package version it was written against in `metadata.version`. If the
package has released since, the skill may lag; tell us in an
[issue](https://github.com/cosyte/agent-skills/issues), naming the skill and what differs.
