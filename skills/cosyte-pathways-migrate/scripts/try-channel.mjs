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
// `pathways start`. In the Pathways 0.0.3 source at its release tag, `pathways test` runs only each
// channel's transform on the files in tests/ and builds no source and no destination; that was not
// confirmed from the published package, and the transform itself runs, so run this only in a
// project whose destinations cannot reach a real system. It never runs an exported script. An
// expected file a person already reviewed is put back byte for byte, and only an input this run
// wrote is listed in tests/.synthetic.
//
// It deliberately ignores the real settings. Every { env: NAME } in channel.yaml gets a placeholder
// on this machine, whatever the shell holds for NAME, and the pathways command gets no other
// variable from the shell but a short fixed list a process needs (PATH, HOME, the temporary folder
// and their Windows counterparts). So a host, a port, a URL or a configuration value set for the
// real channel never reaches the transform that runs here. A channel that reads a variable a
// process uses for itself (PATH, NODE_OPTIONS, any NODE_ or npm_ name) is refused: rename it.
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
// The environment of the pathways command, built from nothing: a fixed list of variables a process
// needs, copied from the shell, and a placeholder for every { env: NAME } the channel reads, whatever
// the shell holds for NAME. The placeholder is one the setting accepts, so the channel loads: a
// port, a host on this machine, or a URL on this machine with the scheme its plaintext line asks
// for. Nothing connects to it.
const PASS_THROUGH = new Set(["PATH", "PATHEXT", "HOME", "USERPROFILE", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT", "WINDIR", "COMSPEC"]);
// The same rule as the reader's: a variable a process reads for itself is never a channel's.
const PROCESS_VARIABLE = /^(?:NODE_.*|NPM_.*|LD_.*|DYLD_.*|PATH|PATHEXT|HOME|USER|USERNAME|USERPROFILE|SHELL|PWD|TMPDIR|TMP|TEMP|LANG|LC_.*|TZ|SYSTEMROOT|WINDIR|COMSPEC|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|COREPACK_.*|UV_.*|SSL_CERT_.*|HTTPS?_PROXY|NO_PROXY|ALL_PROXY|CI)$/;
const env = {};
for (const [k, value] of Object.entries(process.env)) if (PASS_THROUGH.has(k.toUpperCase())) env[k] = value;
const placeholders = [];
const yamlLines = yaml.split(/\r?\n/);
const indentOf = (line) => /^ */.exec(line)[0].length;
function placeholderFor(at) {
  const keyLine = yamlLines[at - 1] ?? "";
  const key = /^\s*(?:-\s+)?([A-Za-z][A-Za-z0-9]*):\s*$/.exec(keyLine)?.[1];
  if (key === "port") return "2575";
  if (key === "host") return "127.0.0.1";
  if (key === "url") {
    // plaintext: true beside the url, in the same block, means an http:// URL.
    const indent = indentOf(keyLine);
    let plaintext = false;
    for (const dir of [-1, 1]) {
      for (let i = at - 1 + dir; i >= 0 && i < yamlLines.length; i += dir) {
        const line = yamlLines[i];
        if (line.trim() === "" || line.trim().startsWith("#")) continue;
        if (indentOf(line) < indent) break;
        if (indentOf(line) === indent && /^\s*plaintext:\s*true\s*$/.test(line)) plaintext = true;
      }
    }
    return plaintext ? "http://127.0.0.1:9/" : "https://127.0.0.1:9/";
  }
  return "placeholder-set-by-try-channel";
}
yamlLines.forEach((line, at) => {
  const name = /^\s*env:\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(line)?.[1];
  if (name === undefined) return;
  if (PROCESS_VARIABLE.test(name.toUpperCase())) {
    refuse(`channels/${v.channel}/channel.yaml reads ${name}, a variable a process uses for itself; give the setting another variable name`);
  }
  if (placeholders.includes(name)) return;
  env[name] = placeholderFor(at);
  placeholders.push(name);
});

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
// Only a file this run wrote is listed in .synthetic: a file of the same name that was already
// there may be anything, so the PHI scan keeps reading it.
const synthetic = readList(".synthetic");
const made = [];
const kept = [];
const { mkdirSync } = await import("node:fs");
mkdirSync(testsDir, { recursive: true });
artifacts.forEach((a, i) => {
  const file = `synth-${seed}-${String(i + 1).padStart(3, "0")}.${ext}`;
  if (existsSync(join(testsDir, file))) {
    if (!synthetic.includes(file)) kept.push(file);
    return;
  }
  writeFileSync(join(testsDir, file), a.content, { flag: "wx" });
  made.push(file);
});
writeList(".synthetic", [...synthetic, ...made]);

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
  `try-channel: ${made.length} synthetic input(s) written in channels/${v.channel}/tests; ` +
    `${unreviewed.size} expected file(s) marked unreviewed in tests/.unreviewed.\n` +
    (kept.length > 0 ? `try-channel: ${kept.join(", ")} was already there and is not listed as synthetic, so the PHI scan reads it.\n` : "") +
    (placeholders.length > 0 ? `try-channel: placeholders set for this run only: ${placeholders.join(", ")}.\n` : "") +
    "try-channel: an expected file written here records what the channel does now, not what it should do: review each against the other engine's output.\n",
);
process.exit(tested === 0 && verified === 0 ? 0 : 1);
