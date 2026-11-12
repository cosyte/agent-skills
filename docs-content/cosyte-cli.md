---
id: cosyte-cli
title: The cosyte-cli skill
sidebar_label: cosyte-cli
description: "The cosyte-cli skill: when an agent should use the cosyte command and the cosyte-mcp server from @cosyte/cli, with an example prompt."
---

# The cosyte-cli skill

The `cosyte-cli` skill teaches an agent to use [`@cosyte/cli`](https://docs.cosyte.com/cli/intro). Its source is
[skills/cosyte-cli/SKILL.md](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-cli/SKILL.md); the sections below quote it.

## What it does

The `cosyte` command: a PHI-safe front door over the `@cosyte/*` parsers. It routes input to the
right library, prints typed JSON on stdout, keeps every diagnostic on stderr value-free, and states
the outcome in a documented exit code. The same core runs as a local stdio MCP server, `cosyte-mcp`.

## When an agent should use it

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

The skill comes with the rest of the collection: [install the skills](./installation.md) in your
agent, and in Claude Code with the plugin, run it as `/cosyte:cosyte-cli`. The skill then tells the
agent how to install the package:

```bash
npm install -g @cosyte/cli
```

Or without installing:

```bash
npx --package @cosyte/cli cosyte parse message.hl7
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

## Example prompt

```text
Validate our HL7 v2 files in CI and fail the build when one is invalid. Then register
the Cosyte MCP server in Claude Code so you can parse messages yourself.
```

## Result

The request asks to validate a message in CI by exit code and to register an MCP server, which the description of `cosyte-cli` lists. The agent loads the skill and follows its example, below. It is the code the skill
shows the agent for this task, not a recorded session: an agent's answer varies from run to run,
but the package, the API and the rules come from the skill.

From the README, with a synthetic ADT^A01 (HL7 v2 ends each segment with a carriage return):

```bash
printf 'MSH|^~\\&|SENDINGAPP|SENDINGFAC|RECEIVINGAPP|RECEIVINGFAC|20240101120000||ADT^A01|MSG00001|P|2.5\rEVN|A01|20240101120000\rPID|1||MRN-000123^^^HOSP^MR||ZZSENTINELLAST^ZZSENTINELFIRST^M||19800101|M\rPV1|1|I|WARD^101^A\r' > message.hl7

cosyte parse message.hl7              # format autodetected, typed JSON on stdout
cosyte inspect message.hl7            # value-free summary: type, version, segment counts
cosyte validate message.hl7; echo $?  # 0 valid, 1 invalid, 65 unparseable
cosyte convert message.hl7 --to fhir  # a FHIR message Bundle on stdout
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

## More in the skill

The skill also lists the [key API](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-cli/SKILL.md#key-api), the
[limits and known defects](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-cli/SKILL.md#limits-and-known-defects) and how to handle PHI
([PHI handling](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-cli/SKILL.md#phi-handling)). The package's own documentation is at
[docs.cosyte.com/cli/intro](https://docs.cosyte.com/cli/intro).
