# @cosyte/ncpdp reference

Fuller API detail for the cosyte-ncpdp skill, version 0.1.1. Every name here is in the published
type declarations; behavior statements come from the package README and its JSDoc.

## Spot the transmission-level mis-split (0.1.1 defect)

In 0.1.1 a Telecom request whose Patient and Insurance segments sit before the first group
separator decodes that leading group as its own transaction. Find such groups before reading a
claim view, then read the shared fields from the leading group and the claim fields from the rest.

```ts
import { findSegment, type TelecomTransaction } from "@cosyte/ncpdp/telecom";

// Indexes of decoded transactions that carry no Claim (07) segment. On a request, a leading
// entry here is how the transmission-level mis-split shows up.
export function groupsWithoutClaim(t: TelecomTransaction): number[] {
  return t.transactions
    .filter((tx) => findSegment(tx.segments, "07") === undefined)
    .map((tx) => tx.index);
}
```

Segment names (`segment.name`) and ids are structural and safe to log; field values are not.

## Read a SCRIPT NewRx

From the README, with every value synthetic.

```ts
import { parseScript, newRx } from "@cosyte/ncpdp/script";

// A minimal SCRIPT NewRx. Every value below is synthetic.
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Message xmlns="http://www.ncpdp.org/schema/SCRIPT" version="2017071">
  <Header><MessageID>SYNTH-MSG-0001</MessageID></Header>
  <Body><NewRx>
    <Patient><HumanPatient>
      <Name><LastName>Testpatient</LastName><FirstName>Avery</FirstName></Name>
      <DateOfBirth><Date>1990-04-12</Date></DateOfBirth>
    </HumanPatient></Patient>
    <MedicationPrescribed>
      <DrugDescription>Amoxicillin 500 MG Oral Capsule</DrugDescription>
      <DrugCoded><ProductCode Qualifier="ND">99999999999</ProductCode></DrugCoded>
      <Sig><SigText>Take 1 capsule by mouth three times daily for 10 days.</SigText></Sig>
    </MedicationPrescribed>
  </NewRx></Body>
</Message>`;

const msg = parseScript(xml);
const rx = newRx(msg); // the NewRx body, or undefined for another transaction

console.log(msg.header.messageId, msg.warnings.length);
console.log(rx?.patient?.name?.lastName, rx?.patient?.dateOfBirth);
console.log(rx?.medication?.description, rx?.medication?.coded?.productCode?.system);
console.log(rx?.medication?.sig?.sigText);
```

```text
SYNTH-MSG-0001 0
Testpatient 1990-04-12
Amoxicillin 500 MG Oral Capsule NDC
Take 1 capsule by mouth three times daily for 10 days.
```

## Read a Telecom response

`adjudication` returns `undefined` when the transmission is not a response or carries no
segments. Address later claims with the `index` argument; never treat the first claim's
disposition as the whole message.

```ts
import { adjudication, parseTelecom } from "@cosyte/ncpdp/telecom";

