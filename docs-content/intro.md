---
id: intro
title: Cosyte agent skills
sidebar_label: Overview
description: "Agent Skills that point AI coding agents at the right @cosyte package for a healthcare data task and show them how to use it."
---

# Cosyte agent skills

Our agent skills teach AI coding agents when and how to use Cosyte's MIT-licensed TypeScript
libraries for healthcare data standards. When you ask an agent to "parse this HL7 message in Node"
or "read this 835", the matching skill points it at the right `@cosyte` package and gives it the
install line, a worked example on synthetic data, the key API names, the limits and known defects
the package has today, and how to handle PHI.

The skills follow the [Agent Skills](https://agentskills.io/specification) format: one folder per
skill, each with a `SKILL.md` whose `name` and `description` front matter tell an agent when to
load it. The same folders work in Claude Code, OpenAI Codex and Cursor. For Cursor we also ship one
project rule per skill, and for any tool that reads `AGENTS.md` we ship a routing summary.

## Who it is for

- Developers who use an AI coding agent on Node.js or TypeScript code that reads, writes, converts
  or de-identifies healthcare data.
- Teams that want every agent in a project to reach for the same package and follow the same PHI
  rules.

## What it is not

- It is not a library. The skills hold no code that runs in your application; they tell an agent
  which `@cosyte` package to install and how to call it.
- It is not a substitute for the package documentation. Each skill links the package's own pages on
  docs.cosyte.com, and every fact in a skill comes from the package's published README, type
  declarations and changelog.
- It makes no compliance claim. The skills tell agents to use synthetic data and to log codes rather
  than values; transport, storage, retention, access control and your own logs remain your
  responsibility.

## The skills

There are 15 skills: one for each of the 14 `@cosyte` packages, plus the `cosyte` router. Each has
a page here with what it does, when an agent should use it, how to install it, and an example
prompt with its result.

| Skill | Package | Use it for |
| --- | --- | --- |
| [cosyte](./cosyte.md) | all | Choosing the right package for a healthcare data task |
| [cosyte-hl7](./cosyte-hl7.md) | `@cosyte/hl7` | HL7 v2 messages: parse, read, build, serialize |
| [cosyte-mllp](./cosyte-mllp.md) | `@cosyte/mllp` | Sending and receiving HL7 v2 over MLLP |
| [cosyte-x12](./cosyte-x12.md) | `@cosyte/x12` | X12 EDI: 835, 837, 270, 271 and the other 005010 sets |
| [cosyte-fhir](./cosyte-fhir.md) | `@cosyte/fhir` | FHIR R4 resources, JSON and XML, validation |
| [cosyte-ccda](./cosyte-ccda.md) | `@cosyte/ccda` | C-CDA documents |
| [cosyte-dicom](./cosyte-dicom.md) | `@cosyte/dicom` | DICOM Part 10 files and metadata |
| [cosyte-ncpdp](./cosyte-ncpdp.md) | `@cosyte/ncpdp` | NCPDP Telecom claims and SCRIPT e-prescriptions |
| [cosyte-astm](./cosyte-astm.md) | `@cosyte/astm` | ASTM lab analyzer records and streams |
| [cosyte-terminology](./cosyte-terminology.md) | `@cosyte/terminology` | Code systems, ConceptMaps, UCUM, RxNorm |
| [cosyte-transform](./cosyte-transform.md) | `@cosyte/transform` | HL7 v2 to FHIR R4 conversion |
| [cosyte-deid](./cosyte-deid.md) | `@cosyte/deid` | De-identification across the formats above |
| [cosyte-synth](./cosyte-synth.md) | `@cosyte/synth` | Synthetic test fixtures |
| [cosyte-cli](./cosyte-cli.md) | `@cosyte/cli` | The `cosyte` command and the `cosyte-mcp` MCP server |
| [cosyte-dates](./cosyte-dates.md) | `@cosyte/dates` | Dates and timestamps from the parsers |

## Where to go next

- [Installation](./installation.md): add the skills to Claude Code, OpenAI Codex, Cursor or another
  agent.
- [Quickstart](./quickstart.md): install the plugin in Claude Code and ask for your first parse.
- [How agents use the skills](./how-agents-use-skills.md): how an agent picks a skill, and where the
  facts in each one come from.
- The source: [cosyte/agent-skills](https://github.com/cosyte/agent-skills) on GitHub.
