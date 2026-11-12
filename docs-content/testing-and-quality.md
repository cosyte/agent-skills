---
id: testing-and-quality
title: Testing and quality
sidebar_label: Testing and quality
description: "What the repository check proves about the Cosyte skills on every pull request, what it cannot prove, and how we keep the facts true."
---

# Testing and quality

The skills are text, not code, so we test them differently from the libraries: there are no unit
tests, coverage or mutation runs here. What we check is that every skill is well formed, names
packages that exist at the versions it claims, links to files that exist, and follows our writing
rules.

## What the check covers

`node scripts/check.mjs` runs in CI on every pull request, on every push to `main`, and weekly. It
uses Node's standard library only, so CI installs nothing. It checks that:

- every `SKILL.md` has front matter the Agent Skills specification accepts: a `name` that matches
  its folder and follows the length and character rules, a `description` of at most 1,024
  characters that says when to use the skill, no key outside the specification's six, and a body
  under 500 lines;
- the repository holds exactly the expected 16 skills and 16 Cursor rules, and each rule matches
  the one generated from its skill;
- every `@cosyte` package named in any file exists in the committed npm snapshot, and each skill's
  `metadata.version` is that package's latest version there;
- no file contains an em dash or an en dash in any spelling, and no file claims that software is
  compliant with HIPAA;
- every relative link in a Markdown file resolves, and the Claude plugin manifests parse;
- a skill's scripts run on Node 22 or later with no install step and no network: each imports only
  `node:` modules and its own skill's files, opens no connection, runs no code from a string, parses
  under `node --check`, and an entry script checks the Node version first. A skill with scripts has
  tests on synthetic fixtures, and the check runs them with `node --test` and fails when none pass.

A second CI step, `node scripts/check.mjs --live`, asks the npm registry about every package
named. It fails when one does not exist, and warns when a package has released past the snapshot,
which is our cue to review its skill (see [Change a skill after a package release](./change-a-skill.md)).
The check fails when it scanned too few files, so a run that read nothing cannot pass.

Beside it, CI runs `actionlint` on the workflows and CodeQL, and a pull request title must follow
Conventional Commits.

## What it cannot catch

The check reads names, versions, links and wording. It cannot tell whether a claim in a skill is
true: a wrong signature, a capability the package does not have, or a missing known defect all
pass. We guard against that by review: every fact in a skill is traced to the package's published
README, type declarations and changelog at the version the skill names, or to the docs.cosyte.com
page the README links. [How agents use the skills](./how-agents-use-skills.md) says why.

It also does not run the examples. Each skill says where an example's expected output comes from:
the package README, where the package's own tests run it, or the README and the type declarations
together, where we have not run that exact snippet. The examples on these pages are copied from the
skills and are not run here either.

It does not check that each skill has a page in this documentation.

## Data

Every example uses synthetic data: invented names, record numbers and identifiers, telephone
numbers in the 555 range. Real patient data never enters this repository.

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
