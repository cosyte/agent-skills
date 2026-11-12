---
id: cosyte-astm
title: The cosyte-astm skill
sidebar_label: cosyte-astm
description: "The cosyte-astm skill: when an agent should use @cosyte/astm to parse, build and frame ASTM lab analyzer messages, with an example prompt."
---

# The cosyte-astm skill

The `cosyte-astm` skill teaches an agent to use [`@cosyte/astm`](https://docs.cosyte.com/astm/intro). Its source is
[skills/cosyte-astm/SKILL.md](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-astm/SKILL.md); the sections below quote it.

## What it does

ASTM parser, serializer and builder for Node.js and TypeScript: lenient on parse, spec-clean on
emit. It reads the delimiters each `H` header declares, decodes escapes before it splits a value,
keeps the practice- and laboratory-assigned patient IDs distinct, and reports every tolerated
deviation as a stable, value-free warning instead of returning a value the bytes do not carry.

## When an agent should use it

- "Parse this ASTM message from the analyzer", a `CR`-delimited record stream starting `H|\^&`.
- Read a result's value, units, range, abnormal flag and status (final, correction, cancelled) from
  `R` records, with patient and order context from `P` and `O`.
- Split a stream holding several `H` to `L` messages so each patient keeps only its own results.
- Decode framed bytes (`STX`, frame number, checksum, `ETX`/`ETB`) from a serial port or socket,
  tell framed from raw TCP traffic, or drive the `ENQ`/`ACK`/`NAK`/`EOT` receiver side yourself.
- Map an analyzer's local test code to LOINC with a LIVD catalog you supply.
- Emit canonical records or framed bytes; read an ASTM timestamp without inventing a timezone.

Use another skill when: results arrive as HL7 v2 or over MLLP (cosyte-hl7, cosyte-mllp); you need
code systems or UCUM (cosyte-terminology); you need synthetic ASTM fixtures (cosyte-synth); you
must de-identify data (cosyte-deid); you are unsure which package fits (cosyte).

## Install

The skill comes with the rest of the collection: [install the skills](./installation.md) in your
agent, and in Claude Code with the plugin, run it as `/cosyte:cosyte-astm`. The skill then tells the
agent how to install the package:

```bash
pnpm add @cosyte/astm
# or
npm install @cosyte/astm
```

Node.js `>=22.0.0`; nothing below it is supported. Dual ESM and CJS (`dist/index.mjs`,
`dist/index.cjs`, each with its own declarations) from one entry point, `@cosyte/astm`. Zero
runtime dependencies, and the package imports no Node built-in.

## Example prompt

```text
Our lab analyzer sends ASTM E1394 records. Write a TypeScript function that returns
each result's value, units, status and abnormal flag, with the practice and laboratory
patient IDs. Test it on a synthetic record stream.
```

## Result

The request asks to read result values, units, flags and status from ASTM records sent by an analyzer, which the description of `cosyte-astm` lists. The agent loads the skill and follows its example, below. It is the code the skill
shows the agent for this task, not a recorded session: an agent's answer varies from run to run,
but the package, the API and the rules come from the skill.

From the README, where it runs on every test run. Every value is synthetic.

```ts no-run copied from the skill, and this repository has no sample runner yet
import { parseAstmRecords, patient, results } from "@cosyte/astm";

// Synthetic ASTM records, CR-delimited. The header declares the delimiters.
const stream =
  "H|\\^&|||analyzer^1|||||||P|LIS02-A2|20240115103000\r" +
  "P|1|PRACTICE-0001|LAB-0002|||||F\r" +
  "O|1|SPEC-7|ACC-42|^^^687|||20240115102500\r" +
  "R|1|^^^687|28.6|U/L|10-40|N||F\r" +
  "L|1|N\r";

const msg = parseAstmRecords(stream);
const [first] = results(msg);

console.log(first?.value, first?.units);
console.log(first?.status.meaning, first?.status.isActiveFinal);
console.log(first?.flag?.meaning);
console.log(first?.universalTestId?.localCode);
console.log(patient(msg)?.practiceAssignedId, patient(msg)?.laboratoryAssignedId);
console.log(msg.warnings.length);
```

```text
28.6 U/L
final true
normal
687
PRACTICE-0001 LAB-0002
0
```

Values and units are raw, never converted or defaulted. `status.isActiveFinal` is `true` only for
a plain `F`, so a correction (`C`) or cancellation (`X`) never reads as active final. An
unrecognized flag reads `undefined`, never `normal`. Results key on the vendor local code in the
Universal Test ID's fourth component.

## More in the skill

The skill also lists the [key API](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-astm/SKILL.md#key-api), the
[limits and known defects](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-astm/SKILL.md#limits-and-known-defects) and how to handle PHI
([PHI handling](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-astm/SKILL.md#phi-handling)). The package's own documentation is at
[docs.cosyte.com/astm/intro](https://docs.cosyte.com/astm/intro).
