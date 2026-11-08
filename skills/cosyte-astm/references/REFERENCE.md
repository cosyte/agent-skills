# @cosyte/astm reference

Fuller API detail for the cosyte-astm skill, version 0.1.3. Every name here is in the published
type declarations; behavior statements come from the package documentation (the README and the
"The API, layer by layer" and "Coverage and compatibility" pages) and its JSDoc. Everything is
imported from the single entry point `@cosyte/astm`. All record content below is synthetic.

## Exports by task

| Task | Names |
| ---- | ----- |
| Parse records | `parseAstmRecords` (options `strict`, `profile`), `tokenizeRecord`, `tokenizeHeader`, `readDelimiters`, `readDelimiterDeclaration`, `decodeEscapes`, `splitEscapeAware`, `CANONICAL_DELIMITERS` |
| Read the model | `results`, `patient`, `orders`, `comments`, `query`, `commentsFor`, `attachComments`, `messages`, `classifyMessage`, `primaryCode`, `recognizeUniversalTestId`, `fieldScalar` |
| Interpret values | `interpretAbnormalFlag`, `interpretResultStatus`, `parseReferenceRange`, `describeVocabulary`, `ABNORMAL_FLAG_CODES`, `ABNORMAL_FLAG_VOCABULARY`, `RESULT_STATUS_VOCABULARY` |
| Frames | `decodeAstmFrames`, `parseFramedAstm`, `composeAstmFrames`, `serializeFramedAstm`, `computeChecksum`, `toChecksumHex`, `parseChecksumHex` |
| Transport | `detectFraming`, `ltpInitialState`, `ltpReduce`, `resolveProfileTransport`, `ASTM_ENQ`, `ASTM_ACK`, `ASTM_NAK`, `ASTM_EOT` |
| Emit records | `buildAstmMessage`, `serializeAstmRecords`, `serializeAstmRecord`, `serializeField`, `encodeComponent` |
| Terminology | `defineLivdCatalog`, `applyLivd`, `lookupLivdForRecord`, `LIVD_CATALOG_IDENTITY_UNDECLARED` |
| Dates | `parseAstmDate`, `toObject`, `toISO`, `toDate`, `astmDateToLocalISO` |
| Profiles | `defineAstmProfile`, `astmProfiles`, `getAstmProfile`, `listAstmProfiles`, `setDefaultAstmProfile`, `getDefaultAstmProfile`, `applyAstmProfile`, `applyAstmProfileToWarnings`, `isSafetyCriticalCode`, `SAFETY_CRITICAL_CODES`, `TOLERABLE_CODES` |
| Errors | `AstmParseError`, `AstmStrictError`, `AstmFrameStrictError`, `AstmAmbiguousStreamError`, `AstmSerializeError`, `AstmFrameEncodeError`, `AstmProfileDefinitionError` |

## Several messages in one stream

A message runs from its `H` header to its `L` terminator. The flat readers refuse to answer across
messages (`ASTM_AMBIGUOUS_MULTI_MESSAGE`) and `patient()` refuses a single message with several `P`
records (`ASTM_AMBIGUOUS_MULTI_PATIENT`), both by throwing `AstmAmbiguousStreamError`.

```ts
import { parseAstmRecords, messages, results, AstmAmbiguousStreamError } from "@cosyte/astm";

const raw =
  "H|\\^&\rP|1|PRACTICE-0001\rR|1|^^^687|28.6|U/L||N||F\rL|1|N\r" +
  "H|\\^&\rP|1|PRACTICE-0002\rR|1|^^^687|31.0|U/L||N||F\rL|1|N\r";
const msg = parseAstmRecords(raw);

try {
  results(msg);
} catch (err) {
  if (err instanceof AstmAmbiguousStreamError) {
    for (const m of messages(msg)) {
      // m.patient is the P for THIS message; m.results are its results only.
      console.log(m.index, m.patient?.practiceAssignedId, m.results.length);
    }
  }
}
```

Check `msg.warnings` for `ASTM_RECORD_UNKNOWN_TYPE` before trusting the split: an unrecognized
header opens no message and merges its neighbors. `msg.classification.kind` is `indeterminate`
when an unrecognized type letter could have been the `Q` that decides it.

## Framed bytes

```ts
import { decodeAstmFrames, parseAstmRecords, parseFramedAstm, results, serializeFramedAstm } from "@cosyte/astm";

// Frame a synthetic message, then read it back the way bytes off a line would arrive.
const bytes = serializeFramedAstm(parseAstmRecords("H|\\^&\rR|1|^^^687|28.6|U/L||N||F\rL|1\r"));

const { frames, warnings } = decodeAstmFrames(bytes);
console.log(frames[0]?.checksum.valid, warnings.length);

// Or both layers at once: only checksum-verified frames reach the record parser.
const { message, frameWarnings } = parseFramedAstm(bytes);
console.log(results(message)[0]?.value, frameWarnings.length);
```

Frame warnings carry a frame number and byte offset, never record bytes. Checksums are emitted
uppercase and accepted lowercase. A bad frame is surfaced untrusted (`trusted: false`) and never
merged; a sequence gap is never bridged.

