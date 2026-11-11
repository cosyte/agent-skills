---
name: cosyte-ncpdp
description: "Parse, build and serialize NCPDP pharmacy messages in TypeScript with @cosyte/ncpdp: Telecommunication Standard vD.0 claims (B1, B2, B3 requests and their responses, framed with FS, GS and RS control characters) and SCRIPT XML ePrescribing (NewRx, RxRenewal, RxChange, CancelRx, Status, Error, Verify). Use when a developer asks to parse a pharmacy claim, decode a Telecom D.0 transmission, check whether a claim was paid or rejected, read reject codes, pricing or DUR alerts, parse a NewRx or SCRIPT response, read an NDC or SIG text, or emit a spec-clean claim or prescription. Money and quantities stay strings with implied decimals, never floats. For X12 837 or 835 medical claims use cosyte-x12, for HL7 v2 use cosyte-hl7, and for synthetic NCPDP test fixtures use cosyte-synth."
license: MIT
metadata:
  package: "@cosyte/ncpdp"
  version: "0.1.7"
  docs: "https://docs.cosyte.com/ncpdp/intro"
---

# @cosyte/ncpdp

NCPDP parser, serializer and builder for Node.js and TypeScript: SCRIPT ePrescribing (XML) and
Telecommunication Standard pharmacy claims (control-character framed), lenient on parse and
spec-clean on emit. A vendor quirk becomes a positioned warning with a stable code, and money and
quantities are handled string-wise so floating point never touches a value.

## When to use it

- "Parse this NCPDP Telecom claim", "read this D.0 B1 transmission", FS/GS/RS-separated bytes.
- "Was this claim paid or rejected?": disposition, reject codes, pricing and DUR alerts.
- Compound ingredients, coordination-of-benefits payments, DUR/PPS or prior authorization segments.
- "Parse this NewRx": patient, prescriber, medication, NDC and SIG text from SCRIPT XML; or a
  Status, Error, Verify, RxRenewal, RxChange or CancelRx response.
- Build a Telecom request (`buildTelecomRequest`) or a SCRIPT NewRx (`buildNewRx`).

Use another skill when: you need synthetic NCPDP fixtures (cosyte-synth); the claim is X12 837,
835 or 270/271 (cosyte-x12); the message is HL7 v2 (cosyte-hl7) or FHIR (cosyte-fhir); you need
RxNorm or other code lookups (cosyte-terminology); you must de-identify data (cosyte-deid); you
are unsure which package fits (cosyte).

## Install

```bash
pnpm add @cosyte/ncpdp
# or
npm install @cosyte/ncpdp
```

Node 22 or newer. ESM with a CommonJS build beside it, both through the `exports` map. No runtime
dependencies: since 0.1.7 the SCRIPT side reads XML with its own reader, which refuses any DOCTYPE.
Entry points: `@cosyte/ncpdp/telecom`, `/script`, `/common`, `/profiles` and the root; since 0.1.6
the root re-exports every Telecom export. Each entry point is its own bundle, so a default profile
set through `@cosyte/ncpdp/profiles` does not reach a parser imported from another subpath: set and
parse through the same entry point.

## Minimal example

```ts
import { buildTelecomRequest, serializeTelecom, parseTelecom, claim } from "@cosyte/ncpdp/telecom";

// Emit a spec-clean Telecom B1 billing claim. Every value below is synthetic.
const wire = serializeTelecom(
  buildTelecomRequest({
    header: { transactionCode: "B1", binNumber: "999999", dateOfService: "20260115" },
    segments: [
      { segmentId: "04", fields: [{ id: "C2", value: "SYNTHCARD09" }] },
      {
        segmentId: "07",
        fields: [
          { id: "D2", value: "RX0000001" },
          { id: "E1", value: "03" },
          { id: "D7", value: "99999999999" },
          { id: "E7", value: "30000" },
          { id: "D5", value: "30" },
        ],
      },
    ],
  }),
);

// Read it back. A vendor quirk becomes a positioned warning here, never a throw.
const t = parseTelecom(wire);
const c = claim(t);

console.log(t.kind, t.header.transactionCode, t.warnings.length);
console.log(c?.cardholderId, c?.prescriptionReferenceNumber);
console.log(c?.product?.id, c?.product?.qualifier);
console.log(c?.quantityDispensed?.source, c?.quantityDispensed?.impliedDecimal);
```

