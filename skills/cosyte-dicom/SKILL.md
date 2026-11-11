---
name: cosyte-dicom
description: "Parse DICOM Part 10 files (.dcm, DICOMDIR) in Node.js and TypeScript with @cosyte/dicom. Use when a developer asks to parse a DICOM file, read DICOM header tags such as Patient ID, Study Instance UID, Series Instance UID, SOP Instance UID, Modality, Rows, Rescale Slope or Pixel Spacing, index a folder of CT or MR studies, get an element by (group,element) tag, decode a VR, read encapsulated JPEG, JPEG 2000 or RLE Pixel Data fragments as raw bytes, resolve GE, Siemens or Philips private tags, apply the PS3.15 Annex E Basic Profile to the header, or write a dataset back to Part 10 bytes. It never decodes pixels. For de-identifying DICOM together with HL7 v2, C-CDA, FHIR, X12 or NCPDP under one Safe Harbor policy and manifest, use cosyte-deid. For HL7 v2 orders use cosyte-hl7, for FHIR ImagingStudy use cosyte-fhir."
license: MIT
metadata:
  package: "@cosyte/dicom"
  version: "0.1.13"
  docs: "https://docs.cosyte.com/dicom/intro"
---

# @cosyte/dicom

A DICOM Part 10 parser and utility library for Node.js and TypeScript: metadata-first, tolerant of
vendor-quirky files, dual ESM/CJS. It reads the headers leniently, records every deviation it tolerated
as a stable warning code, exposes Pixel Data as raw bytes and never decodes pixels.

## When to use it

- "Parse this .dcm file", "get the Patient ID / Study Instance UID / Modality out of a DICOM file".
- Index a folder of studies or a patient CD: patient, study, series and instance UIDs, accession number.
- Read pixel-interpretation metadata (rescale slope and intercept, Pixel Representation, Photometric
  Interpretation, Pixel Spacing, per-frame geometry of an Enhanced multi-frame object).
- Get an element by 8-character tag and decode its value (PN, DA, TM, DT, DS, IS, SQ and the rest);
  walk a DICOMDIR's Directory Records.
- Read a compressed object's Basic Offset Table and fragments as raw bytes; resolve GE, Siemens or
  Philips private tags with a vendor profile.
- Apply the PS3.15 Annex E Basic Profile to the header (metadata only) and serialize the result.

Use another skill when:

- One Safe Harbor policy and one value-free manifest across DICOM and other formats: cosyte-deid (its
  DICOM adapter delegates to this package).
- HL7 v2 orders and results (the accession number is typically OBR-18): cosyte-hl7; MLLP transport:
  cosyte-mllp.
- FHIR R4 resources such as ImagingStudy: cosyte-fhir. Code systems and ConceptMap: cosyte-terminology.
- The `cosyte` command line: cosyte-cli. Unsure which package fits: cosyte.

## Install

```bash
pnpm add @cosyte/dicom   # the README's recommendation; npm install @cosyte/dicom also works
```

- Node `>=22` (`engines.node` is `>=22.0.0`). Dual ESM and CJS with per-condition type declarations,
  one entry point (`@cosyte/dicom`), zero runtime dependencies.

## Minimal example

From the README: a synthetic CT object saved without its 128-byte preamble, with an invented patient
and example-root UIDs.

```ts
import { parseDicom } from "@cosyte/dicom";

const buf = Buffer.from(
  "AgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
  "base64",
);
const ds = parseDicom(buf);

console.log("patient", ds.patient.id, "issuer", ds.patient.issuerOfId);
console.log("study", ds.study.instanceUid);
console.log("series", ds.series.modality, "image", ds.image.rows, "x", ds.image.columns);
console.log("rescale slope", ds.image.rescaleSlope, "intercept", ds.image.rescaleIntercept);
console.log("tolerated", ds.warnings.length, ds.warnings[0]?.code);
```

```text
patient MRN-42 issuer SAMPLE-HOSP
study 1.2.826.0.1.3680043.8.498.1.1
series CT image 512 x 512
rescale slope 1 intercept -1024
tolerated 1 DICOM_MISSING_PREAMBLE
```

## Key API

- `parseDicom(input, options?)`: `Buffer | Uint8Array | ArrayBuffer` to a `Dataset`. Options:
  `strict`, `stripPreamble` (`"tolerate"` or `"require"`), `onWarning`, `copyValues`, `profile`.
- `Dataset`: views `patient`, `study`, `series`, `image` (missing values are `undefined`, never a
  default); `get(tag)`, `has(tag)`, `getAll(tag)`, `elements()`, `warnings`, `fileMeta`, `directory`.
  Tags are 8 hex characters (`"00100020"`), not keywords and not `"(0010,0020)"`.
- `Element`: `tag`, `vr`, `value` (lazy, never throws, a discriminated `DicomValue` keyed on `kind`),
  `items`, `rawBytes`, `byteOffset`.
- `Dictionary.lookup`, `Dictionary.byKeyword` (keyword to tag), `Dictionary.uid` (UID registry name).
- `readPixelDataFragments(ds)`: `{ basicOffsetTable, fragments }` as raw bytes, or `undefined` when
  Pixel Data is absent or native.
- `serializeDicom(ds)`: Part 10 `Buffer` in the source transfer syntax (no transcode). A value over
  65,534 bytes in a VR with a 16-bit length field is written as `UN`, as PS3.5 section 6.2.2
  requires. A Private Creator `(gggg,0010-00FF)` or File Meta `(0002,xxxx)` element that long may
  not be `UN`, so it is refused with `DicomSerializeError` code `VALUE_TOO_LONG_FOR_VR` and nothing is
  written.
