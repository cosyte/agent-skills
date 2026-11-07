#!/usr/bin/env node
// Writes .cursor/rules/<skill>.mdc from skills/<skill>/SKILL.md, so the Cursor rules and the
// skills say the same thing. The skill is the source: edit SKILL.md, then run this script.
// `node scripts/check.mjs` fails when a rule is out of date. No dependencies.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_URL = "https://github.com/cosyte/agent-skills/blob/main";

// File patterns that attach a rule automatically when a matching file is in context. Empty on
// purpose: a pattern that matches anywhere starts with "*", which plain YAML reads as an alias,
// and Cursor's documentation shows no quoted form. Every rule is chosen by its description.
export const CURSOR_GLOBS = {};

// Splits a SKILL.md into its frontmatter text and its body. Returns null when the file does not
// open with a frontmatter block.
export function splitFrontmatter(text) {
  const lines = text.split("\n");
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end === -1) return null;
  return {
    frontmatter: lines.slice(1, end).join("\n"),
    body: lines.slice(end + 1).join("\n"),
  };
}

// Reads `description: "..."` (or an unquoted value) from frontmatter text.
export function readDescription(frontmatter) {
  const line = frontmatter.split("\n").find((l) => l.startsWith("description:"));
  if (line === undefined) return undefined;
  let value = line.slice("description:".length).trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return value;
}

// Builds the .mdc text for one skill. Relative links inside the skill folder become absolute
// links to this repository, because a rule is copied into another project's .cursor/rules.
export function renderRule(skillName, skillText) {
  const parts = splitFrontmatter(skillText);
  if (parts === null) throw new Error(`${skillName}: SKILL.md has no frontmatter`);
  const description = readDescription(parts.frontmatter);
  if (description === undefined) throw new Error(`${skillName}: SKILL.md has no description`);
  const body = parts.body.replace(
    /\]\((?!https?:|#|mailto:)([^)\s]+)\)/g,
    (_match, target) => `](${REPO_URL}/skills/${skillName}/${target})`,
  );
  const head = ["---", `description: ${JSON.stringify(description)}`];
  if (CURSOR_GLOBS[skillName] !== undefined) head.push(`globs: ${CURSOR_GLOBS[skillName]}`);
  head.push("alwaysApply: false", "---");
  const note =
    `<!-- Generated from skills/${skillName}/SKILL.md by scripts/build-cursor-rules.mjs. ` +
    "Edit the skill, not this file. -->";
  return `${head.join("\n")}\n${note}\n${body}`;
}

export function skillNames() {
  const dir = join(ROOT, "skills");
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "SKILL.md")))
    .map((d) => d.name)
    .sort();
}

export function expectedRules() {
  const rules = new Map();
  for (const name of skillNames()) {
    const text = readFileSync(join(ROOT, "skills", name, "SKILL.md"), "utf8");
    rules.set(`${name}.mdc`, renderRule(name, text));
  }
  return rules;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outDir = join(ROOT, ".cursor", "rules");
  mkdirSync(outDir, { recursive: true });
  const rules = expectedRules();
  for (const [file, text] of rules) writeFileSync(join(outDir, file), text);
  console.log(`wrote ${rules.size} rules to .cursor/rules`);
}
