# @cosyte/hl7 reference (0.1.1)

Cookbook recipes and code tables drawn from the published README and type declarations. Every
`ts` block is self-contained; `declare const raw: string;` stands for your own synthetic message
text. Use synthetic data only.

## Contents

1. Three access patterns
2. Clinical helpers (results, orders, location, allergies, SIU/MDM/DFT, timing)
3. Patient merges and identity events
4. Modify and reserialize
5. Message type, narrowing and structure checks
6. Conformance profiles you author
7. Parse profiles (Z-segments, vendor quirks, site fields)
8. Datetimes
9. MLLP framing, batch files and streaming
10. Warnings, fatal codes and errors
11. Other exports

## 1. Three access patterns

Named helpers for the common case, dot-paths for a specific field, structural traversal for
everything else.

```ts
import { parseHL7 } from "@cosyte/hl7";

declare const raw: string;

const msg = parseHL7(raw);

// Named helpers: undefined (never a throw) when the segment is absent.
console.log(msg.patient?.mrn, msg.meta.messageCode, msg.meta.triggerEvent);

// Dot-paths: SEG.field.component.subcomponent. Dot numbers are 1-based HL7 positions.
// [N] is 0-indexed per the type declarations, for segment and field repeats.
console.log(msg.get("PID.5.1")); // family name
console.log(msg.get("OBX[1].5")); // OBX-5 of the second OBX
console.log(msg.get("PID.3[1].1")); // second repetition of PID-3, component 1
console.log(msg.getAll("NK1").length); // every NK1 segment

// Structural traversal: segment, field, then a typed coercion.
for (const obx of msg.segments("OBX")) {
  const id = obx.field(3).asCwe().identifier; // OBX-3.1
  const val = obx.field(5).value; // first component of the first repetition
  console.log(id, val);
}
console.log(msg.allSegments().length);
```

- `msg.get(path)` returns `undefined` for a path that does not resolve and throws `TypeError`
  only for malformed path syntax (`"pid.5"`, `""`).
- `field.value` is the first subcomponent of the first component of the first repetition,
  decoded once at parse, `""` when empty or HL7 null. `field.text` is the whole field as
  canonical wire text. `field.isNull` is `true` for the literal `""`.
- Field coercions: `asXpn`, `asXad`, `asCx`, `asCwe`, `asCe`, `asXtn`, `asPl`, `asTs`, `asNm`,
  `asSn`, `asHd`, `asXcn`.
- The README's structural example calls `field.component(1)`; that method is not in the 0.1.1
  type declarations, so use a coercion (`asCwe().identifier`) or a dot-path (`"OBX.3.1"`).

## 2. Clinical helpers

### Patient demographics

`msg.patient` is `undefined` with no PID. `identifiers` and `phoneNumbers` are always arrays,
`name` is always present (possibly `{}`). Fields: `mrn` (picked from PID-3), `identifiers` (CX
list), `name` (XPN), `familyName`, `givenName`, `middleName`, `fullName`, `dateOfBirth` (fidelity
TS, PID-7), `sex` (PID-8), `address` (XAD, PID-11), `phoneNumbers` (PID-13 and PID-14), and per the
type declarations `race` (CWE, PID-10), `ethnicity` (CWE, PID-22), `language` (CE, PID-15) and
`notes` (NTE lines after the PID, high PHI risk).

There is no named helper for PID-19, PID-29 or PID-30; read them with `msg.get("PID.19")`,
`msg.segments("PID")[0]?.field(29).asTs()` and `msg.get("PID.30")`.

### Lab results and orders

```ts
import { parseHL7 } from "@cosyte/hl7";

declare const raw: string;

const msg = parseHL7(raw);

// Flat list of every OBX, grouped or not.
for (const obs of msg.observations()) {
  console.log(obs.identifier.text, obs.value, obs.units?.identifier);
}

// OBR to OBX grouping for order processing.
for (const order of msg.orders()) {
  console.log(order.universalServiceId?.identifier, order.observations.length);
}
```

Observations are discriminated by `valueType`: `"NM"` gives a number, `"TS"`/`"DT"` a fidelity
TS, `"CWE"`/`"CE"` a composite, `"SN"` a structured numeric, everything else a string.

