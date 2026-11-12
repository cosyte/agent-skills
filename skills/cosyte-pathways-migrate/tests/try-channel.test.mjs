// Tests for try-channel.mjs that need no installed packages. Run with: node --test
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "..", "scripts", "try-channel.mjs");

function run(args, env = process.env) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env });
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

test("gives each unset variable a placeholder its setting accepts, so the channel loads", () => {
  const dir = projectWithStandIns();
  const channel = join(dir, "channels", "synth-adt-feed");
  writeFileSync(
    join(channel, "channel.yaml"),
    [
      "name: synth-adt-feed",
      "format: hl7v2",
      "source:",
      "  mllp:",
      "    port:",
      "      env: SYNTH_SRC_PORT",
      '    host: "127.0.0.1"',
      "    plaintext: true",
      "destinations:",
      "  - http:",
      "      url:",
      "        env: SYNTH_PLAIN_URL",
      "      plaintext: true",
      "    dryRun: true",
      "  - http:",
      "      url:",
      "        env: SYNTH_TLS_URL",
      "      headers:",
      "        Authorization:",
      "          env: SYNTH_AUTH",
      "    dryRun: true",
      "  - tcp:",
      "      host:",
      "        env: SYNTH_TCP_HOST",
      "      port:",
      "        env: SYNTH_TCP_PORT",
      "      plaintext: true",
      "    dryRun: true",
      "  - file:",
      "      dir:",
      "        env: SYNTH_OUT_DIR",
      "    dryRun: true",
      "config:",
      "  siteCode:",
      "    env: SITE_CODE",
      "",
    ].join("\n"),
  );
  // The stand-in pathways command records the environment it was given, then exits 0.
  writeFileSync(
    join(dir, "node_modules", "@cosyte", "pathways", "bin", "pathways.mjs"),
    'import { writeFileSync } from "node:fs";\n' +
      'const seen = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(SYNTH_|SITE_)/.test(k)));\n' +
      'writeFileSync("seen-env.json", JSON.stringify(seen));\n',
  );
  const r = run(["--project", dir, "--channel", "synth-adt-feed", "--count", "1"]);
  assert.equal(r.code, 0, r.out + r.err);
  const seen = JSON.parse(readFileSync(join(dir, "seen-env.json"), "utf8"));
  assert.match(seen.SYNTH_SRC_PORT, /^[0-9]+$/);
  assert.match(seen.SYNTH_TCP_PORT, /^[0-9]+$/);
  assert.equal(seen.SYNTH_TCP_HOST, "127.0.0.1");
  assert.match(seen.SYNTH_PLAIN_URL, /^http:\/\/127\.0\.0\.1[:/]/);
  assert.match(seen.SYNTH_TLS_URL, /^https:\/\/127\.0\.0\.1[:/]/);
  assert.ok(seen.SYNTH_OUT_DIR.length > 0);
  assert.ok(seen.SYNTH_AUTH.length > 0);
  assert.ok(seen.SITE_CODE.length > 0);
  assert.match(r.out, /placeholders set for this run only: .*SYNTH_SRC_PORT/);
});

// A channel that reads a host, a port, a URL and a configuration value from the environment, and a
// stand-in pathways command that records every variable it was given.
function projectThatRecordsEnv(extraYaml = []) {
  const dir = projectWithStandIns();
  writeFileSync(
    join(dir, "channels", "synth-adt-feed", "channel.yaml"),
    [
      "name: synth-adt-feed",
      "format: hl7v2",
      "destinations:",
      "  - http:",
      "      url:",
      "        env: SYNTH_ADT_FEED_D2_URL",
      "    dryRun: true",
      "  - tcp:",
      "      host:",
      "        env: SYNTH_TCP_HOST",
      "      port:",
      "        env: SYNTH_TCP_PORT",
      "      plaintext: true",
      "    dryRun: true",
      "config:",
      "  siteCode:",
      "    env: SITE_CODE",
      ...extraYaml,
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, "node_modules", "@cosyte", "pathways", "bin", "pathways.mjs"),
    'import { writeFileSync } from "node:fs";\nwriteFileSync("seen-env.json", JSON.stringify(process.env));\n',
  );
  return dir;
}

test("never passes a real value from the shell to the channel, even when it is set", () => {
  const dir = projectThatRecordsEnv();
  const real = {
    SYNTH_ADT_FEED_D2_URL: "https://zzrealurl.example.test/in",
    SYNTH_TCP_HOST: "zzrealhost.example.test",
    SYNTH_TCP_PORT: "41999",
    SITE_CODE: "ZZREALSITE",
    ZZ_UNRELATED_SECRET: "zzunrelatedvalue",
  };
  const r = run(["--project", dir, "--channel", "synth-adt-feed", "--count", "1"], { ...process.env, ...real });
  assert.equal(r.code, 0, r.out + r.err);
  const raw = readFileSync(join(dir, "seen-env.json"), "utf8");
  for (const value of Object.values(real)) assert.ok(!raw.includes(value), `${value} reached the child process`);
  const seen = JSON.parse(raw);
  assert.equal(seen.SYNTH_TCP_HOST, "127.0.0.1");
  assert.equal(seen.SYNTH_TCP_PORT, "2575");
  assert.match(seen.SYNTH_ADT_FEED_D2_URL, /^https:\/\/127\.0\.0\.1[:/]/);
  assert.equal(seen.SITE_CODE, "placeholder-set-by-try-channel");
  assert.equal(seen.ZZ_UNRELATED_SECRET, undefined);
  assert.ok(typeof seen.PATH === "string" || typeof seen.Path === "string", "the child has no PATH");
  assert.match(r.out, /placeholders set for this run only: .*SYNTH_TCP_HOST/);
});

test("refuses a channel that reads a process variable such as NODE_OPTIONS from the environment", () => {
  for (const name of ["NODE_OPTIONS", "PATH", "npm_config_registry"]) {
    const dir = projectThatRecordsEnv(["  extra:", `    env: ${name}`]);
    const r = run(["--project", dir, "--channel", "synth-adt-feed", "--count", "1"]);
    assert.equal(r.code, 2, `${name}: ${r.out} ${r.err}`);
    assert.match(r.err, new RegExp(name));
    assert.ok(!existsSync(join(dir, "seen-env.json")), `${name}: pathways ran`);
  }
});