- `deidentify(ds, options?)`: `{ dataset, report }`; options `retain` (values from
  `DEIDENTIFY_OPTIONS`), `uidRoot`, `uidMap`, `profile`, `deidentificationMethod`. The input is never
  mutated.
- `profiles` (`ge`, `siemens`, `philips`, `strict`, `lenient`), `defineProfile()`, `parseDate`,
  `parseTime`, `parseDateTime`, `toObject`, `toISO`, `toDate`, `parsePersonName`, `readCode`.
- Errors: `DicomParseError` (`code`, `byteOffset`, `offsetFrame`, `snippet`), `DicomValueError`,
  `DicomSerializeError`, `ProfileDefinitionError`, `DeidentifyError`. Registries: `FATAL_CODES`,
  `WARNING_CODES`, `SERIALIZE_ERROR_CODES`, `VALUE_ERROR_CODES`, `DEIDENTIFY_ERROR_CODES`.

## Limits and known defects

- Do not expect pixel decoding (no decompression, frame assembly, offset-table interpretation or
  rendering), transcoding, DIMSE networking or DICOMweb. They are out of scope for `@cosyte/dicom`; its
  [scope and non-goals](https://docs.cosyte.com/dicom/non-goals) page lists them only as future work,
  and no package for them is published. Hand `readPixelDataFragments` output to a codec of your choice.
- Wrap `parseDicom` in `try`/`catch` per file when walking a folder: `NOT_DICOM_PART_10`,
  `INVALID_FILE_META`, `UNSUPPORTED_TRANSFER_SYNTAX` (SMPTE ST 2110 and every retired UID) and
  `EMPTY_INPUT` always throw `DicomParseError`.
- JPIP Referenced objects are read for metadata only: `serializeDicom` and `deidentify` refuse them.
- Never substitute a default for an absent view value: `rescaleSlope` `undefined` does not mean 1, and
  `patient.id` is not unique without `patient.issuerOfId`.
- Treat `DICOM_DUPLICATE_TAG_IN_DATA_SET` and `DICOM_DUPLICATE_FILE_META_ELEMENT` like a fatal: each
  reports a value the parsed object lost.
- Coded values are surfaced, not validated against SNOMED, LOINC or other terminologies.
- A warning escalated to a throw (by `{ strict: true }` or a profile's `escalate` list) throws
  `DicomParseError` whose `code` is the warning code, such as `DICOM_MISSING_PREAMBLE`. Since 0.1.9
  the type is `FatalCode | WarningCode`: give a `switch` over `err.code` a `default` branch, and treat
  any code outside `FATAL_CODES` as an escalated warning.
- A parsed `Dataset`, `Item` and `Element` build their elements and `rawBytes` on first read (since
  0.1.13). Read them through `get`, `has`, `getAll`, `elements()` and `el.rawBytes`: `Object.keys`, a
  spread and `JSON.stringify` of one no longer list them.
- `deidentify()` output is metadata-de-identified only, and its open residuals are disclosed, not
  closed. Read `report.warnings` and the report's finding lists after every run; the full residual list
  is in [references/REFERENCE.md](references/REFERENCE.md).
  - It never touches pixels. `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED` means burned-in text may remain.
  - It performs no date transformation. `RetainLongitudinalTemporalModifiedDates` writes `MODIFIED`
    and raises `DICOM_DEIDENT_DATES_NOT_TRANSFORMED`; shifting the dates is yours.
  - An over-declared Value Length that swallows a following element into an `OB`, `OW`, `US` or `UN`
    value is not detected, so a `(0010,0020)` inside it reaches the output with no warning. Treat
    binary attribute lengths from senders you do not control as untrusted.
  - A registered attribute the pinned Table E.1-1 does not list is kept as the source wrote it, and a
    prior `(0012,0063)` text is carried into the output (`DICOM_DEIDENT_METHOD_PRIOR_RETAINED`).
  - Your own `deidentificationMethod` is not bounded: `LO` allows 64 characters per value, so split it
    on `\` yourself; a longer value raises `DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH`.

## PHI handling

- The library has no logger, no cache between calls, and no filesystem or network I/O. Reading files,
  writing output and redacting what you log are yours.
- Warning messages come from a frozen registry with structural substitutions only; `w.code` and
  `w.position` carry nothing from the document. Log codes and positions.
- `DicomParseError.snippet` is 16 raw source bytes (hex). Log `err.code`, `err.byteOffset`,
  `err.offsetFrame` and `err.message`; treat `snippet` as PHI. Strict mode throws these in place of
  warnings, so a review of the lenient path does not cover it.
- In `DeidentifyReport`, `uidMap` (source UIDs), `removedPrivateTags`, `unauditableSequences[].tag`
  and `contextPath` are composed from source bytes: treat them as PHI.
- Parsed values (`ds.patient.name`, dates, free-text descriptions) are PHI.
- Use synthetic data in tests, fixtures and examples. Never paste real patient data or real DICOM
  files into prompts, fixtures or logs.

## Docs

- https://docs.cosyte.com/dicom/intro
- https://www.npmjs.com/package/@cosyte/dicom
- https://github.com/cosyte/dicom
- [references/REFERENCE.md](references/REFERENCE.md): API map by task, cookbook recipes (folder index,
  routing keys, pixel metadata, fragments, profiles, dates, de-identification options and report
  fields), the full de-identification residual list, and the error and warning code tables.