### Admit location

`msg.visit` is `undefined` with no PV1 (most ORU and ORM messages). `visit.location` is a PL
composite (`pointOfCare`, `room`, `bed`, `facility?.namespaceId`); `attendingDoctor` and
`referringDoctor` are XCN; `admitDateTime` and `dischargeDateTime` are fidelity TS.

### Allergies

`msg.allergies()` returns one entry per AL1 and per IAM segment, in document order; an
ADT^A60 carries IAM and no AL1. Each entry names its segment in `source`.

```ts
import { parseHL7 } from "@cosyte/hl7";

declare const raw: string;

for (const al of parseHL7(raw).allergies()) {
  console.log(al.source, al.code?.text, al.severity, al.reaction);
  if (al.deleteRequested === true) {
    // IAM-6 was "D": the sender asks you to delete an allergy it sent earlier, identified by
    // al.uniqueIdentifier?.entityIdentifier. Nothing was deleted for you.
  }
}
```

- It never applies an action: a `D` entry is still returned, a `U` never replaces an earlier
  entry, and an AL1 and an IAM for the same allergen are two entries.
- An IAM entry carries `actionCode` (IAM-6 as sent, absent when empty, never assumed `A`) and
  `uniqueIdentifier` (IAM-7 components 1 and 2). A missing IAM-7 stays missing.
- Not read: IAR and NTE under IAM, IAM-1, IAM-8 onward. IAM-2 and IAM-4 are read as component 1,
  IAM-5 as its first repetition. Use `msg.segments("IAM")` for the rest.

Sibling helpers: `nextOfKin()`, `diagnoses()`, `insurance()`, `medications()` (each with
`orderControl`, ORC-1 exactly as sent), `immunizations()` (each with `administrationStatus`:
`completed`, `not-done`, `no-vaccine-administered`, `delete-requested` or `undetermined`, never
applied, raw RXA-20 and RXA-21 alongside).

### Scheduling, documents and charges (SIU, MDM, DFT)

```ts
import { parseHL7 } from "@cosyte/hl7";

declare const raw: string;

const msg = parseHL7(raw);

for (const appt of msg.appointments()) {
  console.log(appt.fillerAppointmentId, appt.fillerStatusCode?.identifier); // status verbatim
  const provider = appt.resources.find((r) => r.kind === "personnel");
  console.log(provider?.person?.familyName);
}

for (const doc of msg.documents()) {
  // TXA-17 completion and TXA-19 availability are distinct and never conflated.
  console.log(doc.completionStatus, doc.availabilityStatus);
}

for (const charge of msg.charges()) {
  console.log(charge.transactionType, charge.transactionCode?.identifier);
  console.log(charge.amountExtended); // canonical wire text, never a float
}
```

These are breadth helpers: no scheduling state machine, signature verification or pricing.

### Order and medication timing

Every `Order` and `Medication` carries `timings`, from TQ1 (v2.5+) or the legacy TQ in ORC-7 or
RXE-1.

```ts
import { parseHL7 } from "@cosyte/hl7";

declare const raw: string;

const med = parseHL7(raw).medications()[0];

for (const t of med?.timings ?? []) {
  console.log(t.source); // "TQ1" or "legacy"
  console.log(t.repeatPattern?.code); // e.g. "Q6H", verbatim, never resolved to clock times
  console.log(t.repeatPattern?.kind); // "parametric" | "named" | "unknown", provenance only
  console.log(t.repeatPattern?.interval); // e.g. { count: 6, unit: "H" }
  console.log(t.totalOccurrences); // from TQ1-14
  console.log(t.startDateTime?.raw, t.startDateTime?.precision);
}
```

## 3. Patient merges and identity events

`msg.identityEvents()` recognizes merges (A18, A34, A35, A36, A39, A40, A41, A42), moves (A43,
A44, A45), identifier changes (A47, A49, A50, A51), link and unlink (A24, A37) and person add or
update (A28, A31), plus every ADT trigger whose published structure requires MRG. MRG carries the
prior identifiers, PID the surviving ones; the direction is a constant, never inferred.