## Receiver state machine

`ltpReduce` models the receiver's state transitions and nothing else: it owns no socket and no
clock. A frame the codec did not vouch for (bad checksum, unterminated, out of sequence) yields
`sendNak`, never `sendAck`, and is never appended to a record.

```ts
import {
  ASTM_ACK,
  ASTM_EOT,
  ASTM_NAK,
  decodeAstmFrames,
  ltpInitialState,
  ltpReduce,
  type LtpEvent,
  type LtpState,
} from "@cosyte/astm";

// `send` writes to your socket or serial port; `onRecord` receives complete, trusted records.
export function createReceiver(send: (b: Uint8Array) => void, onRecord: (r: Uint8Array) => void) {
  let state: LtpState = ltpInitialState();
  return (event: LtpEvent): void => {
    const { state: next, actions } = ltpReduce(state, event);
    state = next;
    for (const a of actions) {
      if (a.type === "sendAck") send(Uint8Array.of(ASTM_ACK));
      if (a.type === "sendNak") send(Uint8Array.of(ASTM_NAK));
      if (a.type === "sendEot") send(Uint8Array.of(ASTM_EOT));
      if (a.type === "deliverRecord") onRecord(a.record);
    }
  };
}

// Frame events come from the codec; control bytes become { type: "enq" }, "ack", "nak", "eot".
export function frameEvents(chunk: Uint8Array): LtpEvent[] {
  return decodeAstmFrames(chunk).frames.map((frame): LtpEvent => ({ type: "frame", frame }));
}
```

Use `detectFraming(leadingBytes)` first: serial always frames, and over TCP it varies even within one
vendor (the documentation names cobas 4800 and Iguana as framed, cobas b121 as raw). Raw record bytes
go straight to `parseAstmRecords`.

## LIVD: local code to LOINC

```ts
import { parseAstmRecords, defineLivdCatalog, applyLivd } from "@cosyte/astm";

// Your catalog: the vendor transmission code to LOINC. Several rows per code are normal; the
// record's reported units choose between them, compared verbatim and case sensitive.
const catalog = defineLivdCatalog([
  { vendorCode: "GLU", loinc: "2345-7", representativeUnit: "mg/dL" },
  { vendorCode: "GLU", loinc: "14749-6", representativeUnit: "mmol/L" },
]);

const msg = parseAstmRecords("H|\\^&\rR|1|^^^GLU|5.5|mmol/L||N||F\rL|1\r");
const { annotations, warnings } = applyLivd(msg, catalog);

const mapping = annotations[0]?.mapping;
if (mapping?.status === "mapped") console.log(mapping.loinc, mapping.unitComparison?.comparison);
console.log(warnings.map((w) => w.code));
```

`mapping.status` is a closed union: `mapped`, `unmapped` (`ASTM_LIVD_UNMAPPED_CODE`), `ambiguous`
(`ASTM_LIVD_AMBIGUOUS_MAPPING`, every candidate surfaced, none chosen), `no-vendor-code` and
`no-code`. A value in the Universal Test ID's first component is carried as
`unvalidatedWireValue`, never validated and never used as a lookup key;
`wireValueDisagreesWithCatalog` only reports that the two differ. A `lookup` that throws propagates
to you rather than reading as a miss. Only `unitComparison` says the units matched; do not branch
on `representativeUnit`.

## Dates

```ts
import { parseAstmDate, toObject, toISO, toDate } from "@cosyte/astm";

const collected = parseAstmDate("20240315"); // day precision, no time, no zone

console.log(toObject(collected)); // { year: 2024, month: 3, day: 15 }
console.log(toISO(collected)); // "2024-03-15", never a trailing Z
console.log(toDate(collected)); // undefined: the zone is unstated
console.log(toDate(collected, { assumeOffsetMinutes: -300 })); // 2024-03-15T05:00:00.000Z
console.log(toISO(parseAstmDate("19881301"))); // undefined: month 13 is refused, not rolled over
```

`assumeOffsetMinutes` is signed minutes east of UTC; an explicit `0` means "read it as UTC". A
`NaN` or out-of-range offset gives `undefined`, never an `Invalid Date`.

## Emit

```ts
import { buildAstmMessage, parseAstmRecords, results } from "@cosyte/astm";

// Synthetic values. H and L are supplied by the builder; nothing clinical is defaulted.
const raw = buildAstmMessage({
  records: [
    { type: "P", practiceAssignedId: "PRACTICE-0001", laboratoryAssignedId: "LAB-0002" },
    { type: "R", universalTestId: ["", "", "", "687"], value: "28.6", units: "U/L", resultStatus: "F" },
  ],
  terminationCode: "N",
});
console.log(results(parseAstmRecords(raw))[0]?.value); // "28.6"
```

