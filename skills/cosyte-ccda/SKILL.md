---
name: cosyte-ccda
description: "Parse, build, edit and serialize C-CDA (HL7 CDA R2) clinical documents in TypeScript with @cosyte/ccda. Use when a developer wants to read a CCD, Discharge Summary, Referral Note or another C-CDA R2.1 XML document (a ClinicalDocument root in a .xml or .cda file), extract problems, medications, allergies, results, vital signs, immunizations, procedures, encounters, smoking status, plan of treatment or family history, get the patient and MRN, check required SHALL sections, build a spec-clean CCD, Referral Note or Discharge Summary, or replace a section and re-emit the document. Also covers coded parse warnings such as REQUIRED_SECTION_MISSING and SUBJECT_CONTEXT_OVERRIDE, strict mode, and a bring-your-own terminology adapter. For FHIR R4 JSON or XML use cosyte-fhir; for code system lookups, ConceptMap or UCUM use cosyte-terminology; for HL7 v2 messages use cosyte-hl7."
license: MIT
metadata:
  package: "@cosyte/ccda"
  version: "0.1.6"
  docs: "https://docs.cosyte.com/ccda/intro"
---

# @cosyte/ccda

C-CDA parser, serializer, and builder for Node.js and TypeScript, lenient on parse and spec-clean on
emit. It reads a vendor-quirky document into typed clinical models and turns each deviation into a
stable coded warning; where a document contradicts itself, the value is withheld and flagged.

## When to use it

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

```bash
npm install @cosyte/ccda
```

`pnpm add @cosyte/ccda` and `yarn add @cosyte/ccda` install the same package. Node `>=22.0.0`. Dual
ESM and CJS with per-condition type declarations. One runtime dependency, `@xmldom/xmldom`
(exact-pinned), the W3C DOM substrate for the XML.

## Minimal example

Adapted from the README's tested example. The name is joined from its parts on purpose (see Limits).

```ts
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

// Read the identifying fields into variables. Do not log them: the values in the comments are
// synthetic.
const mrn = doc.getMrn(); // "MRN001" (synthetic)
const birthDate = toISO(patient?.birthTime); // "1980-01-01" (synthetic)
// displayName is "Jane Doe" (synthetic)

// Log only what is safe: a document type, booleans, codes from a code system, codes and counts.
console.log(doc.documentType);
console.log("patient fields present", mrn !== undefined, displayName !== "", birthDate !== undefined);
console.log("problem", problem?.problems[0]?.value?.code, problem?.status);
console.log("medication", doc.getMedications()[0]?.drug?.code);
console.log("allergy", allergen?.code);
console.log("warnings", doc.warnings.map((w) => w.code));
console.log("round trip unchanged", parseCcda(doc.toString()).toString() === xml);
```

Expected output. Most lines are values the README asserts; the rest follow from the type
declarations. We have not run this exact snippet.

```text
ccd
patient fields present true true true
problem 59621000 active
medication 314076
allergy 7980
warnings []
round trip unchanged true
```

Hostile or unparseable input (DTD, entity expansion, size or depth limits, malformed XML, a root
that is not `ClinicalDocument`) always throws `CcdaParseError`; catch it and log `err.code` and
`err.position`, as in the reference's error-handling recipe.

## Key API

- `parseCcda(raw, options?)`: XML to `CcdaDocument` (options `strict`, `onWarning`, `limits`,
  `profile`, `terminology`, `valueSets`). `serializeCcda(doc)` re-emits it byte for byte.
- `CcdaDocument`: `documentType`, `header`, `warnings`, `getPatient()`, `getMrn()`, `findSection()`,
  and one `get*()` per entry family (`getProblems()`, `getMedications()`, `getAllergies()`,
  `getResults()`, `getVitals()`, `getImmunizations()`, `getProcedures()`, `getPlannedItems()` ...).
- `buildCcda(init, options?)`: emit a CCD, `"referralNote"` or `"dischargeSummary"`.
  `editCcda(source, options?)`: add, replace or upsert whole sections (throws `CcdaEditError`).
- `CcdaParseError` (`code`, `position`), `FATAL_CODES`, `WARNING_CODES`, `isSafetyCriticalCode`.
- `toObject`, `toISO`, `toDate`; `requiredSectionStatus`, `CCDA_CONFORMANCE_RELEASE`;
  `TerminologyAdapter`, `ValueSetSource`, `defineCcdaProfile`, `ccdaProfiles`.

## Limits and known defects

- **Do not display or match on `HumanName.text`** (`getPatient()?.name?.text`, an author's
  `person?.text`). In 0.1.6 it is the `<name>` element's trimmed text content, so compact XML,
  including every document `buildCcda` emits, gives run-together names (`JaneDoe`) and
  pretty-printed XML gives newlines and indentation between parts. Join `prefix`, `given`, `family`
  and `suffix` yourself with single spaces. Since 0.1.2 the `HumanName` type declaration says the
  same, and the `CcdaPatient` and `CcdaAuthor` JSDoc examples no longer fall back to `.text`.
- Do not read `TS.date` for a birth date or other offset-less value: it assumes UTC and can be a day
  out. Use `toObject`, `toISO`, or `toDate` (`undefined` unless an offset is known).
- A quiet parse is not a conformance result. Required-section checks under-warn (read
  `requiredSectionStatus`); validation is against C-CDA R2.1 only. Use an external validator when
  IG conformance matters.
- `buildCcda` emits three of twelve document types (others throw a `TypeError`). `editCcda` is
  whole-section only: no entry-level append, no section removal, `RPLC` revisions only.
- Entries under a `<subject>` declaration are withheld from every `get*` path and flagged
  `SUBJECT_CONTEXT_OVERRIDE`; check for it before concluding a list is empty.
- The terminology adapter sees five slots only (`problem`, `medication`, `allergen`, `route`,
  `vaccine`). Code-system checks are OID recognition; no licensed content is bundled.
- Contradictions withhold values: `PQ.value` is `undefined` beside a `nullFlavor` (read `raw`),
  `getMrn()` is `undefined` when the first patient id is null-marked, conflicting medication product
  arms leave `drug` undefined. Handle `undefined` everywhere.
- More scope limits (UCUM subset, LOINC list, Plan of Treatment coverage, editable kinds) are in
  [references/REFERENCE.md](references/REFERENCE.md).

## PHI handling

Treat every C-CDA document, and everything parsed from it, as PHI.

- The library does no logging. Messages come whole from a frozen registry and interpolate nothing
  from the document; a `position` holds only element path, section LOINC code, template OID, line
  and column. `CcdaParseError` keeps no input snippet.
- A `CcdaDocument` holds the model and a snapshot of the source XML while you hold it. Nothing is
  written to disk or sent anywhere; a `TerminologyAdapter` you supply is your own egress.
- Your application owns transport, access control, audit, retention, and whether anything you log
  (a document id, an element path, even a count) is safe where you write it.
- Log `warning.code` and `warning.position`, never `doc.toString()`, narrative, names, MRNs or values.
- Use synthetic documents in tests and examples (`buildCcda` makes them). Never paste a real patient
  document into a prompt, fixture, log or issue.

## Docs

- https://docs.cosyte.com/ccda/intro
- https://www.npmjs.com/package/@cosyte/ccda
- https://github.com/cosyte/ccda
- [references/REFERENCE.md](references/REFERENCE.md): API map by task, the full read surface, dates,
  medication product rules, subject override, release recognition, required sections, build and
  edit details, terminology and value-set recipes, profiles, and the warning and fatal code lists.
