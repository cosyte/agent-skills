# @cosyte/ccda reference (0.1.1)

Everything here comes from the published 0.1.1 README and type declarations. Names are exact
exports; check `node_modules/@cosyte/ccda/dist/index.d.ts` when in doubt.

## API map by task

### Parse and read

- `parseCcda(raw: string, options?: ParseCcdaOptions): CcdaDocument`.
- `ParseCcdaOptions`: `strict` (escalate the first tolerated deviation to a thrown
  `CcdaParseError`), `onWarning` (called for each warning before it is appended to
  `doc.warnings`), `limits` (`CcdaParseLimits`: `maxInputBytes`, `maxDepth`, `maxNodeCount`,
  `maxEntityExpansions`), `profile` (a `CcdaProfile`, or `null` to opt out of the process-scoped
  default), `terminology` (`TerminologyAdapter`), `valueSets` (`ValueSetSource`).
- `DEFAULT_LIMITS` and `resolveLimits(overrides?)` expose the safety caps.
- Hostile or unrecoverable input always throws `CcdaParseError`: DTD or external entity, entity
  expansion, oversized, over-deep or over-wide documents, XML that does not parse, and a root that is
  not `ClinicalDocument`. Its `message` comes from a fixed registry and it keeps no input snippet.

Error-handling recipe:

```ts
import { CcdaParseError, parseCcda, type CcdaDocument } from "@cosyte/ccda";

export function readCcda(xml: string): CcdaDocument | undefined {
  try {
    // Log the stable code and the structural position, never a value from the document.
    return parseCcda(xml, { onWarning: (w) => console.warn(w.code, w.position.path) });
  } catch (err) {
    if (err instanceof CcdaParseError) {
      console.error(err.code, err.position.line, err.position.column);
      return undefined;
    }
    throw err;
  }
}
```

### Scope limits

- Fourteen entry families are extracted (Problems, Medications, Allergies, Results, Vital Signs,
  Immunizations, Procedures, Encounters, smoking status, Plan of Treatment, Functional Status,
  Mental Status, Family History, Past Medical History). Other sections carry only identity and
  narrative.
- UCUM validation is grammatical over a curated atom subset, so a valid but uncurated unit can read
  `NON_UCUM_UNIT`. LOINC deprecation (`checkLoincDeprecation`) is a curated list.
- Within the five adapter slots only the primary coding is checked; `<translation>` alternates are
  preserved but not slot-checked.
- `editCcda` covers twelve section kinds. Functional Status, Mental Status and the Referral Note's
  narrative-only Assessment and Reason for Referral sections are buildable but not editable. There
  is no `APND` or `XFRM` relationship.
- `{ strict: true }` throws `CcdaParseError` on the first tolerated deviation; a warning a profile
  marked `expected` does not escalate.

### The read surface of `CcdaDocument`

