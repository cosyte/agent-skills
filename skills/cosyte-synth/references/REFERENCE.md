# @cosyte/synth reference

Recipes for the cosyte-synth skill, version 0.1.1, taken from the package README. Every name here
is in the published type declarations. Each subpath needs its parser installed as a peer.

Before you assert on generated values, read the skill's known-defect list: synth's X12 271 EB-08
percent, NCPDP 442-E7 quantity and ASTM header sender fields are not ground truth.

## FHIR R4 and US Core

```ts
import { generatePatient, generateBundle, fhirCorpus, roundTrip } from "@cosyte/synth/fhir";

// A US Core Patient: same seed gives a byte-identical resource, anywhere.
const patient = generatePatient({ seed: 12345, profile: "us-core" });

// Spec-clean by construction: it round-trips through @cosyte/fhir with zero errors, byte-stable.
console.log(roundTrip(patient).specClean); // true

// A self-contained Bundle assembling a patient and its clinical spine, wired by urn:uuid references.
const bundle = generateBundle({ seed: 42, type: "transaction" });

// Or a reproducible mixed corpus across the whole spine.
const corpus = fhirCorpus({ seed: 2026, count: 6 });
console.log(bundle !== undefined, corpus.artifacts.every((a) => a.warnings.length === 0)); // true true
```

Resources: `Patient` (base or US Core), `Condition`, `Observation` (laboratory and vital signs),
`MedicationRequest`, `Encounter`, `DiagnosticReport`, `Immunization`, `AllergyIntolerance`,
`Procedure`, `Provenance`, assembled into a `collection`, `transaction` or `document` Bundle.
`usCoreCoverage()` lists every US Core 6.1.0 profile with its canonical URL and whether this build
generates it; `generateUsCoreProfile()` returns an artifact for a covered profile and otherwise
throws `SYNTH_PROFILE_NOT_GENERATED` (a published profile this build does not generate) or
`SYNTH_UNSUPPORTED_KIND` (a name outside the guide) before generating anything. To check US Core
conformance, pass your own `StructureDefinition`s through `roundTrip(resource, { profiles })`.

## C-CDA R2.1

```ts
import { serializeCcda } from "@cosyte/ccda";
import { generateCcd, generateReferralNote, ccdaCorpus, roundTrip } from "@cosyte/synth/ccda";

// Same seed gives a byte-identical document. The patient name is from the shipped fake-name pool,
// the MRN lives under a synthetic assigning-authority OID, and every date is seeded.
const ccd = generateCcd({ seed: 12345 });
const xml = serializeCcda(ccd); // spec-clean C-CDA R2.1 XML

console.log(xml.length > 0, roundTrip(ccd).specClean); // true true
console.log(roundTrip(generateReferralNote({ seed: 12345 })).specClean); // true

const corpus = ccdaCorpus({ seed: 42, count: 4 }); // CCD and Referral Note, cycled
console.log(corpus.artifacts.every((a) => a.warnings.length === 0)); // true
```

Sections populated from license-clean example-code pools: Problems, Allergies, Medications,
Results, Vital Signs, Immunizations, Procedures, Social History.

## X12 005010

```ts
import { generate837P, generate835, generate271, x12Corpus, roundTrip } from "@cosyte/synth/x12";

// The provider NPI has a deliberately invalid Luhn check digit, the provider tax id is an SSA
// never-issued 900-range SSN, and member ids live under a synthetic assigning authority.
const claim = generate837P({ seed: 12345 });
console.log(roundTrip(claim).specClean); // true
console.log(roundTrip(generate835({ seed: 7 })).specClean); // true, balance-checked by construction
console.log(roundTrip(generate271({ seed: 3 })).specClean); // true, but see the EB-08 defect

const corpus = x12Corpus({ seed: 42 }); // 837P, 837I, 837D, 835 and 271
console.log(corpus.artifacts.every((a) => a.warnings.length === 0)); // true
```

Not generated yet: the 270 eligibility request, and X12 vendor-quirk mode.

## NCPDP

```ts
import { generateNewRx, generateB1, ncpdpCorpus, scriptRoundTrip, telecomRoundTrip } from "@cosyte/synth/ncpdp";

// The prescriber NPI has a deliberately invalid Luhn check digit and the DEA number a deliberately
// invalid checksum; patient and cardholder ids live under a synthetic assigning authority and
// phones are reserved 555-01xx.
console.log(scriptRoundTrip(generateNewRx({ seed: 12345 })).specClean); // true
console.log(telecomRoundTrip(generateB1({ seed: 777 })).specClean); // true, but see the 442-E7 defect

const corpus = ncpdpCorpus({ seed: 42 }); // NewRx, RxRenewal, RxChange, B1, B2, B3
console.log(corpus.artifacts.every((a) => a.warnings.length === 0)); // true
```

The generators return wire strings (SCRIPT XML or Telecom bytes as a string). SCRIPT lifecycle
responses and NCPDP vendor-quirk mode are not generated yet.

## ASTM

```ts
import {
  generateAstmResult,
  generateAstmResultFramed,
  astmRoundTrip,
  astmFramedRoundTrip,
  astmCorpus,
} from "@cosyte/synth/astm";

// The P record's name, birth date and the practice- and laboratory-assigned patient ids are all
// synthetic, and the two ids are minted independently so they stay distinct.
console.log(astmRoundTrip(generateAstmResult({ seed: 12345 })).specClean); // true, but see the header defect

// The E1381-framed twin: checksum and 0 to 7 frame numbers are computed by @cosyte/astm.
console.log(astmFramedRoundTrip(generateAstmResultFramed({ seed: 12345 })).specClean); // true

const corpus = astmCorpus({ seed: 42 }); // a result report and an order
console.log(corpus.artifacts.every((a) => a.warnings.length === 0)); // true
```

