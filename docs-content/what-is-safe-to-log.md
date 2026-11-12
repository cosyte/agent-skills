---
id: what-is-safe-to-log
title: What is safe to log
sidebar_label: What is safe to log
description: "What an agent's code may print or log when it reads healthcare data with the @cosyte packages, and the error and warning fields that hold raw input and must not be logged."
---

# What is safe to log

Every example in these docs and in the skills follows one rule: it never passes a value that
identifies a person to `console.log` or any other logger or printer. That covers a name, a record
or member number, a date of birth, an address, a phone number, an email, a free-text note, and a
whole message, segment or resource. The rule holds for synthetic values too, so that code an agent
copies from an example is safe to run on real data. To show what a field holds, an example reads it
into a variable or asserts on it, with the synthetic value in a comment beside it.

## What an example may print

- a message type, such as `ADT^A01^ADT_A01`;
- a code from a code system, such as a LOINC, RxNorm or SNOMED CT code;
- a count, a length or a position, such as a segment index or a byte offset;
- the precision of a date (`year`, `day`), never the date;
- a warning code or an error code;
- a boolean, such as whether a field is present.

## Fields that hold raw input

These fields of the packages' errors and results hold input verbatim. Do not log them, send them to
error reporting or put them in a ticket. Log the `code` and the position instead.

| Field | What it holds |
| --- | --- |
| `Hl7ParseError.snippet` | Up to 40 characters of the input, unredacted. `message` is bounded but not absolutely content-free. |
| `X12ParseError.snippet` | An unredacted copy of the start of the input, on the four structural fatals. |
| An X12 `build*` refusal's `message` | The control number, count or code you passed in. Log `err.code`. |
| `DicomParseError.snippet` | 16 raw source bytes, as hex. |
| `--unsafe-show-values` on the `cosyte` command | A bounded input excerpt added to a `CLI_PARSE_FAILED` diagnostic. Leave it off on real data and in CI. |
| A raw line kept on an ASTM deviation | The patient's own record. |
| The `input` of a failed terminology lookup | The code you looked up. |
| A `@cosyte/dates` diagnostic | One component of the date and its value. |

The parsed models hold patient data as well. `JSON.stringify(msg)`, `toString()`, `toJSON()` and
`prettyPrint()` on an HL7 message return real content, so none of them is a log line. Each skill's
PHI handling section lists the rest for its package.

## Example

```ts no-run an illustration, not a skill example
import { Hl7ParseError, parseHL7 } from "@cosyte/hl7";

declare const raw: string;

try {
  parseHL7(raw);
} catch (err) {
  if (err instanceof Hl7ParseError) {
    // The code and the position are safe. err.snippet is raw input: not logged.
    console.log(err.code, err.position.segmentIndex);
  } else {
    throw err;
  }
}
```

## Next

- The rules every skill carries, in [How agents use the skills](./how-agents-use-skills.md).
- Each package's own list, in its page, for example [cosyte-hl7](./cosyte-hl7.md).
