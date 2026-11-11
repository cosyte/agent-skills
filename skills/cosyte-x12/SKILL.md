---
name: cosyte-x12
description: "Parses, reads and builds ASC X12 005010 healthcare EDI in Node.js and TypeScript with @cosyte/x12. Use when the user wants to parse an X12 or EDI file (ISA, GS and ST segments, usually tilde-terminated), read an 835 remittance or ERA and reconcile BPR, CLP, CAS and PLB amounts, read or build an 837P, 837I or 837D claim, a 270 eligibility inquiry or 271 response, a 276 or 277 claim status, a 277CA, 278, 820 or 834, a 999 or TA1 acknowledgment, or the 275 and 277 RFAI attachments transactions. Not for EDIFACT, non-healthcare X12 such as 850, 856 or 810, or transport such as AS2 and SFTP. For synthetic X12 test files use cosyte-synth; to de-identify an interchange use cosyte-deid."
license: MIT
metadata:
  package: "@cosyte/x12"
  version: "0.1.11"
  docs: "https://docs.cosyte.com/x12/intro"
---

# @cosyte/x12

An ASC X12 healthcare EDI parser, serializer and builder for Node.js and TypeScript: lenient on
parse, spec-clean on emit. It decodes the HIPAA 005010 transaction sets into typed models, keeps
every amount in exact decimal arithmetic, and reports each tolerated vendor deviation as a stable
warning code.

## When to use it

- "Parse this X12 file", "read this EDI interchange in Node", "what is in this ISA envelope".
- "Read an 835", "post this ERA", "how much did the payer pay and why", "reconcile the 835".
- "Read or build an 837P / 837I / 837D claim".
- "Answer a 270 with a 271", "read the 271 eligibility benefits", "claim status 276/277".
- "Build a 999 or TA1 acknowledgment", "read a 834 enrollment file", "read an 820".

Use another skill when:

- The data is HL7 v2 (pipe-delimited, starts with `MSH|`): use cosyte-hl7.
- The data is an NCPDP pharmacy claim: use cosyte-ncpdp.
- You need synthetic X12 fixtures for tests: use cosyte-synth.
- You need to strip identifiers from an interchange: use cosyte-deid.

## Install

```bash
npm install @cosyte/x12
```

The README leads with `pnpm add @cosyte/x12`; yarn works the same way. Node 22.0.0 or later, zero
runtime dependencies, dual ESM and CJS builds with type declarations for both. Everything ships from
one entry point; there are no subpath imports.

## Minimal example

From the README: parse an 835 and read the payment, the claim split and the adjustment reason. The
interchange is synthetic.

```ts
import { parseX12, get835 } from "@cosyte/x12";

const raw = `ISA*00*          *00*          *ZZ*MEDICARE       *ZZ*SUBMITTER      *260601*1200*^*00501*000000001*0*P*:~
GS*HP*MEDICARE*SUBMITTER*20260601*1200*1*X*005010X221A1~
ST*835*0001~
BPR*I*450.00*C*ACH*CCP*01*123456789*DA*987654321*1512345678**01*111111111*DA*222222222*20260601~
TRN*1*0012345*1512345678~
DTM*405*20260601~
N1*PR*MEDICARE PART A~
N3*123 PAYER WAY~
N4*BALTIMORE*MD*21244~
PER*BL*JANE COORDINATOR*TE*5551234567~
N1*PE*SAMPLE CLINIC INC~
N3*456 PROVIDER LN~
N4*CLEVELAND*OH*44113~
REF*TJ*123456789~
LX*1~
CLP*PT-ACCT-001*1*500.00*450.00*50.00*MC*PAYER-CLAIM-001*11*1~
NM1*QC*1*PATIENT*TEST*A***MI*MEMBER001~
NM1*82*2*RENDERING PROVIDER INC*****XX*1234567890~
DTM*232*20260501~
DTM*233*20260501~
SVC*HC:99213*500.00*450.00**1~
DTM*472*20260501~
CAS*PR*1*50.00~
REF*6R*LINE-CTRL-001~
SE*23*0001~
GE*1*1~
IEA*1*000000001~`;

const ix = parseX12(raw);
const tx = ix.groups[0]?.transactions.find((t) => t.st.elements[1] === "835");
if (tx === undefined) throw new Error("no 835 in this interchange");
const remit = get835(ix.delimiters, tx);
if (remit === undefined) throw new Error("not an 835");

const claim = remit.claims[0];
const adjustment = claim?.serviceLines[0]?.adjustments[0];
console.log("paid", remit.payment.totalActualPayment?.toString(), "by", remit.payment.method);
console.log("claim", claim?.patientControlNumber, "charged", claim?.totalChargeAmount?.toString());
console.log("patient owes", claim?.patientResponsibilityAmount?.toString());
console.log("reason", adjustment?.groupCode, adjustment?.reasonCode, adjustment?.reasonDescription);
console.log("warnings", ix.warnings.length);
```

