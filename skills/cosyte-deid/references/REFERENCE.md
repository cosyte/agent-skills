# @cosyte/deid reference

Fuller detail for the `cosyte-deid` skill. Version read: `0.2.3`. Facts come from the published README
and type declarations. Read the README's "Known limitations and honesty" section and the limitations
document it links before relying on this library for anything that leaves your control. Nothing here
says an output is de-identified: the library's own label is "Safe-Harbor-transformed per the configured
policy" (`OUTPUT_LABEL`), and it transforms per a policy and evidences what it did; it never certifies.

## API map by entry point

| Entry point | Exports worth knowing |
| --- | --- |
| `@cosyte/deid` | `deidentify`, `DeidOptions`, `createDeidContext`, `DeidContext`, `createDeidRegistry`, `DeidRegistry`, `SAFE_HARBOR_POLICY`, `defineDeidPolicy`, `resolvePolicy`, `SAFE_HARBOR_PROFILE`, `LIMITED_DATA_SET_PROFILE`, `defineDeidProfile`, `profileOptions`, `buildExpertDeterminationSupportReport`, `formatExpertDeterminationSupportReport`, `EXPERT_DETERMINATION_DISCLAIMER`, `FreeTextRedactor`, `SAFE_HARBOR_CATEGORIES`, `SAFE_HARBOR_CATEGORY_META`, `DEID_DISPOSITION_CODES`, `FATAL_CODES`, `DeidError`, `OUTPUT_LABEL`, `WITHHELD_LOCUS_TOKEN`, `RETAINED_LOCUS_CLASSES`, `RESTRICTED_ZIP3`, `VERSION` |
| `@cosyte/deid` (transform primitives) | `redact`, `generalizeDate`, `generalizeZip`, `generalizeAge`, `dateShift`, `pseudonymize`, `keyedHash`, `unkeyedHash` |
| `@cosyte/deid/hl7` | `deidentifyHl7(msg, options?)`, `deidentifyHl7String(raw, options?)` returning `{ document, hl7, manifest, unexaminedResiduals }`; `HL7_LOCUS_MAP`, `RETAIN_SEGMENTS`, `HL7_DATE_LOCI` |
| `@cosyte/deid/ccda` | `deidentifyCcda(doc, options?)` returning `{ document, manifest, unexaminedResiduals }`; `CCDA_LOCUS_MAP` |
| `@cosyte/deid/fhir` | `deidentifyFhir(resource, options?)`, `deidentifyFhirJson(json, options?)` (adds `json`); `FHIR_DEMOGRAPHIC_ELEMENTS`, `PERSON_RESOURCE_TYPES` |
| `@cosyte/deid/x12` | `deidentifyX12(interchange, options?)`, `deidentifyX12String(raw, options?)` returning `{ x12, manifest, unexaminedResiduals }` |
| `@cosyte/deid/ncpdp` | `deidentifyTelecom(tx, options?)`, `deidentifyTelecomString(raw, options?)` returning `{ telecom, manifest, unexaminedResiduals }`; `NCPDP_SCRIPT_REFUSAL_MESSAGE`, `NCPDP_MULTI_TRANSACTION_REFUSAL_MESSAGE` |
| `@cosyte/deid/dicom` | `deidentifyDicom(dataset, options?)`, `deidentifyDicomBuffer(bytes, options?)`, `DicomDeidOptions` (`policy`, `uidMap`, `uidRoot`), `BURNED_IN_ANNOTATION_CODE`, `CID_7050`, `INPUT_METHOD_CODE_SEQUENCE_DROPPED_CODE` |

The `String` and `Json` convenience entries parse for you and discard parse warnings; call the
parser directly when you need those warnings.

## What each adapter covers (from the README)

Every adapter locates PHI structurally in the parsed model, never by regex over raw bytes, and fails
closed: an unrecognized structure, an un-locatable identifier or free text is blocked, and clinical
values are retained untouched (the over-scrub guard).

- **HL7 v2**: PID and NK1 / GT1 / IN1 / IN2 loci (name, relatives, SSN, phone, MRN, account removed;
  DOB to year; address to the safe 3-digit ZIP). Employer positions in GT1 / IN1 / IN2 are acted on.
  Segments not on the retain list (for example MRG, FAM, ACC) and Z-segments are blocked. OBX-5 is kept
  only when OBX-2 types it as a structured clinical value; `TX`, `FT`, `ST` and unknown types, and NTE-3,
  are blocked. Inside retained segments PV1-44, PV1-45, OBR-7 and DG1-5 go to year, and PV1-19,
  OBR-2/3 and ORC-2/3 are blocked under Safe Harbor as the (R) catch-all: the manifest records
  `DEID_LOCUS_BLOCKED`, not a removal (a PV1-19 whose CX-5 type is `MR`, `AN` or `SS` is handled as
  that number). Every other position the v2.5.1 definitions type as a date is acted on too. Only this
  adapter reads retention classes (for example `limited-data-set-geography`).
