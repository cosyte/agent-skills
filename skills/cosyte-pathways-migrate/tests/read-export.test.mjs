// Tests for read-export.mjs and check-migration.mjs, on synthetic exports written from scratch.
// Run with: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync, statSync, rmSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const scripts = join(here, "..", "scripts");
const fixtures = join(here, "fixtures");
const exportFile = join(fixtures, "synth-adt-feed.xml");
const configMap = join(fixtures, "synth-config-map.xml");

function run(script, args) {
  const r = spawnSync(process.execPath, [join(scripts, script), ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function scratch() {
  return mkdtempSync(join(tmpdir(), "pathways-migrate-test-"));
}

function files(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...files(full));
    else out.push(full);
  }
  return out;
}

function allText(dir) {
  return files(dir).map((f) => readFileSync(f, "utf8")).join("\n");
}

function convert(extra = []) {
  const project = scratch();
  const r = run("read-export.mjs", [exportFile, "--out", project, "--config-map", configMap, ...extra]);
  return { project, ...r };
}

test("writes the channel skeleton the golden files describe, and exits 1 while steps wait", () => {
  const { project, code, err } = convert();
  assert.equal(code, 1, err);
  const channel = join(project, "channels", "synth-adt-feed");
  for (const name of ["channel.yaml", "transform.ts"]) {
    const golden = readFileSync(join(fixtures, "expected", name), "utf8");
    assert.equal(readFileSync(join(channel, name), "utf8"), golden, `${name} differs from its golden file`);
  }
  assert.ok(existsSync(join(channel, "shared", "synth-helpers-padleft.ts")));
  const model = JSON.parse(readFileSync(join(project, "migration", "synth-adt-feed", "model.json"), "utf8"));
  assert.equal(model.format, "cosyte-pathways-migrate/1");
  assert.equal(model.channel.name, "synth-adt-feed");
  assert.equal(model.source.kind, "mllp");
  assert.deepEqual(
    model.destinations.map((d) => d.kind),
    ["file", "http", null],
  );
});

test("never runs or evaluates an exported script", () => {
  // The fixture's deploy script would write to a map, and a step calls eval: if either ran, the
  // reader would need a script engine. The reader has none, and imports no vm or worker module.
  for (const f of readdirSync(scripts).filter((n) => n.endsWith(".mjs"))) {
    const text = readFileSync(join(scripts, f), "utf8");
    assert.ok(!/from "node:(vm|worker_threads)"/.test(text), `${f} imports a script runner`);
    assert.ok(!/\beval\s*\(|new Function\s*\(/.test(text.replace(/\/\/.*$/gm, "")), `${f} evaluates code`);
  }
});

test("turns secrets into environment references and never writes their values", () => {
  const { project } = convert();
  const text = allText(project);
  assert.ok(!text.includes("not-a-real-secret-0000"), "a secret value was written");
  const yaml = readFileSync(join(project, "channels", "synth-adt-feed", "channel.yaml"), "utf8");
  assert.match(yaml, /RESULTS_API_PASSWORD/);
  assert.match(yaml, /siteCode: "SYNTHSITE"/);
});

test("drops embedded sample data unless it is confirmed synthetic", () => {
  const dropped = convert();
  assert.ok(!allText(dropped.project).includes("TESTPATIENT"), "a sample message was written");
  const report = JSON.parse(readFileSync(join(dropped.project, "migration", "synth-adt-feed", "report.json"), "utf8"));
  const sample = report.elements.find((e) => e.kind === "sample");
  assert.equal(sample.status, "not-converted");
  assert.match(sample.reason, /dropped/);

  const kept = convert(["--keep-samples-synthetic"]);
  const sampleFile = join(kept.project, "channels", "synth-adt-feed", "tests", "sample-source-inbound.hl7");
  assert.ok(readFileSync(sampleFile, "utf8").startsWith("MSH|"));
  assert.ok(!existsSync(join(kept.project, "channels", "synth-adt-feed", "tests", "sample-source-inbound.expected.hl7")));
});

test("the report lists every element with a status, and dynamic constructs by file and line only", () => {
  const { project } = convert();
  const dir = join(project, "migration", "synth-adt-feed");
  const report = JSON.parse(readFileSync(join(dir, "report.json"), "utf8"));
  const statuses = new Set(["converted", "converted-with-flag", "rewritten", "rewrite-pending", "not-converted"]);
  assert.ok(report.elements.length >= 15);
  for (const e of report.elements) {
    assert.ok(statuses.has(e.status), `${e.id}: ${e.status}`);
    if (e.status === "not-converted" || e.status === "converted-with-flag") assert.ok(e.reason, `${e.id} has no reason`);
  }
  const channelWriter = report.elements.find((e) => e.id === "D3");
  assert.equal(channelWriter.status, "not-converted");
  const xslt = report.elements.find((e) => e.id === "S3");
  assert.equal(xslt.status, "not-converted");
  const evalHit = report.dynamic.find((d) => d.construct === "eval");
  assert.match(evalHit.file, /^source\/D1-S1-stamp\.js$/);
  assert.equal(evalHit.line, 1);
  const md = readFileSync(join(dir, "MIGRATION-REPORT.md"), "utf8");
  assert.match(md, /starting point/);
  assert.ok(!md.includes("1 + 1"), "the report quotes script content");
  assert.ok(!JSON.stringify(report).includes("1 + 1"), "the JSON report quotes script content");
  assert.ok(report.summary.pendingSteps > 0);
});

test("check-migration exits 0 once every step is rewritten or dropped", () => {
  const { project } = convert();
  const channel = join(project, "channels", "synth-adt-feed");
  let pending = run("check-migration.mjs", ["--project", project, "--channel", "synth-adt-feed"]);
  assert.equal(pending.code, 1, pending.err);
  for (const f of files(channel).filter((n) => n.endsWith(".ts"))) {
    const text = readFileSync(f, "utf8");
    writeFileSync(f, text.replace(/migrate: (\S+) pending/g, "migrate: $1 rewritten"));
  }
  // One step dropped with a reason instead.
  const t = join(channel, "transform.ts");
  writeFileSync(t, readFileSync(t, "utf8").replace("migrate: S3 rewritten", "migrate: S3 dropped: disabled in the export"));
  const done = run("check-migration.mjs", ["--project", project, "--channel", "synth-adt-feed"]);
  assert.equal(done.code, 0, done.out + done.err);
  const report = JSON.parse(readFileSync(join(project, "migration", "synth-adt-feed", "report.json"), "utf8"));
  assert.equal(report.summary.pendingSteps, 0);
  assert.equal(report.elements.find((e) => e.id === "S1").status, "rewritten");
  const s3 = report.elements.find((e) => e.id === "S3");
  assert.equal(s3.status, "not-converted");
  assert.match(s3.reason, /dropped: disabled in the export/);
});

test("check-migration refuses a step whose marker was deleted rather than resolved", () => {
  const { project } = convert();
  const t = join(project, "channels", "synth-adt-feed", "transform.ts");
  writeFileSync(t, readFileSync(t, "utf8").replace(/.*migrate: S1 pending.*\n/, ""));
  const r = run("check-migration.mjs", ["--project", project, "--channel", "synth-adt-feed"]);
  assert.equal(r.code, 1);
  const report = JSON.parse(readFileSync(join(project, "migration", "synth-adt-feed", "report.json"), "utf8"));
  assert.equal(report.elements.find((e) => e.id === "S1").status, "rewrite-pending");
  assert.match(report.elements.find((e) => e.id === "S1").reason, /marker/);
});

test("the PHI scan runs on the output and names a finding by file and line, never its value", () => {
  const { project } = convert();
  const t = join(project, "channels", "synth-adt-feed", "transform.ts");
  // Built here so this file never holds an identifier-shaped string.
  const planted = ["9", "0", "0"].join("") + "-" + "7" + "0" + "-" + ["0", "0", "0", "1"].join("");
  writeFileSync(t, `${readFileSync(t, "utf8")}\n// ${planted}\n`);
  const r = run("check-migration.mjs", ["--project", project, "--channel", "synth-adt-feed"]);
  assert.equal(r.code, 3, r.out + r.err);
  assert.ok(!(r.out + r.err).includes(planted));
  const report = JSON.parse(readFileSync(join(project, "migration", "synth-adt-feed", "report.json"), "utf8"));
  assert.equal(report.phi[0].file, "channels/synth-adt-feed/transform.ts");
  assert.equal(report.phi[0].kind, "ssn");
  assert.ok(report.phi[0].line > 1);
  assert.ok(!JSON.stringify(report).includes(planted));
});

test("a hostile export is refused and nothing is written", () => {
  const project = scratch();
  const hostile = join(project, "hostile.xml");
  writeFileSync(hostile, '<!DOCTYPE channel [<!ENTITY x SYSTEM "file:///etc/hostname">]><channel><name>&x;</name></channel>');
  const r = run("read-export.mjs", [hostile, "--out", join(project, "out")]);
  assert.equal(r.code, 2);
  assert.match(r.err, /XML_DOCTYPE_REFUSED/);
  assert.ok(!existsSync(join(project, "out")));
});

test("a channel or step name cannot climb out of the project", () => {
  const work = scratch();
  const project = join(work, "project");
  const xml = readFileSync(exportFile, "utf8")
    .replace("<name>Synth ADT Feed</name>", "<name>../../../evil/..\\x</name>")
    .replace("<name>Stamp</name>", "<name>../../../../escape</name>")
    .replace("<name>Synth Helpers</name>", "<name>/abs/olute</name>");
  const hostile = join(work, "names.xml");
  writeFileSync(hostile, xml);
  const r = run("read-export.mjs", [hostile, "--out", project]);
  assert.equal(r.code, 1, r.err);
  const written = files(project).map((f) => relative(project, f));
  for (const f of written) assert.ok(!f.startsWith(".."), `${f} is outside the project`);
  assert.ok(existsSync(join(project, "channels", "evil-x", "channel.yaml")));
  assert.deepEqual(readdirSync(work).sort(), ["names.xml", "project"]);
  assert.ok(written.some((f) => f.split(sep).join("/") === "migration/evil-x/source/D1-S1-escape.js"));
});

test("an existing channel folder is never overwritten", () => {
  const { project } = convert();
  const again = run("read-export.mjs", [exportFile, "--out", project]);
  assert.equal(again.code, 2);
  assert.match(again.err, /already exists/);
});

test("a name the export does not give is refused with a usage error", () => {
  const work = scratch();
  const bad = join(work, "noname.xml");
  writeFileSync(bad, "<channel><name>   </name></channel>");
  const r = run("read-export.mjs", [bad, "--out", join(work, "p")]);
  assert.equal(r.code, 2);
  rmSync(work, { recursive: true, force: true });
});

test("a file that is not a channel export is refused", () => {
  const work = scratch();
  const bad = join(work, "other.xml");
  writeFileSync(bad, "<project><name>x</name></project>");
  const r = run("read-export.mjs", [bad, "--out", join(work, "p")]);
  assert.equal(r.code, 2);
  assert.match(r.err, /not a channel export/);
  assert.ok(statSync(work).isDirectory());
});
