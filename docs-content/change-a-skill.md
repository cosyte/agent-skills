---
id: change-a-skill
title: Change a skill after a package release
sidebar_label: Change a skill
description: "Bring a skill up to a new @cosyte package release: trace each fact, rebuild the Cursor rules, update its page and run the check."
---

# Change a skill after a package release

This guide is for contributors to the repository. When a `@cosyte` package releases, the weekly CI
run's live npm check warns that the snapshot is behind, and the skill for that package needs a
review.

## Steps

1. Refresh the npm snapshot, so the check knows the new version:

   ```bash
   node scripts/check.mjs --update-snapshot
   ```

2. Read the package's published README, type declarations and changelog at the new version, and the
   docs.cosyte.com pages the README links. Every fact in a skill comes from those sources and no
   others.
3. Edit `skills/<name>/SKILL.md`: set `metadata.version` to the new version, and change the install
   line, the example, the key API, the limits and known defects, and the PHI notes wherever the
   release changed them. Longer material goes in `skills/<name>/references/`.
4. Rebuild the Cursor rules, which are generated from the skills:

   ```bash
   node scripts/build-cursor-rules.mjs
   ```

5. If the skill's description, install line or minimal example changed, update its page in
   `docs-content/<name>.md` to match.
6. Run the check:

   ```bash
   node scripts/check.mjs
   ```

## Add a skill

A new skill follows the same steps, plus four more: add the package to the list in
`scripts/check.mjs`, add a row to the routing tables in `AGENTS.md`, `README.md` and the `cosyte`
skill, write its page in `docs-content/<name>.md`, and list that page under Reference in
`docs-content/sidebars.json`.

## See also

- [Testing and quality](./testing-and-quality.md): what the check catches and what it cannot.
- [How agents use the skills](./how-agents-use-skills.md): why a wrong fact in a skill matters.