```text
request B1 0
SYNTHCARD09 RX0000001
99999999999 03
30000 30.000
```

## Key API

- `parseTelecom(raw, opts?)`: string or `Buffer` to a frozen `TelecomTransaction` (`kind`,
  `header`, `transmissionSegments`, `transactions`, `segments`, `transactionCount`,
  `decodedTransactionCount`, `warnings`).
- `claim(t, index?)`: request view of one transaction (cardholder, DOB, Rx number, product, quantity).
- `adjudication(t, index?)`: response view (`status.disposition`, `pricing`, every `dur` alert).
- `compound`, `cobOtherPayments`, `responseCob`, `requestDur`, `priorAuthorization`: `(t, index?)`.
- `findSegment(segments, code)`, `fieldValue(segment, fieldId)`: raw access (`"07"` is Claim).
  `buildTelecomRequest`, `serializeTelecom`: Telecom emit; refusals throw `NcpdpTelecomBuildError`.
- `parseScript`, `newRx`, `status`, `error`, `verify`, `rxRenewalResponse`, `rxChangeResponse`,
  `cancelRxResponse`, `approvalOf` (script): SCRIPT read; `buildNewRx`, `serializeScript`: emit.
- `NcpdpTelecomParseError`, `NcpdpScriptParseError`: fatal errors; `TELECOM_WARNING_CODES`,
  `SCRIPT_WARNING_CODES`: stable codes to branch on.
- `dateValue`, `toObject`, `toISO`, `toDate`, `ndcValue`, `decimalValue` (common);
  `defineProfile`, `partitionWarnings`, `profiles.surescripts`, `profiles.pbm` (profiles).

## Limits and known defects

We have no known defects on our list for 0.1.7. Since 0.1.6 the segments ahead of the first group
separator in a Telecom request or response, such as Patient and Insurance, are transmission-level:
they are on `transmissionSegments`, never in `transactions`, and every view addressed by a
transaction index reads them with that transaction's own segments (its own segment wins over a
shared one with the same id). A sender that writes its first transaction with no group separator
in front of it and a later one with it has that first group read as transmission-level, with
`NCPDP_TELECOM_TRANSACTION_COUNT_MISMATCH` warned.

Stated limits from the README:

- Emit is canonical form, not byte identity, and one transaction per transmission
  (`NCPDP_TELECOM_BUILD_MULTI_TRANSACTION_EMIT`). Serializing an unmodeled SCRIPT transaction
  throws: test `body.kind` first and relay the original bytes.
- A reject always wins: any reject makes the disposition `"rejected"` even if the status says paid;
  an unrecognized status reads `"unknown"`. Most reject, DUR and reason labels do not ship
  (`known: false`): do not invent meanings. Prior authorization is presence, never validity.
- The structured SIG (`medication.sig`) is lossy and still changing; `sigText` is authoritative.
- Only `CCYYMMDD` (401-D1, 304-C4) is decoded; other date fields stay verbatim and `dateValue`
  returns `undefined`: do not guess their format. `toDate` needs `assumeOffsetMinutes`. An F6
  version stamp is recognized but not decoded (`NCPDP_TELECOM_VF6_NOT_DECODED`).
- Out of scope: Electronic Prescribing of Controlled Substances, streaming, SIG generation. No
  third party has tested it. Full list: [KNOWN-LIMITATIONS.md](https://github.com/cosyte/ncpdp/blob/main/KNOWN-LIMITATIONS.md)

## PHI handling

- The library logs nothing, retains nothing, writes nothing and opens no file or socket.
- Warning and error messages come from a frozen registry keyed by code and carry only a position
  (XPath for SCRIPT, byte offset plus field id for Telecom). Log `code` and `position`, not values.
- The parsed model is not safe to log: field values, drug codes, identifiers and dates are PHI.
  `segment.segmentId` and `field.id` are bounded to two characters and safe.
- The SCRIPT loader refuses `<!DOCTYPE>` and `<!ENTITY>` and resolves no entities. Your
  application owns transport, encryption, access control, audit, retention and de-identification.
- Use synthetic data (cosyte-synth) in tests and examples; never paste real patient data into
  prompts, fixtures or logs.

## Docs

- https://docs.cosyte.com/ncpdp/intro
- https://www.npmjs.com/package/@cosyte/ncpdp
- https://github.com/cosyte/ncpdp
- [references/REFERENCE.md](references/REFERENCE.md): mis-split helper, SCRIPT example, recipes, code tables.