| accessor                                    | returns                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `documentType`                              | one of the 12 `DocumentType`s, or `undefined`                               |
| `header`                                    | `CcdaHeader`: `documentId`, `code`, `title`, `effectiveTime`, `setId`, `versionNumber`, `recordTargets`, `relatedDocuments`, `authorship`, `custodian`, `encompassingEncounter` |
| `getPatient()`                              | `CcdaPatient`: `identifiers`, `name` (`HumanName`), `genderCode`, `birthTime`, marital status, race, ethnic group |
| `getMrn()`                                  | the MRN string, or `undefined` (withheld when the first patient id is null-marked) |
| `findSection(key)`, `allSections()`         | `CcdaSection`: `key`, `title`, `code`, `narrativeText`, `narrativeById`, `subsections` |
| `getProblems()`                             | `ProblemConcern[]`: `status`, `effectiveTime`, `problems[]` (`value` is the coded condition) |
| `getMedications()`                          | `Medication[]`: `drug`, `dose`, `doseRange`, `route`, `duration`, `frequency`, `moodCode` |
| `getAllergies()`                            | `AllergyConcern[]`: `status`, `allergies[]` (`allergen`, `reactions`, `criticality`, `noKnownAllergy`) |
| `getResults()`                              | `ResultOrganizer[]`: `results[]` with `code`, `value`, `referenceRange`, `interpretation` |
| `getVitals()`                               | `VitalSignsOrganizer[]`: `vitals[]` with `code`, `value`, `interpretation`   |
| `getImmunizations()`                        | `Immunization[]`: `vaccine`, `dose`, `route`, `effectiveTime`, `refused`     |
| `getProcedures()`                           | `Procedure[]`: `kind`, `disposition` (`"performed"` or `"planned"`), `code`  |
| `getEncounters()`                           | `Encounter[]`: `code`, `statusCode`, `effectiveTime`                         |
| `getSmokingStatus()`                        | `SmokingStatus[]`: `value`, `unknown`                                        |
| `getPlannedItems()`                         | `PlannedItem[]`: `kind`, `disposition`, `code`, `value`                      |
| `getFunctionalStatus()`, `getMentalStatus()`| `StatusObservation[]`: `domain`, `assessmentScale`, `value`, `supporting`    |
| `getFamilyHistory()`                        | `FamilyHistory[]`: `relative` (`relationship`, `gender`, `deceased`), `observations[]` |
| `getPastMedicalHistory()`                   | `Problem[]` (bare Problem Observations, never double-counted as concerns)    |
| `nonXmlBody`                                | `ED` for an Unstructured Document (base64 left inert)                        |
| `warnings`                                  | `CcdaWarning[]`: `code`, `message`, `position`, plus `expected`, `profile`, `toleratedCode`, `valueSet`, `valueSetRelease` when set |

The same lists are also on plain fields (`problems`, `medications`, `allergies`, `results`, `vitals`,
`immunizations`, `procedures`, `encounters`, `smokingStatus`, `plannedItems`, `functionalStatus`,
`mentalStatus`, `familyHistory`, `pastMedicalHistory`).

Datatypes: `II`, `ST`, `BL`, `CD`, `PQ`, `IVL_PQ`, `TS`, `IVL_TS`, `ED`, each with a `nullFlavor`
field. A `CD` keeps `code`, `codeSystem`, `displayName`, `originalText` and `translation[]`.

A result or vital `value` is an `ObservationValue` discriminated on `kind`, and these six arms are
the whole set, so an exhaustive `switch` is complete:

```ts
import type { ObservationValue } from "@cosyte/ccda";

export function valueKind(value: ObservationValue | undefined): string {
  if (value === undefined) return "absent";
  switch (value.kind) {
    case "physicalQuantity":
      return `quantity in ${value.quantity.unit ?? "no unit"}`; // raw text is on value.quantity.raw
    case "coded":
      return `coded in ${value.code.codeSystem ?? "no system"}`;
    case "string":
      return "string";
    case "integer":
      return "integer"; // value.raw keeps the verbatim text
    case "range":
      return "range";
    case "unsupported":
      return `unsupported xsi:type ${value.xsiType ?? "none"}`;
  }
}
```

### Serialize

- `serializeCcda(doc)` and `doc.toString()` re-emit a parsed document from a snapshot taken at parse
  time, with a UTF-8 declaration. Every attribute, namespace declaration, `templateId` and unmodeled
  element survives, and `parseCcda(serializeCcda(doc))` re-serializes to the identical string.
- `doc.withWarnings(extra)` returns a new document with extra warnings appended. Models are
  immutable.
- A hand-constructed `CcdaDocument` keeps no source XML, so `toString()` throws.

### Build

- `buildCcda(init: BuildCcdaInit, options?: BuildCcdaOptions): CcdaDocument` emits a spec-clean
  C-CDA R2.1 document and returns its re-parse. A clean build carries zero warnings.
- `documentType`: `"ccd"` (default), `"referralNote"` or `"dischargeSummary"`
  (`BuildableDocumentType`). Any other value throws a `TypeError`.
- `patient` (`BuildCcdaPatient`) is required: `mrn`, `mrnRoot`, `mrnAssigningAuthority`, `prefix`,
  `given`, `family`, `suffix`, `gender`, `birthTime`. An omitted demographic is emitted as
  `nullFlavor="UNK"`.