export function summarize(rawResponse: string): string[] {
  const t = parseTelecom(rawResponse);
  const lines: string[] = [];
  for (let i = 0; i < t.decodedTransactionCount; i += 1) {
    const a = adjudication(t, i);
    if (a === undefined) continue;
    const rejects = a.status?.rejectCodes.map((r) => `${r.code}${r.known ? "" : " (unlabeled)"}`);
    lines.push(
      `${i}: ${a.status?.disposition ?? "no status"}; pay ${a.pricing?.patientPayAmount?.amount ?? "n/a"}; ` +
        `rejects ${rejects?.join(", ") ?? "none"}; DUR alerts ${a.dur.length}`,
    );
  }
  return lines;
}
```

The returned lines hold PHI-adjacent claim data (amounts, codes); do not send them to a shared log.

- `Disposition` is `"paid" | "captured" | "approved" | "duplicate" | "deferred" | "rejected" | "unknown"`.
- `status.statusConflict` is `true` when a paid-like status arrived with reject codes; the
  disposition is then `"rejected"`.
- `TelecomMoney` keeps `source` (verbatim) beside `amount` (string-wise, implied two decimals,
  optional overpunch sign) and `isValid`. Unexpected input has `isValid: false` and no `amount`.

## Telecom API by task

| Task | Names (all from `@cosyte/ncpdp/telecom`) |
| ---- | ---------------------------------------- |
| Parse | `parseTelecom`, `TelecomParseOptions` (`encoding`, default `latin1` for a `Buffer`; `profile`) |
| Request views | `claim`, `claimView`, `compound`, `cobOtherPayments`, `requestDur`, `priorAuthorization` |
| Response views | `adjudication`, `responseStatus`, `responsePricing`, `responseDur`, `responseCob` |
| Raw access | `findSegment`, `fieldValue`, `fieldValues`, `SEGMENT_NAMES`, `FIELD_NAMES`, `SEGMENT_ABSENCES` |
| Tokenize | `tokenizeTransactions` (every group), `tokenizeBody` (first group only, says nothing about the rest) |
| Values | `telecomQuantity`, `impliedThreeDecimal`, `telecomMoney` |
| Emit | `buildTelecomRequest`, `serializeTelecom` |
| Lookup tables | `RESPONSE_STATUS_MEANINGS`, `DUR_REASON_MEANINGS` |
| Framing constants | `FIELD_SEPARATOR` (FS, 0x1C), `GROUP_SEPARATOR` (GS, 0x1D), `SEGMENT_SEPARATOR` (RS, 0x1E), `D0_HEADER_LENGTH` (56) |

Every per-transaction view takes `(transaction, index?)` with `index` defaulting to the first
transaction; an index past the last reads `undefined` or an empty array, never a throw. See the
skill's known-defect section before relying on transaction indexes for a request.

## SCRIPT API by task

| Task | Names (from `@cosyte/ncpdp/script` unless noted) |
| ---- | ------------------------------------------------ |
| Parse | `parseScript`, `ScriptMessage` (`header`, `body`, `warnings`, `asNewRx()`, `asStatus()`, `asError()`) |
| NewRx | `newRx`, `extractStructuredSig` |
| Responses | `status`, `error`, `verify`, `dispositionOf` (returns `"success"`, `"error"` or `"verify"`) |
| Lifecycle requests | `rxRenewalRequest`, `rxChangeRequest`, `cancelRx` |
| Lifecycle responses | `rxRenewalResponse`, `rxChangeResponse`, `cancelRxResponse`, `approvalOf` |
| Versions | `KNOWN_SCRIPT_VERSIONS`, `classifyVersion` |
| Emit | `buildNewRx`, `buildScriptResponse`, `serializeScript` |
| Errors | `NcpdpScriptParseError`, `NcpdpScriptBuildError` (from `@cosyte/ncpdp/common` or the root) |

- `approvalOf(outcome)` is fail-safe: only an outright approval (`approved`,
  `approvedWithChanges`) is `"affirmative"`, denials are `"negative"`, everything else is
  `"indeterminate"`. A malformed response with more than one outcome resolves denial-first.
- On `approvedWithChanges`, dispense `medicationPrescribed`: that is the changed medication.
- An `Error` body is never a success; where a malformed message carries several response bodies the
  most conservative one wins. Codes and descriptions are verbatim; no code-to-meaning table ships.

## Dates

```ts
import { dateValue, toObject, toISO, toDate } from "@cosyte/ncpdp";

const dos = dateValue("20260629"); // a synthetic Date of Service

