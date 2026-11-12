---
id: cosyte-pathways-migrate
title: The cosyte-pathways-migrate skill
sidebar_label: cosyte-pathways-migrate
description: "The cosyte-pathways-migrate skill: how an agent converts a channel exported from another integration engine into a Pathways channel, with an example prompt."
---

# The cosyte-pathways-migrate skill

The `cosyte-pathways-migrate` skill teaches an agent to convert a channel exported as XML from
another healthcare integration engine into a channel for
[`@cosyte/pathways`](https://www.npmjs.com/package/@cosyte/pathways), our code-first engine. Its
source is
[skills/cosyte-pathways-migrate/SKILL.md](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-pathways-migrate/SKILL.md);
the sections below quote it.

## What it does

Three scripts do the deterministic work, and the agent does the rewriting:

- `read-export.mjs` reads the export, refusing a DOCTYPE, any entity other than the five XML
  predefines and input over its limits, and writes `channels/<name>/` (`channel.yaml`, a
  `transform.ts` skeleton with one marker per step, and stub modules for shared code) and
  `migration/<name>/` (each exported script as a file to read, a normalised model, and the
  migration report as Markdown and JSON).
- The agent rewrites each script step in TypeScript, never running one, and marks it rewritten or
  dropped.
- `check-migration.mjs` runs the PHI scan on the output, writes the report again, and exits
  non-zero while any step is pending.
- `try-channel.mjs` writes @cosyte/synth inputs into the channel's tests, saves its current output
  as expected files marked unreviewed, and runs `pathways test`, and with the team's de-identified
  pairs, `pathways verify --samples`.

The result is a starting point, not a proved conversion: a conversion is proved only against input
and output pairs a team supplies, de-identified. Every destination is written to run dry and every
source listens on `127.0.0.1`, and the skill runs a channel on files only.

## When an agent should use it

- "Move this channel to Pathways", "port our interface off our current engine".
- The user has a channel export: an XML file whose root element is `channel`, with a
  `sourceConnector` and `destinationConnectors`.
- "What of this channel would Pathways run?"

Use another skill when:

- You write a new Pathways channel with no export behind it: the Pathways documentation covers it.
- You need the HL7 v2 API inside a transform: use cosyte-hl7. You need test messages: cosyte-synth.

## Install

The skill comes with the rest of the collection: [install the skills](./installation.md) in your
agent, and in Claude Code with the plugin, run it as `/cosyte:cosyte-pathways-migrate`. Its scripts
need Node.js 22 or later and nothing installed. The project it writes into needs Node.js 24 or
later and the packages the skill tells the agent to install:

```bash
npm install --save-dev @cosyte/pathways @cosyte/synth @cosyte/hl7
```

## Example prompt

```text
Here is our ADT feed exported from our current engine (exports/adt-feed.xml) and its
configuration map (exports/config-map.xml). Convert it into a Pathways channel in this
project, tell me what could not be converted, and do not run any of its scripts.
```

## Result

The request names a channel export and asks for a Pathways channel, which the description of
`cosyte-pathways-migrate` lists. The agent loads the skill and runs its reader first. This is what
the reader prints for the skill's own synthetic test export, which we wrote from scratch; an
agent's answer around it varies from run to run.

```bash
node ${CLAUDE_SKILL_DIR}/scripts/read-export.mjs exports/adt-feed.xml --out . \
  --config-map exports/config-map.xml
```

```text
synth-adt-feed: 21 elements; converted 6, with a flag 4, rewritten 0, waiting for a rewrite 5, not converted 6; steps pending 8; PHI findings 0.
See migration/synth-adt-feed/MIGRATION-REPORT.md.
```

It exits 1, since eight steps wait for a rewrite. The agent then reads each step's file under
`migration/synth-adt-feed/source/`, rewrites it in `transform.ts`, and runs `check-migration.mjs`
until it exits 0.

## More in the skill

The skill also gives the rules that hold every time, how each piece of an export maps to Pathways,
the exit codes, the limits of Pathways 0.0.3 that leave some elements not converted, and how to
handle PHI. Its
[reference](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-pathways-migrate/references/REFERENCE.md)
holds the full conversion table and the model and report formats.