- Content lists: `problems`, `allergies`, `medications`, `results`, `vitalSigns`, `immunizations`,
  `procedures`, `encounters`, `smokingStatus`, `functionalStatus`, `functionalStatusOrganizers`,
  `functionalStatusScales`, `mentalStatus`, `mentalStatusOrganizers`, `mentalStatusScales`,
  `pastMedicalHistory`, `planOfTreatment`, `familyHistory`.
- Type-specific inputs: `assessment` and `reasonForReferral` (Referral Note; refused with a
  `TypeError` on a Discharge Summary, ignored on a CCD), `hospitalCourse`, `dischargeDiagnoses`,
  `encompassingEncounter` (Discharge Summary only; refused on the other two types).
- A CCD SHALL section with no content is emitted as an empty `nullFlavor="NI"` section. The other
  sections are emitted only when populated.
- Safety-critical values are never guessed: an omitted dose or route is left absent so the parser
  flags it, a unit is emitted verbatim, a refused immunization is `negationInd="true"`, a planned
  procedure is `moodCode="INT"`, an unrecorded status value is `nullFlavor="UNK"`.
- `buildCcda` throws a `TypeError` for an allergy that is neither `allergen` nor `noKnownAllergy`, a
  result without exactly one of `quantity`, `codedValue`, `stringValue`, an `"observation"`
  procedure without `value`, a family-history entry with empty `observations`, or a `resolution`
  date without `status: "resolved"`.
- A planned medication built without `effectiveTime` is emitted as given and the returned document
  carries `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME`. A Functional Status Organizer without
  `selfCareActivities` is not written; its findings are emitted standalone and the document carries
  `MISSING_SELF_CARE_ACTIVITY`.
- `options.terminology`: `validateCode` flags rejected codes on the re-parse; an optional
  `translate` adds `<translation>` alternates beside the primary code at the five wired slots. The
  primary code is never rewritten.

### Edit

- `editCcda(source, options?: EditCcdaOptions): CcdaDocument`. `source` must come from `parseCcda`.
- `sections`: an ordered list of `SectionEdit`s, each `{ kind, content, mode? }` where `kind` is an
  `EditableSectionKind` (`problems`, `allergies`, `medications`, `results`, `vitalSigns`,
  `immunizations`, `procedures`, `encounters`, `socialHistory`, `pastMedicalHistory`,
  `planOfTreatment`, `familyHistory`) and `mode` is `"add"`, `"replace"` or `"upsert"` (default).
- `revision`: by default an edit stamps a CDA R2 revision (new `ClinicalDocument.id`, same `setId`,
  incremented `versionNumber`, `relatedDocument typeCode="RPLC"`). Pass `revision: false` to edit in
  place, or a `RevisionInit` (`documentId`, `setId`, `versionNumber`).
- A `setId` minted because the source had none is labelled synthetic; check it with
  `isSyntheticSetId(doc.header.setId)` (`SYNTHETIC_SETID_PREFIX`).
- `CcdaEditError.code`: `NO_SOURCE_DOCUMENT`, `NO_STRUCTURED_BODY`, `SECTION_ALREADY_PRESENT`,
  `SECTION_ABSENT`, `REQUIRED_SECTION_MISSING`, `SOURCE_MISSING_ID`.

```ts
import { CcdaEditError, editCcda, parseCcda } from "@cosyte/ccda";

export function replaceMedications(xml: string) {
  try {
    return editCcda(parseCcda(xml), {
      sections: [
        {
          kind: "medications",
          mode: "replace",
          content: [{ drug: { code: "314076", displayName: "Lisinopril 10 MG" } }],
        },
      ],
    });
  } catch (err) {
    if (err instanceof CcdaEditError) {
      console.error(err.code); // a stable code, no document content
      return undefined;
    }
    throw err;
  }
}
```

A `replace` rebuilds that section from your typed input only, so any detail in the original section
that you do not carry over, including detail this package does not model, is gone from the result.

## Dates and times