console.log(toObject(dos)); // { year: 2026, month: 6, day: 29 }, month is 1 to 12
console.log(toISO(dos)); // "2026-06-29"
console.log(toDate(dos)); // undefined: no zone stated, none assumed
console.log(toDate(dos, { assumeOffsetMinutes: -300 })); // 2026-06-29T05:00:00.000Z
console.log(dateValue("20240230")); // undefined: no such day, never rolled over
```

The names `dateValue`, `toObject`, `toISO` and `toDate` are the same in every Cosyte parser; alias
them (`import { toISO as ncpdpToISO }`) or namespace-import when two parsers share a file.

## Profiles

Profiles are descriptive. Attach one with `parseTelecom(raw, { profile })` or
`parseScript(xml, { profile })`; output is byte-identical with or without it. Use
`partitionWarnings(warnings, profile)` to split warnings into `expected` and `unexpected`.
`setDefaultProfile` and `getDefaultProfile` manage a process-scoped default; pass
`profile: null` to opt one call out of it. Built-ins: `profiles.surescripts` (SCRIPT) and
`profiles.pbm` (Telecom). `defineProfile` builds your own; it throws `NcpdpProfileError` on a bad spec.

## Code tables

Fatal (thrown, typed error with `code` and `position`):

| Code | Thrown by |
| ---- | --------- |
| `EMPTY_INPUT` | `parseTelecom`, `parseScript` |
| `NCPDP_TELECOM_NO_HEADER` | `parseTelecom`: input shorter than the fixed header |
| `NCPDP_TELECOM_INVALID_FRAMING` | `parseTelecom`: body content with none of the framing characters; a separator is never guessed |
| `NCPDP_TELECOM_UNSUPPORTED_VERSION` | `parseTelecom`: version stamp neither D.0 nor a recognized future stamp |
| `NCPDP_SCRIPT_NOT_XML` | `parseScript` |
| `NCPDP_SCRIPT_NO_MESSAGE_ROOT` | `parseScript` |
| `NCPDP_SCRIPT_UNSUPPORTED_VERSION` | `parseScript` |

Build (thrown by the builders and serializers):

| Code | Meaning |
| ---- | ------- |
| `NCPDP_TELECOM_BUILD_MISSING_TRANSACTION_CODE` | no Transaction Code (103-A3) |
| `NCPDP_TELECOM_BUILD_MISSING_SEGMENT_ID` / `NCPDP_TELECOM_BUILD_INVALID_SEGMENT_ID` | segment id missing or not two characters |
| `NCPDP_TELECOM_BUILD_INVALID_FIELD_ID` | field id not two characters |
| `NCPDP_TELECOM_BUILD_EMBEDDED_CONTROL_CHARACTER` | a value contains FS, GS or RS |
| `NCPDP_TELECOM_BUILD_FIELD_TOO_LONG` | an over-long fixed-header field |
| `NCPDP_TELECOM_BUILD_MULTI_TRANSACTION_EMIT` | `serializeTelecom` given more than one decoded transaction |
| `NCPDP_SCRIPT_BUILD_MISSING_RESPONSE_CODE`, `NCPDP_SCRIPT_BUILD_MISSING_MEDICATION`, `NCPDP_SCRIPT_BUILD_INVALID_CHARACTER`, `NCPDP_SCRIPT_BUILD_UNSUPPORTED_TRANSACTION` | SCRIPT emit refusals |

Telecom warnings (`TELECOM_WARNING_CODES`, never thrown in the lenient parse):

| Code | Meaning |
| ---- | ------- |
| `NCPDP_TELECOM_VF6_NOT_DECODED` | F6 stamp recognized, body left untokenized |
| `NCPDP_TELECOM_UNKNOWN_SEGMENT` | segment id not modeled; preserved verbatim |
| `NCPDP_TELECOM_MALFORMED_FIELD` | field token too short for an id; preserved with empty id |
| `NCPDP_TELECOM_MISSING_SEGMENT_ID` / `NCPDP_TELECOM_MALFORMED_SEGMENT_ID` | segment does not open with a valid `AM` field |
| `NCPDP_TELECOM_TRANSACTION_COUNT_MISMATCH` | declared 109-A9 differs from decoded count (can be false, see the skill) |
| `NCPDP_TELECOM_STATUS_CONFLICT` | paid-like status with reject codes; disposition is rejected |
| `NCPDP_TELECOM_UNKNOWN_REJECT_CODE` / `NCPDP_TELECOM_UNKNOWN_RESPONSE_STATUS` / `NCPDP_TELECOM_UNKNOWN_DUR_REASON` | code not recognized; preserved verbatim |
| `NCPDP_TELECOM_COMPOUND_COUNT_MISMATCH` / `NCPDP_TELECOM_COB_COUNT_MISMATCH` | declared count differs from decoded blocks; nothing dropped |

SCRIPT warnings (`SCRIPT_WARNING_CODES`): `NCPDP_SCRIPT_VERSION_ABSENT`,
`NCPDP_SCRIPT_UNSUPPORTED_VERSION_TOLERATED`, `NCPDP_SCRIPT_UNSUPPORTED_TRANSACTION`,
`NCPDP_SCRIPT_MISSING_REQUIRED_ELEMENT`, `NCPDP_SCRIPT_STRENGTH_CODED_AND_EXPLICIT`,
`NCPDP_SCRIPT_RESPONSE_AMBIGUOUS_DISPOSITION`, `NCPDP_SCRIPT_LIFECYCLE_AMBIGUOUS_OUTCOME`,
`NCPDP_SCRIPT_LIFECYCLE_OUTCOME_UNRECOGNIZED`, `NCPDP_SCRIPT_SIG_STRUCTURED_LOSSY`,
`NCPDP_SCRIPT_SIG_AMBIGUOUS_DOSE`.

Renaming a warning code is a breaking change, so branch on `w.code`, never on `w.message`.
