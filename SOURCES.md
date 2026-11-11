# Sources

Every format claim in this repository, the document it comes from, and the date we read it. Where a
URL redirected, we list the address we requested and the address that served the page.

## File formats and install paths

All read on 2026-11-07.

### Agent Skills format

| Claim | Source |
| --- | --- |
| A skill is a folder holding `SKILL.md` with YAML frontmatter, then Markdown instructions; optional `scripts/`, `references/` and `assets/` folders. | https://agentskills.io/specification |
| Required frontmatter: `name` (1 to 64 characters, lowercase a-z, 0-9 and hyphens, no leading, trailing or doubled hyphen, must match the folder name) and `description` (1 to 1024 characters, what the skill does and when to use it). Optional: `license`, `compatibility`, `metadata` (string to string map), `allowed-tools`. | https://agentskills.io/specification |
| Keep `SKILL.md` under 500 lines and move detail to reference files kept one level deep. | https://agentskills.io/specification |
| Anthropic's rules: `name` and `description` required; `name` at most 64 characters, lowercase letters, numbers and hyphens, no XML tags, not containing `anthropic` or `claude`; `description` non-empty, at most 1,024 characters, no XML tags. | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview (requested as https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview, which redirects there) |

### Claude Code

| Claim | Source |
| --- | --- |
| Claude Code skills follow the Agent Skills open standard. Personal skills live at `~/.claude/skills/<skill-name>/SKILL.md`, project skills at `.claude/skills/<skill-name>/SKILL.md`. | https://code.claude.com/docs/en/skills |
| Outside Claude Code (claude.ai uploads, the Skills API) only `name`, `description`, `license`, `compatibility`, `metadata` and `allowed-tools` are accepted; other keys are a hard error. We use only those keys. | https://code.claude.com/docs/en/skills |
| `description` drives automatic loading; the listing truncates `description` plus `when_to_use` at 1,536 characters, so the key use case goes first. | https://code.claude.com/docs/en/skills |
| A marketplace is a repository with `.claude-plugin/marketplace.json`; `name`, `owner` (with `name`) and `plugins` are required; each plugin entry needs `name` and `source`. Users run `claude plugin marketplace add <owner>/<repo>` and `claude plugin install <plugin>@<marketplace>`, or `/plugin marketplace add` and `/plugin install` in a session. | https://code.claude.com/docs/en/plugin-marketplaces |
| A relative `source` must start with `./`; a plugin can sit at the marketplace root with `"source": "./"`. `agent-skills` is a reserved marketplace name, so our marketplace is named `cosyte`. | https://code.claude.com/docs/en/plugins/marketplace-reference |
| `plugin.json` requires only `name` (kebab-case); `description`, `author`, `homepage`, `repository`, `license` and `keywords` are optional display fields. | https://code.claude.com/docs/en/plugins/manifest-reference |
| A plugin's skills live at `skills/<name>/SKILL.md` and run as `/<plugin>:<name>`. | https://code.claude.com/docs/en/plugins/components |
| Without a `version` field, a plugin from a Git-hosted marketplace takes its version from the commit SHA, so updates follow commits. We set no `version`. | https://code.claude.com/docs/en/plugins/loading |
| Claude Code reads `AGENTS.md` as project instructions when the project has no `CLAUDE.md`. | https://code.claude.com/docs/en/memory |
| `claude mcp add [options] <name> -- <command> [args...]` with `--transport stdio` registers a local MCP server. | https://code.claude.com/docs/en/mcp |

### OpenAI Codex

| Claim | Source |
| --- | --- |
| Codex skills build on the open Agent Skills standard; a skill is a folder with `SKILL.md` that must include `name` and `description`. | https://developers.openai.com/codex/skills (redirects to https://learn.chatgpt.com/docs/build-skills) |
| Codex scans `.agents/skills` in every folder from the working directory up to the repository root, and `$HOME/.agents/skills` for the user; it detects changes automatically and a restart helps if a skill does not appear. | https://developers.openai.com/codex/skills (as above) |
| Codex reads `AGENTS.md` from its home folder and from the project root down to the working directory. | https://developers.openai.com/codex/guides/agents-md (redirects to https://learn.chatgpt.com/docs/agent-configuration/agents-md) |
| `codex mcp add <server-name> -- <stdio server-command>` registers a local MCP server. | https://developers.openai.com/codex/mcp (redirects to https://learn.chatgpt.com/docs/extend/mcp?surface=cli) |

