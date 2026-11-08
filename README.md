<a href="https://cosyte.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cosyte.com/tile/cosyte-lockup-tile-on-dark-1200x300.png">
    <img alt="The Cosyte logo on its own white ground: the icon beside the word Cosyte." src="https://cosyte.com/tile/cosyte-lockup-tile-on-light-1200x300.png">
  </picture>
</a>

# Cosyte agent skills

Skills that teach AI coding agents when and how to use Cosyte's MIT-licensed TypeScript libraries
for healthcare data standards. When you ask an agent to "parse this HL7 message in Node" or "read
an 835", the matching skill points it at the right `@cosyte` package and shows it how to use that
package correctly: the install line, a checked example with synthetic data, the key API names, the
limits and known defects the package has today, and how to handle PHI.

The skills follow the [Agent Skills](https://agentskills.io/specification) format: one folder per
skill with a `SKILL.md` that carries `name` and `description` frontmatter, plus optional reference
files. The same folders work in Claude Code, OpenAI Codex and Cursor. For Cursor we also ship
project rules, and for any tool that reads `AGENTS.md` we ship a routing summary.

## What is in it

| Skill | Package | Use it for |
| --- | --- | --- |
| [cosyte](skills/cosyte/SKILL.md) | all | Choosing the right package for a healthcare data task |
| [cosyte-hl7](skills/cosyte-hl7/SKILL.md) | `@cosyte/hl7` | HL7 v2 messages: parse, read, build, serialize |
| [cosyte-mllp](skills/cosyte-mllp/SKILL.md) | `@cosyte/mllp` | Sending and receiving HL7 v2 over MLLP |
| [cosyte-x12](skills/cosyte-x12/SKILL.md) | `@cosyte/x12` | X12 EDI: 835, 837, 270, 271 and the other 005010 sets |
| [cosyte-fhir](skills/cosyte-fhir/SKILL.md) | `@cosyte/fhir` | FHIR R4 resources, JSON and XML, validation |
| [cosyte-ccda](skills/cosyte-ccda/SKILL.md) | `@cosyte/ccda` | C-CDA documents |
| [cosyte-dicom](skills/cosyte-dicom/SKILL.md) | `@cosyte/dicom` | DICOM Part 10 files and metadata |
| [cosyte-ncpdp](skills/cosyte-ncpdp/SKILL.md) | `@cosyte/ncpdp` | NCPDP Telecom claims and SCRIPT e-prescriptions |
| [cosyte-astm](skills/cosyte-astm/SKILL.md) | `@cosyte/astm` | ASTM lab analyzer records and streams |
| [cosyte-terminology](skills/cosyte-terminology/SKILL.md) | `@cosyte/terminology` | Code systems, ConceptMaps, UCUM, RxNorm |
| [cosyte-transform](skills/cosyte-transform/SKILL.md) | `@cosyte/transform` | HL7 v2 to FHIR R4 conversion |
| [cosyte-deid](skills/cosyte-deid/SKILL.md) | `@cosyte/deid` | De-identification across the formats above |
| [cosyte-synth](skills/cosyte-synth/SKILL.md) | `@cosyte/synth` | Synthetic test fixtures |
| [cosyte-cli](skills/cosyte-cli/SKILL.md) | `@cosyte/cli` | The `cosyte` command and the `cosyte-mcp` MCP server |
| [cosyte-dates](skills/cosyte-dates/SKILL.md) | `@cosyte/dates` | Dates and timestamps from the parsers |

Each skill names the package version it was written against in its `metadata.version`. The
package documentation lives at [docs.cosyte.com](https://docs.cosyte.com/).

## Install

Every method below comes from the tool's own documentation, read on 2026-11-07; [SOURCES.md](SOURCES.md)
has the links. We have checked the file layout against those documents. We have not yet run an
install in each tool, so tell us in an issue if one does not work as written.

Most methods copy the skill folders, so start with a clone:

```bash
git clone https://github.com/cosyte/agent-skills.git
```

### Claude Code

As a plugin, from inside a Claude Code session:

```text
/plugin marketplace add cosyte/agent-skills
/plugin install cosyte@cosyte
```

Or from your shell: `claude plugin marketplace add cosyte/agent-skills`, then
`claude plugin install cosyte@cosyte`. Plugin skills are namespaced, so the HL7 skill runs as
`/cosyte:cosyte-hl7`; Claude also loads a skill on its own when your request matches its
description. The repository root is both the marketplace (`.claude-plugin/marketplace.json`) and
the plugin (`.claude-plugin/plugin.json` plus `skills/`). We wrote both manifests from Anthropic's
documentation and have not yet run `claude plugin validate` on them.

Or copy the folders. For every project on your machine:

```bash
mkdir -p ~/.claude/skills && cp -R agent-skills/skills/* ~/.claude/skills/
```

For one project, committed so your team gets them, run this from the project root:

```bash
mkdir -p .claude/skills && cp -R /path/to/agent-skills/skills/* .claude/skills/
```

### OpenAI Codex

Codex reads `SKILL.md` folders from `.agents/skills` in the repository (from the working directory
up to the repository root) and from `$HOME/.agents/skills` for your user.

```bash
mkdir -p ~/.agents/skills && cp -R agent-skills/skills/* ~/.agents/skills/
```

For one repository, copy into `.agents/skills/` at its root instead. Codex picks up new skills
automatically; restart it if one does not appear. Codex also reads `AGENTS.md`, so you can add the
routing table from this repository's [AGENTS.md](AGENTS.md) to your project's own.

### Cursor

Cursor loads `SKILL.md` folders from `.agents/skills/` and `.cursor/skills/` in a project and from
`~/.agents/skills/` and `~/.cursor/skills/` for your user (it also reads the Claude and Codex skill
folders). The same copy commands work:

```bash
mkdir -p .cursor/skills && cp -R /path/to/agent-skills/skills/* .cursor/skills/
```

We also ship one project rule per skill in [.cursor/rules](.cursor/rules). They are generated from
the skills, set to `alwaysApply: false`, and carry the skill's description so the agent pulls a
rule in when it is relevant. They set no `globs`; add one to a copied rule if you want it attached
whenever a matching file is in context. Cursor does not import rules from a repository on their
own, so copy them:

```bash
mkdir -p .cursor/rules && cp /path/to/agent-skills/.cursor/rules/*.mdc .cursor/rules/
```

Use the skills or the rules; you do not need both.

### Other agents

Any agent that follows the Agent Skills format can load the folders in `skills/`; check that
agent's documentation for its skills directory. For an agent that reads `AGENTS.md` (Codex, Cursor,
Claude Code when a project has no `CLAUDE.md`, and the other tools listed at
[agents.md](https://agents.md)), copy the "Which skill to use" section of [AGENTS.md](AGENTS.md)
into your project's `AGENTS.md`.

### The MCP server

`@cosyte/cli` ships a local MCP server, `cosyte-mcp`, with `parse`, `validate`, `inspect` and
`convert` tools. The [cosyte-cli skill](skills/cosyte-cli/SKILL.md) shows how to register it in
Claude Code, Codex and Cursor. The skills do not need it.

## PHI

Every example in these skills uses synthetic data: invented names, invented record numbers and no
real person. The skills tell agents to keep it that way, to use `@cosyte/synth` for test data, and
to log diagnostic codes rather than values. Never paste real patient data into a prompt, a fixture
or a log. The libraries and these skills make no compliance claim on your behalf; transport,
storage, retention, access control and your own logs remain your responsibility.

## Keeping the skills accurate

Every fact in a skill comes from the package's published npm README and type declarations at the
version the skill names. Known defects come from our own defect tracking and are each confirmed
against the published package before they are listed. When a package releases a new version, we
review its skill.

`node scripts/check.mjs` runs in CI on every pull request and push. It checks that:

- every `SKILL.md` has frontmatter the Agent Skills spec accepts, with a name that matches its
  folder and a description that says when to use it;
- the repository holds exactly the 15 expected skills and 15 Cursor rules, and each rule matches its
  skill;
- every `@cosyte` package named anywhere exists on npm (against `scripts/npm-snapshot.json`, and
  against the live registry with `--live`), and each skill's version matches the snapshot;
- no file contains an em dash or an en dash in any spelling, and no file claims that software is
  compliant with HIPAA;
- every relative link resolves and the plugin manifests parse.

To change a skill, edit `skills/<name>/SKILL.md`, then run:

```bash
node scripts/build-cursor-rules.mjs
node scripts/check.mjs
```

`node scripts/check.mjs --update-snapshot` refreshes the npm snapshot after a release.

## License

MIT, copyright 2026 Cosyte. See [LICENSE](LICENSE). The `@cosyte` packages are MIT-licensed too.
