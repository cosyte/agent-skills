// Tests for try-channel.mjs that need no installed packages. Run with: node --test
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "..", "scripts", "try-channel.mjs");

function run(args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

// Every temporary folder a test makes, removed once the tests end.
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

function project() {
  const dir = mkdtempSync(join(tmpdir(), "pathways-try-test-"));
  made.push(dir);
  mkdirSync(join(dir, "channels", "synth-adt-feed", "tests"), { recursive: true });
  writeFileSync(join(dir, "channels", "synth-adt-feed", "channel.yaml"), "name: synth-adt-feed\nformat: hl7v2\n");
  return dir;
}

test("refuses a channel name that is not a Pathways channel name", () => {
  const r = run(["--project", project(), "--channel", "../x"]);
  assert.equal(r.code, 2);
  assert.match(r.err, /channel name/);
});

test("names the packages to install when the project has none, and runs nothing", () => {
  const r = run(["--project", project(), "--channel", "synth-adt-feed"]);
  assert.equal(r.code, 2);
  assert.match(r.err, /@cosyte\/pathways/);
  assert.match(r.err, /npm install --save-dev/);
});

test("refuses a count outside 1 to 100", () => {
  const r = run(["--project", project(), "--channel", "synth-adt-feed", "--count", "1000"]);
  assert.equal(r.code, 2);
});

// A project with stand-in packages: a pathways command that does nothing and a synth module that
// returns fixed, plainly fake messages. Nothing here is downloaded or installed.
function projectWithStandIns() {
  const dir = project();
  const pw = join(dir, "node_modules", "@cosyte", "pathways");
  mkdirSync(join(pw, "bin"), { recursive: true });
  writeFileSync(join(pw, "package.json"), JSON.stringify({ name: "@cosyte/pathways", version: "0.0.0", bin: { pathways: "bin/pathways.mjs" } }));
  writeFileSync(join(pw, "bin", "pathways.mjs"), "process.exit(0);\n");
  const synth = join(dir, "node_modules", "@cosyte", "synth");
  mkdirSync(synth, { recursive: true });
  writeFileSync(join(synth, "package.json"), JSON.stringify({ name: "@cosyte/synth", version: "0.0.0", type: "module", exports: { "./hl7": "./hl7.mjs" } }));
  writeFileSync(
    join(synth, "hl7.mjs"),
    "export function hl7Corpus({ count }) {\n" +
      "  return { artifacts: Array.from({ length: count }, (_, i) => ({ content: `MSH|^~\\\\&|SYNTH|SYNTH|||20260101||ADT^A01|SYNTH${i}|P|2.5.1\\r` })) };\n" +
      "}\n",
  );
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "synth-project", private: true }));
  return dir;
}

test("marks as synthetic only the inputs it wrote, never a file that was already there", () => {
  const dir = projectWithStandIns();
  const tests = join(dir, "channels", "synth-adt-feed", "tests");
  writeFileSync(join(tests, "synth-1-001.hl7"), "a file a person put here\n");
  const r = run(["--project", dir, "--channel", "synth-adt-feed", "--count", "2", "--seed", "1"]);
  assert.equal(r.code, 0, r.out + r.err);
  const listed = readFileSync(join(tests, ".synthetic"), "utf8").split("\n").filter(Boolean);
  assert.deepEqual(listed, ["synth-1-002.hl7"]);
  assert.equal(readFileSync(join(tests, "synth-1-001.hl7"), "utf8"), "a file a person put here\n");
  assert.match(r.out, /1 synthetic input\(s\) written/);
  assert.match(r.out, /synth-1-001\.hl7 was already there/);
});