### Cursor

| Claim | Source |
| --- | --- |
| Project rules are `.mdc` files in `.cursor/rules` with frontmatter `description`, `globs` and `alwaysApply`; a plain `.md` file there is ignored. With `alwaysApply: false`, a `description` lets the agent pull the rule in when relevant and `globs` attach it when a matching file is in context. Keep rules under 500 lines. | https://cursor.com/docs/rules (requested as https://cursor.com/docs/context/rules, which redirects there) |
| Rules are not imported from a repository on their own; they arrive through a plugin or are copied into the project. | https://cursor.com/docs/rules |
| Cursor reads `AGENTS.md` in the project root and in subfolders. | https://cursor.com/docs/rules |
| Cursor loads `SKILL.md` folders from `.agents/skills/`, `.cursor/skills/`, `~/.agents/skills/` and `~/.cursor/skills/`, and for compatibility from `.claude/skills/`, `.codex/skills/`, `~/.claude/skills/` and `~/.codex/skills/`. | https://cursor.com/docs/skills |
| MCP servers go in `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (user) under `mcpServers`. | https://cursor.com/docs/mcp |

### AGENTS.md

| Claim | Source |
| --- | --- |
| `AGENTS.md` is plain Markdown at the repository root with no required fields; agents read the nearest one in the folder tree. Tools listed as supporting it include Codex, Cursor, Gemini CLI, GitHub Copilot's coding agent and others. | https://agents.md |

### GitHub Actions pins

| Action | Version | Commit | Source |
| --- | --- | --- | --- |
| actions/checkout | v7.0.1 | 3d3c42e5aac5ba805825da76410c181273ba90b1 | `gh api repos/actions/checkout/releases/latest`, then `gh api repos/actions/checkout/git/ref/tags/v7.0.1` |
| actions/setup-node | v7.1.0 | 949feb2413d6458794dcd2491c4babbbce0c15c1 | `gh api repos/actions/setup-node/releases/latest`, then `gh api repos/actions/setup-node/git/ref/tags/v7.1.0` |

## Packages

Read on 2026-11-08 (UTC), and brought up to the latest version on npm on 2026-11-11 (UTC). For each
package we read the README, the type declarations (`dist/**/*.d.ts`) and the changelog of the
latest version on npm, from the registry document `https://registry.npmjs.org/@cosyte/<name>` and
the tarball it lists. On 2026-11-11 we read each changelog from the version the skill named before
to the latest, and changed the skill wherever an entry fixed a defect it listed or changed a
behavior, an option or a range it stated. Where a README
moved a section to docs.cosyte.com, we read that page in the package's repository at the release
tag. Every capability, API name and limit in a skill comes from those sources. On 2026-11-11 we
typechecked every TypeScript block in the skills (80 blocks) with `tsc --strict` against the
declarations of the versions in the table below: the `cosyte-synth` blocks against `@cosyte/synth`
0.1.6 with `@cosyte/deid` 0.1.5, which its peer range requires, and every other block against
`@cosyte/deid` 0.2.3. We did not run the packages.

