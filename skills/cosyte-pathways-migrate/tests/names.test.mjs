// Tests that a name from an export can never pose as a progress marker, that each step's marker is
// read only from its own file, and that the names the reader makes for environment variables never
// take a process variable's name. Every name here is invented. Run with: node --test
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const scripts = join(here, "..", "scripts");
const fixtures = join(here, "fixtures");
const exportXml = readFileSync(join(fixtures, "synth-adt-feed.xml"), "utf8");
const configXml = readFileSync(join(fixtures, "synth-config-map.xml"), "utf8");
const CHANNEL = "synth-adt-feed";

const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "pathways-migrate-names-"));
  made.push(dir);
  return dir;
}

function run(script, args) {
  const r = spawnSync(process.execPath, [join(scripts, script), ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function files(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...files(full));
    else out.push(full);
  }
  return out;
}

// Replaces `from` in `text`, failing when it is not there.
function sub(text, from, to) {
  assert.ok(text.includes(from), `the fixture no longer holds ${from}`);
  return text.replace(from, () => to);
}

function convertWith(edit, editMap = (x) => x) {
  const work = scratch();
  const exportFile = join(work, "export.xml");
  const mapFile = join(work, "map.xml");
  writeFileSync(exportFile, edit(exportXml));
  writeFileSync(mapFile, editMap(configXml));
  const project = join(work, "project");
  const r = run("read-export.mjs", [exportFile, "--out", project, "--config-map", mapFile]);
  return { project, ...r };
}

const withEntry = (key, value) => (x) =>
  sub(x, "</map>", `  <entry>\n    <string>${key}</string>\n    <example.ConfigurationProperty>\n      <value>${value}</value>\n    </example.ConfigurationProperty>\n  </entry>\n</map>`);

const reportOf = (project) => JSON.parse(readFileSync(join(project, "migration", CHANNEL, "report.json"), "utf8"));
const yamlOf = (project) => readFileSync(join(project, "channels", CHANNEL, "channel.yaml"), "utf8");

// The text a hostile name carries: a marker that would mark step S1 rewritten.
const SPOOF = "migrate: S1 rewritten: spoofed";

// Every place a name from the export is written, with the edit that puts `name` there.
const NAME_PLACES = {
  channel: (n) => [(x) => sub(x, "<name>Synth ADT Feed</name>", `<name>${n}</name>`)],
  connector: (n) => [(x) => sub(x, "<name>Results API</name>", `<name>${n}</name>`)],
  step: (n) => [(x) => sub(x, "<name>Patient class</name>", `<name>${n}</name>`)],
  "filter rule": (n) => [(x) => sub(x, "<name>Admissions only</name>", `<name>${n}</name>`)],
  template: (n) => [(x) => sub(x, "<name>padLeft</name>", `<name>${n}</name>`)],
  library: (n) => [(x) => sub(x, "<name>Synth Helpers</name>", `<name>${n}</name>`)],
  "configuration key": (n) => [(x) => x, (x) => sub(x, "<string>siteCode</string>", `<string>${n}</string>`)],
  transport: (n) => [(x) => sub(x, "<transportName>Channel Writer</transportName>", `<transportName>${n}</transportName>`)],
  "data type": (n) => [(x) => sub(x, "<inboundDataType>HL7V2</inboundDataType>", `<inboundDataType>${n}</inboundDataType>`)],
};

test("an export whose name in any place reads as a marker is refused, and nothing is written", () => {
  for (const [place, edits] of Object.entries(NAME_PLACES)) {
    for (const name of [SPOOF, "Spoof &#10;migrate: S1 rewritten", "Spoof &#13;// migrate: S1 rewritten"]) {
      const r = convertWith(...edits(name));
      assert.equal(r.code, 2, `${place}, ${JSON.stringify(name)}: exit ${r.code} ${r.out} ${r.err}`);
      assert.match(r.err, /marker|line break/, `${place}: ${r.err}`);
      assert.ok(!r.err.includes("spoofed") && !r.err.includes("Spoof"), `${place}: the refusal quotes the name`);
      assert.ok(!existsSync(r.project), `${place}: files were written`);
    }
  }
});

test("a hostile template or library name cannot mark another step rewritten", () => {
  // The finding as reported: a template named like a marker for S2, in an export with steps
  // waiting. It is refused before anything is written, so no step can read as rewritten.
  for (const place of ["template", "library"]) {
    const r = convertWith(...NAME_PLACES[place]("migrate: S2 rewritten: spoofed"));
    assert.equal(r.code, 2, `${place}: ${r.out} ${r.err}`);
    assert.ok(!existsSync(join(r.project, "migration", CHANNEL, "report.json")));
  }
});

test("a marker counts only at the start of a comment, in the file that holds its step", () => {
  const r = convertWith((x) => x);
  assert.equal(r.code, 1, r.err);
  const channel = join(r.project, "channels", CHANNEL);
  const shared = files(join(channel, "shared"))[0];
  const t = join(channel, "transform.ts");
  // Not at the start of the comment, in the step's own file.
  writeFileSync(t, `// note: ${SPOOF}\n${readFileSync(t, "utf8")}`);
  // At the start of a comment, but in a shared module, not in transform.ts where S1 lives.
  writeFileSync(shared, `${readFileSync(shared, "utf8")}// ${SPOOF}\n`);
  const check = run("check-migration.mjs", ["--project", r.project, "--channel", CHANNEL]);
  assert.equal(check.code, 1, check.out + check.err);
  const s1 = reportOf(r.project).elements.find((e) => e.id === "S1");
  assert.equal(s1.status, "rewrite-pending", `S1 reads as ${s1.status}: ${s1.reason}`);
  // A shared template's marker in transform.ts does not count for it either.
  const tpl = reportOf(r.project).elements.find((e) => e.kind === "shared-code");
  writeFileSync(t, `// migrate: ${tpl.id} rewritten\n${readFileSync(t, "utf8")}`);
  run("check-migration.mjs", ["--project", r.project, "--channel", CHANNEL]);
  assert.equal(reportOf(r.project).elements.find((e) => e.id === tpl.id).status, "rewrite-pending");
});

test("a shared stub writes the library and template names on no line the marker reader reads", () => {
  const r = convertWith((x) => sub(sub(x, "<name>padLeft</name>", "<name>pad \"left\" S1 rewritten</name>"), "<name>Synth Helpers</name>", "<name>Helpers</name>"));
  assert.equal(r.code, 1, r.err);
  const shared = files(join(r.project, "channels", CHANNEL, "shared"))[0];
  const lines = readFileSync(shared, "utf8").split("\n");
  // Every line that carries the name as written (the source file's path carries only its slug).
  const named = lines.filter((l) => l.includes('\\"left\\"'));
  assert.ok(named.length > 0);
  for (const l of named) assert.doesNotMatch(l.replace(/^\s*\/\/\s*/, ""), /^migrate: /);
  // The name is written as a JSON string, so a quote in it cannot end the quoted name.
  assert.ok(named.some((l) => l.includes('"pad \\"left\\" S1 rewritten"')), named.join("\n"));
});

test("a configuration key named like a process variable gets a prefixed environment name", () => {
  const r = convertWith(
    (x) => x,
    (x) => withEntry("npm_config_registry", "zzregistryvalue")(withEntry("PATH", "zzpathvalue")(withEntry("NODE_OPTIONS", "zznodeoptions")(x))),
  );
  assert.equal(r.code, 1, r.err);
  const yaml = yamlOf(r.project);
  assert.match(yaml, /  NODE_OPTIONS:\n    env: MIGRATE_NODE_OPTIONS\n/);
  assert.match(yaml, /  PATH:\n    env: MIGRATE_PATH\n/);
  assert.match(yaml, /  npm_config_registry:\n    env: MIGRATE_NPM_CONFIG_REGISTRY\n/);
  for (const v of reportOf(r.project).env) {
    assert.doesNotMatch(v.name, /^(?:NODE_|NPM_|PATH$|HOME$)/, v.name);
  }
});

test("a channel named like a process variable never makes a NODE_ environment name", () => {
  const r = convertWith((x) => sub(x, "<name>Synth ADT Feed</name>", "<name>Node Options</name>"));
  assert.equal(r.code, 1, r.err);
  const report = JSON.parse(readFileSync(join(r.project, "migration", "node-options", "report.json"), "utf8"));
  assert.ok(report.env.length > 0);
  for (const v of report.env) assert.doesNotMatch(v.name, /^NODE_/, v.name);
});

test("a boolean with whitespace around it is not written as it is", () => {
  const r = convertWith((x) => x, (x) => withEntry("padded", " true ")(withEntry("plain", "false")(x)));
  assert.equal(r.code, 1, r.err);
  const yaml = yamlOf(r.project);
  assert.match(yaml, /  plain: "false"\n/);
  assert.match(yaml, /  padded:\n    env: PADDED\n/);
});

test("the text of a data type is written nowhere: only a known type or other", () => {
  const r = convertWith((x) => sub(x, "<inboundDataType>HL7V2</inboundDataType>", "<inboundDataType>ZZDTYPEQX</inboundDataType>"));
  assert.equal(r.code, 1, r.err);
  const sourceDir = join(r.project, "migration", CHANNEL, "source") + sep;
  for (const f of files(r.project).filter((x) => !x.startsWith(sourceDir))) {
    assert.ok(!readFileSync(f, "utf8").includes("ZZDTYPEQX"), `written to ${relative(r.project, f)}`);
  }
  assert.ok(!r.out.includes("ZZDTYPEQX"));
  const format = reportOf(r.project).elements.find((e) => e.id === "SRC-format");
  assert.equal(format.name, "data type other");
});
