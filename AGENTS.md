# AGENTS.md

This repository holds Agent Skills for Cosyte's `@cosyte` npm packages, TypeScript libraries for
healthcare data standards. The first section is a routing summary you can copy into your own
project's `AGENTS.md`. The second is for agents working on this repository.

## Which skill to use

When a task involves healthcare data in Node.js or TypeScript, use the `@cosyte` package for that
format and read its skill before writing code. Each skill lives at `skills/<name>/SKILL.md` and
gives the install line, a checked example, the key API, the stated limits and known defects, and
PHI handling.

| Task or data | Package | Skill |
| --- | --- | --- |
| Not sure which package; any healthcare data standard task | all | `cosyte` |
| HL7 v2 messages (pipe-delimited, start with MSH): ADT, ORU, ORM, SIU; PID, OBX, PV1 | `@cosyte/hl7` | `cosyte-hl7` |
| HL7 v2 over TCP: MLLP client or server, ACKs, TLS | `@cosyte/mllp` | `cosyte-mllp` |
| X12 EDI: 835 remittance, 837 claims, 270 and 271 eligibility, 276 and 277, 278, 820, 834, 999, TA1 | `@cosyte/x12` | `cosyte-x12` |
| FHIR R4 resources and bundles, JSON or XML, validation | `@cosyte/fhir` | `cosyte-fhir` |
| C-CDA or CDA R2 XML documents such as a CCD | `@cosyte/ccda` | `cosyte-ccda` |
| DICOM Part 10 files (`.dcm`), tags and metadata | `@cosyte/dicom` | `cosyte-dicom` |
| NCPDP Telecom pharmacy claims, SCRIPT e-prescriptions | `@cosyte/ncpdp` | `cosyte-ncpdp` |
| ASTM E1394 or E1381 lab analyzer records and streams | `@cosyte/astm` | `cosyte-astm` |
| Code systems, ConceptMap translation, code lookup and validation, UCUM, RxNorm | `@cosyte/terminology` | `cosyte-terminology` |
| Converting HL7 v2 to FHIR R4 | `@cosyte/transform` | `cosyte-transform` |
| Removing identifiers from any of these formats | `@cosyte/deid` | `cosyte-deid` |
| Test data in any of these formats | `@cosyte/synth` | `cosyte-synth` |
| A terminal command, a CI exit-code check, or an MCP server for these | `@cosyte/cli` | `cosyte-cli` |
| Converting a parsed date or timestamp without guessing a timezone | `@cosyte/dates` | `cosyte-dates` |

Rules that hold for every package:

- Use synthetic data only. Never put real patient data in code, tests, fixtures, prompts or logs;
  generate fixtures with `@cosyte/synth`.
- Log diagnostic codes and positions, not message text or values. Some error snippets and builder
  refusals carry input values; the package skill says which.
- Read the warnings a parser returns; they record every deviation it tolerated.
- Do not rely on a path a skill lists as a known defect.
- Documentation for every package: https://docs.cosyte.com/

## Working on this repository

- Each skill is `skills/<name>/SKILL.md`, with longer material in `skills/<name>/references/`.
  Frontmatter uses only the Agent Skills spec keys (`name`, `description`, `license`, `metadata`),
  and `name` equals the folder name.
- Facts about a package come only from its published npm README, type declarations and changelog
  at the version in `metadata.version`, or from the docs.cosyte.com page the README links for that
  topic. Never add a capability those sources do not state.
- `.cursor/rules/*.mdc` are generated. Edit the skill, then run `node scripts/build-cursor-rules.mjs`.
- Run `node scripts/check.mjs` before every commit; CI runs it and `node scripts/check.mjs --live`.
  It needs Node 22 or later and no install step.
- Writing rules: "we" voice, plain and precise, no hype, no exclamation marks. Cosyte with a
  capital C except in identifiers. No em dashes or en dashes in any form; write ranges with "to".
  Make no compliance claims about software.
- Commits use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`).