```ts
import { parseHL7 } from "@cosyte/hl7";

declare const rawA40: string;

for (const ev of parseHL7(rawA40).identityEvents()) {
  if (ev.kind === "merge" && ev.prior && ev.surviving && ev.warnings.length === 0) {
    console.log(ev.prior.identifiers[0]?.idNumber, "->", ev.surviving.identifiers[0]?.idNumber);
  } else if (ev.warnings.length > 0) {
    // MERGE_MISSING_PRIOR_OR_SURVIVOR: incomplete MRG to PID pair. Route for review.
  }
}
```

- An identifier change is `kind: "change"`, never `"merge"`. Act on `kind` explicitly.
- An incomplete pair surfaces what is present plus `MERGE_MISSING_PRIOR_OR_SURVIVOR`; the MRG is
  never dropped and the direction never guessed.
- PID-2 and MRG-4 are not read when MSH-12 declares v2.7 or later.
- The library surfaces the merge. Re-pointing stored data is your integration engine's job.

## 4. Modify and reserialize

```ts
import { parseHL7 } from "@cosyte/hl7";

declare const raw: string;

const msg = parseHL7(raw);
msg.setField("PV1.3.1", "NEW-WARD");
console.log(msg.get("PV1.3.1")); // "NEW-WARD"
const outbound = msg.toString(); // spec-clean HL7 wire format, canonical delimiters
console.log(outbound.length);
```

`setField` takes the dot-path syntax of `get`. `addSegment(name, fields)`, `removeSegment(type,
occurrence?)` and `setComposite(path, kind, value)` complete the write surface. The emitter always
uses `|`, `^`, `~`, `\`, `&`, and a parsed field's escape sequences re-emit byte for byte.
`toJSON()` returns a serializable structure; `prettyPrint()` is a human debug view, not wire
output.

## 5. Message type, narrowing and structure checks

- `msg.meta.type` is MSH-9 as carried; prefer `msg.meta.messageCode` plus
  `msg.meta.triggerEvent`, since some senders populate MSH-9.3 and some do not.
- `msg.is("ADT^A01")` compares MSH-9.1 and MSH-9.2 and narrows: inside the guard the code and
  event are literal types and `msg.part(name)` / `msg.parts(name)` accept only the segments that
  structure requires. Any non-key string returns `false` and never throws. `"ACK"` is keyed on the
  message code alone. `SUPPORTED_OVERLAY_MESSAGES` lists every key.
- `msg.structure` reports `recognized`, `missingSegments` and `structureIds` for a misroute or
  truncation check, and adds the `MISSING_EXPECTED_GROUP` warning. Recognized codes: ADT, ORU,
  ORM, OML, OMG, OMP, OMI, SIU, MDM, DFT, VXU, ACK (94 trigger pairs).
  `STRUCTURE_REGISTRY_PROVENANCE` records the vendored publication.

`validateMessageStructure(msg)` is opt-in and read-only:

```ts
import { parseHL7, validateMessageStructure } from "@cosyte/hl7";

declare const raw: string;

const result = validateMessageStructure(parseHL7(raw));
if (!result.validated) {
  console.log("not validated:", result.reason); // the publication cannot answer
} else {
  for (const f of result.findings) console.log(f.severity, f.code, f.locus.segment);
}
```

Finding codes: `STRUCTURE_SEGMENT_OUT_OF_ORDER`, `STRUCTURE_SEGMENT_CARDINALITY`,
`STRUCTURE_SEGMENT_UNEXPECTED` (warning severity, Z-segments included). Each locus is a segment
name, a 0-indexed occurrence and a structure id, never a value. An unmodelled type, `ORM^O01`, a
structure with no ordered expectation, or a message with no readable type come back
`validated: false` with a `reason`. Conforming to one published variant conforms to the family.

## 6. Conformance profiles you author

`validateAgainstProfile(msg, profile)` checks an interface spec you write. We ship no profile,
no value set and no network call.

```ts
import { parseHL7, validateAgainstProfile, type ConformanceProfile } from "@cosyte/hl7";

declare const raw: string;

// A profile you author: an example, not an attestation of conformance.
const profile: ConformanceProfile = {
  name: "our-adt-intake",
  segments: [
    {
      segment: "PID",
      usage: "R",
      fields: [
        { field: 3, name: "Patient Identifiers", usage: "R", cardinality: { min: 1, max: 1 } },
        { field: 8, name: "Administrative Sex", usage: "RE", valueSet: ["M", "F", "U"] },
      ],
    },
    { segment: "ZZZ", usage: "X" },
  ],
};