```text
paid 450.00 by ACH
claim PT-ACCT-001 charged 500.00
patient owes 50.00
reason PR 1 Deductible Amount
warnings 0
```

The `groupCode` says who owes the money (`PR` patient responsibility, `CO` contractual obligation).
Read it; never infer it.

## Key API

- `parseX12(raw)`: decode an interchange (string or Buffer) into a model with `delimiters`,
  `groups[].transactions[]` and `warnings`.
- Typed readers, each taking `(ix.delimiters, tx)`: `get835`, `get837Claims`, `get270Inquiry`,
  `get271Eligibility`, `get276StatusInquiry`, `get277Status`, `get277CADisposition`,
  `get278Request`, `get278Response`, `get820Payments`, `get834Enrollments`, `get275Attachments`,
  `get277RequestForAdditionalInformation`; plus `parse999` and `parseTA1`.
- Builders: `buildInterchange`, `serializeX12`, and a domain builder per transaction set
  (`build835`, `build837P`, `build837I`, `build837D`, `build270`, `build271`, `build276`,
  `build277`, `build277CA`, `build278Request`, `build278Response`, `build820`, `build834`,
  `build999`, `buildTA1`, `build275`, `build277RequestForAdditionalInformation`). Builders are pure
  functions and never send anything.
- `X12Decimal`: every money, percent and quantity field. String-backed with BigInt arithmetic; an
  empty slot reads `undefined`, not zero. Never `parseFloat` an EDI amount.
- The 835 balance: BPR-02 equals the sum of CLP-04 minus the sum of PLB amounts, each PLB amount
  in its raw sign, so a positive PLB amount reduces the payment (a recoupment). Reconcile with the
  subtraction.
- `X12ParseError`: thrown only for the four structural fatals (`X12_NO_ISA_HEADER`,
  `X12_ISA_TOO_SHORT`, `X12_INVALID_DELIMITERS`, `X12_EMPTY_INPUT`). Everything else is a warning
  on `ix.warnings`.
- `X12_TR3_CONFORMANCE`: which implementation guide each transaction set follows.
- `checkCoreCodeCombination`: checks an 835 adjustment's codes against a CORE Code Combinations
  table that you supply. No CORE table ships with the package, and an `unevaluated` answer is never
  permission to post.
- `toObject`, `toISO`, `toDate`: read a DTP or DTM date (`D8` and `RD8` only). `toDate` returns an
  instant only when you pass `assumeOffsetMinutes`; an `RD8` range converts to `undefined`.
- `defineProfile`: author a vendor-deviation profile. `ALL_WARNING_MESSAGES`: the frozen warning
  message registry.

## Limits and known defects

- Scope: 005010 HIPAA transaction sets, plus the 006020 attachments guides (`006020X313` 277 RFAI and
  `006020X314` 275) at base structure only: for those two no implementation-guide usage is checked
  and attachment content is not decoded. Out of scope: non-healthcare sets, EDIFACT, AS2 and SFTP,
  pre-005010 revisions.
- Round trips are not byte-exact in general: `serialize(parse(s)) === s` is not guaranteed. Line
  breaks between segments are absorbed at parse. Do not promise a byte-identical re-emit.
- `build271` writes the BHT segment 005010X279A1 requires after the ST (since 0.1.10). Set it with
  the optional `header` field (`Build271HeaderSpec`); pass `referenceId` to echo the 270's BHT-03,
  which is otherwise written empty. `get271Eligibility` warns `X12_271_HEADER_ABSENT` when a 271 has
  no BHT.
- Every builder refuses, with its own `INVALID_SPEC` code, an ISA value longer than its fixed width
  and a hole or `null` inside a list it reads (since 0.1.10). Before, the ISA value was cut to fit.
- The README points to `KNOWN-LIMITATIONS.md` as the full do-not-over-trust list:
  https://github.com/cosyte/x12/blob/main/KNOWN-LIMITATIONS.md

## PHI handling

The README says to treat every interchange as PHI. What it states:

- Decoding happens in memory only: no socket, no disk write, no runtime fetch.
- Warning messages come from a frozen registry and never contain a value from your document. Log
  the warning `code` and `position`.
- Exception: `X12ParseError.snippet` on the four structural fatals is an unredacted copy of the
  start of the input and can carry PHI. Log `err.code` and `err.position`, never the snippet.
- A `build*` refusal names the control number, count or code you passed in (bounded, not redacted).
  Log `err.code`, not `err.message`, from a builder.
- 275 attachment data (`X12AttachmentData`) prints only its octet count; `readOctets()` is the one
  route to the bytes.
- Transport, storage, retention, access control, audit logging and your own log lines remain yours.
  The library makes no compliance claim on your behalf.

Use synthetic interchanges in tests and examples (cosyte-synth generates them). Never paste a real
remittance or claim into a prompt, fixture or log.

## Docs

- Documentation: https://docs.cosyte.com/x12/intro
- npm: https://www.npmjs.com/package/@cosyte/x12
- Source: https://github.com/cosyte/x12
