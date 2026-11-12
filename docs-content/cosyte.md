---
id: cosyte
title: The cosyte skill
sidebar_label: cosyte (router)
description: "The cosyte router skill: how an agent picks the right @cosyte package when a request names a healthcare format but no package, with an example prompt."
---

# The cosyte skill

The `cosyte` skill is the router. It holds no package API; it tells an agent which `@cosyte`
package fits the data in front of it, and to load that package's skill before writing code. Its
source is [skills/cosyte/SKILL.md](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte/SKILL.md).

## What it does

It maps the data or the task to a package and its skill, names the common combinations, and states
how the parsers behave and the PHI rules that hold for every package:

- `@cosyte/x12`, `ccda`, `ncpdp` and `astm` are lenient on parse and spec-clean on emit: a tolerated
  deviation becomes a warning with a stable code, so read the warnings.
- Dates are not JavaScript `Date` objects, and no parser assumes a timezone.
- No round trip is promised byte for byte unless the package skill says the package guarantees one.
- Synthetic data only; log diagnostic codes and positions, not values; and never describe these
  libraries, or what they output, as compliant with any regulation.

## When an agent should use it

When a request is about a healthcare data standard in Node.js or TypeScript and names no package:
parse, read, validate, build, convert, de-identify or generate test data for HL7 v2, MLLP, X12,
FHIR R4, C-CDA, DICOM, NCPDP, ASTM, code systems, HL7 v2 to FHIR conversion, or a command line or
MCP server for these. Also when the request mentions Cosyte or any `@cosyte` package.

The routing table, as the skill gives it:

| The data or task | Package | Skill |
| --- | --- | --- |
| HL7 v2 message text (pipe-delimited, starts with MSH; ADT, ORU, ORM, SIU; segments like PID, OBX) | `@cosyte/hl7` | [cosyte-hl7](./cosyte-hl7.md) |
| Sending or receiving HL7 v2 over TCP with MLLP framing, ACKs, TLS | `@cosyte/mllp` | [cosyte-mllp](./cosyte-mllp.md) |
| X12 EDI (`ISA*...~`): 835, 837P/I/D, 270, 271, 276, 277, 278, 820, 834, 999, TA1 | `@cosyte/x12` | [cosyte-x12](./cosyte-x12.md) |
| FHIR R4 JSON or XML resources and bundles, FHIR validation | `@cosyte/fhir` | [cosyte-fhir](./cosyte-fhir.md) |
| C-CDA or CDA R2 XML documents (CCD, discharge summary, referral note) | `@cosyte/ccda` | [cosyte-ccda](./cosyte-ccda.md) |
| DICOM Part 10 files (`.dcm`), tags, metadata, pixel data fragments | `@cosyte/dicom` | [cosyte-dicom](./cosyte-dicom.md) |
| NCPDP Telecom pharmacy claims or SCRIPT e-prescriptions (NewRx) | `@cosyte/ncpdp` | [cosyte-ncpdp](./cosyte-ncpdp.md) |
| ASTM E1394 or E1381 lab analyzer records and framed byte streams | `@cosyte/astm` | [cosyte-astm](./cosyte-astm.md) |
| Code systems, ConceptMap `$translate`, `$lookup`, `$validate-code`, UCUM units, RxNorm | `@cosyte/terminology` | [cosyte-terminology](./cosyte-terminology.md) |
| Converting HL7 v2 messages to FHIR R4 | `@cosyte/transform` | [cosyte-transform](./cosyte-transform.md) |
| Removing identifiers from any of the formats above | `@cosyte/deid` | [cosyte-deid](./cosyte-deid.md) |
| Generating synthetic test fixtures in any of the formats above | `@cosyte/synth` | [cosyte-synth](./cosyte-synth.md) |
| Doing any of this from a terminal, in CI by exit code, or through an MCP server | `@cosyte/cli` | [cosyte-cli](./cosyte-cli.md) |
| Converting a parsed date or timestamp to ISO 8601, Temporal or an instant | `@cosyte/dates` | [cosyte-dates](./cosyte-dates.md) |

Common combinations: receive HL7 v2 over the network and read it with `cosyte-mllp`, then
`cosyte-hl7`; convert HL7 v2 to FHIR with `cosyte-transform`, then `cosyte-fhir` to validate or
serialize the result; test any parser with input from `cosyte-synth`; share data outside its
origin with `cosyte-deid`, then review what it reports.

## Install

The skill comes with the rest of the collection: [install the skills](./installation.md) in your
agent, and in Claude Code with the plugin, run it as `/cosyte:cosyte`. It installs no package
itself. It gives the install line in one form, to be adapted to the package it routes to:

```bash
npm install @cosyte/hl7
```

`pnpm add` and `yarn add` work the same way. Every package needs Node.js 22 or later.

## Example prompt

```text
Our lab analyzer sends records that start with H|\^& and end with an L record. Write a
TypeScript function that pulls out the result values and their units. Test it on a
synthetic record stream.
```

## Result

The request is about healthcare data and names no package, so the agent loads `cosyte`. The table
routes ASTM E1394 lab analyzer records to `@cosyte/astm`, so the agent loads
[cosyte-astm](./cosyte-astm.md), installs `@cosyte/astm`, and follows that skill's example: it
calls `parseAstmRecords` and reads each result's value and units through `results`. For
synthetic input, the router points it at `@cosyte/synth` rather than real analyzer output.

This is what the skill directs, not a recorded session: an agent's answer varies from run to run.

## More in the skill

The skill also links the documentation for every package, at [docs.cosyte.com](https://docs.cosyte.com/),
the source at [github.com/cosyte](https://github.com/cosyte), and the npm scope at
[npmjs.com/org/cosyte](https://www.npmjs.com/org/cosyte).