- **C-CDA**: header participations (`recordTarget` with `guardian`, `author`, `dataEnterer`,
  `informant`, `authenticator`, `legalAuthenticator`, `participant`, `custodian`, `documentationOf`,
  `componentOf`). Section `<text>`, `nonXMLBody`, unknown and foreign elements are blocked. The coded
  `structuredBody` entries are retained.
- **FHIR R4**: person resources (`Patient`, `RelatedPerson`, `Practitioner`, `Person`,
  `Patient.contact`); any `HumanName` or `Address` anywhere, decided by datatype; `identifier`, dates,
  `text.div`, extension values and `Reference.display` on every resource. Contained resources and
  `Bundle` entries are walked.
- **X12 (005010)**: `NM1` patient-side parties, employers (entity code `36`), unknown entity codes
  (blocked), `N3` / `N4`, `DMG-02`, `DTP-03`, `DTM-02`, `PER`, `REF` by qualifier, `CLM-01` / `CLP-01`,
  `SBR-03` / `SBR-04`. Recognized provider and payer organizations and clinical / financial segments
  are retained.
- **NCPDP Telecom vD.0**: Patient (`01`), Insurance (`04`), Coordination of Benefits (`05`) and the
  header Date of Service; Prescriber (`03`) id removed; free-text fields `544-FY` and `504-F4` and
  unknown segments blocked.
- **DICOM**: delegates to `@cosyte/dicom`'s PS3.15 Annex E Basic Profile; Study / Series / SOP Instance
  UIDs remapped consistently; private tags removed; clinical and technical values and pixel bytes
  retained untouched. Writes `Patient Identity Removed = YES`, the `(0012,0063)` text and CID 7050
  codes in `(0012,0064)`. An input `(0012,0064)` is dropped with a value-free warning.

## Residuals and limits, in the README's terms

- Safe Harbor's actual-knowledge condition (§164.514(b)(2)(ii)) is the consumer's.
- Expert Determination is supported, never rendered or certified.
- Free text is block-by-default; a BYO redactor's completeness is the consumer's responsibility.
- Non-date fields of a retained HL7 v2 segment that the carve-outs do not name are not de-identified,
  including provider names in PV1-7/8 and OBR-16, GT1-51, and date components inside a person-name or
  address composite. A position only a version other than v2.5.1 types as a date is a residual.
- C-CDA: entry service dates, entry ids, in-entry performer names and family-history relative
  demographics in the retained clinical body are not de-identified; the document `id` / `code` /
  `title` envelope is retained.
- FHIR: extension values are block-only (a `us-core-*` demographic extension is dropped); reference
  wiring and resource ids are preserved, with no coordinated pseudonymization across a corpus;
  `contentAttachment` binary content and a built-in narrative scrub are out of scope. Five residual
  surfaces: a `ContactPoint` outside a person resource; an organisation's own `name`; the employer as a
  separate `Organization`; a name or address with an undefined property or wrong marker shape at a
  position R4 does not type; a name or address inside a person resource at a property the map does not
  list (for example a vendor `Patient.alias`).
- An employer named only in free text is reached only by a BYO redactor.
- Unexamined positions are counted on `unexaminedResiduals` with locus and count, never cleaned and
  never assigned a Safe Harbor category. A structure whose positions cannot be enumerated fails the
  pass with `DEID_POSITIONS_UNENUMERABLE`.
- NCPDP SCRIPT is refused (`DEID_FORMAT_UNSUPPORTED`), with no partial output.
- NCPDP Telecom: one transaction per message. A transmission that decodes to more than one
  transaction, whose header declares more than one, or whose decode carries
  `NCPDP_TELECOM_TRANSACTION_COUNT_MISMATCH` is refused (`DEID_FORMAT_UNSUPPORTED`, message
  `NCPDP_MULTI_TRANSACTION_REFUSAL_MESSAGE`) with no partial output (since 0.2.3).
- X12: every element of the output is decided (since 0.2.0). A value that lacks the shape its
  position expects, or sits at a position no rule names, is removed and recorded as a blocked manifest
  row; `unexaminedResiduals` is always empty for X12.
- DICOM is metadata-only (`metadataOnly` is always `true`); burned-in text (Safe Harbor category Q) is
  flagged with `burnedInAnnotationHazard` and `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED`, never cleaned.
  Do not release such an image on metadata alone.
- DICOM De-identification Method `(0012,0063)` is four Values of at most 64 characters each
  (since 0.2.1): `Cosyte @cosyte/deid`, `PS3.15 Basic Application Level Confidentiality Profile`,
  `metadata only`, and `policy "<name>"`. In the policy name a backslash is written as `/` and any
  character outside printable ASCII as `?`; a name too long for its Value is cut and ends in `...`.
  `(0012,0064)` carries the coded profile.

