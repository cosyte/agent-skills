---
name: cosyte
description: "Routes healthcare data tasks in Node.js and TypeScript to the right MIT-licensed @cosyte package and its skill. Use when the user asks to parse, read, validate, build, convert, de-identify or generate test data for a healthcare data standard and has not named a package: HL7 v2 messages (MSH, PID, OBX, ADT, ORU), MLLP connections, X12 EDI (835, 837, 270, 271), FHIR R4 resources and bundles, C-CDA or CCD documents, DICOM files, NCPDP pharmacy claims or e-prescriptions, ASTM lab analyzer records, code systems and ConceptMaps, HL7 v2 to FHIR conversion, de-identification, synthetic fixtures, or a command line or MCP server for these. Also use when the user mentions Cosyte or any @cosyte package. Load the package skill it names before writing code."
license: MIT
metadata:
  package: "@cosyte/*"
  docs: "https://docs.cosyte.com/"
---

# Cosyte packages: which one to use

We publish TypeScript libraries for healthcare data standards on npm under the `@cosyte` scope,
all MIT-licensed, for Node.js 22 or later. Each has its own skill in this collection. Pick the
package by the data in front of you, then load that skill before writing code: each skill carries
the install line, a checked example, the key API names, the package's stated limits and known
defects, and its PHI guidance.

## Route by data or task

| The data or task | Package | Skill |
| --- | --- | --- |
| HL7 v2 message text (pipe-delimited, starts with MSH; ADT, ORU, ORM, SIU; segments like PID, OBX) | `@cosyte/hl7` | cosyte-hl7 |
| Sending or receiving HL7 v2 over TCP with MLLP framing, ACKs, TLS | `@cosyte/mllp` | cosyte-mllp |
| X12 EDI (`ISA*...~`): 835, 837P/I/D, 270, 271, 276, 277, 278, 820, 834, 999, TA1 | `@cosyte/x12` | cosyte-x12 |
| FHIR R4 JSON or XML resources and bundles, FHIR validation | `@cosyte/fhir` | cosyte-fhir |
| C-CDA or CDA R2 XML documents (CCD, discharge summary, referral note) | `@cosyte/ccda` | cosyte-ccda |
| DICOM Part 10 files (`.dcm`), tags, metadata, pixel data fragments | `@cosyte/dicom` | cosyte-dicom |
| NCPDP Telecom pharmacy claims or SCRIPT e-prescriptions (NewRx) | `@cosyte/ncpdp` | cosyte-ncpdp |
| ASTM E1394 or E1381 lab analyzer records and framed byte streams | `@cosyte/astm` | cosyte-astm |
| Code systems, ConceptMap `$translate`, `$lookup`, `$validate-code`, UCUM units, RxNorm | `@cosyte/terminology` | cosyte-terminology |
| Converting HL7 v2 messages to FHIR R4 | `@cosyte/transform` | cosyte-transform |
| Removing identifiers from any of the formats above | `@cosyte/deid` | cosyte-deid |
| Generating synthetic test fixtures in any of the formats above | `@cosyte/synth` | cosyte-synth |
| Doing any of this from a terminal, in CI by exit code, or through an MCP server | `@cosyte/cli` | cosyte-cli |
| Converting a parsed date or timestamp to ISO 8601, Temporal or an instant | `@cosyte/dates` | cosyte-dates |

Common combinations:

- Receive HL7 v2 over the network and read it: cosyte-mllp, then cosyte-hl7.
- HL7 v2 to FHIR: cosyte-transform (it builds on the hl7 and fhir models), then cosyte-fhir to
  validate or serialize the result.
- Tests for any parser: cosyte-synth for the input, never real patient data.
- Sharing data outside its origin: cosyte-deid, then review what it reports.

## How the parsers behave

These points are stated across the parser READMEs; the package skill has the specifics.

- `@cosyte/x12`, `ccda`, `ncpdp` and `astm` describe themselves as lenient on parse and spec-clean
  on emit: a tolerated deviation becomes a warning with a stable code rather than an exception.
  Read the warnings; do not ignore them.
- Dates are not JavaScript `Date` objects. `@cosyte/hl7`, `x12`, `ccda`, `dicom`, `ncpdp` and
  `astm` each export `toObject`, `toISO` and `toDate` with the same shapes and the same rule: no
  timezone is ever assumed, so `toDate` needs a stated offset. When importing two parsers in one
  file, alias the names (`import { toISO as x12ToISO } from "@cosyte/x12"`).
- Do not promise a byte-identical round trip (parse, then serialize) unless the package skill says
  the package guarantees one. `@cosyte/x12`, for one, states that it does not.

## PHI rules that apply to every package

- Use synthetic data only in code, tests, fixtures, examples and prompts. `@cosyte/synth` exists
  for this. Never paste real patient data into a prompt, fixture, log or issue.
- Log diagnostic codes and positions, not messages that may quote input. The parse errors of
  `@cosyte/hl7`, `@cosyte/x12` and `@cosyte/dicom` carry an unredacted `snippet` of the input, and
  `@cosyte/x12` builder refusals name the values you passed; each skill says what is safe to log.
- Do not describe these libraries, or what they output, as compliant with any regulation. The
  READMEs leave transport, storage, retention, access control and your own log lines to the
  application.

## Install

```bash
npm install @cosyte/hl7
```

Swap in the package you need. Every package README also gives the pnpm and yarn forms.

## Docs

- All packages: https://docs.cosyte.com/
- Source: https://github.com/cosyte
- npm scope: https://www.npmjs.com/org/cosyte