const { findings } = validateAgainstProfile(parseHL7(raw), profile);
for (const f of findings) console.log(f.severity, f.code, f.message);
```

- It never throws (a malformed profile yields `PROFILE_MALFORMED` findings); use
  `defineConformanceProfile` for an authoring gate that does throw.
- A valid message yields zero findings; no finding carries PHI; validation is read-only.
- Usage codes: `R`, `RE`, `C`, `CE`, `O`, `X`, `B`, or a declared conditional `C(t/f)` with an
  optional condition predicate. A predicate the message cannot decide yields
  `PROFILE_CONDITION_UNEVALUATABLE` and the element is not assessed.

```text
// PID-8 is Required when a date of birth was sent, Not-permitted when it was not.
{
  field: 8,
  usage: "C(R/X)",
  condition: { location: { segment: "PID", field: 7 }, presence: "is valued" },
}
```

Predicate verbs: `is`, `is not`, `contains`, `does not contain`, `matches`, `does not match`;
presence: `is valued`, `is not valued`; connectors `AND`, `OR`, `XOR`.

## 7. Parse profiles

A parse profile shapes how a message is parsed (distinct from a conformance profile).

```ts
import { defineProfile, parseHL7, profiles } from "@cosyte/hl7";

declare const raw: string;

const site = defineProfile({
  name: "myhospital-adt",
  extends: profiles.epic,
  description: "Custom Z-segments and site fields for our ADT feed",
  dateFormats: ["MM/DD/YYYY HH:mm:ss"],
  customSegments: { ZDP: { fields: { departmentCode: 3, departmentName: 4 } } },
  segmentOverrides: { PID: { fields: { siteMrn: 19 } } },
});

const msg = parseHL7(raw, site);
console.log(msg.profile?.lineage); // ["epic", "myhospital-adt"]
console.log(msg.part("PID")?.get("siteMrn")?.value); // the value at PID-19
```

- `customSegments` names fields on Z-segments; declared Z-segments stop raising `UNKNOWN_SEGMENT`.
- `segmentOverrides` names fields on standard segments. Positions are 1-indexed HL7 positions. An
  undeclared name and an absent position both read `undefined`. Overrides only add named reads:
  typed helpers, dot-paths, `toString()`, `toJSON()`, warnings and the write path are unchanged.
- `extends` takes one profile or an array. Merge rules: scalars, later wins; arrays (`dateFormats`,
  `lineage`) concatenate and dedupe; `customSegments` and `segmentOverrides` deep-merge per key;
  `onWarning` handlers chain in lineage order; `name` is never inherited.
- `setDefaultProfile(p)` applies to every later `parseHL7` in the process; opt out per call with
  `{ profile: null }`; reset with `setDefaultProfile(null)`. `getDefaultProfile()` reads it.
- `p.describe?.()` and `p.lineage` show what each layer contributed.
- Built-ins: `profiles.epic`, `profiles.cerner`, `profiles.meditech`, `profiles.athena`,
  `profiles.genericLab`, `profiles.visage`, `profiles.philips`, `profiles.va`.

`defineProfile` throws `ProfileDefinitionError` (with `profileName`) for: a missing or non-string
`name`; a malformed `customSegments` (bad Z-segment name, non-positive position, duplicate field
names after merge); a `segmentOverrides` key that is a Z-segment or not in `KNOWN_SEGMENTS`; a date
format token outside `SUPPORTED_DATE_TOKENS`; an unknown option key (with a suggestion).

## 8. Datetimes

Every HL7 datetime is a fidelity `TS`: `raw`, `valid`, `precision`, the stated parts (`month` is
1 to 12), `hasTimezone`, `offsetMinutes` when stated, `matchedFormat` when a declared format won,
and `ambiguity` when a slash date could be read two ways.

```ts
import { formatDtm, parseDtm, toDate, toISO, toObject } from "@cosyte/hl7";

