---
id: cosyte-terminology
title: The cosyte-terminology skill
sidebar_label: cosyte-terminology
description: "The cosyte-terminology skill: when an agent should use @cosyte/terminology for code systems, ConceptMaps and UCUM, with an example prompt."
---

# The cosyte-terminology skill

The `cosyte-terminology` skill teaches an agent to use [`@cosyte/terminology`](https://docs.cosyte.com/terminology/intro). Its source is
[skills/cosyte-terminology/SKILL.md](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-terminology/SKILL.md); the sections below quote it.

## What it does

A zero-dependency terminology engine for US healthcare code systems. It is not a wire parser: it
mirrors the FHIR Terminology Module (`$translate`, `$lookup`, `$validate-code`, `$expand`) over FHIR
resources and standard releases you supply, and it never fabricates a code.

## When an agent should use it

- "What system is OID 2.16.840.1.113883.6.1", "normalize this code system identifier".
- "Translate this code with our ConceptMap", "is this mapping 1:1 or 1:many".
- Load LOINC CSV, RxNorm or UMLS RRF, the ICD-10-CM order file or a FHIR CodeSystem, then look up a
  display or check a code (deprecated and not-billable status carried through).
- Expand a ValueSet, or decide whether a coding is in one.
- "Is `mg/dl` valid UCUM", "are `mmol/L` and `mmol.L-1` the same unit".
- ICD-9-CM to ICD-10-CM (or back) with the CMS GEM files; SNOMED CT to ICD-10-CM with the NLM
  complex map.
- RxNorm: ingredients of a drug, generic for a brand, NDC to RXCUI.

Use another skill when:

- Reading or validating FHIR resources: `cosyte-fhir` (it takes a terminology service you implement).
- Reading a C-CDA document: `cosyte-ccda` (its code systems page,
  https://docs.cosyte.com/ccda/code-systems, says its `TerminologyAdapter` mirrors this engine, so
  you can wire the engine in behind it).
- You are converting HL7 v2 to FHIR: `cosyte-transform`.

## Install

The skill comes with the rest of the collection: [install the skills](./installation.md) in your
agent, and in Claude Code with the plugin, run it as `/cosyte:cosyte-terminology`. The skill then tells the
agent how to install the package:

```bash
npm install @cosyte/terminology
```

Zero runtime dependencies (Node standard library only). Dual ESM and CJS, built with `tsup` and
checked with `attw`. Node.js 22 or later, tested on 22, 24 and 26. Runnable programs are in the
repository's `examples/` folder.

## Example prompt

```text
Resolve the OID 2.16.840.1.113883.6.1 to its code system URI, translate the FHIR
administrative gender code "male" to HL7 v2 table 0001 with a ConceptMap, look a code up
in a small code system, and check whether "mg" and "g" are the same UCUM unit.
```

## Result

The request asks to resolve an OID, translate through a ConceptMap, look a code up and compare UCUM units, which the description of `cosyte-terminology` lists. The agent loads the skill and follows its example, below. It is the code the skill
shows the agent for this task, not a recorded session: an agent's answer varies from run to run,
but the package, the API and the rules come from the skill.

```ts no-run copied from the skill, and this repository has no sample runner yet
import { isUnknownSystem, loadCodeSystem, loadConceptMap, lookup, resolveSystem } from "@cosyte/terminology";
import { translate, ucumEqual, validateUcum } from "@cosyte/terminology";

// 1. Resolve an OID, a mnemonic or a URI to the canonical system URI.
const loinc = resolveSystem("2.16.840.1.113883.6.1");
console.log(isUnknownSystem(loinc) ? "unknown" : loinc.url);

// 2. $translate through a ConceptMap you supply (an inline example map here).
const map = loadConceptMap({
  resourceType: "ConceptMap",
  url: "http://example.org/cm/gender",
  group: [
    {
      source: "http://hl7.org/fhir/administrative-gender",
      target: "http://terminology.hl7.org/CodeSystem/v2-0001",
      element: [{ code: "male", target: [{ code: "M", equivalence: "equivalent" }] }],
    },
  ],
});
const result = translate({ system: "http://hl7.org/fhir/administrative-gender", code: "male" }, map);
if (result.unmapped) {
  console.log("unmapped", result.mode); // a typed outcome, never a guessed target
} else {
  for (const match of result.matches) console.log(match.target.code, match.equivalence);
}

// 3. $lookup in a code system you load (a tiny FHIR CodeSystem here).
const cs = loadCodeSystem({
  format: "fhir",
  resource: {
    resourceType: "CodeSystem",
    url: "http://example.org/cs",
    concept: [{ code: "a", display: "Alpha" }],
  },
});
const hit = lookup(cs, "a");
console.log(hit.found ? hit.display : hit.code);
console.log(lookup(cs, "zz").found); // an unknown code is TERM_CODE_UNKNOWN, never a made-up display

// 4. UCUM recognition and canonicalization only: no magnitude conversion.
console.log(validateUcum("mmol/L").valid, ucumEqual("N", "kg.m/s2"), ucumEqual("mg", "g"));
```

Expected output. Most lines are values the README asserts; the rest follow from the type
declarations. We have not run this exact snippet.

```text
http://loinc.org
M equivalent
Alpha
false
true true false
```

## More in the skill

The skill also lists the [key API](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-terminology/SKILL.md#key-api), the
[limits and known defects](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-terminology/SKILL.md#limits-and-known-defects) and how to handle PHI
([PHI handling](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-terminology/SKILL.md#phi-handling)). The package's own documentation is at
[docs.cosyte.com/terminology/intro](https://docs.cosyte.com/terminology/intro).
