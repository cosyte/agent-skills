# @cosyte/dicom reference

Fuller API detail for the `cosyte-dicom` skill. Version read: `0.1.1`. Every name below is exported
from the single entry point `@cosyte/dicom`. Facts come from the published README and type
declarations; where the README is longer, this file points to the README section rather than
paraphrasing it.

## API map by task

| Task | Names |
| --- | --- |
| Parse | `parseDicom(input, options?)`, `ParseOptions` (`strict`, `stripPreamble`, `onWarning`, `copyValues`, `profile`), `Dataset`, `Item`, `Element`, `Sequence`, `FileMeta` |
| Safety-critical views | `ds.patient` (`PatientView`), `ds.study` (`StudyView`), `ds.series` (`SeriesView`), `ds.image` (`ImageView`, with `frame(i)` returning `FrameFunctionalGroups`) |
| Structural access | `ds.get(tag)`, `ds.has(tag)`, `ds.getAll(tag)`, `ds.elements()`, `Dictionary.lookup`, `Dictionary.byKeyword`, `Dictionary.uid` |
| Typed values | `Element.value` (`DicomValue`), `decodeElementValue`, `parsePersonName`, `readCode`, `codingSchemeOid`, `CODING_SCHEME_OIDS` |
| Character sets | `parseSpecificCharacterSet`, `isKnownCharsetTerm`, `resolveDecoderLabel`, `decodeText` |
| Dates and times | `parseDate`, `parseTime`, `parseDateTime`, `toObject`, `toISO`, `toDate` (`ToDateOptions.assumeOffsetMinutes`), `DateParts` |
| Pixel Data (raw bytes only) | `readPixelDataFragments(ds)`, `PixelDataFragments` |
| Write | `serializeDicom(ds)` |
| Vendor tolerance | `profiles` (`ge`, `siemens`, `philips`, `strict`, `lenient`), `defineProfile`, `Profile`, `DefineProfileOptions` (`name`, `description`, `escalate`, `suppress`, `privateTags`, `extends`) |
| De-identification (metadata) | `deidentify(ds, options?)`, `DeidentifyOptions` (`retain`, `uidRoot`, `uidMap`, `profile`, `deidentificationMethod`), `DeidentifyReport`, `DEIDENTIFY_OPTIONS`, `DEIDENTIFICATION_METHOD_CODES`, `makeUidRemapper`, `DEFAULT_UID_ROOT` |
| DICOMDIR | `ds.directory` (`DicomDirectory`, `DirectoryRecord`) |
| Errors and codes | `DicomParseError`, `DicomValueError`, `DicomSerializeError`, `ProfileDefinitionError`, `DeidentifyError`, `FATAL_CODES`, `WARNING_CODES`, `SERIALIZE_ERROR_CODES`, `VALUE_ERROR_CODES`, `DEIDENTIFY_ERROR_CODES`, `OFFSET_FRAMES` |
| Version | `VERSION` |

## Recipes

All data in these recipes is synthetic. Each block is self-contained.

### Index a folder of studies, skipping files the parser refuses

```ts
import { readFile } from "node:fs/promises";
import { DicomParseError, parseDicom } from "@cosyte/dicom";

export async function indexFile(path: string) {
  try {
    const ds = parseDicom(await readFile(path));
    return {
      patientId: ds.patient.id, // (0010,0020): not unique without the issuer
      issuerOfPatientId: ds.patient.issuerOfId, // (0010,0021)
      studyUid: ds.study.instanceUid, // (0020,000D)
      seriesUid: ds.series.instanceUid, // (0020,000E)
      sopInstanceUid: ds.image.sopInstanceUid, // (0008,0018)
      modality: ds.series.modality, // (0008,0060)
      accession: ds.study.accessionNumber, // (0008,0050)
      tolerated: ds.warnings.map((w) => w.code),
    };
  } catch (err) {
    if (err instanceof DicomParseError) {
      // Log the code and position only. err.snippet is raw source bytes: treat it as PHI.
      console.warn("skipped file", err.code, err.byteOffset, err.offsetFrame);
      return undefined;
    }
    throw err;
  }
}
```

A cross-system patient key pairs the two: `` `${p.issuerOfId ?? "?"}|${p.id ?? "?"}` ``, and
`ds.patient.otherIds` carries further `{ id, issuer, typeCode }` entries from `(0010,1002)`.

### Read pixel-interpretation metadata without defaults