Every timestamp is a `TS` with the verbatim `raw` string and an eager `date`. `TS.date` treats an
offset-less value as UTC, which puts a date of birth a day out in any negative-offset zone. The three
functions below read `raw` instead, and are the same names and shapes every sibling Cosyte parser
exports (alias them, for example `toISO as ccdaToISO`, when importing two parsers in one file).

```ts
import { toDate, toISO, toObject, type TS } from "@cosyte/ccda";

const onset: TS = { raw: "20260628" };

console.log(toObject(onset)); // { year: 2026, month: 6, day: 28 }, only the stated parts
console.log(toISO(onset)); // "2026-06-28", no trailing Z
console.log(toDate(onset)); // undefined: the value stated no timezone
console.log(toDate(onset, { assumeOffsetMinutes: -300 })?.toISOString()); // "2026-06-28T05:00:00.000Z"
```

- `toObject` returns a frozen `DateParts` with only the stated components; `offsetMinutes` is present
  only when the document wrote an offset.
- `toISO` truncates to the stated precision and never fabricates a `Z`.
- `toDate` returns a `Date` only when the value carries an offset or you pass `assumeOffsetMinutes`.
  It never reads the host timezone and never returns an `Invalid Date`.
- A document-stated offset beyond 23 hours 59 minutes makes all three return `undefined`.

## Medication product identity

The drug (and a vaccine) is read from either arm of `manufacturedProduct`: `manufacturedMaterial`, or
`manufacturedLabeledDrug` (read and flagged `MEDICATION_PRODUCT_ARM_UNEXPECTED`). The same rules
apply to performed and planned medications and immunizations.

- Arms naming different products: `MEDICATION_PRODUCT_ARM_CONFLICT`, `drug` / `vaccine` is
  `undefined`. Every arm still round-trips through `toString()`.
- No arm carries a code: `MISSING_PRODUCT_CODE`.
- The product is named only in a `<translation>`: `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`, and
  `drug.code` is `undefined`. Search `drug.translation` for the coding you want; do not read `[0]`.
- A repeated arm: `MEDICATION_PRODUCT_ARM_REPEATED`. A repeated `<code>` on one arm:
  `MEDICATION_PRODUCT_CODE_REPEATED`.
- On a planned medication, `PlannedItem.code` is the drug from the consumable, never the act code.
- A missing `doseQuantity` or `routeCode` is kept absent and flagged (`MISSING_DOSE_QUANTITY`,
  `MISSING_ROUTE_CODE`), never defaulted.

## Whose data an entry is about: the subject override

- Any `<subject>` declaration on a section or entry is an override, whatever it names, including one
  that restates the patient.
- The whole top-level `<entry>` is withheld from every record-target read path (`getProblems()` and
  the rest) and flagged once with `SUBJECT_CONTEXT_OVERRIDE`, a safety-critical code no profile may
  tolerate. The nearest enclosing declaration wins.
- A Family History Organizer's own `<subject>` is never an override; `getFamilyHistory()` is
  unaffected.
- Withholding is read-side only: `toString()` keeps the entry, and the section narrative is returned
  unredacted. There is no accessor for the third party's data.

## C-CDA release recognition

`CCDA_CONFORMANCE_RELEASE` is `"R2.1"`. The document `templateId` `@extension` is read into a
`TemplateStampReading` (`readTemplateStamp`, `releaseForTemplateExtension`, `CCDA_RELEASE_STAMPS`):

| stamp                     | reading             | diagnostic                                                                 | required-section verdict |
| ------------------------- | ------------------- | -------------------------------------------------------------------------- | ------------------------ |
| `2015-08-01`              | `r21-stamped`       | none                                                                       | the full R2.1 obligation |
| no `@extension`           | `unstamped`         | `TEMPLATE_EXTENSION_ABSENT`                                                | the R1.1-origin reading  |
| any other `@extension`    | `unmodeled-release` | `TEMPLATE_EXTENSION_UNMODELED_RELEASE` and `REQUIRED_SECTIONS_NOT_EVALUATED` | not evaluated            |

C-CDA 3.0.0, 4.0.0 and 5.0.0 documents are recognized and named, not read against their own guides.

