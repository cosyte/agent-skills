---
name: cosyte-cli
description: "Runs the cosyte command line from @cosyte/cli and its cosyte-mcp MCP server to parse, validate, inspect, format, convert, map codes in and de-identify healthcare messages without writing code. Use when the user wants to parse an HL7 v2, FHIR, X12, ASTM, NCPDP, C-CDA, DICOM or MLLP file from the terminal or a shell pipeline into JSON, validate a message in CI by exit code, get a value-free structural summary, convert HL7 v2 to FHIR R4 on the command line, translate a code through a ConceptMap, redact a file, or register an MCP server that gives an AI agent parse, validate, inspect and convert tools. Also use when an npx or npm install of @cosyte/cli fails. For library calls inside an application, use the format's own skill, such as cosyte-hl7, cosyte-fhir or cosyte-transform."
license: MIT
metadata:
  package: "@cosyte/cli"
  version: "0.1.8"
  docs: "https://docs.cosyte.com/cli/intro"
---

# @cosyte/cli

The `cosyte` command: a PHI-safe front door over the `@cosyte/*` parsers. It routes input to the
right library, prints typed JSON on stdout, keeps every diagnostic on stderr value-free, and states
the outcome in a documented exit code. The same core runs as a local stdio MCP server, `cosyte-mcp`.

## When to use it

- "Parse this HL7 file from the terminal", "pipe this message into something that gives me JSON".
- "Validate this FHIR resource in CI and fail the build if it is invalid."
- "What kind of message is this?" (a summary with no field values).
- "Convert this HL7 v2 ADT to a FHIR Bundle from the command line."
- "Set up an MCP server so my agent can parse HL7 and FHIR."
- "`npx @cosyte/cli` says could not determine executable to run."

Use another skill when you are writing application code that calls a library: cosyte-hl7,
cosyte-fhir, cosyte-x12, cosyte-transform, cosyte-terminology, cosyte-deid and the other format
skills.

## Install

```bash
npm install -g @cosyte/cli
```

Or without installing:

```bash
npx --package @cosyte/cli cosyte inspect message.hl7   # value-free summary
```

