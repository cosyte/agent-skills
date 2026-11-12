---
id: how-agents-use-skills
title: How agents use the skills
sidebar_label: How agents use the skills
description: "How an agent decides to load a Cosyte skill, what the skill gives it, and why every fact in a skill is traced to the package's published sources."
---

# How agents use the skills

## A description decides when a skill loads

An agent that supports Agent Skills reads the `name` and `description` of every installed skill
up front, and loads a skill's full `SKILL.md` only when a request matches its description. So the
description carries the weight. Each of ours opens with what the package does, then says "Use when"
and lists the requests and data that should trigger it, in the words a developer would use: "parse
this HL7 message", "read an 835", "the MRN from PID". It ends with the neighbouring skills to use
instead, so an agent that loaded the wrong one can move on.

Claude Code also lets you run a skill by name. Installed as a plugin, the skills are namespaced:
`/cosyte:cosyte-hl7`.

## The router covers the case where no package is named

When a request names a data format but no package, the `cosyte` skill matches. It holds one table,
from the data or task to the package and its skill, and the rules that hold for every package. It
tells the agent to load the package skill before writing code. The same table, with the same rules,
opens the repository's `AGENTS.md`, for agents that read that file rather than skills; see
[Add the routing summary to AGENTS.md](./add-the-routing-summary.md).

## What a package skill gives the agent

Every package skill has the same sections, in the same order:

- **When to use it**, and which skill to use instead for the neighbouring tasks.
- **Install**: the install line, the Node.js version, the module formats and the runtime
  dependencies, including any optional peer the agent must add.
- **Minimal example**: a worked example on synthetic data, and in most skills its expected output.
- **Key API**: the names the agent should call, so it does not guess at a signature.
- **Limits and known defects**: what the package does not do, and the paths the agent must not
  rely on.
- **PHI handling**: what the package's errors and warnings may quote from the input, and so what is
  safe to log.

The body stays under 500 lines, as the Agent Skills specification asks. Where a package needs more,
such as recipes and full lists, it sits in a `references/` folder beside the skill, for the agent to
open when it needs it.

## Why every fact is traced

A skill is read by an agent writing code for healthcare data. A capability the package does not
have, a wrong signature or a missing known defect becomes code that mishandles a patient record.
So every fact in a skill comes from the package's published npm README, type declarations and
changelog at the version the skill names in `metadata.version`, or from the docs.cosyte.com page
the README links for that topic. Known defects are each confirmed against the published package
before they are listed.

Where an example's expected output follows from the README and the type declarations rather than
from a run, the skill says so beside it.

## What the skills ask of every agent

- Synthetic data only, in code, tests, fixtures, examples and prompts; `@cosyte/synth` generates
  it.
- Log diagnostic codes and positions, not message text or values. Some parse errors and builder
  refusals carry input values; the package skill says which.
- Read the warnings a parser returns, since they record every deviation it tolerated.
- Do not describe these libraries, or what they output, as compliant with any regulation.

## See also

- [Change a skill after a package release](./change-a-skill.md).
- [Testing and quality](./testing-and-quality.md): what the repository check proves, and what it
  cannot.