## Required sections

- A missing SHALL section raises a `REQUIRED_SECTION_MISSING` warning, never a fatal.
- `requiredSectionStatus(documentType, options?)` returns `keys`, `verification`
  (`traced-complete`, `traced-partial`, `untraced`, `not-applicable`), `evaluation` (`evaluated`,
  `not-evaluated`), `traced`, `unasserted` (with a reason) and `source`. `requiredSectionStatuses()`
  returns all twelve; `requiredSectionKeys` and `missingRequiredSections` expose the table.
  `RequiredSectionOptions`: `r21Stamped`, `stamp`.
- The CCD and Care Plan tables report `traced-complete`. The CCD asserts Allergies, Medications,
  Problems, Results, Social History and Vital Signs (the last two only for an R2.1-stamped
  document). Read the status object at run time for the other types rather than relying on a copy.
- A `traced-partial` type does not check the sections in its `unasserted` list. Nothing here checks
  what a section or entry contains.

```ts
import { parseCcda, requiredSectionStatus, WARNING_CODES } from "@cosyte/ccda";

export function sectionCheck(xml: string) {
  const doc = parseCcda(xml);
  if (doc.documentType === undefined) return undefined;
  const status = requiredSectionStatus(doc.documentType);
  return {
    verification: status.verification,
    evaluation: status.evaluation,
    notChecked: status.unasserted.length,
    missing: doc.warnings.filter((w) => w.code === WARNING_CODES.REQUIRED_SECTION_MISSING).length,
  };
}
```

## Plan of Treatment coverage

`getPlannedItems()` returns seven planned-entry templates (`PlannedItemKind`: `act`, `encounter`,
`procedure`, `medicationActivity`, `supply`, `observation`, `immunizationActivity`), as a direct entry
or nested in a Planned Intervention Act. Instruction, Handoff Communication Participants and
Nutrition Recommendation entries are reported as `PLAN_ENTRY_NOT_MODELED` in the Plan of Treatment
and Interventions sections and are not returned. Goal Observation is not returned. Planned acts
nested in a Nutrition Recommendation, or in a Planned Intervention Act inside an Intervention Act,
are not reached and nothing is raised. A planned item's `disposition` is `"planned"`; a missing or
unrecognized mood leaves it `undefined`.

## Terminology and value sets (bring your own)

- `checkCodeSlot` and the OID constants (`SNOMED_CT`, `RXNORM`, `ICD10_CM`, `ICD10_PCS`,
  `ICD9_CM_DX`, `ICD9_CM_PROC`, `LOINC`, `NDC`, `UNII`, `NCI_ROUTE`, `CVX`, `INTERPRETATION`) do
  structural recognition only: an expected `@codeSystem` per slot, deprecated (ICD-9) or unexpected
  systems flagged. No code-system content is bundled.
- A code with no `@codeSystem` is `MISSING_CODE_SYSTEM` and never reaches the adapter; a present slot
  with no `@code` and no `@nullFlavor` is `MISSING_CODE_VALUE`. The system is never inferred.
- `TerminologyAdapter` is synchronous: `validateCode(coding)` returns `{ result }` or `undefined`
  (no opinion); optional `translate(coding)` returns `{ matches }` or `undefined`. A `false` verdict
  raises `SEMANTIC_CODE_INVALID` with the code preserved.

```ts
import { parseCcda, SNOMED_CT, type TerminologyAdapter } from "@cosyte/ccda";

// Stand-in for your own licensed terminology service.
const knownSnomedCodes = new Set<string>(["59621000"]);

const adapter: TerminologyAdapter = {
  validateCode: (coding) =>
    coding.system === SNOMED_CT ? { result: knownSnomedCodes.has(coding.code) } : undefined,
};

export function parseWithTerminology(xml: string) {
  return parseCcda(xml, { terminology: adapter });
}
```

- `valueSetBinding(slot)` and `valueSetBindings()` declare the value set each of the five slots is
  bound to (`valueSet` OID, `strength` `required` or `preferred`, `conformanceId`). Four are
  Required; `problem` is Preferred. Only identifiers ship, never expansions.