console.log(toObject(parseDtm("19880705"))); // { year: 1988, month: 7, day: 5 }
console.log(toISO(parseDtm("19880705"))); // "1988-07-05", no fabricated Z
console.log(toISO(parseDtm("20250102153045.5-0500"))); // "2025-01-02T15:30:45.5-05:00"
console.log(toDate(parseDtm("20250102"))); // undefined: no offset stated, none assumed
console.log(toDate(parseDtm("20250102"), { assumeOffsetMinutes: -300 })); // 05:00Z instant
console.log(formatDtm(parseDtm("20250102153045-0000"))); // byte-exact round trip
console.log(toISO(parseDtm("20230229"))); // undefined: not a leap year
```

- `toObject`, `toISO` and `toDate` return `undefined` (never throw) for an invalid value,
  `undefined`, `null`, an impossible calendar date, or an offset outside 23 hours 59 minutes.
- `toDate` never reads the host timezone and never assumes UTC. A stated offset wins over
  `assumeOffsetMinutes`. A non-finite or non-number `assumeOffsetMinutes` names no zone.
- `toISO` renders a zero offset as `Z`; `formatDtm` is the byte-exact route back to the wire.
  `dtmToDate(ts, { assumeOffsetMinutes })` is the narrower instant-or-nothing converter.
- The same three names exist in `@cosyte/x12`, `@cosyte/dicom`, `@cosyte/ncpdp`, `@cosyte/astm`
  and `@cosyte/ccda`; alias on import (`toISO as hl7ToISO`) or namespace-import.

Non-standard formats: pass `dateFormats` (or use a profile). They reach every datetime the
library returns, and `matchedFormat` tells you which one won. Undeclared non-canonical values on
typed fields stay `valid: false` with `raw` intact. There is no two-digit-year token.

```ts
import { AMBIGUOUS_DATE_ORDER, parseHL7 } from "@cosyte/hl7";

declare const raw: string; // MSH-7 written as "05/07/1988"

const ts = parseHL7(raw).meta.timestamp;
if (ts?.ambiguity?.code === AMBIGUOUS_DATE_ORDER) {
  console.log(ts.ambiguity.candidates[0].isoDate, ts.ambiguity.candidates[1].isoDate);
}
const dayFirst = parseHL7(raw, { dateFormats: ["DD/MM/YYYY"] });
console.log(dayFirst.meta.timestamp?.month); // 7
```

The ambiguity report exists only on `msg.meta.timestamp`, the one field where
`BUILTIN_DATE_FALLBACKS` runs. Declaring the sender's order resolves every field at once.

## 9. MLLP framing, batch files and streaming

- `parseHL7` strips VT, FS and CR framing by default and adds `MLLP_FRAMING_STRIPPED`; pass
  `{ stripMllpFraming: false }` to disable. It never adds framing on `toString()`.

```ts
import { splitBatch, type Hl7Message } from "@cosyte/hl7";

declare const rawBatchFile: string;
declare function handle(message: Hl7Message): void;
declare function quarantine(raw: string, code: string): void;

const { messages, warnings } = splitBatch(rawBatchFile);
for (const entry of messages) {
  if (entry.ok) handle(entry.message);
  else quarantine(entry.raw, entry.error.code); // isolated, siblings still parse
}
for (const w of warnings) console.log(w.code); // BATCH_COUNT_MISMATCH, BATCH_MISSING_TRAILER
```

`splitBatch` splits on MSH boundaries inside `[FHS] { [BHS] { MSH ... } [BTS] } [FTS]`,
reconciles BTS-1 and FTS-1 counts without dropping the tail, passes a bare message through, and
forwards its second argument to `parseHL7`. It does not enforce a trailer, generate batch ACKs or
remove transport framing.

```ts
import { createReadStream } from "node:fs";
import { parseStream } from "@cosyte/hl7";

async function readFeed(path: string): Promise<void> {
  for await (const entry of parseStream(createReadStream(path))) {
    if (entry.ok) console.log(entry.message.meta.type);
    else console.log("failed", entry.error.code, entry.position.segmentIndex);
    for (const w of entry.streamWarnings) console.log(w.code); // UNTERMINATED_STREAM_MESSAGE
  }
}

