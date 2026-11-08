---
name: cosyte-hl7
description: "Parse, read, edit and serialize HL7 v2 messages in Node.js and TypeScript with @cosyte/hl7. Use when a developer says parse this HL7 message, read the MRN or patient name from PID, loop over OBX results in an ORU^R01, check the MSH-9 message type, handle an ADT^A01 or an A40 merge, read allergies from AL1 or IAM, split an HL7 batch file (FHS, BHS), stream a large .hl7 feed, define a profile for Z-segments or vendor quirks, validate a message against HL7 published structures or a conformance profile, or turn an HL7 timestamp into ISO text without guessing a timezone. Covers MSH, PID, PV1, NK1, OBR, OBX, AL1, IAM, RXA, TQ1, SCH, TXA, FT1 and MRG. For MLLP sockets and ACKs use cosyte-mllp; for HL7 v2 to FHIR use cosyte-transform; for synthetic test messages use cosyte-synth."
license: MIT
metadata:
  package: "@cosyte/hl7"
  version: "0.1.3"
  docs: "https://docs.cosyte.com/hl7/intro"
---

# @cosyte/hl7

A parser and utility library for HL7 v2 in Node.js and TypeScript. It accepts vendor-quirky
messages leniently, exposes the common fields as named helpers (`msg.patient?.mrn`,
`msg.meta.timestamp`), keeps the positional tree for everything else, and emits spec-clean HL7
from `toString()`.

## When to use it

- "Parse this HL7 message", "get the MRN, name and date of birth out of PID".
- "Loop over the lab results (OBX) in this ORU^R01", "group OBX under their OBR".
- "What message type is this?" (MSH-9), "is this an ADT^A01?".
- Reading allergies (AL1, IAM), next of kin, diagnoses, insurance, medications, immunizations,
  appointments (SIU), documents (MDM), charges (DFT) and order timing (TQ1).
- Patient merges and identity events (ADT A40 and the other MRG-carrying triggers).
- Changing a field and re-sending the message (`setField`, then `toString()`).
- Splitting a batch file or streaming a multi-GB feed one message at a time.
- Vendor Z-segments and site-specific fields through profiles (8 built-in vendor profiles).
- Checking a message against HL7's published structures, or against an interface spec you write.
- Turning an HL7 datetime into an ISO string or a `Date` without inventing a timezone.

Use another skill when:

- sending or receiving over TCP (MLLP), ACK correlation, reconnects, TLS: `cosyte-mllp`;
- converting a parsed message to FHIR R4 resources: `cosyte-transform`;
- generating synthetic HL7 fixtures: `cosyte-synth`; de-identifying messages: `cosyte-deid`;
- X12, C-CDA, FHIR JSON or ASTM analyzer data: `cosyte-x12`, `cosyte-ccda`, `cosyte-fhir`,
  `cosyte-astm`; the `cosyte` command line or MCP server: `cosyte-cli`.

## Install

```bash
npm install @cosyte/hl7
# the README recommends pnpm
pnpm add @cosyte/hl7
```

Node `>=22`. Dual ESM and CommonJS builds with type declarations for both. Zero runtime
dependencies: it loads only the Node standard library.

## Minimal example

The README's synthetic ADT^A01 (MSH-3 renamed to a placeholder), plus a warnings loop.

```ts
import { parseHL7 } from "@cosyte/hl7";

// A synthetic ADT^A01 admit. HL7 v2 ends every segment with a carriage return.
const raw =
  "MSH|^~\\&|ADTAPP|MAIN|LIS|REF|20260419101500||ADT^A01^ADT_A01|MSG00001|P|2.5\r" +
  "EVN|A01|20260419101500\r" +
  "PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M|||123 Main St^^Boston^MA^02101||^PRN^PH^^^617^5551212\r" +
  "PV1|1|I|ICU^101^A^HOSP|||||ATTEND^Smith^Jane^^^^MD|||||||||||VISIT001\r";

const msg = parseHL7(raw);

console.log("Patient record number:", msg.patient?.mrn);
console.log("Full name:", msg.patient?.fullName);
console.log("Date of birth:", msg.patient?.dateOfBirth?.raw);
console.log("Precision:", msg.patient?.dateOfBirth?.precision);
console.log("Message type:", msg.meta.type);
console.log("Sent at:", msg.meta.timestamp?.raw);
console.log("Ward:", msg.visit?.location?.pointOfCare);

// Tolerated deviations are data, not exceptions. Log code and position, never values.
for (const w of msg.warnings) {
  console.log(w.code, w.position.segmentIndex, w.position.fieldIndex);
}
```

```text
Patient record number: MRN12345
Full name: John Q Doe
Date of birth: 19800115
Precision: day
Message type: ADT^A01^ADT_A01
Sent at: 20260419101500
Ward: ICU
```

Helpers return `undefined` (never throw) when their segment is absent, so use `?.` throughout.
Every datetime is a fidelity `TS` (`raw`, `precision`, `hasTimezone`, parts), not a `Date`.

## Key API

- `parseHL7(raw, options?)`: string or `Buffer` in, `Hl7Message` out. The second argument is a
  profile or an options bag: `strict`, `dateFormats`, `stripMllpFraming`, `profile`, `charset`,
  `onWarning`.