```ts
import { parseDicom } from "@cosyte/dicom";

export function pixelInterpretation(buf: Buffer) {
  const img = parseDicom(buf).image;
  if (img.rescaleSlope === undefined) {
    // (0028,1053) absent: do not assume 1.
  }
  const perFrame = img.isEnhancedMultiFrame ? img.frame(0) : undefined; // throws DicomValueError when out of range
  return {
    slope: img.rescaleSlope,
    intercept: img.rescaleIntercept, // apply as stored * slope + intercept
    signed: img.signed, // undefined when (0028,0103) is absent
    bitsStored: img.bitsStored,
    photometric: img.photometricInterpretation, // never defaulted to MONOCHROME2
    pixelSpacing: img.pixelSpacing, // (0028,0030), distinct from imagerPixelSpacing
    firstFramePosition: perFrame?.planePosition?.imagePositionPatient,
  };
}
```

Philips writes private rescale tags `(2005,1409/140A/140B)` that shadow `(0028,1052/1053)`; the parser
keeps them, so read `ds.get("20051409")` (optionally under `profiles.philips`) when you need them.

### Read encapsulated Pixel Data fragments

```ts
import { parseDicom, readPixelDataFragments, WARNING_CODES } from "@cosyte/dicom";

export function fragments(buf: Buffer) {
  const ds = parseDicom(buf);
  const pixels = readPixelDataFragments(ds); // undefined: no Pixel Data, or native Pixel Data
  if (pixels === undefined) return undefined;
  const mayBeShort = ds.warnings.some(
    (w) => w.code === WARNING_CODES.DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED,
  );
  return {
    basicOffsetTableBytes: pixels.basicOffsetTable?.length, // 0 when the table is empty
    fragmentCount: pixels.fragments.length,
    mayBeShort,
  };
}
```

The buffers are views over the parsed input unless you parse with `{ copyValues: true }`. Nothing is
decoded and the Basic Offset Table is not interpreted.

### Typed values and dates

```ts
import { Dictionary, parseDate, parseDicom, toDate, toISO } from "@cosyte/dicom";

export function values(buf: Buffer) {
  const ds = parseDicom(buf);
  const rows = ds.get("00280010")?.value;
  const rowCount = rows?.kind === "numbers" ? rows.values[0] : undefined;
  const pn = ds.get("00100010")?.value;
  const familyName = pn?.kind === "personName" ? pn.values[0]?.alphabetic.familyName : undefined;
  const modalityTag = Dictionary.byKeyword("Modality")?.tag; // "00080060"
  const modality = modalityTag === undefined ? undefined : ds.get(modalityTag)?.value;
  return {
    rowCount,
    familyName,
    modality,
    studyDate: toISO(ds.study.date), // "2024-01-15" style, undefined when absent or impossible
    instant: toDate(parseDate("20240115").value, { assumeOffsetMinutes: 0 }), // no zone is ever guessed
  };
}
```

Date conversion rules from the README: `toObject`, `toISO` and `toDate` take any of `DA`, `TM`, `DT`;
the returned `DateParts` keys are singular (`hour`, `minute`, `second`) and `month` is 1 to 12; `toDate`
returns `undefined` when neither the value nor the caller states an offset; an impossible date such as
`18700230` converts to `undefined`, never to the next day. When you import date helpers from two Cosyte
parsers in one file, alias them (`toISO as dicomToISO`).

### Vendor profiles

```ts
import { defineProfile, parseDicom, profiles } from "@cosyte/dicom";

const acme = defineProfile({
  name: "acme",
  extends: profiles.siemens,
  privateTags: {
    "ACME PRIV 01": { "0019XX10": { vr: "DS", keyword: "AcmeDose", name: "ACME Dose" } },
  },
});

export function parseAcme(buf: Buffer) {
  return parseDicom(buf, { profile: acme });
}
```

A profile only tightens or annotates: it resolves private tags by the file's live Private Creator
string, escalates the warning codes it names (`escalate`) and silences the ones it names (`suppress`).
An unknown creator degrades to `UN` plus `DICOM_PRIVATE_CREATOR_UNKNOWN`. Declare the creator in each
Sequence Item that writes private data. Do not extend `profiles.strict` for files that may carry
multi-VR tags (see the known defect below).

### Metadata de-identification with a shared UID map

