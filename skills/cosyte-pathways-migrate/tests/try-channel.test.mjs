// Tests for try-channel.mjs that need no installed packages. Run with: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "..", "scripts", "try-channel.mjs");

function run(args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function project() {
  const dir = mkdtempSync(join(tmpdir(), "pathways-try-test-"));
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
