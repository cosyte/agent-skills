---
id: cosyte-fhir
title: The cosyte-fhir skill
sidebar_label: cosyte-fhir
description: "The cosyte-fhir skill: when an agent should use @cosyte/fhir to read, validate and write FHIR R4 resources, with an example prompt."
---

# The cosyte-fhir skill

The `cosyte-fhir` skill teaches an agent to use [`@cosyte/fhir`](https://docs.cosyte.com/fhir/intro). Its source is
[skills/cosyte-fhir/SKILL.md](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-fhir/SKILL.md); the sections below quote it.

## What it does

FHIR R4 for Node.js and TypeScript: a resource model that keeps every value exactly as written, JSON
and XML codecs, layered validation, and a safety readout for status and negation. A `decimal` keeps
its exact text and never passes through a JavaScript number.

## When an agent should use it

- "Parse this FHIR resource", "read this Patient JSON", "load this FHIR XML", keeping `0.010`,
  `120.0` or a large `integer64` exactly as written.
- Validate a resource (structure, R4 constraints, your profiles) and return an `OperationOutcome`.
- Before summarizing or displaying a resource, check status, `refuted`, `entered-in-error`,
  `not-done`, `doNotPerform` and any `modifierExtension`.
- Read `Observation.value[x]` by its actual type and compare units on the UCUM `code`.
- Tell a transaction Bundle from a batch, resolve references, stream a Bulk Data NDJSON export.

Use another skill when:

- The input is a C-CDA or CDA R2 XML document: `cosyte-ccda`.
- You need code-system content, ValueSet `$expand`, ConceptMap `$translate`, UCUM equivalence or
  RxNorm: `cosyte-terminology`.
- You are converting HL7 v2 messages to FHIR: `cosyte-transform` (v2 parsing itself: `cosyte-hl7`).
- You need de-identification: `cosyte-deid`. Synthetic fixtures: `cosyte-synth`.

## Install

The skill comes with the rest of the collection: [install the skills](./installation.md) in your
agent, and in Claude Code with the plugin, run it as `/cosyte:cosyte-fhir`. The skill then tells the
agent how to install the package:

```bash
pnpm add @cosyte/fhir
```

`npm install @cosyte/fhir` and `yarn add @cosyte/fhir` also work. Node `>=22.0.0`. Dual ESM and
CommonJS builds with type declarations for both. Zero runtime dependencies, no Node built-in imported.
Everything ships from one entry point; there are no subpath imports.

## Example prompt

```text
Parse this synthetic FHIR Observation, keep the 120.0 exactly as written, refuse to
summarize it if its status or a modifier makes that unsafe, and validate it against R4.
Compare the value, without printing it, and print its UCUM code.

{ "resourceType": "Observation", "id": "syn-0001", "status": "final",
  "code": { "coding": [{ "system": "http://loinc.org", "code": "8480-6" }] },
  "subject": { "reference": "Patient/syn-0001" }, "effectiveDateTime": "2026-01-05",
  "valueQuantity": { "value": 120.0, "unit": "mmHg",
    "system": "http://unitsofmeasure.org", "code": "mm[Hg]" } }
```

## Result

The request asks to parse and validate FHIR JSON, keep decimal precision and check safety before summarizing, which the description of `cosyte-fhir` lists. The agent loads the skill and follows its example, below. It is the code the skill
shows the agent for this task, not a recorded session: an agent's answer varies from run to run,
but the package, the API and the rules come from the skill.

The document is the README's synthetic Observation; every value in it is fabricated.

```ts no-run copied from the skill, and this repository has no sample runner yet
import { assertSafeToSummarize, FhirSafetyError, isList, parseResource } from "@cosyte/fhir";
import { readObservationValue, resolvePath, validateResource, type FhirNode } from "@cosyte/fhir";

const document = `{
  "resourceType": "Observation",
  "id": "syn-0001",
  "status": "final",
  "code": { "coding": [{ "system": "http://loinc.org", "code": "8480-6" }] },
  "subject": { "reference": "Patient/syn-0001" },
  "effectiveDateTime": "2026-01-05",
  "valueQuantity": {
    "value": 120.0,
    "unit": "mmHg",
    "system": "http://unitsofmeasure.org",
    "code": "mm[Hg]"
  }
}`;

const { resource, issues } = parseResource(document);
console.log(issues.map((issue) => issue.code)); // the 120.0 was kept exactly, and says so

// Refuse rather than summarize something that cannot be summarized honestly.
try {
  assertSafeToSummarize(resource);
} catch (err) {
  if (err instanceof FhirSafetyError) console.error("not safe to summarize at", err.locations);
  else throw err;
}

// Branch on the value[x] type before touching a magnitude, and compare on the UCUM code.
const reading = readObservationValue(resource);
if (reading?.type === "Quantity") {
  // The magnitude is clinical data: compare it, do not log it.
  console.log(reading.quantity?.value?.raw === "120.0", reading.quantity?.code);
}

// resolvePath returns a repeating last segment as one list node: flatten it yourself.
const codings = resolvePath(resource, "code.coding").flatMap((node): readonly FhirNode[] =>
  isList(node) ? node.items : [node],
);
console.log(codings.map((node) => node.kind));

const result = validateResource(resource);
console.log(result.valid, result.issues.filter((issue) => issue.severity === "error").length);
```

Expected output. Most lines are values the README asserts; the rest follow from the type
declarations. We have not run this exact snippet.

```text
[ 'DECIMAL_PRECISION_AT_RISK' ]
true mm[Hg]
[ 'complex' ]
true 0
```

## More in the skill

The skill also lists the [key API](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-fhir/SKILL.md#key-api), the
[limits and known defects](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-fhir/SKILL.md#limits-and-known-defects) and how to handle PHI
([PHI handling](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-fhir/SKILL.md#phi-handling)). The package's own documentation is at
[docs.cosyte.com/fhir/intro](https://docs.cosyte.com/fhir/intro).