| Package | Version read | Skill | Documentation |
| --- | --- | --- | --- |
| `@cosyte/hl7` | 0.1.10 | cosyte-hl7 | https://docs.cosyte.com/hl7/intro |
| `@cosyte/mllp` | 0.1.8 | cosyte-mllp | https://docs.cosyte.com/mllp/intro |
| `@cosyte/x12` | 0.1.11 | cosyte-x12 | https://docs.cosyte.com/x12/intro |
| `@cosyte/fhir` | 0.1.11 | cosyte-fhir | https://docs.cosyte.com/fhir/intro |
| `@cosyte/ccda` | 0.1.6 | cosyte-ccda | https://docs.cosyte.com/ccda/intro |
| `@cosyte/dicom` | 0.1.13 | cosyte-dicom | https://docs.cosyte.com/dicom/intro |
| `@cosyte/ncpdp` | 0.1.7 | cosyte-ncpdp | https://docs.cosyte.com/ncpdp/intro |
| `@cosyte/astm` | 0.1.7 | cosyte-astm | https://docs.cosyte.com/astm/intro |
| `@cosyte/terminology` | 0.1.7 | cosyte-terminology | https://docs.cosyte.com/terminology/intro |
| `@cosyte/transform` | 0.2.1 | cosyte-transform | https://docs.cosyte.com/transform/intro |
| `@cosyte/deid` | 0.2.3 | cosyte-deid | https://docs.cosyte.com/deid/intro |
| `@cosyte/synth` | 0.1.6 | cosyte-synth | https://docs.cosyte.com/synth/intro |
| `@cosyte/cli` | 0.1.8 | cosyte-cli | https://docs.cosyte.com/cli/intro |
| `@cosyte/dates` | 0.1.6 | cosyte-dates | https://docs.cosyte.com/dates/intro |

### Known defects

These come from our own defect tracking. Before listing one, we confirmed it in the published code of
the version named, by reading the file below and, where the package ships one, its changelog, which records no fix.

| Package | Defect stated in the skill | Evidence in the published package |
| --- | --- | --- |
| `@cosyte/ccda` 0.1.6 | `HumanName.text` runs name parts together | `dist/index.mjs` `parseName` (line 1767): `text` is the element's trimmed text content (line 1778) |
| `@cosyte/fhir` 0.1.11 | `resolvePath` returns a repeating last segment as one list node | `dist/index.mjs` `resolvePath` (line 4714) and `step` (line 4722) |
| `@cosyte/synth` 0.1.6 | 271 EB-08 percent as a whole number | `dist/x12/index.mjs` line 996 |
| `@cosyte/synth` 0.1.6 | NCPDP 442-E7 without implied decimals | `dist/ncpdp/index.mjs` line 743 |
| `@cosyte/synth` 0.1.6 | ASTM header sender in H.3 and H.4, H.5 empty | `dist/astm/index.mjs` line 666 |

Fixed since the skills were first written, and taken out of them: `@cosyte/x12` 0.1.3 corrected the
two JSDoc comments that gave the 835 balance with the wrong PLB sign (`dist/index.d.ts` now
subtracts the PLB amounts), and `@cosyte/deid` 0.1.2 bounded its parser peers to `^0.1.0` and now
refuses an NCPDP Telecom transmission carrying more than one transaction with
`DEID_FORMAT_UNSUPPORTED`. One more defect on our list is fixed and was never in the skills:
`@cosyte/ccda` depends on `@xmldom/xmldom` 0.9.12, no longer the deprecated 0.9.10.

Fixed since, each by the changelog entry of the release named, and taken out of the skills on
2026-11-11: `@cosyte/dicom` 0.1.9 types `DicomParseError.code` as `FatalCode | WarningCode`, and
0.1.11 accepts any VR the dictionary lists for a tag, so Pixel Data as `OW` raises no
`DICOM_VR_MISMATCH`; `@cosyte/x12` 0.1.10 writes the BHT in `build271` and warns
`X12_271_HEADER_ABSENT` from `get271Eligibility`; `@cosyte/ncpdp` 0.1.6 reads the segments ahead of
the first group separator as transmission-level; `@cosyte/transform` 0.2.0 raises
`TRANSFORM_ELEMENT_DROPPED` for PID-10, 15, 19, 22, 29 and 30 and locates the telecom issue at the
field the phone came from (the Patient still does not carry those fields, and the skill says so);
`@cosyte/deid` 0.2.1 writes De-identification Method `(0012,0063)` as four Values of at most 64
characters.
