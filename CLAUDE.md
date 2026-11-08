# cosyte/agent-skills

Our Agent Skills for the `@cosyte` packages: one skill per library plus the `cosyte` router, a
Claude plugin manifest, and Cursor rules generated from the skills. AGENTS.md, imported here, holds
the build, the check, and the data rule. This card adds what CI requires, the hazard, and the rules
that bind here.

@AGENTS.md

## Gate

Required checks: `check` (ci.yml) and `pr-title / conventional-commits`. Not required, but red if
they fail: `actionlint` and CodeQL. Scorecard runs on `main` only. From the repo root:

```sh
node scripts/build-cursor-rules.mjs   # after editing a skill
node scripts/check.mjs
node scripts/check.mjs --live
actionlint
```

## Hazard: an agent acts on what a skill says

A skill is read by an agent writing code for healthcare data. A capability the package does not
have, a wrong signature, or a missing known defect becomes code that mishandles a patient record,
and `check.mjs` still passes: it checks names, versions, links, and wording, not whether a claim is
true. Trace every package fact to its npm README and type declarations at `metadata.version`.

## Rules

- README.md, the skills, and the Cursor rules are text a reader sees in a public repository: a
  change to them merges only with the operator's words (#2).
- Workflows call cosyte/.github at the one published `workflows-*` reference, never `@main`, and
  pin every action by full SHA with its version comment (#1).
- The scripts use Node's standard library only, so CI installs nothing and Dependabot watches
  Actions alone (2026-11-07).
