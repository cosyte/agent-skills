#!/usr/bin/env node
// Tries a converted channel on synthetic messages, on files only. It writes inputs made with
// @cosyte/synth into the channel's tests/, saves the channel's current output for each as its
// expected file, marked unreviewed in tests/.unreviewed, then runs `pathways test` and, with
// --pairs, `pathways verify --samples`, which names where an output differs by field path.
//
//   node try-channel.mjs --project <project> --channel <name> [--count 5] [--seed 1]
//                        [--kind ADT^A01] [--pairs <dir>]
//
// It uses the project's own @cosyte/pathways and @cosyte/synth and installs nothing. It never runs
// `pathways start`, so no source listens and no destination sends: `pathways test` and
// `pathways verify --samples` read files and open no database and no connection. It never runs an
// exported script. An expected file a person already reviewed is put back byte for byte.
//
// Exit codes: 0 every test passed; 1 a test or a compare failed; 2 refused (the arguments, or a
// package the project lacks).

if (Number(process.versions.node.split(".")[0]) < 22) {
  process.stderr.write("try-channel: needs Node.js 22 or later\n");
  process.exit(2);
}

const { parseArgs } = await import("node:util");
const { readFileSync, writeFileSync, existsSync, readdirSync } = await import("node:fs");
const { join, resolve } = await import("node:path");
const { spawnSync } = await import("node:child_process");
const { createRequire } = await import("node:module");
const { pathToFileURL } = await import("node:url");

const INSTALL = "npm install --save-dev @cosyte/pathways @cosyte/synth @cosyte/hl7 @cosyte/fhir";

function refuse(message) {
  process.stderr.write(`try-channel: ${message}\n`);
  process.exit(2);
}

let args;
try {
  args = parseArgs({
    options: {
      project: { type: "string" },
      channel: { type: "string" },
      count: { type: "string", default: "5" },
      seed: { type: "string", default: "1" },
      kind: { type: "string" },
      pairs: { type: "string" },
    },
  });
} catch (err) {
  refuse(err.message);
}
const v = args.values;
if (v.project === undefined || v.channel === undefined) refuse("usage: try-channel.mjs --project <project> --channel <name> [--count 5] [--seed 1] [--kind ADT^A01] [--pairs <dir>]");
if (!/^[a-z0-9][a-z0-9-]*$/.test(v.channel)) refuse("--channel takes a channel name: lowercase letters, digits and hyphens");
const count = Number(v.count);
const seed = Number(v.seed);
if (!Number.isInteger(count) || count < 1 || count > 100) refuse("--count takes a whole number from 1 to 100");
if (!Number.isInteger(seed) || seed < 0 || seed > 2 ** 31) refuse("--seed takes a whole number from 0 to 2147483648");

const project = resolve(v.project);
const channelDir = join(project, "channels", v.channel);
const testsDir = join(channelDir, "tests");
if (!existsSync(join(channelDir, "channel.yaml"))) refuse(`there is no channels/${v.channel}/channel.yaml in the project`);

// The project's own packages, never a download.
const pathwaysPkg = join(project, "node_modules", "@cosyte", "pathways", "package.json");
if (!existsSync(pathwaysPkg)) refuse(`the project has no @cosyte/pathways; in the project run: ${INSTALL}`);
const bin = JSON.parse(readFileSync(pathwaysPkg, "utf8")).bin?.pathways;
if (typeof bin !== "string") refuse("the project's @cosyte/pathways names no pathways command");
const pathwaysBin = join(project, "node_modules", "@cosyte", "pathways", bin);

const yaml = readFileSync(join(channelDir, "channel.yaml"), "utf8");
const format = /^format:\s*([a-z0-9]+)\s*$/m.exec(yaml)?.[1] ?? "hl7v2";
const requireFromProject = createRequire(join(project, "package.json"));
async function load(spec) {
  try {
    return await import(pathToFileURL(requireFromProject.resolve(spec)).href);
  } catch {
    refuse(`the project cannot load ${spec}; in the project run: ${INSTALL}`);
  }
}

let artifacts;
let ext;
if (format === "hl7v2") {
  const synth = await load("@cosyte/synth/hl7");
  artifacts = synth.hl7Corpus({ seed, count, ...(v.kind === undefined ? {} : { mix: [v.kind] }) }).artifacts;
  ext = "hl7";
} else if (format === "fhir") {
  const synth = await load("@cosyte/synth/fhir");
  artifacts = synth.fhirCorpus({ seed, count }).artifacts;
  ext = "json";
} else {
  refuse(`this script makes hl7v2 and fhir inputs; for format ${format}, write synthetic inputs by hand into channels/${v.channel}/tests/`);
}

// Inputs. A file that is already there is left as it is.
const listFile = (name) => join(testsDir, name);
const readList = (name) => (existsSync(listFile(name)) ? readFileSync(listFile(name), "utf8").split("\n").map((s) => s.trim()).filter(Boolean) : []);
const writeList = (name, items) => writeFileSync(listFile(name), `${[...new Set(items)].sort().join("\n")}\n`);
const synthetic = readList(".synthetic");
const made = [];
const { mkdirSync } = await import("node:fs");
mkdirSync(testsDir, { recursive: true });
artifacts.forEach((a, i) => {
  const file = `synth-${seed}-${String(i + 1).padStart(3, "0")}.${ext}`;
  if (!existsSync(join(testsDir, file))) writeFileSync(join(testsDir, file), a.content);
  made.push(file);
});
writeList(".synthetic", [...synthetic, ...made]);

// Every { env: NAME } the channel reads must be set for `pathways test` to load it. A variable that
// is not set gets a placeholder in the test run only, and the run says which.
const env = { ...process.env };
const placeholders = [];
for (const m of yaml.matchAll(/^\s*env:\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/gm)) {
  if (env[m[1]] === undefined || env[m[1]] === "") {
    env[m[1]] = "placeholder-set-by-try-channel";
    placeholders.push(m[1]);
  }
}

function pathways(argv) {
  const r = spawnSync(process.execPath, [pathwaysBin, ...argv], { cwd: project, env, encoding: "utf8", timeout: 600_000 });
  process.stdout.write(r.stdout ?? "");
  process.stderr.write(r.stderr ?? "");
  return r.status ?? 1;
}

// Save outputs for the new inputs, and put back every expected file a person already reviewed.
const unreviewed = new Set(readList(".unreviewed"));
const isExpected = (f) => f.includes(".expected");
const before = new Map();
for (const f of readdirSync(testsDir).filter(isExpected)) {
  if (!unreviewed.has(f)) before.set(f, readFileSync(join(testsDir, f)));
}
pathways(["test", v.channel, "--update"]);
for (const f of readdirSync(testsDir).filter(isExpected)) {
  if (before.has(f)) writeFileSync(join(testsDir, f), before.get(f));
  else unreviewed.add(f);
}
writeList(".unreviewed", [...unreviewed]);

const tested = pathways(["test", v.channel]);
let verified = 0;
if (v.pairs !== undefined) verified = pathways(["verify", "--channel", v.channel, "--samples", resolve(v.pairs)]);

process.stdout.write(
  `try-channel: ${made.length} synthetic input(s) in channels/${v.channel}/tests; ` +
    `${unreviewed.size} expected file(s) marked unreviewed in tests/.unreviewed.\n` +
    (placeholders.length > 0 ? `try-channel: placeholders set for this run only: ${placeholders.join(", ")}.\n` : "") +
    "try-channel: an expected file written here records what the channel does now, not what it should do: review each against the other engine's output.\n",
);
process.exit(tested === 0 && verified === 0 ? 0 : 1);
