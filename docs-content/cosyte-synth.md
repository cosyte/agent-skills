---
id: cosyte-synth
title: The cosyte-synth skill
sidebar_label: cosyte-synth
description: "The cosyte-synth skill: when an agent should use @cosyte/synth to generate seeded synthetic healthcare test fixtures, with an example prompt."
---

# The cosyte-synth skill

The `cosyte-synth` skill teaches an agent to use [`@cosyte/synth`](https://docs.cosyte.com/synth/intro). Its source is
[skills/cosyte-synth/SKILL.md](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-synth/SKILL.md); the sections below quote it.

## What it does

A deterministic, seedable synthetic healthcare-fixture generator for Node.js and TypeScript. It is
a consumer of the Cosyte parsers, not a parser: each artifact is built through that parser's own
builder or serializer, and every identifier, name, date, phone and address is drawn from a
synthetic source. It is a format and conformance generator, not a clinical simulator.

**Whenever you need test data for healthcare code, use this package.** Do not use, copy, ask for
or reconstruct real patient data for a fixture, a test, an example or a prompt.

## When an agent should use it

- "Generate a test HL7 message", "I need a sample ADT or ORU", a fixture for a parser test.
- "Make a fake patient", a FHIR Patient or Bundle, a fixture by US Core 6.1.0 profile name.
- "A sample 837, 835 or 271", "a sample NCPDP claim or NewRx", "an ASTM result" or framed bytes.
- A reproducible corpus from one seed for golden files or snapshot tests.
- A vendor-quirk fixture that should raise exactly one known parser warning (HL7 v2, C-CDA, ASTM).
- Proving a de-identification step removes planted PHI: the `@cosyte/deid` pairing loop.
- One synthetic value: SSN, NPI, DEA number, phone, email, IP address, name or address.

Use another skill when you parse or build a message from your own data (cosyte-hl7, cosyte-fhir,
cosyte-ccda, cosyte-x12, cosyte-ncpdp, cosyte-astm), de-identify data that is not synth's own
output (cosyte-deid), or are unsure which Cosyte package fits (cosyte).

## Install

The skill comes with the rest of the collection: [install the skills](./installation.md) in your
agent, and in Claude Code with the plugin, run it as `/cosyte:cosyte-synth`. The skill then tells the
agent how to install the package:

```bash
npm install @cosyte/synth @cosyte/hl7 @cosyte/fhir @cosyte/ccda @cosyte/x12 @cosyte/ncpdp @cosyte/astm
```

- The parsers and `@cosyte/deid` are optional peer dependencies, each needed only for its subpath:
  `@cosyte/synth/hl7`, `/fhir`, `/ccda`, `/x12`, `/ncpdp`, `/astm`, and `/deid` (which needs
  `@cosyte/deid` plus the parsers for the formats it pairs). Install only what you generate. Since
  0.1.6 the peer ranges are `@cosyte/hl7` `^0.1.8`, `@cosyte/fhir` `^0.1.8`, `@cosyte/ccda`
  `^0.1.6`, `@cosyte/x12` `^0.1.10`, `@cosyte/ncpdp` `^0.1.6`, `@cosyte/astm` `^0.1.6` and
  `@cosyte/deid` `^0.1.5`. The `@cosyte/deid` range does not admit the 0.2 line: npm refuses to
  install `@cosyte/deid` 0.2 beside synth (`ERESOLVE`), so pair synth with `@cosyte/deid` 0.1.
- Importing a subpath does not load its parser (since 0.1.6): the parser loads on the first call
  that needs it, so a missing optional parser is named by that call's error, not by the import.
- The core (`@cosyte/synth`: seeded PRNG and synthetic-value providers) has zero third-party
  runtime dependencies. Dual ESM and CJS.

## Example prompt

```text
I need test fixtures for our HL7 v2 code: an ADT^A01, an ORU and a small corpus with
one message of each kind, identical on every run. No real patient data.
```

## Result

The request asks for reproducible test messages, which the description of `cosyte-synth` lists, and it says to use the package instead of real patient data every time. The agent loads the skill and follows its example, below. It is the code the skill
shows the agent for this task, not a recorded session: an agent's answer varies from run to run,
but the package, the API and the rules come from the skill.

```ts no-run copied from the skill, and this repository has no sample runner yet
import { generateAdt, generateOru, generateHl7, hl7Corpus, roundTrip } from "@cosyte/synth/hl7";

// Same seed gives a byte-identical message, on any machine, any run.
const adt = generateAdt({ seed: 12345, trigger: "A01" });
const oru = generateOru({ seed: 12345 });

// Spec-clean by construction: it round-trips through @cosyte/hl7 with zero warnings.
console.log(roundTrip(adt).specClean); // true
console.log(roundTrip(oru).specClean); // true

// Or generate a reproducible mixed corpus across every family:
const corpus = hl7Corpus({ seed: 42, count: 7 }); // one of each family, cycled
console.log(corpus.artifacts.every((a) => a.warnings.length === 0)); // true, all spec-clean

// Dispatch by kind when the message type is data:
console.log(roundTrip(generateHl7("VXU^V04", 12345)).content.startsWith("MSH|")); // true, it opens with an MSH segment
```

What the README promises, and only that:

- **Seeds.** The same seed yields byte-identical output on the same parser versions, on any
  machine, any run. A hand-rolled seeded PRNG (`sfc32` seeded through `splitmix32`) drives every
  draw and `Math.random` is lint-banned: "a seed determines the output, byte for byte, on the same
  parser versions." A parser release can change the bytes: since 0.1.2 every C-CDA document is
  built by `@cosyte/ccda` 0.1, so a C-CDA golden file committed from 0.1.1 has to be regenerated,
  and since 0.1.6 every 271 carries the BHT segment `@cosyte/x12` 0.1.10 writes, so a 271 golden
  file committed from an earlier release has to be regenerated too.
  Generated artifacts and `Corpus` results are deep-frozen.
- **Spec-clean.** Built through the parser's own builder or serializer and fed back into that
  parser, it re-parses with zero warnings. `roundTrip(...).specClean` is `true` only for zero
  warnings and a byte-identical re-serialize. For FHIR it means validating under
  `validateResource` and conforming to the real US Core 6.1.0 profiles you supply (none bundled).
  This is the Cosyte parser's own judgment, not an independent check against each standard, so a
  value at the wrong scale or position can still pass (see the defects below).
- **Vendor quirks.** A quirk deviates the message structure so it round-trips to exactly one
  intended, stable warning code, and where a built-in public parser profile claims the deviation,
  it round-trips cleanly under it. A quirk changes shape, never provenance: no real-looking value.
- **The deid pairing loop.** Generates an artifact, plants synthetic PHI sentinels at the patient
  loci, de-identifies it through `@cosyte/deid`, and fails if any sentinel survives or a clinical
  value was scrubbed. It proves the pair works on synth's own output and is not an independent
  audit of `@cosyte/deid` against real-world data.

## More in the skill

The skill also lists the [key API](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-synth/SKILL.md#key-api), the
[limits and known defects](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-synth/SKILL.md#limits-and-known-defects) and how to handle PHI
([PHI handling](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-synth/SKILL.md#phi-handling)). The package's own documentation is at
[docs.cosyte.com/synth/intro](https://docs.cosyte.com/synth/intro).