## Recipes

These blocks need the matching parser installed as a peer. All values are synthetic placeholders.

### HL7 v2 plus an Expert Determination support report

```ts
import { parseHL7 } from "@cosyte/hl7";
import { deidentifyHl7 } from "@cosyte/deid/hl7";
import { buildExpertDeterminationSupportReport, createDeidContext } from "@cosyte/deid";

export function deidentifyMessage(rawMessage: string, key: string) {
  const context = createDeidContext({ key });
  const { document, manifest, unexaminedResiduals } = deidentifyHl7(parseHL7(rawMessage), { context });
  const report = buildExpertDeterminationSupportReport(manifest, {
    policy: "safe-harbor",
    unexaminedResiduals,
  });
  // report.determination is always null: the library never renders one.
  return { wire: document.toString(), manifest, unexaminedResiduals, report };
}
```

`formatExpertDeterminationSupportReport(report)` renders the same facts as Markdown for a
statistician. The report never says the output is de-identified, computes no risk score, and its
k-anonymity indicator uses only class sizes you supply (`quasiIdentifiers`).

### FHIR JSON and X12 text in one call each

```ts
import { deidentifyFhirJson } from "@cosyte/deid/fhir";
import { deidentifyX12String } from "@cosyte/deid/x12";
import { createDeidContext } from "@cosyte/deid";

export function transformBoth(fhirJson: string, x12Text: string, key: string) {
  const context = createDeidContext({ key });
  const fhir = deidentifyFhirJson(fhirJson, { context });
  const x12 = deidentifyX12String(x12Text, { context });
  return { fhir: fhir.json, x12: x12.x12, manifests: [fhir.manifest, x12.manifest] };
}
```

### NCPDP Telecom, one transaction at a time

```ts
import { deidentifyTelecomString } from "@cosyte/deid/ncpdp";
import { DeidError, FATAL_CODES } from "@cosyte/deid";

// Pass a message that carries exactly one transaction; one that carries more is refused.
export function transformClaim(raw: string) {
  try {
    return deidentifyTelecomString(raw);
  } catch (err) {
    if (err instanceof DeidError && err.code === FATAL_CODES.DEID_FORMAT_UNSUPPORTED) {
      return undefined; // NCPDP SCRIPT XML, or more than one transaction: refused, no partial output
    }
    throw err;
  }
}
```

### DICOM bytes, with the burned-in hazard and the warnings surfaced

```ts
import { deidentifyDicomBuffer } from "@cosyte/deid/dicom";

// One shared map per study keeps replacement UIDs consistent across calls. It holds source UIDs.
const uidMap = new Map<string, string>();

export function transformDicom(part10: Buffer) {
  const result = deidentifyDicomBuffer(part10, { uidMap });
  return {
    bytes: result.bytes,
    holdForPixelReview: result.burnedInAnnotationHazard, // true: do not release on metadata alone
    warningCodes: result.warnings.map((w) => w.code), // log codes, never values
    uidScope: result.uidReferentialIntegrity.scope, // "single-call" or "caller-supplied-cache"
  };
}
```

### Longitudinal research linkage (not Safe Harbor)

```ts
import {
  createDeidRegistry,
  defineDeidPolicy,
  deidentify,
  SAFE_HARBOR_CATEGORIES,
  type GenericLocus,
} from "@cosyte/deid";

export function shiftForResearch(key: string, patientKey: string, loci: readonly GenericLocus[]) {
  const registry = createDeidRegistry({ key });
  const research = defineDeidPolicy({
    name: "research", // date-shift may not wear the "safe-harbor" label
    transforms: { [SAFE_HARBOR_CATEGORIES.DATES]: "date-shift" },
  });
  return deidentify({ loci }, { policy: research, context: registry.forPatient(patientKey) });
}
```

The registry keeps the same patient's date offset and the same identifier's pseudonym across documents
and runs. Rotating the key breaks that linkage on purpose. Date shift and keyed surrogates are Expert
Determination support, not Safe Harbor, and loci carrying a keyed surrogate are flagged
`reidentificationCode: true`.

### Profiles that can only tighten

```ts
import {
  createDeidContext,
  defineDeidProfile,
  profileOptions,
  SAFE_HARBOR_CATEGORIES,
  SAFE_HARBOR_PROFILE,
} from "@cosyte/deid";

export function siteOptions(key: string) {
  const site = defineDeidProfile({
    name: "site-strict",
    base: SAFE_HARBOR_PROFILE,
    transforms: { [SAFE_HARBOR_CATEGORIES.GEOGRAPHIC]: "redact" }, // generalize to redact is stronger
  });
  return profileOptions(site, createDeidContext({ key })); // pass to any adapter
}
```