`generateAstmResult` takes `resultCount` and `comment` options beside `seed`.

## Vendor-quirk fixtures

```ts
import { generateHl7Quirk, hl7QuirkRoundTrip } from "@cosyte/synth/hl7";
import { generateCcdaQuirk, ccdaQuirkRoundTrip } from "@cosyte/synth/ccda";
import { generateAstmQuirk, astmQuirkRoundTrip } from "@cosyte/synth/astm";

// A site-defined HL7 v2 Z-segment gives exactly UNKNOWN_SEGMENT; the `visage` profile suppresses it.
console.log(hl7QuirkRoundTrip(generateHl7Quirk({ seed: 1, quirk: "unknown-zsegment" })).warnings);

// A deprecated C-CDA LOINC gives exactly DEPRECATED_LOINC; `smartScorecard` re-badges it.
console.log(ccdaQuirkRoundTrip(generateCcdaQuirk({ seed: 1, quirk: "deprecated-loinc" })).withProfile?.tolerated);

// A non-standard ASTM &Z& escape gives exactly ASTM_UNKNOWN_ESCAPE_SEQUENCE; `referenceCorpus` re-badges it.
console.log(astmQuirkRoundTrip(generateAstmQuirk({ seed: 1, quirk: "unknown-escape" })).intendedWarningHeld);
```

| Format | Quirk names |
| ------ | ----------- |
| HL7 v2 | `unknown-zsegment`, `unknown-escape` |
| C-CDA | `template-extension-absent`, `deprecated-loinc`, `deprecated-code-system` |
| ASTM | `unknown-escape`, `unknown-record-type` |

A quirk round-trip result carries `warnings`, `intendedWarnings`, `intendedWarningHeld` and, where
a public parser profile claims the quirk, `withProfile` (`profileName`, `disposition`, `warnings`,
`tolerated`). Every quirk is grounded in a publicly documented deviation or a parser's public
profile. Use `hl7QuirkCorpus`, `ccdaQuirkCorpus` or `astmQuirkCorpus` for a quirk corpus.

## The deid pairing loop

```ts
import {
  hl7DeidLoop,
  fhirDeidLoop,
  x12DeidLoop,
  ncpdpTelecomDeidLoop,
  ccdaDeidLoop,
  summarizeDeidCoverage,
} from "@cosyte/synth/deid";

const r = hl7DeidLoop({ seed: 42, kind: "ORU^R01" });
console.log(r.pass, r.survivors.length, r.clinicalScrubbed.length); // true 0 0

const summary = summarizeDeidCoverage([
  hl7DeidLoop({ seed: 1 }),
  fhirDeidLoop({ seed: 1 }),
  x12DeidLoop({ seed: 1, variant: "837P" }),
  ncpdpTelecomDeidLoop({ seed: 1, transaction: "B1" }),
  ccdaDeidLoop({ seed: 1 }),
]);
console.log(summary.allPass); // true: zero survivors, zero over-scrub, per format
```

A surviving sentinel is a hard failure; a scrubbed clinical value is the over-scrub guard. The
removal check is locus-scoped, so provider or organization identity a de-identifier legitimately
keeps never reads as a false survivor. This is a co-validation harness on synth's own output, not
an independent audit of `@cosyte/deid` against real-world data. `DEID_LOOP_SKIPPED` names NCPDP
SCRIPT, ASTM and DICOM.

## Synthetic values

```ts
import { createRng, safe, isSyntheticSsn, isItinFormatted, isSyntheticNpi } from "@cosyte/synth";

const rng = createRng(42);
const nationalId = safe.ssn(rng);
console.log(isSyntheticSsn(nationalId)); // true, always an SSA never-issued SSN
console.log(isItinFormatted(nationalId)); // false, never a validly formatted IRS ITIN either
console.log(isSyntheticNpi(safe.npi(rng))); // true, always a deliberately-invalid-Luhn NPI
```

`safe` also has `phone`, `email`, `ipv4`, `ipv6`, `uuid`, `name`, `address`, `identifier`,
`dateYmd` and `dea`; each takes the `Rng`. Use the matching `isSynthetic*` check
(`isSyntheticPhone`, `isSyntheticEmail`, `isSyntheticIp`, `isSyntheticDea`) to assert a value in
your own fixture is from a reserved range.

## Fatal codes

`SynthError` carries `code` (from `SYNTH_FATAL_CODES`) and a fixed message that quotes nothing you
passed.

| Code | Meaning |
| ---- | ------- |
| `SYNTH_UNSUPPORTED_KIND` | a message kind, document type, corpus mix entry, claim variant, Bundle type or profile name outside its closed set |
| `SYNTH_PROFILE_NOT_GENERATED` | a US Core profile the guide publishes but this build does not generate |
| `SYNTH_UNSUPPORTED_QUIRK` | a quirk the format's profile system does not support |
| `SYNTH_QUIRK_ANCHOR_ABSENT` | a quirk found no structural anchor to mutate |
| `SYNTH_INTENDED_WARNING_MISMATCH` | a quirk artifact did not parse to exactly its intended warning codes |
| `SYNTH_UNMAPPED_CODE_SYSTEM` | a C-CDA example concept's code system has no OID mapping |
| `SYNTH_INVALID_DECIMAL` | a money value could not be read as an X12 decimal |
| `SYNTH_INVALID_RANGE` | an integer range with its maximum below its minimum |
| `SYNTH_EMPTY_POOL` | a draw from an empty pool |
| `SYNTH_INVALID_PROFILE` | a `defineSynthProfile` spec with a missing or blank name |
| `SYNTH_UNSUPPORTED_FORMAT` | reserved; no code path in 0.1.1 raises it |
