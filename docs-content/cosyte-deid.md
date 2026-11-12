---
id: cosyte-deid
title: The cosyte-deid skill
sidebar_label: cosyte-deid
description: "The cosyte-deid skill: when an agent should use @cosyte/deid to de-identify healthcare data under a Safe Harbor policy, with an example prompt."
---

# The cosyte-deid skill

The `cosyte-deid` skill teaches an agent to use [`@cosyte/deid`](https://docs.cosyte.com/deid/intro). Its source is
[skills/cosyte-deid/SKILL.md](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-deid/SKILL.md); the sections below quote it.

## What it does

A de-identification library for Node.js and TypeScript. It applies a policy (HIPAA Safe Harbor by
default) to a structurally located model of a healthcare document and returns a transformed model plus
a value-free manifest of everything it acted on. The README's honesty line: results are
"Safe-Harbor-transformed per the configured policy", never labelled "de-identified" and never a
compliance claim. Safe Harbor is implemented mechanically, the actual-knowledge condition
(§164.514(b)(2)(ii)) is the consumer's, and Expert Determination (§164.514(b)(1)) is supported, never
rendered or certified. The certification is always the consumer's.

## When an agent should use it

- "De-identify this HL7 v2 message / C-CDA document / FHIR resource / X12 837 / NCPDP Telecom claim /
  DICOM file", "strip PHI before we share this extract".
- Remove or generalize Safe Harbor identifiers: names removed, dates to year, ZIP to a safe 3-digit
  prefix (or `000`), ages over 89 to `90+`, MRN, health plan and account numbers removed.
- Keep a research corpus linkable with a key: consistent per-patient date shift and keyed pseudonyms
  (Expert Determination territory, not Safe Harbor).
- Get a value-free audit (manifest) of what was removed, generalized, blocked or retained.
- Hand a statistician a structured Expert Determination support report.
- Run your own redactor over narrative fields instead of blocking them.

Use another skill when:

- Parsing or building the source format: cosyte-hl7, cosyte-ccda, cosyte-fhir, cosyte-x12,
  cosyte-ncpdp, cosyte-dicom. For DICOM Annex E Retain or Clean options, use `deidentify` from
  `@cosyte/dicom` (cosyte-dicom): this package's DICOM adapter takes only `policy`, `uidMap` and
  `uidRoot`.
- NCPDP SCRIPT: this package refuses it. ASTM: the README lists no adapter for it.
- Synthetic test fixtures: cosyte-synth. The `cosyte redact` command: cosyte-cli.

## Install

The skill comes with the rest of the collection: [install the skills](./installation.md) in your
agent, and in Claude Code with the plugin, run it as `/cosyte:cosyte-deid`. The skill then tells the
agent how to install the package:

```bash
npm install @cosyte/deid
# plus the parser for each format you de-identify, for example:
npm install @cosyte/deid @cosyte/hl7
```

- The core has zero third-party runtime dependencies (every primitive is `node:crypto`). Each adapter
  is a subpath (`@cosyte/deid/hl7`, `/ccda`, `/fhir`, `/x12`, `/ncpdp`, `/dicom`) whose parser
  (`@cosyte/hl7`, `@cosyte/ccda`, `@cosyte/fhir`, `@cosyte/x12`, `@cosyte/ncpdp`, `@cosyte/dicom`) is
  an optional peer dependency, every one with the range `^0.1.0`.
- `package.json`: `engines.node` `>=22.0.0`; ESM and CJS builds with types for every entry point.

## Example prompt

```text
Before we share an HL7 v2 extract, remove the patient's name (PID-5) and generalize the
date of birth (PID-7), keep the lab value in OBX-5, and show me a value-free record of
what was removed. Use placeholder values to test it.
```

## Result

The request asks to remove names and dates from HL7 v2 fields and to see what was removed, which the description of `cosyte-deid` lists. The agent loads the skill and follows its example, below. It is the code the skill
shows the agent for this task, not a recorded session: an agent's answer varies from run to run,
but the package, the API and the rules come from the skill.

The README's core example, with placeholder values in the shape of an HL7 v2 name and date of birth.

```ts no-run copied from the skill, and this repository has no sample runner yet
import { deidentify, SAFE_HARBOR_CATEGORIES } from "@cosyte/deid";

const name = "ZZFAMILY^ZZGIVEN";
const dob = "19900215";

const { document, manifest } = deidentify(
  {
    loci: [
      { path: "PID-5", kind: "identifier", category: SAFE_HARBOR_CATEGORIES.NAMES, value: name },
      { path: "PID-7", kind: "date", category: SAFE_HARBOR_CATEGORIES.DATES, value: dob },
      { path: "OBX-5", kind: "clinical", value: "5.4 mmol/L" },
    ],
  },
  {},
);

// Print booleans and counts, never the loci's values.
console.log("name still present:", document.loci.some((locus) => locus.value === name));
console.log("date of birth still present:", document.loci.some((locus) => locus.value === dob));
console.log("loci:", document.loci.length);
console.log(manifest.map((entry) => `${entry.locus} ${entry.category} ${entry.disposition}`));
```

```text
name still present: false
date of birth still present: false
loci: 3
[ 'PID-5 NAMES removed', 'PID-7 DATES transformed' ]
```

## More in the skill

The skill also lists the [key API](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-deid/SKILL.md#key-api), the
[limits and known defects](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-deid/SKILL.md#limits-and-known-defects) and how to handle PHI
([PHI handling](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-deid/SKILL.md#phi-handling)). The package's own documentation is at
[docs.cosyte.com/deid/intro](https://docs.cosyte.com/deid/intro).