- A `ValueSetSource` answers `member`, `not-a-member` or `no-expansion`. A non-member at a Required
  binding raises `VALUE_SET_BINDING_VIOLATED`; `no-expansion` raises
  `VALUE_SET_BINDING_NOT_EVALUATED`; `undefined` is silent.

```ts
import { parseCcda, valueSetBinding, WARNING_CODES, type ValueSetSource } from "@cosyte/ccda";

// Stand-in for an expansion package you hold under its own licence.
const expansions = new Map<string, ReadonlySet<string>>([
  [valueSetBinding("medication").valueSet, new Set(["314076"])],
]);

const valueSets: ValueSetSource = {
  release: "my-value-set-package-2026.1",
  isMember: ({ valueSet, coding }) => {
    const expansion = expansions.get(valueSet);
    if (expansion === undefined) return { membership: "no-expansion" };
    return { membership: expansion.has(coding.code) ? "member" : "not-a-member" };
  },
};

export function violatesBinding(xml: string): boolean {
  const doc = parseCcda(xml, { valueSets });
  return doc.warnings.some((w) => w.code === WARNING_CODES.VALUE_SET_BINDING_VIOLATED);
}
```

## A `nullFlavor` beside a value

`<doseQuantity nullFlavor="UNK" value="10" unit="mg"/>` raises `CONTRADICTORY_NULL_FLAVOR`
(safety-critical). `PQ.value`, `TS.date` and an `integer` observation value are withheld (`raw`
stays). `CD`, `II`, `ST`, `ED` and `BL` keep their field, with `nullFlavor` beside it. `getMrn()`
returns `undefined` when the first `patientRole/id` is null-marked and does not fall through to the
next id; `getPatient()?.identifiers` still lists every id.

## UCUM

`isValidUcumUnit(unit)` and `isUcumCaseSuspect(unit)` check grammar against a curated atom subset.
`NON_UCUM_UNIT` and `UCUM_CASE_SUSPECT` flag a unit; the raw unit is always preserved.

## Vendor profiles

- `defineCcdaProfile({ name, description?, tolerate?, provenance?, extends? })` builds a
  `CcdaProfile`. Each `tolerate` entry is `{ code, rationale, match? }`. A tolerated warning is
  re-badged `PROFILE_QUIRK_APPLIED` with `expected: true` and `toleratedCode`; nothing is dropped and
  no extracted value changes.
- Tolerating a safety-critical code throws `CcdaProfileDefinitionError` at definition time. Check
  with `isSafetyCriticalCode(code)` or `SAFETY_CRITICAL_CODES`.
- Built-ins: `ccdaProfiles.default` (tolerates nothing), `ccdaProfiles.smartScorecard`,
  `ccdaProfiles.legacyR11`. Also `getCcdaProfile`, `listCcdaProfiles`, `setDefaultCcdaProfile`,
  `getDefaultCcdaProfile`.

```ts
import { ccdaProfiles, defineCcdaProfile, parseCcda } from "@cosyte/ccda";

const senderProfile = defineCcdaProfile({
  name: "example-sender",
  extends: ccdaProfiles.default,
  tolerate: [{ code: "DEPRECATED_LOINC", rationale: "Sender still emits a retired LOINC code." }],
});

export function parseFromSender(xml: string) {
  return parseCcda(xml, { profile: senderProfile });
}
```

## Fatal codes (`FATAL_CODES`, thrown as `CcdaParseError`)

`XXE_OR_DTD_PRESENT`, `ENTITY_EXPANSION_LIMIT`, `INPUT_SIZE_LIMIT_EXCEEDED`,
`ELEMENT_DEPTH_LIMIT_EXCEEDED`, `NODE_COUNT_LIMIT_EXCEEDED`, `NOT_WELL_FORMED_XML`,
`NOT_A_CLINICAL_DOCUMENT`.

## Warning codes (`WARNING_CODES`)

Branch on `warning.code`; renaming a code is a breaking change. Call `isSafetyCriticalCode(code)` to
learn whether a code is safety-critical rather than relying on a list copied from here.

