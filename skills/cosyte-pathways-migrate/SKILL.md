---
name: cosyte-pathways-migrate
description: "Convert a channel exported as XML from another healthcare integration engine into a Pathways channel for @cosyte/pathways: scripts read the export, refuse hostile XML, write channel.yaml, a transform.ts skeleton, stub modules for shared code and a migration report, and the agent rewrites each script step in TypeScript without ever running it. Use when a developer wants to move, port, migrate or import a channel or interface from another engine to Pathways, has a channel export file (XML whose root element is channel, with a sourceConnector and destinationConnectors), or asks what of such a channel Pathways can and cannot run. The result is a starting point, proved only against de-identified input and output pairs the team supplies. To write a new Pathways channel from nothing, read the Pathways docs instead; for the HL7 v2 API inside a transform use cosyte-hl7."
license: MIT
compatibility: "The scripts need Node.js 22 or later and nothing installed. The project they write into needs Node.js 24 or later and @cosyte/pathways 0.0.3; try-channel also needs @cosyte/synth."
metadata:
  package: "@cosyte/pathways"
  version: "0.0.3"
  docs: "https://github.com/cosyte/pathways/blob/main/docs-content/intro.md"
---

# Move a channel from another engine to Pathways

Pathways is our code-first integration engine: a channel is a YAML file, its transform is a
TypeScript function, and both are tested like any other code. Pathways has no import command and
is not a drop-in replacement for another engine. This skill is how a channel exported from another
engine as XML becomes a Pathways channel: three scripts do the deterministic work, reading and
checking, and you, the agent, rewrite each script step in TypeScript.

**The result is a starting point, not a proved conversion.** A conversion is proved only by
running the channel against input and output pairs the team supplies, de-identified, and reviewing
every expected file. Say so to the user every time you finish a conversion.

The scripts are in the `scripts/` folder next to this file. In Claude Code that folder is
`${CLAUDE_SKILL_DIR}/scripts`; in another agent, use the path of the folder that holds this
SKILL.md.

## When to use it

- "Move this channel to Pathways", "port our interface", "migrate off our current engine".
- The user has a channel export: an XML file whose root element is `channel`, holding a
  `sourceConnector`, `destinationConnectors`, transformers, filters and scripts.
- "What of this channel would Pathways run?" The report answers it element by element.

