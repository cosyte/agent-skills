#!/usr/bin/env node
// Checks this repository. No dependencies; Node 22 or later.
//
//   node scripts/check.mjs                    check against scripts/npm-snapshot.json
//   node scripts/check.mjs --live             also ask the npm registry, now
//   node scripts/check.mjs --update-snapshot  rewrite scripts/npm-snapshot.json from the registry
//
// What it checks:
//   1. Every skills/<name>/SKILL.md has frontmatter the Agent Skills spec accepts: name and
//      description present, name matching the folder, the spec's length and character rules,
//      and no keys outside the spec's six.
//   2. The skill set is exactly the expected one (anti-vacuity: a check that read nothing fails).
//   3. Every @cosyte package named anywhere exists on npm (snapshot, or live with --live), and
//      each skill's metadata.version matches the snapshot.
//   4. No em dash or en dash in any file, in any spelling: the characters themselves, percent
//      encoding, backslash-u escapes, and named, decimal or hex HTML entities.
//   5. No claim that software is compliant with HIPAA, in any spacing or hyphenation.
//   6. Relative links in skills resolve, the Cursor rules match their skills, and the plugin
//      manifests parse.
//
// The patterns in this file are assembled from pieces so that the file does not match itself.

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, extname } from "node:path";
import { ROOT, expectedRules, skillNames } from "./build-cursor-rules.mjs";

const SNAPSHOT_PATH = join(ROOT, "scripts", "npm-snapshot.json");
const REGISTRY = "https://registry.npmjs.org";

// The packages we publish skills for. One skill per package, plus the `cosyte` router.
const PACKAGES = [
  "hl7", "mllp", "x12", "fhir", "ccda", "dicom", "ncpdp", "astm",
  "terminology", "transform", "deid", "synth", "cli", "dates",
];
const EXPECTED_SKILLS = ["cosyte", ...PACKAGES.map((p) => `cosyte-${p}`)].sort();
const EXPECTED_SKILL_COUNT = 15;

// Frontmatter keys the Agent Skills spec defines (https://agentskills.io/specification).
const ALLOWED_KEYS = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools"]);

const TEXT_EXTENSIONS = new Set([".md", ".mdc", ".mjs", ".js", ".json", ".yml", ".yaml", ".txt", ""]);
const SKIP_DIRS = new Set([".git", "node_modules"]);

const args = new Set(process.argv.slice(2));
const live = args.has("--live");
const updateSnapshot = args.has("--update-snapshot");

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

// ---------------------------------------------------------------------------------------------
// Dash and claim patterns, built from parts.

const EM = String.fromCodePoint(0x2014);
const EN = String.fromCodePoint(0x2013);
const BS = "\\";
const DASH_PATTERNS = [
  { label: "em dash character", re: new RegExp(EM, "u") },
  { label: "en dash character", re: new RegExp(EN, "u") },
  { label: "percent-encoded dash", re: new RegExp("%e2%80%9" + "[34]", "i") },
  { label: "backslash-u dash escape", re: new RegExp(BS + BS + "u" + "\\{?0*201" + "[34]\\}?", "i") },
  { label: "backslash-x dash escape", re: new RegExp(BS + BS + "x" + "\\{0*201" + "[34]\\}", "i") },
  { label: "named dash entity", re: new RegExp("&" + "(?:m|n)dash;", "i") },
  { label: "decimal dash entity", re: new RegExp("&#" + "0*821" + "[12];", "i") },
  { label: "hex dash entity", re: new RegExp("&#x" + "0*201" + "[34];", "i") },
];
const CLAIM_PATTERN = new RegExp("hipaa" + "[\\s_-]*" + "compliant", "i");

// ---------------------------------------------------------------------------------------------
// Files.

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const allFiles = walk(ROOT);
const textFiles = allFiles.filter((f) => TEXT_EXTENSIONS.has(extname(f)) && statSync(f).size < 2_000_000);