- Named helpers: `msg.meta` (`type`, `messageCode`, `triggerEvent`, `controlId`, `timestamp`),
  `msg.patient` (`mrn`, `identifiers`, `name`, `fullName`, `dateOfBirth`, `sex`, `address`,
  `phoneNumbers`, and per the type declarations `race`, `ethnicity`, `language`), `msg.visit`.
- List helpers: `msg.observations()`, `msg.orders()`, `msg.allergies()`, `msg.nextOfKin()`,
  `msg.diagnoses()`, `msg.insurance()`, `msg.medications()`, `msg.immunizations()`,
  `msg.appointments()`, `msg.documents()`, `msg.charges()`, `msg.identityEvents()`.
- `msg.get("PID.5.1")`: dot-path to a decoded string or `undefined`; `msg.getAll(type)`.
- `msg.segments(type)`, `msg.allSegments()`, `seg.field(n)`, `field.value`, `field.text`,
  typed coercions such as `field.asCwe()`, `field.asCx()`, `field.asXpn()`, `field.asTs()`.
- `msg.is("ADT^A01")`: runtime check that also narrows types; then `msg.part()` / `msg.parts()`.
- `msg.setField(path, value)`, `msg.addSegment(name, fields)`, `msg.removeSegment(type)`,
  `msg.toString()` (wire format), `msg.toJSON()`, `msg.prettyPrint()` (debug only).
- `msg.warnings` and `WARNING_CODES` (20 stable codes); `Hl7ParseError` with `FATAL_CODES`
  (4 codes); `ProfileDefinitionError`.
- `splitBatch(raw)` and `parseStream(source)`: batch files and incremental parsing.
- `msg.structure`, `validateMessageStructure(msg)`, `validateAgainstProfile(msg, profile)`,
  `defineConformanceProfile(profile)`.
- `defineProfile(opts)`, `profiles` (`epic`, `cerner`, `meditech`, `athena`, `genericLab`,
  `visage`, `philips`, `va`), `setDefaultProfile`, `getDefaultProfile`.
- `parseDtm`, `formatDtm`, `dtmToDate`, `toObject`, `toISO`, `toDate`.
- `emitMessageSchema(target)`: JSON Schema or Zod source for what `toJSON()` returns.

## Limits and known defects

- It is a parser. Do not expect network IO: it strips MLLP framing on read and never adds it on
  `toString()`. Use `cosyte-mllp` for the wire. No HL7 v3 or CDA, and no FHIR conversion.
- Do not treat it as a coded-value validator: it checks structure, not every HL7 table.
  `validateAgainstProfile` ships no profiles and no value sets; you author both.
- Do not read zero findings as conformance. Read `validated` before `findings` on
  `validateMessageStructure`; it covers twelve message codes and leaves field content, datatypes,
  value sets and tables unchecked. `msg.structure` is a misroute and truncation net only.
- Helpers report, they never act: an allergy `D`, an immunization delete request or a merge is
  returned for you to apply. Re-pointing data to a surviving record is your integration's job.
- Do not expect interpretation: TQ1 repeat patterns (`Q6H`) are verbatim, medication
  `orderControl` is ORC-1 as sent, DFT amounts are strings. The SIU, MDM and DFT helpers are not a
  scheduling state machine, signature verification or a pricing engine.
- `allergies()` does not read IAR or NTE under IAM, nor IAM-1 or IAM-8 onward; use
  `msg.segments("IAM")` for those.
- Do not expect timezone guessing: `toDate`/`dtmToDate` return `undefined` for an offset-less
  value unless you pass `assumeOffsetMinutes`. A non-canonical date stays `valid: false` unless
  you declare its format in `dateFormats`; check `valid` before reading parts.
- `msg.is()` narrows types but does not promise the segments are present.
- `segmentOverrides` names add reads only; typed helpers keep reading standard positions.
- `splitBatch` does not generate batch ACKs or enforce a trailer; `parseStream` expects an
  already de-framed stream.
- Dot-path `[N]` is 0-indexed (`OBX[1]` is the second OBX) while dot numbers are 1-based HL7
  positions. The type declarations and the documentation's access patterns page agree on this.
- `strict: true` turns every warning into a thrown `Hl7ParseError`; the four fatal codes always
  throw. Wrap `parseHL7` in `try`/`catch` on untrusted input.
- Known defects: none on our list for 0.1.3.

## PHI handling

- The library does not log, cache, write files or open connections. Content lives only on the
  `Hl7Message` you hold.
- Warnings, structure findings and conformance findings carry codes and positions, never field
  values: log those.
- `Hl7ParseError.snippet` holds up to 40 characters of input verbatim and unredacted. Strip it
  before logging or error reporting. `message` is bounded, not absolutely content-free.
- `toString()`, `toJSON()` and `prettyPrint()` return real content; `prettyPrint()` is not
  redacted. The `raw` on a batch or stream entry is the message's verbatim source.
- Transport security, storage, retention, redaction and access control stay with the application.
- Use synthetic data in tests and examples. Never paste real patient data into prompts, fixtures
  or logs.

## Docs

- https://docs.cosyte.com/hl7/intro
- https://www.npmjs.com/package/@cosyte/hl7
- https://github.com/cosyte/hl7
- [references/REFERENCE.md](references/REFERENCE.md): cookbook recipes (helpers, merges,
  profiles, datetimes, batch and stream, validation), the warning and fatal code tables, and
  error handling.