Use another skill when you write a new channel with no export behind it (the Pathways docs:
[Write a channel](https://github.com/cosyte/pathways/blob/main/docs-content/write-a-channel.md)),
or need the HL7 v2 API inside a transform (cosyte-hl7) or synthetic messages (cosyte-synth).

## Rules that hold every time

- **Never run an exported script.** Not in Node, not in a sandbox, not "to see what it does".
  Read it as text and rewrite it. The scripts here never evaluate one: they copy each out as a file.
- **Files and loopback only.** Run a converted channel only through `pathways test` and
  `pathways verify --samples`. Never `pathways start` a converted channel against a real endpoint.
  Every destination is written with `dryRun: true`, and every source listens on `127.0.0.1`; only
  the team removes those, when it decides to. In the source of Pathways 0.0.3 at its release tag,
  `pathways test` runs only each channel's transform on the files in `tests/`: it builds no source
  and no destination, so `dryRun` never comes into it. We have not confirmed that from the
  published npm package, and the transform you write runs, so run try-channel only in a project
  whose destinations cannot reach a real system.
- **No real patient data.** Never paste a message from a live system into the conversation, a test
  or a fixture. Make inputs with @cosyte/synth. The reader drops every sample message embedded in the
  export unless the person running it passes `--keep-samples-synthetic`, confirming it is synthetic.
- **No secret in a file the reader converts.** A setting or a configuration map value that is
  named like a secret or shaped like one (a URL with a user name or password, a credential in a
  query or a connection string, a key, a token) becomes an environment reference
  (`{ env: NAME }`), and its value is not written to `channel.yaml`, `model.json` or the report. A
  keystore or truststore password or another credential property the reader does not convert is
  listed by name only. Tell the user which variables to set.
- **The source copies are the exception.** Each exported script is copied verbatim into
  `migration/<name>/source/`, so a password hard-coded in a script, or sample patient data, is in
  that copy. The reader writes a `.gitignore` there that keeps the folder out of version control,
  and the report's credential scan lists each line shaped like a secret by file and line. Tell the
  user to review those files before committing anything from them, and never carry a hard-coded
  secret into the rewrite: read it from `ctx.config` with an `env` reference.
- **The export stays the team's.** Do not copy an export, or anything from the other engine's
  documentation, into this repository or a public issue.

## Steps

### 1. Read the export

In the Pathways project (or an empty folder that will become one):

```bash
node ${CLAUDE_SKILL_DIR}/scripts/read-export.mjs path/to/export.xml --out . \
  --config-map path/to/configuration-map.xml
```

- `--config-map` (optional) reads the engine's configuration map export into the channel's
  `config:` block, read in the transform as `ctx.config`. A key whose name looks like a secret
  (password, token, key, credential, auth), or whose value is shaped like one, becomes
  `{ env: NAME }` and its value is dropped.
- `--name <channel>` sets the channel name when the exported name does not make one.
- `--keep-samples-synthetic` keeps the sample messages embedded in the export as test inputs. Pass
  it only when the user confirms they are synthetic.

It writes:

| Path | What it holds |
| --- | --- |
| `channels/<name>/channel.yaml` | The source, the destinations (each `dryRun: true`) and `config:`, with a comment on each saying what was converted and what was not |
| `channels/<name>/transform.ts` | A skeleton with one marker per step, filter rule and script |
| `channels/<name>/shared/*.ts` | One stub module per shared code template, named `t<n>-<library>-<template>.ts` |
| `migration/<name>/source/` | Each exported script as a `.js` file, and each mapping or rule as `.json`, verbatim, for you to read; a `.gitignore` keeps them out of version control |
| `migration/<name>/model.json` | The normalised model of the export |
| `migration/<name>/MIGRATION-REPORT.md`, `report.json` | Every element and its status, the dynamic constructs by file and line, the PHI scan and the credential scan |

It refuses (exit 2) an export with a DOCTYPE or any entity other than the five XML predefines, one
over its size, depth or count limits, a file that is not a channel export, a channel folder that
already exists, and a symbolic link on the way to any file it would write. A name from the export never becomes a path: it is cut to lowercase letters,
digits and hyphens.

### 2. Read the report

`migration/<name>/MIGRATION-REPORT.md` lists every element with one of five statuses:
`converted`, `converted, with a flag` (converted, but read the reason), `waiting for the agent to
rewrite it`, `rewritten by the agent`, and `not converted` (with the reason). Tell the user what is
not converted before you start rewriting: some of it has no counterpart in Pathways 0.0.3 at all
(see Limits). The report names dynamic constructs (`eval`, a Java bridge, a shared map, routing
calls, file or network classes) by file and line only; read those lines first.

### 3. Rewrite each step

For each marker `// migrate: <id> pending: ...` in `transform.ts` and `shared/*.ts`:

1. Open the step's file under `migration/<name>/source/` and read what it does.
2. Write the same behaviour in TypeScript in the transform, or in the shared module.
3. Change the marker to `// migrate: <id> rewritten`, or to `// migrate: <id> dropped: <why>` when
   the step is not needed (a disabled step, an XSLT step whose effect the transform already has).
   Never delete a marker: `check-migration` counts a missing one as pending.

How the pieces map:

- A filter rule is the transform returning `null`: the message is filtered out.
- A step that edits the message edits `msg` and returns it. For HL7 v2 the transform receives an
  `Hl7Message` from @cosyte/hl7 (`msg.is("ADT^A01")`, `msg.get("PID.5.1")`,
  `msg.setField("MSH.5", "LAB")`); load the cosyte-hl7 skill for the rest of its API.
- One message in, several out: return an array.
- A value from the configuration map is `ctx.config.<key>`. Declare its type by declaration merging
  on the exported `TransformConfig` interface.
- A value a step put in a per-message map for a later step is a local variable in the transform.
- Pathways 0.0.3 has no map shared between messages or channels. A step that kept state across
  messages needs a decision from the user: drop it, or keep the state in a destination or a store
  of their own. Say which and why in the marker.
- Shared code becomes an exported function in its `shared/*.ts` module, imported from
  `transform.ts` with its `.ts` extension: Node runs the transform by stripping its types, with no
  build step, so syntax that needs compiling (enums, namespaces) is not available.
- A deploy script has no start hook in 0.0.3: code at the top of `transform.ts` runs whenever the
  channel's worker loads the module, which can be more than once. Keep it idempotent, or drop it.

### 4. Check

```bash
node ${CLAUDE_SKILL_DIR}/scripts/check-migration.mjs --project . --channel <name>
```

It reads the markers, runs the PHI scan on everything under `channels/<name>/` and
`migration/<name>/`, writes the report again and exits 0 only when no step is pending and the scan
is clean. Run it after each round of rewriting.

### 5. Try it on synthetic messages

```bash
npm install --save-dev @cosyte/pathways @cosyte/synth @cosyte/hl7
node ${CLAUDE_SKILL_DIR}/scripts/try-channel.mjs --project . --channel <name> --count 5 --seed 1
```

It writes seeded @cosyte/synth inputs into `channels/<name>/tests/` (hl7v2 and fhir channels;
`--kind ORU^R01` picks the HL7 v2 message kind), saves the channel's current output for each as its
expected file with `pathways test --update`, marks each new expected file unreviewed in
`tests/.unreviewed`, puts back byte for byte any expected file a person already reviewed, then runs
`pathways test`. It sets a placeholder for each `{ env: NAME }` the channel reads that is not set,
for that run only, and says which.

**An expected file written this way records what the channel does now, not what it should do.**
Review each against what the other engine produced for the same input, then remove its name from
`tests/.unreviewed`. With pairs the team supplies, de-identified, laid out as
`<dir>/<channel>/<input>` and `<dir>/<channel>/<input without extension>.expected.<extension>`,
add `--pairs <dir>`: it runs `pathways verify --samples`, which names where each output differs by
HL7 v2 field path, JSON pointer or byte offset, never by value.

### 6. Hand it over

Run `npx pathways validate` in the project. Then tell the user: the report's counts, what is not
converted and why, which environment variables to set, which expected files still need review,
which files the credential scan lists, that `migration/<name>/source/` holds verbatim copies to
review before anything from it is committed, and that the conversion is a starting point until
the team's own de-identified pairs pass.

## Exit codes

| Code | read-export | check-migration | try-channel |
| --- | --- | --- | --- |
| 0 | written, every step converted | every step rewritten or dropped, scan clean | every test passed |
| 1 | written, steps waiting for a rewrite | a step still pending | a test or a compare failed |
| 2 | refused: input, arguments, or an existing channel | refused: arguments or no model | refused: arguments or a missing package |
| 3 | the PHI scan found something | the PHI scan found something | |

## Limits

- **Pathways 0.0.3 has no counterpart** for: a filter or transform per destination, a response
  step on a destination's reply, a channel destination or routing between channels, batch
  splitting on a source, a preprocessor before the parse, and start, stop or post-delivery
  scripts. The reader lists each such element as not converted, with the reason, and keeps its
  script in `migration/<name>/source/` for when a later release has a place for it. Each
  destination still gets every output of the channel transform.
- **Connectors.** The reader converts an MLLP or other TCP listener, an HTTP listener and a file
  reader on a local folder as the source, and a file writer, an HTTP sender and an MLLP or other TCP
  sender as destinations. Other connectors are not converted; a file source stands in for a source
  it cannot convert, so the channel still loads. TCP framing, file name patterns, HTTP methods and
  content types are not converted, and the report flags each.
- **Data types.** HL7 v2, JSON, delimited text, X12 and FHIR map to `hl7v2`, `json`, `csv`, `x12`
  and `fhir`; XML and anything else is read as `text`.
- **The format.** We wrote the reader from a description of the export format and test it only on
  synthetic exports we wrote from scratch. It has not yet been checked against a real export. An
  element it does not know is listed as not converted, never guessed at; check the report against
  the export before you trust it.
- **The PHI scan is a floor.** It looks for the shapes of SSNs, email addresses outside example
  domains, phone numbers outside 555-01xx and HL7 v2 PID segments with a name, and skips files
  listed in a `tests/.synthetic` file. A clean scan does not prove the output holds no PHI.
- **The credential scan is a floor too.** It looks for the shapes of a hard-coded password, a URL
  with credentials, a key and a token, and lists each line it finds without quoting it; it does
  not change the exit code. A clean scan does not prove a file holds no secret.
- try-channel makes inputs for `hl7v2` and `fhir` channels only; write synthetic inputs for
  another format by hand.

## PHI handling

- An export can hold PHI: in an embedded sample message, a hard-coded value in a script, or a
  comment. Treat the export as PHI until the team says otherwise, and never paste it into a prompt.
- The scripts print counts, ids, names of steps and codes, never a message or a script's text. The
  report names a dynamic construct or a PHI finding by file and line, never the value.
- The reader drops every embedded sample message by default, and the PHI scan runs on the output.
- The verbatim copies under `migration/<name>/source/` can hold whatever the exported scripts
  hold, sample patient data included. They stay out of version control until someone reviews them.
- Test inputs come from @cosyte/synth; the team's real pairs are de-identified before they are
  used, and never committed with a real value.

## Docs

- [references/REFERENCE.md](references/REFERENCE.md): the full conversion table, the model and
  report formats, the markers, and the XML limits.
- https://github.com/cosyte/pathways/blob/main/docs-content/intro.md
- https://github.com/cosyte/pathways/blob/main/docs-content/test-a-channel.md
- https://www.npmjs.com/package/@cosyte/pathways