// ---------------------------------------------------------------------------------------------
// Minimal YAML for the frontmatter subset the spec uses: top-level `key: scalar` pairs and one
// level of `key:` mapping with indented `key: scalar` pairs. Anything else is reported.

function parseScalar(raw, where) {
  const value = raw.trim();
  if (value.startsWith('"')) {
    if (!value.endsWith('"') || value.length < 2) return { error: `${where}: unterminated double quote` };
    const inner = value.slice(1, -1);
    if (/(^|[^\\])(\\\\)*"/.test(inner)) return { error: `${where}: unescaped double quote inside value` };
    return { value: inner.replace(/\\(["\\])/g, "$1") };
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) return { error: `${where}: unterminated single quote` };
    return { value: value.slice(1, -1).replace(/''/g, "'") };
  }
  if (value === "") return { value: "" };
  if (/^[>|&*!%@`{[]/.test(value)) return { error: `${where}: unsupported YAML construct "${value[0]}"` };
  if (/: /.test(value) || / #/.test(value)) return { error: `${where}: plain value contains ": " or " #"; quote it` };
  return { value };
}

function parseFrontmatter(text, file) {
  const lines = text.split("\n");
  if (lines[0] !== "---") return { error: `${file}: first line must be "---"` };
  const end = lines.indexOf("---", 1);
  if (end === -1) return { error: `${file}: frontmatter has no closing "---"` };
  const data = {};
  let currentMap = null;
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    const where = `${file}:${i + 1}`;
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const nested = /^ {2}([A-Za-z0-9_.-]+):(.*)$/.exec(line);
    if (nested !== null) {
      if (currentMap === null) return { error: `${where}: indented key outside a mapping` };
      const scalar = parseScalar(nested[2], where);
      if (scalar.error) return { error: scalar.error };
      currentMap[nested[1]] = scalar.value;
      continue;
    }
    const top = /^([A-Za-z0-9_-]+):(.*)$/.exec(line);
    if (top === null) return { error: `${where}: not a "key: value" line` };
    const [, key, rest] = top;
    if (Object.hasOwn(data, key)) return { error: `${where}: duplicate key "${key}"` };
    if (rest.trim() === "") {
      currentMap = {};
      data[key] = currentMap;
      continue;
    }
    currentMap = null;
    const scalar = parseScalar(rest, where);
    if (scalar.error) return { error: scalar.error };
    data[key] = scalar.value;
  }
  return { data, bodyStart: end + 1 };
}

// ---------------------------------------------------------------------------------------------
// 1 and 2. Skills.

const skillDirs = skillNames();
const skills = [];
for (const name of skillDirs) {
  const file = join("skills", name, "SKILL.md");
  const text = readFileSync(join(ROOT, file), "utf8");
  const parsed = parseFrontmatter(text, file);
  if (parsed.error) {
    fail(parsed.error);
    continue;
  }
  const fm = parsed.data;
  for (const key of Object.keys(fm)) {
    if (!ALLOWED_KEYS.has(key)) fail(`${file}: frontmatter key "${key}" is not in the Agent Skills spec`);
  }
  if (typeof fm.name !== "string" || fm.name === "") fail(`${file}: missing name`);
  else {
    if (fm.name !== name) fail(`${file}: name "${fm.name}" does not match folder "${name}"`);
    if (fm.name.length > 64) fail(`${file}: name longer than 64 characters`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name)) fail(`${file}: name must be lowercase a-z, 0-9 and single hyphens`);
    if (/anthropic|claude/.test(fm.name)) fail(`${file}: name uses a reserved word`);
  }
  if (typeof fm.description !== "string" || fm.description.trim() === "") fail(`${file}: missing description`);
  else {
    if (fm.description.length > 1024) fail(`${file}: description is ${fm.description.length} characters (max 1024)`);
    if (/[<>]/.test(fm.description)) fail(`${file}: description contains an angle bracket`);
    if (!/\buse when\b/i.test(fm.description)) fail(`${file}: description does not say when to use the skill ("Use when ...")`);
  }
  if (fm.metadata !== undefined && (typeof fm.metadata !== "object" || fm.metadata === null)) {
    fail(`${file}: metadata must be a mapping`);
  }
  if (fm.compatibility !== undefined && String(fm.compatibility).length > 500) fail(`${file}: compatibility over 500 characters`);
  const bodyLines = text.split("\n").length - parsed.bodyStart;
  if (bodyLines > 500) fail(`${file}: SKILL.md body is ${bodyLines} lines (keep it under 500)`);
  skills.push({ name, file, fm, text });
}

// Count every SKILL.md found, parsed or not, so a parse error is reported once, not twice.
const found = [...skillDirs].sort();
if (found.length !== EXPECTED_SKILL_COUNT) {
  fail(`expected ${EXPECTED_SKILL_COUNT} skills, found ${found.length}`);
}
for (const name of EXPECTED_SKILLS) if (!found.includes(name)) fail(`missing skill: skills/${name}/SKILL.md`);
for (const name of found) if (!EXPECTED_SKILLS.includes(name)) fail(`unexpected skill: skills/${name}`);

// ---------------------------------------------------------------------------------------------
// 3. npm packages.

function readSnapshot() {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
}

async function fetchLatest(pkg) {
  const res = await fetch(`${REGISTRY}/${pkg.replace("/", "%2F")}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (res.status === 404) return { exists: false };
  if (!res.ok) throw new Error(`${pkg}: registry answered HTTP ${res.status}`);
  const body = await res.json();
  return { exists: true, latest: body["dist-tags"]?.latest };
}

const named = new Map();
const PKG_RE = /@cosyte\/([a-z0-9][a-z0-9._-]*)/g;
for (const file of textFiles) {
  const rel = relative(ROOT, file);
  if (rel === relative(ROOT, SNAPSHOT_PATH)) continue;
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(PKG_RE)) {
    const pkg = `@cosyte/${m[1].replace(/[.]+$/, "")}`;
    if (!named.has(pkg)) named.set(pkg, rel);
  }
}
for (const p of PACKAGES) if (!named.has(`@cosyte/${p}`)) fail(`@cosyte/${p} is never named in this repository`);

let snapshot = readSnapshot();
if (updateSnapshot) {
  const packages = {};
  for (const pkg of [...named.keys()].sort()) {
    const r = await fetchLatest(pkg);
    if (!r.exists) fail(`${pkg} (named in ${named.get(pkg)}) does not exist on npm`);
    else packages[pkg] = { latest: r.latest };
  }
  snapshot = { registry: REGISTRY, fetched: new Date().toISOString().slice(0, 10), packages };
  if (errors.length === 0) {
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`wrote ${Object.keys(packages).length} packages to scripts/npm-snapshot.json`);
  }
}

if (snapshot === null) fail("scripts/npm-snapshot.json is missing; run with --update-snapshot");
else {
  for (const [pkg, where] of named) {
    if (snapshot.packages[pkg] === undefined) fail(`${pkg} (named in ${where}) is not in the npm snapshot`);
  }
  for (const s of skills) {
    const pkg = s.fm.metadata?.package;
    const version = s.fm.metadata?.version;
    if (pkg === undefined || pkg.includes("*")) continue;
    const snap = snapshot.packages[pkg];
    if (snap === undefined) fail(`${s.file}: metadata.package ${pkg} is not in the npm snapshot`);
    else if (version !== snap.latest) {
      fail(`${s.file}: metadata.version ${version} but the snapshot's latest ${pkg} is ${snap.latest}`);
    }
  }
}

if (live && !updateSnapshot) {
  for (const pkg of [...named.keys()].sort()) {
    try {
      const r = await fetchLatest(pkg);
      if (!r.exists) fail(`${pkg} (named in ${named.get(pkg)}) does not exist on npm (live)`);
      else if (snapshot?.packages[pkg] && snapshot.packages[pkg].latest !== r.latest) {
        warn(`${pkg}: npm latest is ${r.latest}, snapshot says ${snapshot.packages[pkg].latest}; review the skill`);
      }
    } catch (err) {
      fail(`${pkg}: live check failed: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 4 and 5. Dashes and claims, in every text file, plus file names.

for (const file of allFiles) {
  const rel = relative(ROOT, file);
  for (const { label, re } of DASH_PATTERNS) if (re.test(rel)) fail(`${rel}: ${label} in the file name`);
}
for (const file of textFiles) {
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const { label, re } of DASH_PATTERNS) if (re.test(line)) fail(`${rel}:${i + 1}: ${label}`);
    if (CLAIM_PATTERN.test(line)) fail(`${rel}:${i + 1}: compliance claim about HIPAA`);
  });
}

// ---------------------------------------------------------------------------------------------
// 6. Links, Cursor rules, plugin manifests.

const LINK_RE = /\]\((?!https?:|#|mailto:)([^)\s#]+)(?:#[^)\s]*)?\)/g;
for (const file of textFiles.filter((f) => f.endsWith(".md"))) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(LINK_RE)) {
    if (!existsSync(join(dirname(file), m[1]))) fail(`${rel}: link target ${m[1]} does not exist`);
  }
}

const rules = expectedRules();
const rulesDir = join(ROOT, ".cursor", "rules");
const ruleFiles = existsSync(rulesDir) ? readdirSync(rulesDir).filter((f) => f.endsWith(".mdc")) : [];
for (const [file, text] of rules) {
  const path = join(rulesDir, file);
  if (!existsSync(path)) fail(`.cursor/rules/${file} is missing; run node scripts/build-cursor-rules.mjs`);
  else if (readFileSync(path, "utf8") !== text) {
    fail(`.cursor/rules/${file} is out of date with its skill; run node scripts/build-cursor-rules.mjs`);
  }
}
for (const file of ruleFiles) if (!rules.has(file)) fail(`.cursor/rules/${file} has no matching skill`);
if (ruleFiles.length !== EXPECTED_SKILL_COUNT) fail(`expected ${EXPECTED_SKILL_COUNT} Cursor rules, found ${ruleFiles.length}`);

for (const manifest of [".claude-plugin/marketplace.json", ".claude-plugin/plugin.json"]) {
  const path = join(ROOT, manifest);
  if (!existsSync(path)) {
    fail(`${manifest} is missing`);
    continue;
  }
  try {
    const json = JSON.parse(readFileSync(path, "utf8"));
    if (typeof json.name !== "string" || json.name === "") fail(`${manifest}: missing name`);
    if (manifest.endsWith("marketplace.json")) {
      if (typeof json.owner?.name !== "string") fail(`${manifest}: owner.name is required`);
      if (!Array.isArray(json.plugins) || json.plugins.length === 0) fail(`${manifest}: plugins must be a non-empty array`);
      for (const p of json.plugins ?? []) {
        if (typeof p.name !== "string" || p.source === undefined) fail(`${manifest}: each plugin needs name and source`);
        if (typeof p.source === "string" && !(p.source === "." || p.source.startsWith("./"))) {
          fail(`${manifest}: relative source must start with "./"`);
        }
      }
    }
  } catch (err) {
    fail(`${manifest}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Report.

console.log(`skills found: ${skillDirs.length} of ${EXPECTED_SKILL_COUNT} expected, frontmatter parsed: ${skills.length}`);
console.log(`cursor rules checked: ${ruleFiles.length}`);
console.log(`text files scanned for dashes and claims: ${textFiles.length}`);
console.log(`@cosyte packages named: ${named.size} (${[...named.keys()].sort().join(", ")})`);
console.log(`npm check: ${updateSnapshot ? "registry (snapshot rewritten)" : live ? "snapshot and live registry" : `snapshot of ${snapshot?.fetched ?? "none"}`}`);
for (const w of warnings) console.log(`warning: ${w}`);
if (textFiles.length < EXPECTED_SKILL_COUNT * 2) fail(`only ${textFiles.length} text files scanned; the scan looks vacuous`);
if (errors.length > 0) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`${errors.length} problem(s) found`);
  process.exit(1);
}
console.log("all checks passed");
