---
id: cosyte-dates
title: The cosyte-dates skill
sidebar_label: cosyte-dates
description: "The cosyte-dates skill: when an agent should use @cosyte/dates to convert parsed dates without guessing a timezone, with an example prompt."
---

# The cosyte-dates skill

The `cosyte-dates` skill teaches an agent to use [`@cosyte/dates`](https://docs.cosyte.com/dates/intro). Its source is
[skills/cosyte-dates/SKILL.md](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-dates/SKILL.md); the sections below quote it.

## What it does

Date and time utilities for the `@cosyte/*` healthcare parsers: precision-preserving conversion and
validation that never guesses a timezone. The parsers hand back spec-native date parts rather than
JavaScript `Date` objects; this package validates and converts those parts.

## When an agent should use it

- "Convert this HL7 timestamp to ISO 8601 without losing precision."
- "Turn the parsed date of birth into a `Temporal.PlainDate`."
- "Is this date valid?", "February 29 in a non-leap year", "which component is wrong?"
- "Get an absolute instant from a timestamp that has no offset, in `America/New_York`."
- "What precision does this value have: year, day, minute?"

Use another skill when:

- You need to parse the message that carries the date: use the format's skill (cosyte-hl7,
  cosyte-x12, cosyte-fhir, cosyte-ccda, cosyte-ncpdp, cosyte-astm, cosyte-dicom). Several parsers
  also export their own `toObject`, `toISO` and `toDate` for their date types; the format skill
  covers those.

## Install

The skill comes with the rest of the collection: [install the skills](./installation.md) in your
agent, and in Claude Code with the plugin, run it as `/cosyte:cosyte-dates`. The skill then tells the
agent how to install the package:

```bash
npm install @cosyte/dates
```

The README leads with `pnpm add @cosyte/dates`. Node 22.0.0 or later. ESM only: there is no
CommonJS build, so `require()` will not load it. One runtime dependency, `temporal-polyfill`;
`Temporal` is re-exported from this package, so use that export rather than installing a second copy.

## Example prompt

```text
Convert the date parts our @cosyte parsers return to ISO 8601 without inventing a
timezone or precision. A year-only date of birth must stay a year, and an impossible
date such as 2025-02-29 must be refused with the reason.
```

## Result

The request asks to turn parsed date parts into ISO 8601 without inventing precision or a timezone, which the description of `cosyte-dates` lists. The agent loads the skill and follows its example, below. It is the code the skill
shows the agent for this task, not a recorded session: an agent's answer varies from run to run,
but the package, the API and the rules come from the skill.

Adapted from the README usage block (no real data; the dates are invented).

```ts no-run copied from the skill, and this repository has no sample runner yet
import {
  MissingZoneError,
  precisionOf,
  toISO,
  toInstant,
  toTemporal,
  validateParts,
} from "@cosyte/dates";

// A date that arrived as a year and nothing more. It stays a year. These dates are invented
// event dates; a date of birth or of service belongs to a person, so print its precision, not the
// date.
const reportYear = { year: 2024 };
console.log(toISO(reportYear), "| precision:", precisionOf(reportYear));

// A calendar date. No midnight is invented and no zone is attached.
const reportDate = { year: 2024, month: 5, day: 7 };
console.log(toISO(reportDate), "| Temporal:", toTemporal(reportDate).constructor.name);

// A timestamp whose sender stated its offset. The offset is kept exactly.
const collected = { year: 2024, month: 5, day: 7, hour: 13, minute: 45, offsetMinutes: 330 };
console.log(toISO(collected), "->", toInstant(collected).toString());

// The same timestamp with no offset. Nothing guesses one.
const unknownZone = { year: 2024, month: 5, day: 7, hour: 13, minute: 45 };
try {
  toInstant(unknownZone);
} catch (error) {
  if (error instanceof MissingZoneError) console.log(error.name);
}

// Supplying the zone is the caller's decision.
console.log(toInstant(unknownZone, { timeZone: "America/New_York" }).toString());

// A date that does not exist is refused, and says which rule it broke.
const result = validateParts({ year: 2025, month: 2, day: 29 });
console.log(result.valid ? "valid" : result.issues[0]?.message);
```

The README shows lines like these for the year, date, offset, missing-zone and invalid-date cases,
identical under every host `TZ`. The dates here are invented event dates, not the README's, and the
zoned line in this snippet is our addition and is not in the README output:

```text
2024 | precision: year
2024-05-07 | Temporal: PlainDate
2024-05-07T13:45+05:30 -> 2024-05-07T08:15:00Z
MissingZoneError
day 29 does not exist: February 2025 has 28 days, because 2025 is not a leap year in the proleptic Gregorian calendar
```

## More in the skill

The skill also lists the [key API](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-dates/SKILL.md#key-api), the
[limits and known defects](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-dates/SKILL.md#limits-and-known-defects) and how to handle PHI
([PHI handling](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-dates/SKILL.md#phi-handling)). The package's own documentation is at
[docs.cosyte.com/dates/intro](https://docs.cosyte.com/dates/intro).
