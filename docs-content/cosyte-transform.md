---
id: cosyte-transform
title: The cosyte-transform skill
sidebar_label: cosyte-transform
description: "The cosyte-transform skill: when an agent should use @cosyte/transform to convert HL7 v2 messages to FHIR R4, with an example prompt."
---

# The cosyte-transform skill

The `cosyte-transform` skill teaches an agent to use [`@cosyte/transform`](https://docs.cosyte.com/transform/intro). Its source is
[skills/cosyte-transform/SKILL.md](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-transform/SKILL.md); the sections below quote it.

## What it does

HL7 v2 to FHIR R4 transformation for Node.js and TypeScript. It takes messages already parsed by
`@cosyte/hl7`, produces `@cosyte/fhir` model nodes grounded on the official HL7 Version 2 to FHIR
implementation guide (`hl7.fhir.uv.v2mappings`), and reports every ambiguity as a typed,
value-free `TransformIssue` instead of guessing.

## When an agent should use it

- "Convert this HL7 v2 message to FHIR", "map an ADT^A01 to Patient and Encounter".
- ADT with NK1, AL1, DG1, PR1 and IN1 to RelatedPerson, AllergyIntolerance, Condition,
  Procedure and Coverage.
- ORU^R01 to DiagnosticReport, Observation and Specimen.
- ORM_O01 or OML_O21 to ServiceRequest, RXO to MedicationRequest, TQ1 to a FHIR Timing.
- VXU_V04 to Immunization, SIU_S12 to Appointment, MDM_T02 to DocumentReference.
- Converting a single v2 datatype: DTM/TS, CX, CWE/CE, XPN, XAD, NM with units.
- Rendering the diagnostics as a FHIR OperationOutcome.
- Emitting a v2 message carrying a PID or OBX from a FHIR Patient or Observation (narrow, lossy).

Use another skill when:

- parsing or reading the HL7 message itself: `cosyte-hl7`;
- reading, validating or serializing FHIR resources on their own: `cosyte-fhir`;
- code systems, ConceptMaps, UCUM or RxNorm: `cosyte-terminology`;
- receiving HL7 over a socket: `cosyte-mllp`; synthetic fixtures: `cosyte-synth`.

## Install

The skill comes with the rest of the collection: [install the skills](./installation.md) in your
agent, and in Claude Code with the plugin, run it as `/cosyte:cosyte-transform`. The skill then tells the
agent how to install the package:

```bash
npm install @cosyte/transform @cosyte/hl7 @cosyte/fhir
```

`@cosyte/hl7` and `@cosyte/fhir` are peer dependencies at `^0.1.8` (since 0.2.1): install them
beside it and parse with `@cosyte/hl7` before you transform. No third-party runtime dependencies.
Node `>=22.0.0`. Dual ESM and CommonJS builds with type declarations for both.

## Example prompt

```text
Convert a synthetic HL7 v2 ADT^A01 to a FHIR R4 Bundle in TypeScript. Log every issue
the conversion reports without logging values, and tell me which PID fields the Patient
does not carry.
```

## Result

The request asks to convert an HL7 v2 message to FHIR, which the description of `cosyte-transform` lists. The agent loads the skill and follows its example, below. It is the code the skill
shows the agent for this task, not a recorded session: an agent's answer varies from run to run,
but the package, the API and the rules come from the skill.

Transform a synthetic ADT^A01, log the issues, then read the PID fields the Patient does not carry
(the first of the skill's limits) straight from the parsed message.

```ts no-run copied from the skill, and this repository has no sample runner yet
import { serializeResource } from "@cosyte/fhir";
import { parseHL7 } from "@cosyte/hl7";
import { createNamingSystem, toFhir } from "@cosyte/transform";

// A synthetic ADT^A01. Every name, identifier and date is invented.
const raw =
  "MSH|^~\\&|ADTAPP|MAIN|FHIRGW|REF|20260419101500||ADT^A01^ADT_A01|MSG00001|P|2.5\r" +
  "EVN|A01|20260419101500\r" +
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M||2106-3^White^CDCREC|" +
  "123 Main St^^Boston^MA^02101||||en^English^ISO639|||||||" +
  "2186-5^Not Hispanic or Latino^CDCREC|||||||20260418|Y\r" +
  "PV1|1|I|ICU^101^A^HOSP||||||||||||||||VISIT001\r";

const msg = parseHL7(raw);

const { bundle, issues } = toFhir(msg, {
  // Seed every assigning authority you trust. A bare HD.1 never becomes a system on its own.
  namingSystem: createNamingSystem({ authorities: { HOSP: "https://example.org/fhir/sid/mrn" } }),
});

console.log(serializeResource(bundle).length, "bytes of FHIR JSON");
for (const i of issues) {
  // Value-free: a stable code, the v2 location and the FHIR path. Safe to log.
  console.log(i.severity, i.code, i.v2Location, i.fhirPath ?? "");
}

// toFhir reports these six PID fields as dropped but does not map them. Read them here.
const p = msg.patient;
const race = p?.race?.identifier; // PID-10
const language = p?.language?.identifier; // PID-15
const hasSsn = (msg.get("PID.19") ?? "") !== ""; // PID-19: check presence, do not copy it around
const ethnicity = p?.ethnicity?.identifier; // PID-22
const deathDateTime = msg.segments("PID")[0]?.field(29).asTs(); // PID-29, fidelity TS
const deathIndicator = msg.get("PID.30"); // PID-30, "Y" means deceased
const recordedDeceased = deathIndicator === "Y" || deathDateTime?.valid === true;
console.log({ race, language, hasSsn, ethnicity, recordedDeceased });
```

This MSH-7 has no timezone, so the transform reduces it to date precision and raises
`TRANSFORM_TIMESTAMP_NO_TIMEZONE` rather than assuming UTC. Pass
`assumeTimezoneOffsetMinutes` only when you know the sender's offset.

## More in the skill

The skill also lists the [key API](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-transform/SKILL.md#key-api), the
[limits and known defects](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-transform/SKILL.md#limits-and-known-defects) and how to handle PHI
([PHI handling](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-transform/SKILL.md#phi-handling)). The package's own documentation is at
[docs.cosyte.com/transform/intro](https://docs.cosyte.com/transform/intro).