- Document and sections: `UNKNOWN_DOCUMENT_TEMPLATE`, `MISSING_TEMPLATE_ID`,
  `TEMPLATE_EXTENSION_ABSENT`, `TEMPLATE_EXTENSION_UNMODELED_RELEASE`,
  `REQUIRED_SECTIONS_NOT_EVALUATED`, `REQUIRED_SECTION_MISSING`, `UNKNOWN_SECTION_CODE`,
  `SECTION_MATCHED_BY_LOINC_FALLBACK`, `SECTION_PLACEMENT_SUSPECT`, `SUBJECT_CONTEXT_OVERRIDE`,
  `PLAN_ENTRY_NOT_MODELED`.
- XML and datatypes: `UNKNOWN_NAMESPACE_PREFIX`, `ENCODING_BOM_STRIPPED`, `INVALID_NULL_FLAVOR`,
  `CONTRADICTORY_NULL_FLAVOR`, `MALFORMED_DATETIME`, `MULTIPLE_EFFECTIVE_TIMES_UNRESOLVED`.
- Header and identity: `MULTIPLE_RECORD_TARGETS`, `MISSING_ASSIGNING_AUTHORITY`,
  `UNIDENTIFIED_AUTHOR`.
- Codes and narrative: `CODE_NARRATIVE_MISMATCH`, `NARRATIVE_REFERENCE_BROKEN`,
  `UNEXPECTED_CODE_SYSTEM`, `DEPRECATED_CODE_SYSTEM`, `MISSING_CODE_SYSTEM`, `MISSING_CODE_VALUE`,
  `DEPRECATED_LOINC`, `SEMANTIC_CODE_INVALID`, `VALUE_SET_BINDING_VIOLATED`,
  `VALUE_SET_BINDING_NOT_EVALUATED`.
- Medications and allergies: `MISSING_DOSE_QUANTITY`, `MISSING_ROUTE_CODE`, `MISSING_PRODUCT_CODE`,
  `MEDICATION_PRODUCT_ARM_UNEXPECTED`, `MEDICATION_PRODUCT_ARM_CONFLICT`,
  `MEDICATION_PRODUCT_ARM_REPEATED`, `MEDICATION_PRODUCT_CODE_REPEATED`,
  `MEDICATION_PRODUCT_CODE_TRANSLATION_ONLY`, `NEGATION_VS_NULLFLAVOR_AMBIGUOUS`,
  `ALLERGEN_GRANULARITY_SUSPECT`, `PROBLEM_STATUS_INDETERMINATE`.
- Results and units: `NON_UCUM_UNIT`, `UCUM_CASE_SUSPECT`, `MISSING_UNIT_ON_PQ`,
  `FREE_TEXT_REFERENCE_RANGE`, `RESULT_VALUE_TYPE_UNHANDLED`.
- Events and status: `IMMUNIZATION_REFUSED`, `PROCEDURE_MOOD_UNEXPECTED`,
  `PLANNED_VS_PERFORMED_AMBIGUOUS`, `SMOKING_STATUS_UNKNOWN`, `SMOKING_STATUS_CODE_UNRECOGNIZED`.
- Emit side (`buildCcda`, `editCcda`): `MISSING_PLANNED_MEDICATION_EFFECTIVE_TIME`,
  `MISSING_SELF_CARE_ACTIVITY`.
- Profiles: `PROFILE_QUIRK_APPLIED`.

`CcdaWarning.position` (`CcdaPosition`) has `path`, `line`, `column`, `templateId`, `sectionCode`.
Only some codes carry `sectionCode` or `templateId`; do not assume a field is present.

## Lower-level exports

The package also exports the building blocks the parser uses (`extractProblems`,
`extractMedications` and the other `extract*` functions, the `parse*` datatype readers,
`buildHeader`, `buildSection`, `parseSecureXml`, DOM helpers such as `child` and `attr`). They take
`@xmldom/xmldom` elements and a `ParseCtx`. Prefer `parseCcda` and the `CcdaDocument` accessors;
handing a subsection to an `extract*` function withholds subject-override entries exactly as a full
parse does.