void readFeed("synthetic-feed.hl7");
```

`parseStream` takes a Node `Readable`, an async iterable or an iterable of string or Buffer
chunks, holds about one message of state, reassembles messages split across chunks, and never
yields batch-envelope segments. Count reconciliation stays with `splitBatch`.

## 10. Warnings, fatal codes and errors

Tiers: 0 silent (spec-compliant), 1 auto-handled (trivial, no warning), 2 warning (recoverable,
on `msg.warnings` and `onWarning`), 3 fatal (always throws). `{ strict: true }` escalates every
tier-2 warning to a thrown `Hl7ParseError`.

Tier-2 `WARNING_CODES` (20, stable; renaming one is a breaking change):

| Code | Code |
| --- | --- |
| `MLLP_FRAMING_STRIPPED` | `FIELD_WHITESPACE_TRIMMED` |
| `UNKNOWN_ESCAPE_SEQUENCE` | `TIMESTAMP_FALLBACK_FORMAT` |
| `SEGMENT_CASE` | `EXTRA_FIELDS` |
| `UNKNOWN_SEGMENT` | `DUPLICATE_REQUIRED_SEGMENT` |
| `ENCODING_MISMATCH` | `MISSING_REQUIRED_FIELD` |
| `MISSING_EXPECTED_GROUP` | `OUT_OF_ORDER_SEGMENT` |
| `VERSION_MISMATCH` | `UNKNOWN_CHARSET` |
| `UNSUPPORTED_CHARSET` | `ACK_NO_CORRELATION_ID` |
| `MERGE_MISSING_PRIOR_OR_SURVIVOR` | `BATCH_COUNT_MISMATCH` |
| `BATCH_MISSING_TRAILER` | `UNTERMINATED_STREAM_MESSAGE` |

Tier-3 `FATAL_CODES`: `NO_MSH_SEGMENT`, `MSH_TOO_SHORT`, `INVALID_ENCODING_CHARACTERS`,
`EMPTY_INPUT`.

```ts
import { FATAL_CODES, Hl7ParseError, parseHL7, type Hl7ParseWarning } from "@cosyte/hl7";

function tryParse(raw: string): void {
  try {
    const msg = parseHL7(raw);
    for (const w of msg.warnings) console.log(label(w), w.position.segmentIndex);
  } catch (err) {
    if (err instanceof Hl7ParseError) {
      // Log code and position. Do not log err.snippet: it is raw input.
      console.log(err.code, err.position.segmentIndex, err.code === FATAL_CODES.EMPTY_INPUT);
    } else {
      throw err;
    }
  }
}

function label(w: Hl7ParseWarning): string {
  switch (w.code) {
    case "MLLP_FRAMING_STRIPPED":
      return "framed input";
    case "UNKNOWN_SEGMENT":
      return "unknown segment";
    default:
      return w.code;
  }
}

tryParse("");
```

- `Hl7ParseError`: `code`, `position`, `snippet` (up to 40 characters of input verbatim,
  unredacted), and a bounded `message` that echoes only spec-shaped tokens (a three-character
  segment id, a message type, a version, a Table 0211 charset label) and writes `<withheld>`
  otherwise.
- `Hl7ParseWarning`: `code`, a bounded `message`, `position` (`segmentIndex`, `fieldIndex`,
  `repetitionIndex`, `componentIndex`, `subcomponentIndex`), never the field value.
- `ProfileDefinitionError`: thrown by `defineProfile` (see section 7).

## 11. Other exports

- `emitMessageSchema(target)`: JSON Schema or Zod (as TypeScript source text) describing what
  `toJSON()` returns.
- `KNOWN_SEGMENTS`, `SUPPORTED_DATE_TOKENS`, `BUILTIN_DATE_FALLBACKS`,
  `SUPPORTED_OVERLAY_MESSAGES`, `STRUCTURE_REGISTRY_PROVENANCE`: introspection constants.
- The type declarations also export builders and acknowledgement helpers that the README does not
  document (`buildMessage`, `buildAdt`, `buildOru`, `buildOrm`, `buildSiu`, `buildMdm`,
  `buildDft`, `buildVxu`, `buildAck`, `interpretAck`). Read their JSDoc in the installed
  `dist/index.d.ts` before using them; for ACKs on an MLLP link, see `cosyte-mllp`.
