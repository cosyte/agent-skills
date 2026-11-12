---
id: cosyte-ccda
title: The cosyte-ccda skill
sidebar_label: cosyte-ccda
description: "The cosyte-ccda skill: when an agent should use @cosyte/ccda to parse, build and serialize C-CDA documents, with an example prompt."
---

# The cosyte-ccda skill

The `cosyte-ccda` skill teaches an agent to use [`@cosyte/ccda`](https://docs.cosyte.com/ccda/intro). Its source is
[skills/cosyte-ccda/SKILL.md](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-ccda/SKILL.md); the sections below quote it.

## What it does

C-CDA parser, serializer, and builder for Node.js and TypeScript, lenient on parse and spec-clean on
emit. It reads a vendor-quirky document into typed clinical models and turns each deviation into a
stable coded warning; where a document contradicts itself, the value is withheld and flagged.

## When an agent should use it

- "Parse this CCD", "read this C-CDA", "what problems, meds and allergies are in this document".
- Pull results, vitals (UCUM-checked), immunizations, procedures (performed vs planned), encounters,
  smoking status, plan of treatment, functional and mental status, family or past medical history.
- Identify the document type (12 US Realm types), the patient and the MRN.
- Find missing required (SHALL) sections, and how complete that check is.
- Build a CCD, Referral Note or inpatient Discharge Summary, or replace a section of a parsed one.
- Read a C-CDA timestamp without guessing a timezone.

Use another skill when:

- FHIR R4 JSON or XML, Bundles or Bulk Data NDJSON: `cosyte-fhir`.
- Code-system membership, ConceptMap, ValueSet expansion, UCUM, RxNorm: `cosyte-terminology`.
- HL7 v2 messages: `cosyte-hl7` (MLLP transport: `cosyte-mllp`; v2 to FHIR: `cosyte-transform`).
- Redaction or de-identification (out of scope here): `cosyte-deid`. Bulk fixtures: `cosyte-synth`.

## Install

The skill comes with the rest of the collection: [install the skills](./installation.md) in your
agent, and in Claude Code with the plugin, run it as `/cosyte:cosyte-ccda`. The skill then tells the
agent how to install the package:

```bash
npm install @cosyte/ccda
```

`pnpm add @cosyte/ccda` and `yarn add @cosyte/ccda` install the same package. Node `>=22.0.0`. Dual
ESM and CJS with per-condition type declarations. One runtime dependency, `@xmldom/xmldom`
(exact-pinned), the W3C DOM substrate for the XML.

## Example prompt

```text
Write TypeScript that reads the patient, MRN, problems, medications and allergies out
of a CCD and logs any parse warnings by code. Build a synthetic CCD to test it with.
```

## Result

The request asks to read problems, medications and allergies from a CCD and to build one, which the description of `cosyte-ccda` lists. The agent loads the skill and follows its example, below. It is the code the skill
shows the agent for this task, not a recorded session: an agent's answer varies from run to run,
but the package, the API and the rules come from the skill.

Adapted from the README's tested example. The name is joined from its parts on purpose (the skill's limits explain why).

```ts no-run copied from the skill, and this repository has no sample runner yet
import { buildCcda, parseCcda, toISO } from "@cosyte/ccda";

// A synthetic CCD, built so the example stands on its own. In an integration this is the
// document a sending system handed you.
const xml = buildCcda({
  patient: { mrn: "MRN001", given: ["Jane"], family: "Doe", gender: "F", birthTime: "19800101" },
  problems: [{ problem: { code: "59621000", displayName: "Essential hypertension" } }],
  medications: [
    {
      drug: { code: "314076", displayName: "Lisinopril 10 MG Oral Tablet" }, // RxNorm
      dose: { value: 1, unit: "{tablet}" },
      route: { code: "C38288", displayName: "Oral" }, // NCI Thesaurus
    },
  ],
  allergies: [
    {
      allergen: { code: "7980", displayName: "Penicillin G" }, // RxNorm
      reaction: { code: "247472004", displayName: "Hives" }, // SNOMED CT
    },
  ],
}).toString();

// Log the stable code and the structural position, never a value from the document.
const doc = parseCcda(xml, { onWarning: (w) => console.warn(w.code, w.position.path) });

const patient = doc.getPatient();
const name = patient?.name;
const displayName = [...(name?.given ?? []), name?.family]
  .filter((part): part is string => part !== undefined)
  .join(" ");
const problem = doc.getProblems()[0];
const allergen = doc.getAllergies()[0]?.allergies[0]?.allergen;

console.log(doc.documentType, doc.getMrn(), displayName, toISO(patient?.birthTime));
console.log("problem", problem?.problems[0]?.value?.code, problem?.status);
console.log("medication", doc.getMedications()[0]?.drug?.code);
console.log("allergy", allergen?.code, allergen?.displayName);
console.log("warnings", doc.warnings.map((w) => w.code));
console.log("round trip unchanged", parseCcda(doc.toString()).toString() === xml);
```

Expected output. Most lines are values the README asserts; the rest follow from the type
declarations. We have not run this exact snippet.

```text
ccd MRN001 Jane Doe 1980-01-01
problem 59621000 active
medication 314076
allergy 7980 Penicillin G
warnings []
round trip unchanged true
```

Hostile or unparseable input (DTD, entity expansion, size or depth limits, malformed XML, a root
that is not `ClinicalDocument`) always throws `CcdaParseError`; catch it and log `err.code` and
`err.position`, as in the reference's error-handling recipe.

## More in the skill

The skill also lists the [key API](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-ccda/SKILL.md#key-api), the
[limits and known defects](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-ccda/SKILL.md#limits-and-known-defects) and how to handle PHI
([PHI handling](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-ccda/SKILL.md#phi-handling)). The package's own documentation is at
[docs.cosyte.com/ccda/intro](https://docs.cosyte.com/ccda/intro).
