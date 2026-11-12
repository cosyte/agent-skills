---
id: cosyte-hl7
title: The cosyte-hl7 skill
sidebar_label: cosyte-hl7
description: "The cosyte-hl7 skill: when an agent should use @cosyte/hl7 to parse, read, edit and serialize HL7 v2 messages, with an example prompt."
---

# The cosyte-hl7 skill

The `cosyte-hl7` skill teaches an agent to use [`@cosyte/hl7`](https://docs.cosyte.com/hl7/intro). Its source is
[skills/cosyte-hl7/SKILL.md](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-hl7/SKILL.md); the sections below quote it.

## What it does

A parser and utility library for HL7 v2 in Node.js and TypeScript. It accepts vendor-quirky
messages leniently, exposes the common fields as named helpers (`msg.patient?.mrn`,
`msg.meta.timestamp`), keeps the positional tree for everything else, and emits spec-clean HL7
from `toString()`.

## When an agent should use it

- "Parse this HL7 message", "get the MRN, name and date of birth out of PID".
- "Loop over the lab results (OBX) in this ORU^R01", "group OBX under their OBR".
- "What message type is this?" (MSH-9), "is this an ADT^A01?".
- Reading allergies (AL1, IAM), next of kin, diagnoses, insurance, medications, immunizations,
  appointments (SIU), documents (MDM), charges (DFT) and order timing (TQ1).
- Patient merges and identity events (ADT A40 and the other MRG-carrying triggers).
- Changing a field and re-sending the message (`setField`, then `toString()`).
- Splitting a batch file or streaming a multi-GB feed one message at a time.
- Vendor Z-segments and site-specific fields through profiles (8 built-in vendor profiles).
- Checking a message against HL7's published structures, or against an interface spec you write.
- Turning an HL7 datetime into an ISO string or a `Date` without inventing a timezone.

Use another skill when:

- sending or receiving over TCP (MLLP), ACK correlation, reconnects, TLS: `cosyte-mllp`;
- converting a parsed message to FHIR R4 resources: `cosyte-transform`;
- generating synthetic HL7 fixtures: `cosyte-synth`; de-identifying messages: `cosyte-deid`;
- X12, C-CDA, FHIR JSON or ASTM analyzer data: `cosyte-x12`, `cosyte-ccda`, `cosyte-fhir`,
  `cosyte-astm`; the `cosyte` command line or MCP server: `cosyte-cli`.

## Install

The skill comes with the rest of the collection: [install the skills](./installation.md) in your
agent, and in Claude Code with the plugin, run it as `/cosyte:cosyte-hl7`. The skill then tells the
agent how to install the package:

```bash
npm install @cosyte/hl7
# the README recommends pnpm
pnpm add @cosyte/hl7
```

Node `>=22`. Dual ESM and CommonJS builds with type declarations for both. Zero runtime
dependencies: it loads only the Node standard library.

## Example prompt

```text
Write a Node.js script that parses this HL7 v2 message and prints the patient's MRN,
full name and date of birth, the message type, and the ward. Log any parser warnings
by code and position only.

MSH|^~\&|ADTAPP|MAIN|LIS|REF|20260419101500||ADT^A01^ADT_A01|MSG00001|P|2.5
EVN|A01|20260419101500
PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M|||123 Main St^^Boston^MA^02101||^PRN^PH^^^617^5551212
PV1|1|I|ICU^101^A^HOSP|||||ATTEND^Smith^Jane^^^^MD|||||||||||VISIT001
```

## Result

The request names an HL7 v2 message and PID fields, which the description of `cosyte-hl7` lists. The agent loads the skill and follows its example, below. It is the code the skill
shows the agent for this task, not a recorded session: an agent's answer varies from run to run,
but the package, the API and the rules come from the skill.

The README's synthetic ADT^A01 (MSH-3 renamed to a placeholder), plus a warnings loop.

```ts no-run copied from the skill, and this repository has no sample runner yet
import { parseHL7 } from "@cosyte/hl7";

// A synthetic ADT^A01 admit. HL7 v2 ends every segment with a carriage return.
const raw =
  "MSH|^~\\&|ADTAPP|MAIN|LIS|REF|20260419101500||ADT^A01^ADT_A01|MSG00001|P|2.5\r" +
  "EVN|A01|20260419101500\r" +
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M|||123 Main St^^Boston^MA^02101||^PRN^PH^^^617^5551212\r" +
  "PV1|1|I|ICU^101^A^HOSP|||||ATTEND^Smith^Jane^^^^MD|||||||||||VISIT001\r";

const msg = parseHL7(raw);

console.log("Patient record number:", msg.patient?.mrn);
console.log("Full name:", msg.patient?.fullName);
console.log("Date of birth:", msg.patient?.dateOfBirth?.raw);
console.log("Precision:", msg.patient?.dateOfBirth?.precision);
console.log("Message type:", msg.meta.type);
console.log("Sent at:", msg.meta.timestamp?.raw);
console.log("Ward:", msg.visit?.location?.pointOfCare);

// Tolerated deviations are data, not exceptions. Log code and position, never values.
for (const w of msg.warnings) {
  console.log(w.code, w.position.segmentIndex, w.position.fieldIndex);
}
```

```text
Patient record number: MRN12345
Full name: John Q Doe
Date of birth: 19800115
Precision: day
Message type: ADT^A01^ADT_A01
Sent at: 20260419101500
Ward: ICU
```

Helpers return `undefined` (never throw) when their segment is absent, so use `?.` throughout.
Every datetime is a fidelity `TS` (`raw`, `precision`, `hasTimezone`, parts), not a `Date`.

## More in the skill

The skill also lists the [key API](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-hl7/SKILL.md#key-api), the
[limits and known defects](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-hl7/SKILL.md#limits-and-known-defects) and how to handle PHI
([PHI handling](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-hl7/SKILL.md#phi-handling)). The package's own documentation is at
[docs.cosyte.com/hl7/intro](https://docs.cosyte.com/hl7/intro).