```ts
import { deidentify, parseDicom, serializeDicom, WARNING_CODES } from "@cosyte/dicom";

// Share one map across a study so remapped UIDs stay consistent. It fills with source UIDs: treat it as PHI.
const uidMap = new Map<string, string>();

export function deidentifyFile(buf: Buffer) {
  const { dataset, report } = deidentify(parseDicom(buf), { uidMap });
  const needsPixelReview = report.warnings.some(
    (w) => w.code === WARNING_CODES.DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED,
  );
  return {
    bytes: serializeDicom(dataset), // same transfer syntax; throws DicomSerializeError when it cannot write
    needsPixelReview, // do not release the image on metadata de-identification alone when true
    warningCodes: report.warnings.map((w) => w.code),
  };
}
```

`retain` takes values from `DEIDENTIFY_OPTIONS`: `CleanGraphics`, `CleanStructuredContent`,
`CleanDescriptors`, `RetainLongitudinalTemporal`, `RetainLongitudinalTemporalModifiedDates`,
`RetainPatientCharacteristics`, `RetainDeviceIdentity`, `RetainUIDs`, `RetainSafePrivate`,
`RetainInstitutionIdentity`. The two temporal options are mutually exclusive; naming both throws
`DeidentifyError` (`INVALID_OPTIONS`).

What the output says about itself:

- `(0012,0062)` Patient Identity Removed is set to `YES`.
- `(0028,0303)` Longitudinal Temporal Information Modified is `REMOVED` by default, `UNMODIFIED` under
  `RetainLongitudinalTemporal`, `MODIFIED` under `RetainLongitudinalTemporalModifiedDates`. Read the
  top-level value only; a nested copy is retained as the sender wrote it. If you shift dates yourself
  under `RetainLongitudinalTemporal`, `UNMODIFIED` becomes wrong for your object.
- `(0012,0063)` De-identification Method: this run's text is added after any prior value, one Value for
  the Profile and one per active Option.
- `(0012,0064)` De-identification Method Code Sequence: CID 7050 codes, `113100` for the Basic Profile
  then one per active Option (`DEIDENTIFICATION_METHOD_CODES`). `113101` and `113102` (pixel options)
  are never written. `113107` says the modified-dates column was applied, not that a date was shifted.

`DeidentifyReport` fields: `attributes` (tag, keyword, action, no values), `removedPrivateTags`,
`embeddedAttributes`, `unauditableSequences`, `unenumerablePrivateRemovals` (complete, never capped),
`undefinedVrElements`, `fileMetaElementsDropped` and `fileMetaElementsDroppedCount`,
`group0004Removals` and `group0004RemovalCount`, `unregisteredElementRemovals` and
`unregisteredElementRemovalCount`, `uidMap`, `warnings`, `retained`.

### Find root elements that 0.1.1 flags with a false DICOM_VR_MISMATCH

```ts
import { Dictionary, parseDicom } from "@cosyte/dicom";

// Root-level elements whose on-wire VR is one the dictionary allows, but not the first one it lists.
export function multiVrElements(buf: Buffer): string[] {
  return parseDicom(buf)
    .elements()
    .filter((el) => {
      const allowed = Dictionary.lookup(el.tag)?.vr;
      return allowed !== undefined && allowed.length > 1 && allowed[0] !== el.vr && allowed.includes(el.vr);
    })
    .map((el) => el.tag);
}
```

This covers the root Data Set only. `DicomParseWarning.position.byteOffset` inside a defined-length
Sequence Item is relative to that Item, so it is not a lookup key against the root.

## Known defect (0.1.1)

The Explicit VR Little Endian and Big Endian parsers compare the on-wire VR only with the first VR of
the dictionary entry. A tag the standard lets carry two VRs, such as Pixel Data `(7FE0,0010)` as `OB` or
`OW`, or `(0028,0106)` Smallest Image Pixel Value as `US` or `SS`, gets a false `DICOM_VR_MISMATCH`
when written with the second VR. `{ strict: true }` escalates every Tier-2 warning and `profiles.strict`
escalates `DICOM_VR_MISMATCH` by name, so either one throws `DicomParseError` on, for example, a native
image whose Pixel Data is `OW`. Lenient parsing adds a false warning and otherwise reads the element
under its on-wire VR.

- Do not use `{ strict: true }`, `profiles.strict`, or a profile that extends it or escalates
  `DICOM_VR_MISMATCH`, on files that may carry such tags.
- Treat `DICOM_VR_MISMATCH` on a multi-VR tag as possibly false.