Node 22.0.0 or later (the package's `engines` field), tested on 22, 24 and 26. The short form
`npx @cosyte/cli ...` does not work: the package ships two executables, `cosyte` and `cosyte-mcp`,
so `npx` needs `--package`. Versions 0.0.1 and 0.0.2 are published but cannot be installed (they
fail with `ENOENT` on a `vendor/*.tgz` path) and re-running will not help; install the current
release (0.1.8 when we wrote this). Hard dependencies are
`@cosyte/hl7` and `@cosyte/terminology`; the other parsers, `@cosyte/deid`, `@cosyte/transform`,
`@cosyte/fhir` (since 0.1.6) and the MCP SDK are optional dependencies, so install with optional
dependencies (the npm default). Every `@cosyte` range is `^0.1.0`, so the CLI runs the 0.1 line of
`@cosyte/deid` and `@cosyte/transform`, not their 0.2 releases. A command whose library is missing
exits `69` with `CLI_PARSER_UNAVAILABLE`; an install without the MCP SDK runs every command but
`cosyte mcp` and `cosyte-mcp`, which exit `69` naming `@modelcontextprotocol/sdk`.

## Minimal example

From the README, with a synthetic ADT^A01 (HL7 v2 ends each segment with a carriage return):

```bash
printf 'MSH|^~\\&|SENDINGAPP|SENDINGFAC|RECEIVINGAPP|RECEIVINGFAC|20240101120000||ADT^A01|MSG00001|P|2.5\rEVN|A01|20240101120000\rPID|1||MRN-000123^^^HOSP^MR||ZZSENTINELLAST^ZZSENTINELFIRST^M||19800101|M\rPV1|1|I|WARD^101^A\r' > message.hl7

cosyte parse message.hl7 > parsed.json            # format autodetected, typed JSON; it holds field values, so write it to a file, not the terminal
cosyte inspect message.hl7                        # value-free summary: type, version, segment counts
cosyte validate message.hl7; echo $?              # 0 valid, 1 invalid, 65 unparseable
cosyte convert message.hl7 --to fhir > bundle.json  # a FHIR message Bundle, written to a file for the same reason
```

Register the MCP server (local stdio subprocess) in an MCP client config, as the README gives it:

```json
{
  "mcpServers": {
    "cosyte": { "command": "npx", "args": ["-y", "--package", "@cosyte/cli", "cosyte-mcp"] }
  }
}
```

The same server from each tool's own command line:

```bash
claude mcp add --transport stdio cosyte -- npx -y --package @cosyte/cli cosyte-mcp   # Claude Code
codex mcp add cosyte -- npx -y --package @cosyte/cli cosyte-mcp                      # OpenAI Codex
```

In Cursor, put the JSON above in `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (user).

## Key API

Commands:

- `cosyte parse <file|->`: autodetect and print `{ format, model, warnings }`. `--format` accepts
  `hl7 | fhir | x12 | astm | ncpdp | ccda | dicom | mllp`. An MLLP stream, or any input with
  `--ndjson`, streams NDJSON with per-record isolation. Input limit 64 MiB.
- `cosyte validate`: the wrapped library's own verdict in the exit code; `--json`, `--quiet`.
- `cosyte inspect`: value-free structural summary.
- `cosyte fmt`: canonical re-serialization; no partial output on unparseable input.
- `cosyte convert <file> --to fhir`: HL7 v2 to FHIR R4 through `@cosyte/transform`. An
  error-severity conversion issue exits `1`.
- `cosyte map-codes <conceptmap.json> --system <uri> --code <code>`: translate through a FHIR
  ConceptMap you supply. Unmapped exits `1` with `TERM_TRANSLATE_UNMAPPED`.
- `cosyte redact` (alias `cosyte deid`): delegates to `@cosyte/deid` for `ccda`, `fhir`, `hl7` and
  `x12` only.
- `cosyte completion <bash|zsh|fish>`; `cosyte mcp` or `cosyte-mcp`: start the MCP server.

Exit codes: `0` success or valid, `1` invalid or de-identification incomplete, `2` usage, `65` data
error, `66` no input, `69` unavailable, `70` internal error, `74` output stream closed early.

MCP tools: `parse`, `validate`, `inspect`, `convert`. Each result carries `ok`, `status`
(`success`, `verdict` or `failed`), `exit`, a stable `code` on failure, and the payload under `data`;
every tool publishes an `outputSchema`. A parsed-but-invalid `validate` is a successful call that
reports the verdict.

Programmatic: the `.` entry exports `run`, `detectFormat`, `EXIT`, `CLI_CODES`, `resolveInput` and
one function per command (`parseCommand`, `validateCommand`, `inspectCommand`, `fmtCommand`,
`convertCommand`, `mapCodesCommand`, `redactCommand`, plus `convertOutcome`). The `@cosyte/cli/mcp`
subpath exports `createMcpServer`, `startStdioServer`, `dispatchTool` and `TOOL_DEFS`. The README
defers their shapes to the docs, so read the docs before calling them.

## Limits and known defects

- Support is per format and operation. `ccda`: no `parse` (inspect, fmt, validate only). `dicom`:
  inspect and validate only. `mllp`: parse and inspect only. A deferred cell is
  `CLI_FORMAT_UNSUPPORTED`, never a fake result.
- `--profile` on `validate` is reserved: no profiles are bundled, so it exits `69`.
- `convert` has one target, `--to fhir`, and the mapping is `@cosyte/transform`'s own, from its 0.1
  line (see cosyte-transform for that library's limits). On the 0.1 line PID-10, 15, 19, 22, 29 and
  30 are dropped from the Patient with no issue, and the telecom issue is always located at
  `PID.13`; 0.2.0 added the issues. Never read a converted Patient with no `deceased[x]` as alive.
- `redact` refuses `astm`, `mllp` and `ncpdp` (exit `69`, no adapter) and `dicom` (exit `65`, binary
  output on a text stdout). With the library's default policy, an HL7 visit number (`PV1-19`) or a
  placer or filler order number is blocked, so the whole run exits `1` with `CLI_DEID_INCOMPLETE`
  and nothing on stdout. Many real ADT messages carry `PV1-19`. Always check the exit code before
  using the output file. Surrogates use a per-run ephemeral key, so they are not stable across runs.
- Autodetection is conservative: an ambiguous input is a data error asking for `--format`.
- With `parse` on a stream, records reach stdout as they parse, so a later refusal can follow
  partial output. The exit code, not the output, says whether the run completed.
- An MLLP stream that ends on a frame's FS byte without the closing CR is refused as truncated
  (`CLI_PARSE_FAILED`, exit `65`) by `parse`, `inspect` and `deframeMllp` (since 0.1.8); before, that
  last frame was dropped with exit `0`.

## PHI handling

- stdout is the data channel: `parse` prints field values there because you asked for them. Do not
  redirect it into logs or tickets.
- Every stderr diagnostic is value-free (a stable code, a position, a file path). The CLI writes no
  temp files and logs to no file.
- `--unsafe-show-values` is the single opt-in that adds a bounded input excerpt to a
  `CLI_PARSE_FAILED` diagnostic. It exposes PHI. Do not use it on real patient data or in CI, and
  never add it on a user's behalf.
- The MCP server has no `--unsafe-show-values`; a tool error carries only a code and position. A
  tool result does carry the parsed data, which then sits in the agent's context: point the server
  at synthetic files unless the user has decided otherwise.

Use synthetic files for demos and tests (cosyte-synth generates them). Never paste real patient data
into prompts, fixtures or logs.

## Docs

- Documentation: https://docs.cosyte.com/cli/intro
- npm: https://www.npmjs.com/package/@cosyte/cli
- Source: https://github.com/cosyte/cli