A weakening override is a fatal `DEID_PROFILE_INVALID`. `LIMITED_DATA_SET_PROFILE` date-shifts, keeps
keyed surrogates and (HL7 v2 only) keeps town, State and the whole zip code; it requires a keyed
per-patient context, is not labelled `safe-harbor`, and a §164.514(e) Limited Data Set also needs a
Data Use Agreement, which the library neither holds nor checks.

### Bring your own free-text redactor

```ts
import { parseHL7 } from "@cosyte/hl7";
import { deidentifyHl7 } from "@cosyte/deid/hl7";
import { type FreeTextRedactor } from "@cosyte/deid";

export function withRedactor(rawMessage: string, scrub: (text: string) => string) {
  const redactor: FreeTextRedactor = ({ text }) => ({ text: scrub(text) });
  return deidentifyHl7(parseHL7(rawMessage), { redactor });
}
```

No redactor, a redactor that throws, or one that returns nothing: the locus is blocked. A returned
`{ text }` is written back and recorded as `DEID_FREETEXT_CONSUMER_REDACTED`, and the engine does not
re-scan it.

## Code tables

### Fatal codes (`FATAL_CODES`, thrown as `DeidError`)

| Code | Meaning (from the type declarations) |
| --- | --- |
| `EMPTY_INPUT` | The input model was null or undefined, or carried no locus list |
| `DEID_NO_KEY` | A keyed transform was needed and no key (or no per-patient scope for date-shift) was supplied; there is never an unkeyed fallback |
| `DEID_POLICY_INVALID` | A policy claiming `safe-harbor` assigns a transform derived from the category's own value, or an unpublished transform name |
| `DEID_CONTEXT_INVALID` | A context parameter that would silently weaken the result, such as `maxShiftDays` flooring to 0 |
| `DEID_PROFILE_INVALID` | A derived profile would weaken a category of its base |
| `DEID_OUTPUT_INVALID` | The transformed document could not be re-serialized or no longer round-trips through its parser |
| `DEID_POSITIONS_UNENUMERABLE` | The positions of a structure the pass would hand through could not be enumerated |
| `DEID_DECLARATION_UNNAMEABLE` | A profile or option its coding vocabulary cannot name (the DICOM coded declaration) |
| `DEID_FORMAT_UNSUPPORTED` | A format the adapter refuses, such as NCPDP SCRIPT, or an NCPDP Telecom transmission carrying more than one transaction |
| `DEID_KEY_TOO_SHORT` | An HMAC key or an explicit date-shift seed is shorter than 16 bytes (128 bits), measured on the bytes the HMAC uses: a `Uint8Array` as given, a string as its UTF-8 encoding (a hex or base64 string is not decoded). An empty key stays `DEID_NO_KEY`. The message names the minimum and how to make a key (32 random bytes), and carries no key, no part of one and no length |

### Disposition codes (`DEID_DISPOSITION_CODES`, on manifest entries)

`DEID_CATEGORY_REMOVED`, `DEID_CATEGORY_GENERALIZED`, `DEID_CATEGORY_PSEUDONYMIZED`,
`DEID_CATEGORY_DATE_SHIFTED`, `DEID_CATEGORY_HASHED`, `DEID_LOCUS_BLOCKED`, `DEID_FREETEXT_BLOCKED`,
`DEID_FREETEXT_CONSUMER_REDACTED`, `DEID_RESIDUAL_RETAINED`, `DEID_PARTY_ROLE_RETAINED`, and
`DEID_POSITION_UNEXAMINED` (on `unexaminedResiduals` entries).

### Safe Harbor categories (`SAFE_HARBOR_CATEGORIES`)

`NAMES`, `GEOGRAPHIC`, `DATES`, `PHONE`, `FAX`, `EMAIL`, `SSN`, `MRN`, `HEALTH_PLAN_BENEFICIARY`,
`ACCOUNT`, `CERTIFICATE_LICENSE`, `VEHICLE`, `DEVICE`, `URL`, `IP_ADDRESS`, `BIOMETRIC`,
`FULL_FACE_PHOTO`, `OTHER_UNIQUE_ID`: §164.514(b)(2)(i)(A) to (R), with `OTHER_UNIQUE_ID` the
open-ended catch-all (R). `SAFE_HARBOR_CATEGORY_META` gives each one's letter, number and title.

### Transforms (`TransformName`)

`redact`, `generalize` (date to year, ZIP to 3 digits or `000`, age to `90+`), `date-shift`,
`pseudonymize`, `hash` (the five the README names), plus the policy values `block`, `byo-redact` and
`retain`. `KEYED_TRANSFORMS` lists the ones that need a key.