Emit writes the canonical `H|\^&` set and re-escapes embedded delimiters. It refuses, with a typed
error rather than lossy bytes: a value holding `CR` or `LF` (`ASTM_EMIT_UNENCODABLE_VALUE`), a
delimiter set that cannot be read back (`ASTM_EMIT_INVALID_DELIMITERS`), a record whose own type
letter the set would escape away (`ASTM_EMIT_TYPE_LETTER_COLLISION`, which can fire when transcoding
a stream read under a vendor set), and in frames a character above `U+00FF`
(`ASTM_FRAME_UNENCODABLE_CHARACTER`), a raw `STX`, `ETB` or `ETX` byte (`ASTM_FRAME_RESERVED_BYTE`),
no records (`ASTM_FRAME_EMPTY_RECORD`) or a `startFrameNumber` outside 0 to 7
(`ASTM_FRAME_INVALID_START_FRAME_NUMBER`). Encode non-Latin-1 content yourself and pass a
`Uint8Array`.

## Profiles

`defineAstmProfile({ name, description?, tolerate?, transport?, provenance?, extends? })` builds a
profile. Each `tolerate` entry is `{ code, rationale, match? }`. A tolerated warning is downgraded
to `PROFILE_QUIRK_APPLIED` (with `toleratedCode`) and no value changes. A default-deny safety gate
throws `AstmProfileDefinitionError` for any safety-critical code (result value, flag, status,
range or units warnings, patient or comment context, message-kind ambiguity, unrecognized record
types, frame or transport integrity), and runs again when a warning would be downgraded. Built-ins:
`astmProfiles.default` and `astmProfiles.referenceCorpus`. Pass `profile: null` to opt one parse
out of the process default.

## Code tables

Fatal (`FATAL_CODES`, `AstmParseError`): `EMPTY_INPUT`, `ASTM_RECORD_NO_HEADER`,
`ASTM_RECORD_UNDECLARED_DELIMITERS`. Under `{ strict: true }` every tolerated deviation becomes an
`AstmStrictError` (record layer) or `AstmFrameStrictError` (frame layer) carrying the warnings.

Record warnings (`WARNING_CODES`). Codes marked "no" may not be tolerated by any profile, per the
documentation pages "The API, layer by layer" and "Coverage and compatibility":

| Code | Profile may tolerate |
| ---- | -------------------- |
| `ASTM_RECORD_UNKNOWN_TYPE` | no |
| `ASTM_RECORD_FIELDS_UNSEPARATED` | no |
| `ASTM_RECORD_DELIMITER_ROLE_COLLISION` | no |
| `ASTM_RECORD_DELIMITER_SWALLOWED_BY_ESCAPE` | no |
| `ASTM_RECORD_AMBIGUOUS_ESCAPE_ALIGNMENT` | no |
| `ASTM_RECORD_ALIGNMENT_SHIFTED_FIELDS` | no |
| `ASTM_RECORD_ALIGNMENT_TRUNCATED_FIELD` | no |
| `ASTM_RECORD_ALIGNMENT_SHIFTED_COMPONENTS` | no |
| `ASTM_NONSTANDARD_DELIMITERS` | yes |
| `ASTM_UNKNOWN_ESCAPE_SEQUENCE` | yes |
| `ASTM_UNPAIRED_ESCAPE_CHARACTER` | yes |

Other record warnings: `ASTM_RECORD_AMBIGUOUS_VALUE_SPLIT`, `ASTM_RECORD_UNDEFINED_ABNORMAL_FLAG`,
`ASTM_RECORD_UNDEFINED_RESULT_STATUS`, `ASTM_RECORD_UNPARSEABLE_REFERENCE_RANGE`,
`ASTM_RECORD_UNITS_ABSENT`, `ASTM_RECORD_ORPHAN_COMMENT`, `ASTM_RECORD_PARTIAL_TIMESTAMP`,
`ASTM_RECORD_UNINTERPRETED_QUERY_STATUS`, `ASTM_RECORD_AMBIGUOUS_MESSAGE_KIND`,
`ASTM_RECORD_DELIMITERS_REDECLARED`, `ASTM_RECORD_UNREADABLE_REDECLARATION`,
`PROFILE_QUIRK_APPLIED`. Ask `isSafetyCriticalCode(code)` rather than hard-coding which of these a
profile may tolerate.

Frame warnings (`FRAME_WARNING_CODES`): `ASTM_FRAME_BAD_CHECKSUM`, `ASTM_FRAME_SEQUENCE_GAP`,
`ASTM_FRAME_UNTERMINATED`, `ASTM_FRAME_OVERSIZE`. Transport (`LTP_WARNING_CODES`):
`ASTM_LTP_AMBIGUOUS_TRANSPORT`, `ASTM_LTP_UNEXPECTED_EVENT`, `ASTM_LTP_FRAME_REJECTED`. Terminology
(`LIVD_WARNING_CODES`): `ASTM_LIVD_UNMAPPED_CODE`, `ASTM_LIVD_AMBIGUOUS_MAPPING`,
`ASTM_LIVD_CATALOG_NO_LOINC_VERSION`.

Branch on `w.code`; renaming a code is a breaking change, and a newly added code is
safety-critical by default.