## De-identification residuals (from the README's Known limitations)

`deidentify()` output is metadata-de-identified only, and the README says none of the open residuals
is an all-clear. Read the README's "Known limitations & non-goals" section in full before sharing an
output. In short:

- Pixels are untouched. Burned-in annotation raises `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED`.
- No date transformation on any branch. `DICOM_DEIDENT_DATES_NOT_TRANSFORMED` rides with the modified
  dates option, and the README claims no PS3.15 Annex E conformance for that option.
- A sequence the parser could not open is emptied (data loss), named in `report.unauditableSequences`,
  with `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE`. A conformant file nested deeper than
  `NESTING_DEPTH_LIMIT` (64) loses that sequence the same way.
- One shape still leaks: an undefined-length `UN` that the CP-246 descent could not read as a
  sequence, where no profile named the attribute. Pass your profile to `parseDicom` as well as to
  `deidentify()`. The reliable test is `el.items === undefined` on the element.
- `RetainSafePrivate` removes private values this run did not enumerate (recorded in
  `report.unenumerablePrivateRemovals`). A value kept because the file's own `(0008,0300)` declaration
  calls it safe is retained on the sender's word, unexamined. If you do not trust the sender, do not
  pass `RetainSafePrivate`.
- `RetainSafePrivate` retains nothing inside a sequence whose item stream over-runs its declared
  length, nor after a sequence whose contents contradict its declared extent. Treat
  `DICOM_ITEM_CROSSES_SEQUENCE_END` as "this file's structure is in dispute".
- An over-declared Value Length into an `OB`, `OW`, `US` or `UN` carrier is not detected; a
  `(0010,0020)` swallowed into it reaches the output with no warning and no report entry.
- An unrecognized Explicit VR is read long-form and the element is emptied
  (`report.undefinedVrElements`, `DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE`).
