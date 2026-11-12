---
id: quickstart
title: Quickstart
sidebar_label: Quickstart
description: "Install the Cosyte plugin in Claude Code and ask it to parse a synthetic HL7 v2 message with the cosyte-hl7 skill."
---

# Quickstart

In this tutorial we install the skills as a Claude Code plugin, then ask Claude to read a synthetic
HL7 v2 admit message. You need Claude Code and Node.js 22 or later, in an empty folder that will
become a small Node.js project.

The install steps come from Claude Code's documentation; we have not yet run them in every
environment. If a step does not work as written, tell us in an
[issue](https://github.com/cosyte/agent-skills/issues).

## 1. Add the marketplace and install the plugin

Start Claude Code in your folder, then run:

```text
/plugin marketplace add cosyte/agent-skills
/plugin install cosyte@cosyte
```

The plugin is named `cosyte` and so is its marketplace, so the install target is `cosyte@cosyte`.

## 2. Check that the skills are there

Run the HL7 skill by its namespaced name:

```text
/cosyte:cosyte-hl7
```

Claude loads the skill. You do not have to run a skill by name: Claude also loads one when a
request matches its description, which is what the next step relies on.

## 3. Ask for a parse

Send this prompt. Every value in the message is invented.

```text
Write a Node.js script that parses this HL7 v2 message and prints the patient's MRN,
full name and date of birth, the message type, and the ward. Log any parser warnings
by code and position only.

MSH|^~\&|ADTAPP|MAIN|LIS|REF|20260419101500||ADT^A01^ADT_A01|MSG00001|P|2.5
EVN|A01|20260419101500
PID|1||MRN12345^^^HOSP^MR||Doe^John^Q||19800115|M|||123 Main St^^Boston^MA^02101||^PRN^PH^^^617^5551212
PV1|1|I|ICU^101^A^HOSP|||||ATTEND^Smith^Jane^^^^MD|||||||||||VISIT001
```

## 4. What to expect

The request names HL7 v2 and PID, which matches the description of `cosyte-hl7`, so Claude loads
that skill. The skill tells it to:

- install `@cosyte/hl7` (`npm install @cosyte/hl7`);
- call `parseHL7` and read the named helpers, `msg.patient?.mrn`, `msg.patient?.fullName`,
  `msg.patient?.dateOfBirth?.raw`, `msg.meta.type` and `msg.visit?.location?.pointOfCare`, with
  optional chaining, since a helper returns `undefined` when its segment is absent;
- join the segments with a carriage return, the HL7 v2 segment separator, rather than the line
  breaks in the prompt;
- log each warning's `code` and position, never the values.

The skill's own example prints:

```text
Patient record number: MRN12345
Full name: John Q Doe
Date of birth: 19800115
Precision: day
Message type: ADT^A01^ADT_A01
Sent at: 20260419101500
Ward: ICU
```

An agent's answer varies from run to run; what the skill fixes is the package it reaches for, the
API it calls and the rules it follows. The [cosyte-hl7 page](./cosyte-hl7.md) has the whole
example.

## Next

- Install the skills in another agent: [Installation](./installation.md).
- Give every agent in a project the same routing table:
  [Add the routing summary to AGENTS.md](./add-the-routing-summary.md).
- See what each skill covers, starting with the router: [cosyte](./cosyte.md).
- Learn how an agent picks a skill: [How agents use the skills](./how-agents-use-skills.md).