- `(0012,0063)` is added to, so a prior de-identifier's text is carried
  (`DICOM_DEIDENT_METHOD_PRIOR_RETAINED`). When the join would not fit an `LO`, the prior value is
  replaced (`DICOM_DEIDENT_METHOD_NOT_ADDED`); a prior value under another VR is replaced
  (`DICOM_DEIDENT_METHOD_NOT_LO`). A Value over 64 bytes, yours or the source's, raises
  `DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH`; nothing is shortened. Split your own
  `deidentificationMethod` on `\` if a strict receiver is in your path.
- A standard attribute from a PS3.6 edition newer than this build is removed, conformant or not
  (`report.unregisteredElementRemovals`, by byte offset only). An attribute PS3.6 registers and the
  pinned Table E.1-1 does not list is kept as the source wrote it.
- DICOMDIR: a de-identified DICOMDIR is not File-set conformant
  (`DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED`), and Referenced File IDs `(0004,1500)` are kept
  verbatim.
- `deidentify()` refuses the four JPIP Referenced transfer syntaxes with `DeidentifyError`
  (`UNSUPPORTED_TRANSFER_SYNTAX`).

## Code tables

### Fatal parse codes (`FATAL_CODES`, thrown as `DicomParseError`)

| Code | Meaning |
| --- | --- |
| `NOT_DICOM_PART_10` | Not a Part 10 file (also with `stripPreamble: "require"` and no `DICM` magic) |
| `INVALID_FILE_META` | Truncated or malformed File Meta group |
| `UNSUPPORTED_TRANSFER_SYNTAX` | SMPTE ST 2110, a retired UID, or any other syntax not read |
| `EMPTY_INPUT` | Zero-byte input |

`DicomParseError.offsetFrame` is one of `OFFSET_FRAMES`: `"input"`, `"inflated-dataset"`,
`"value-slice"`. Only `"input"` is an index into the buffer you passed.

### Other thrown codes

| Class | Codes |
| --- | --- |
| `DicomValueError` (`VALUE_ERROR_CODES`, from `image.frame(i)` only) | `FRAME_INDEX_OUT_OF_RANGE`, `MISSING_REQUIRED_FUNCTIONAL_GROUP` |
| `DicomSerializeError` (`SERIALIZE_ERROR_CODES`) | `MISSING_TRANSFER_SYNTAX`, `UNSUPPORTED_TRANSFER_SYNTAX`, `INVALID_ENCAPSULATED_PIXEL_DATA`, `DIRECTORY_OFFSET_UNRESOLVED`, `DIRECTORY_OFFSET_DEFLATED` |
| `DeidentifyError` (`DEIDENTIFY_ERROR_CODES`) | `INVALID_OPTIONS` (unknown option, malformed UID root, both temporal options), `UNSUPPORTED_TRANSFER_SYNTAX` (JPIP Referenced) |
| `ProfileDefinitionError` | thrown by `defineProfile()` for an invalid profile |

### Warning codes (`WARNING_CODES`)

Parser deviations: `DICOM_MISSING_PREAMBLE`, `DICOM_FILE_META_GROUP_LENGTH_MISMATCH`,
`DICOM_FILE_META_GROUP_LENGTH_MISSING`, `DICOM_DUPLICATE_FILE_META_ELEMENT`,
`DICOM_DUPLICATE_TAG_IN_DATA_SET`, `DICOM_EMPTY_ITEM_IN_SEQUENCE`, `DICOM_GROUP_LENGTH_IN_DATASET`,
`DICOM_IMPLICIT_VR_FOR_PRIVATE_TAG_WITHOUT_VR`, `DICOM_ITEM_CROSSES_SEQUENCE_END`,
`DICOM_NONZERO_RESERVED_BYTES`, `DICOM_ODD_LENGTH_VALUE_PADDED`,
`DICOM_PIXEL_DATA_FRAGMENTS_NOT_DELIMITED`, `DICOM_PIXEL_DATA_LENGTH_MISMATCH`,
`DICOM_PRIVATE_TAG_NO_CREATOR`, `DICOM_PRIVATE_CREATOR_UNKNOWN`, `DICOM_SQ_NOT_DESCENDED`,
`DICOM_UN_PARSED_AS_SQ`, `DICOM_UNDEFINED_LENGTH_IN_EXPLICIT_VR`, `DICOM_VR_MISMATCH`.

DICOMDIR: `DICOM_DIRECTORY_OFFSET_DEFLATED`, `DICOM_DIRECTORY_OFFSET_MALFORMED`,
`DICOM_DIRECTORY_OFFSET_UNRESOLVED`, `DICOM_DIRECTORY_RECORD_REVISITED`.

Value decode: `DICOM_BOM_IN_TEXT_VR`, `DICOM_DA_LEGACY_FORMAT`, `DICOM_DT_NONSTANDARD_OFFSET`,
`DICOM_IS_NONINTEGER_VALUE`, `DICOM_NON_ASCII_IN_ASCII_VR`, `DICOM_TRAILING_NULL_IN_TEXT_VR`,
`DICOM_UI_TRAILING_SPACE`, `DICOM_CHARSET_AMBIGUOUS_SEPARATOR`, `DICOM_CHARSET_BYTES_UNDECODABLE`,
`DICOM_CHARSET_ESCAPE_UNDECLARED`, `DICOM_CHARSET_EXTENSION_NOT_RESET`, `DICOM_UNSUPPORTED_CHARSET`.

De-identification (on `report.warnings`): `DICOM_BURNED_IN_ANNOTATION_NOT_REMOVED`,
`DICOM_DEIDENT_DATES_NOT_TRANSFORMED`, `DICOM_DEIDENT_DICOMDIR_FILE_SET_NOT_DISCHARGED`,
`DICOM_DEIDENT_EMBEDDED_ATTRIBUTE_REMOVED`, `DICOM_DEIDENT_FILE_META_REPLACED`,
`DICOM_DEIDENT_GROUP_0004_REMOVED`, `DICOM_DEIDENT_METHOD_CODES_PRIOR_REPLACED`,
`DICOM_DEIDENT_METHOD_CODES_PRIOR_RETAINED`, `DICOM_DEIDENT_METHOD_NOT_ADDED`,
`DICOM_DEIDENT_METHOD_NOT_LO`, `DICOM_DEIDENT_METHOD_PRIOR_RETAINED`,
`DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH`, `DICOM_DEIDENT_PRIVATE_CARRIER_NOT_AUDITABLE`,
`DICOM_DEIDENT_PRIVATE_DECLARATION_NOT_RESOLVED`, `DICOM_DEIDENT_SEQUENCE_NOT_AUDITABLE`,
`DICOM_DEIDENT_UNDEFINED_VR_NOT_AUDITABLE`, `DICOM_DEIDENT_UNREGISTERED_ELEMENT_REMOVED`.

Narrow with `w.code === WARNING_CODES.<NAME>` rather than string literals. The README does not quote a
count of codes; read `WARNING_CODES` itself.
