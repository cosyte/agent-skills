// Tests that no secret from an export reaches a file the reader writes, other than the verbatim
// source copies, which are kept out of version control and scanned; that shared code templates
// never overwrite each other; and that the reader never writes through a symlinked folder.
// Every value here is invented. Run with: node --test
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, symlinkSync, rmSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const scripts = join(here, "..", "scripts");
const fixtures = join(here, "fixtures");
const exportXml = readFileSync(join(fixtures, "synth-adt-feed.xml"), "utf8");
const configXml = readFileSync(join(fixtures, "synth-config-map.xml"), "utf8");
const CHANNEL = "synth-adt-feed";

// Every temporary folder a test makes, removed once the tests end.
const made = [];
after(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});
function scratch(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
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

// Converts an export after `edit` changes its text, with a configuration map after `editMap`.
function convertWith(edit, editMap = (x) => x, extra = []) {
  const work = scratch("pathways-migrate-secret-");
  const exportFile = join(work, "export.xml");
  const mapFile = join(work, "map.xml");
  writeFileSync(exportFile, edit(exportXml));
  writeFileSync(mapFile, editMap(configXml));
  const project = join(work, "project");
  const r = run("read-export.mjs", [exportFile, "--out", project, "--config-map", mapFile, ...extra]);
  return { project, ...r };
}

// Every file the reader wrote, except the verbatim copies of exported scripts under source/.
function writtenOutsideSource(project) {
  const sourceDir = join(project, "migration", CHANNEL, "source") + sep;
  return files(project).filter((f) => !f.startsWith(sourceDir));
}

function assertNowhere(result, secret) {
  const { project, out, err } = result;
  assert.ok(!out.includes(secret), "a secret value was printed to stdout");
  assert.ok(!err.includes(secret), "a secret value was printed to stderr");
  for (const f of writtenOutsideSource(project)) {
    assert.ok(!readFileSync(f, "utf8").includes(secret), `a secret value was written to ${relative(project, f)}`);
  }
}

const yamlOf = (project) => readFileSync(join(project, "channels", CHANNEL, "channel.yaml"), "utf8");
const reportOf = (project) => JSON.parse(readFileSync(join(project, "migration", CHANNEL, "report.json"), "utf8"));
const modelOf = (project) => JSON.parse(readFileSync(join(project, "migration", CHANNEL, "model.json"), "utf8"));

// A token in the shape of a signed web token, built in pieces so this file holds no such string.
const JWT_HEAD = "eyJ" + "hbGciOiJIUzI1NiJ9";
const JWT = `${JWT_HEAD}.eyJ${"zdWIiOiJzeW50aCJ9"}.c2lnbmF0dXJl`;

// The at sign of a URL's user information, kept apart so no line of this file is shaped like an
// email address.
const AT = "@";

const API_HOST = "<host>https://results.example.test/api/adt</host>";

test("a user name and password in a connector URL become an environment reference", () => {
  const secret = "s3cr3t-value-1234";
  const r = convertWith((x) => x.replace(API_HOST, `<host>https://synthuser:${secret}${AT}results.example.test/api/adt</host>`));
  assert.equal(r.code, 1, r.err);
  assertNowhere(r, secret);
  assertNowhere(r, "synthuser:");
  const yaml = yamlOf(r.project);
  assert.match(yaml, /url:\n\s+env: SYNTH_ADT_FEED_D2_URL\n/);
  const d2 = modelOf(r.project).destinations.find((d) => d.id === "D2");
  assert.deepEqual(d2.settings.url, { env: "SYNTH_ADT_FEED_D2_URL", secret: true });
  const flagged = reportOf(r.project).elements.find((e) => e.id === "D2");
  assert.match(flagged.reason, /SYNTH_ADT_FEED_D2_URL/);
});

test("a credential in a URL's query becomes an environment reference", () => {
  const secret = "q5ecret-token-5678";
  const r = convertWith((x) => x.replace(API_HOST, `<host>https://results.example.test/api/adt?site=synth&amp;api_key=${secret}</host>`));
  assert.equal(r.code, 1, r.err);
  assertNowhere(r, secret);
  assert.match(yamlOf(r.project), /url:\n\s+env: SYNTH_ADT_FEED_D2_URL\n/);
});

test("an http:// URL with credentials still gets plaintext: true", () => {
  const r = convertWith((x) => x.replace(API_HOST, `<host>http://synthuser:plain-s3cret-9${AT}results.example.test/in</host>`));
  assertNowhere(r, "plain-s3cret-9");
  assert.match(yamlOf(r.project), /url:\n\s+env: SYNTH_ADT_FEED_D2_URL\n[^-]*plaintext: true\n\s+dryRun: true/);
});

test("a configuration map value shaped like a secret is not written, whatever its key", () => {
  const credentialedUrl = `postgres://synthdb:map-s3cret-4321${AT}db.example.test/synth`;
  const connection = "Server=db.example.test;User Id=synth;Password=conn-s3cret-8765;";
  const bearer = "Bearer synthbearertoken0123456789";
  const entries = [
    ["dbUrl", credentialedUrl],
    ["warehouse", connection],
    ["upstreamHeader", bearer],
  ].map(([k, v]) => `  <entry>\n    <string>${k}</string>\n    <example.ConfigurationProperty>\n      <value>${v}</value>\n    </example.ConfigurationProperty>\n  </entry>\n`);
  const r = convertWith(
    (x) => x.replace(API_HOST, "<host>${dbUrl}</host>"),
    (m) => m.replace("</map>", `${entries.join("")}</map>`),
  );
  assert.equal(r.code, 1, r.err);
  for (const s of ["map-s3cret-4321", "conn-s3cret-8765", "synthbearertoken0123456789"]) assertNowhere(r, s);
  const yaml = yamlOf(r.project);
  assert.match(yaml, /url:\n\s+env: DB_URL\n\s+headers:/, "the ${dbUrl} reference carries no default");
  assert.match(yaml, /  dbUrl:\n    env: DB_URL\n/);
  assert.match(yaml, /  warehouse:\n    env: WAREHOUSE\n/);
  assert.match(yaml, /  upstreamHeader:\n    env: UPSTREAM_HEADER\n/);
  assert.match(yaml, /  siteCode:\n    env: SITE_CODE\n/, "a value the reader cannot prove harmless is read from the environment");
});

test("a keystore or truststore password in a connector is never written, and the report names the property", () => {
  const ks = "keystore-s3cret-2468";
  const ts = "truststore-s3cret-1357";
  const r = convertWith((x) =>
    x
      .replace("<contentType>text/plain</contentType>", `<contentType>text/plain</contentType>\n        <keyStorePassword>${ks}</keyStorePassword>`)
      .replace("<processBatch>false</processBatch>", `<processBatch>false</processBatch>\n      <trustStorePassword>${ts}</trustStorePassword>\n      <apiToken>${JWT}</apiToken>`),
  );
  assert.equal(r.code, 1, r.err);
  assertNowhere(r, ks);
  assertNowhere(r, ts);
  assertNowhere(r, JWT_HEAD);
  const elements = reportOf(r.project).elements;
  const listed = elements.filter((e) => e.kind === "credential");
  assert.deepEqual(listed.map((e) => e.name).sort(), ["apiToken", "keyStorePassword", "trustStorePassword"]);
  for (const e of listed) {
    assert.equal(e.status, "not-converted");
    assert.match(e.reason, /value was not written/);
  }
});

test("a secret hard-coded in a script stays only in the source copies, which git ignores and the report flags", () => {
  const secret = "script-s3cret-1122";
  const r = convertWith((x) => x.replace("var site = $cfg('siteCode');", `var site = $cfg('siteCode');\nvar dbPassword = '${secret}';`));
  assert.equal(r.code, 1, r.err);
  assertNowhere(r, secret);
  const source = join(r.project, "migration", CHANNEL, "source");
  assert.ok(readFileSync(join(source, "S1-set-receiving-app.js"), "utf8").includes(secret), "the source copy is verbatim");
  const ignore = readFileSync(join(source, ".gitignore"), "utf8");
  assert.match(ignore, /^\*$/m);
  assert.match(ignore, /^!\.gitignore$/m);
  const report = reportOf(r.project);
  assert.deepEqual(report.secrets, [{ file: "migration/synth-adt-feed/source/S1-set-receiving-app.js", line: 3, kind: "secret-assignment" }]);
  assert.equal(report.summary.secretFindings, 1);
  const md = readFileSync(join(r.project, "migration", CHANNEL, "MIGRATION-REPORT.md"), "utf8");
  const top = md.split("## Summary")[0];
  assert.match(top, /verbatim copies/);
  assert.match(top, /\.gitignore/);
  assert.match(top, /review/i);
  assert.ok(md.includes("| migration/synth-adt-feed/source/S1-set-receiving-app.js | 3 | secret-assignment |"));
});

test("shared code templates with the same name, or names equal after cutting, keep a module and a marker each", () => {
  const tpl = (name) => `          <codeTemplate version="9.9.0">\n            <name>${name}</name>\n            <properties class="example.BasicCodeTemplateProperties">\n              <code>function x() { return 1; }</code>\n            </properties>\n          </codeTemplate>\n`;
  const long = "formatAccessionNumberForTheSynthLab";
  const r = convertWith((x) =>
    x.replace("        </codeTemplates>", `${tpl("padLeft")}${tpl(`${long}One`)}${tpl(`${long}Two`)}        </codeTemplates>`),
  );
  assert.equal(r.code, 1, r.err);
  const model = modelOf(r.project);
  const modules = model.shared.map((s) => s.module);
  assert.equal(modules.length, 4);
  assert.equal(new Set(modules).size, 4, `modules collide: ${modules.join(", ")}`);
  const sharedDir = join(r.project, "channels", CHANNEL, "shared");
  assert.equal(readdirSync(sharedDir).length, 4);
  for (const s of model.shared) {
    const text = readFileSync(join(r.project, "channels", CHANNEL, s.module), "utf8");
    assert.match(text, new RegExp(`migrate: ${s.id} pending`), `${s.module} lacks the marker of ${s.id}`);
  }
  const report = reportOf(r.project);
  for (const e of report.elements.filter((x) => x.kind === "shared-code")) {
    assert.doesNotMatch(e.reason, /marker is missing/, `${e.id}: ${e.reason}`);
  }
});

test("the reader refuses to write through a symlinked channels or migration folder", () => {
  for (const linked of ["channels", "migration"]) {
    const work = scratch("pathways-migrate-link-");
    const project = join(work, "project");
    const elsewhere = join(work, "elsewhere");
    mkdirSync(project);
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(project, linked), "dir");
    const r = run("read-export.mjs", [join(fixtures, "synth-adt-feed.xml"), "--out", project]);
    assert.equal(r.code, 2, `${linked}: ${r.out}${r.err}`);
    assert.match(r.err, /symbolic link/);
    assert.deepEqual(readdirSync(elsewhere), [], `${linked}: something was written through the link`);
    assert.deepEqual(readdirSync(project), [linked], `${linked}: something was written`);
  }
});

test("check-migration refuses to write the report through a symlinked file", () => {
  const r = convertWith((x) => x);
  const dir = join(r.project, "migration", CHANNEL);
  const target = join(r.project, "..", "outside.json");
  writeFileSync(target, "{}\n");
  const report = join(dir, "report.json");
  rmSync(report);
  symlinkSync(target, report);
  const c = run("check-migration.mjs", ["--project", r.project, "--channel", CHANNEL]);
  assert.equal(c.code, 2, c.out + c.err);
  assert.match(c.err, /symbolic link/);
  assert.equal(readFileSync(target, "utf8"), "{}\n");
});

// A configuration map entry for each [key, value], in the fixture's shape.
const mapEntries = (pairs) =>
  pairs.map(([k, v]) => `  <entry>\n    <string>${k}</string>\n    <example.ConfigurationProperty>\n      <value>${v}</value>\n    </example.ConfigurationProperty>\n  </entry>\n`).join("");
const withEntries = (pairs) => (m) => m.replace("</map>", `${mapEntries(pairs)}</map>`);
const ARCHIVE = "<host>/var/synth/archive</host>";

test("a configuration map value under a key named like a key is never written", () => {
  const values = { hmacKey: "zebraHorseBatteryStaple", signingKey: "plainwordsecret", accessKey: "AKIASYNTHFAKE", encKey: "0123456789abcdef" };
  const r = convertWith((x) => x.replace(ARCHIVE, "<host>${hmacKey}</host>"), withEntries(Object.entries(values)));
  assert.equal(r.code, 1, r.err);
  for (const v of Object.values(values)) assertNowhere(r, v);
  const yaml = yamlOf(r.project);
  assert.match(yaml, /dir:\n\s+env: HMAC_KEY\n\s+dryRun: true/, "the ${hmacKey} reference carries no default");
  assert.doesNotMatch(yaml, /^\s*default:/m);
  for (const [k, env] of [["hmacKey", "HMAC_KEY"], ["signingKey", "SIGNING_KEY"], ["accessKey", "ACCESS_KEY"], ["encKey", "ENC_KEY"]]) {
    assert.match(yaml, new RegExp(`  ${k}:\\n    env: ${env}\\n`));
  }
});

test("values no name or shape rule catches are read from the environment all the same", () => {
  const values = { greeting: "aHVudGVyMg==", session: "JSESSIONID=abc123", note: "plainvalue" };
  const r = convertWith(
    (x) => x.replace("https://results.example.test/api/adt", "https://results.example.test/api/adt?code=Zq9vN3plainvalue"),
    withEntries(Object.entries(values)),
  );
  assert.equal(r.code, 1, r.err);
  for (const v of [...Object.values(values), "Zq9vN3plainvalue"]) assertNowhere(r, v);
  const yaml = yamlOf(r.project);
  assert.match(yaml, /url:\n\s+env: SYNTH_ADT_FEED_D2_URL\n/);
  assert.match(yaml, /  greeting:\n    env: GREETING\n/);
  assert.match(yaml, /  session:\n    env: SESSION\n/);
});

test("a value proved harmless by the closed allow rule is kept as it is", () => {
  const values = { retries: "3", enabled: "true", timeout: "30s", archiveDir: "/var/synth/out", lookup: "https://lookup.example.test/v1", relay: "relay.example.test" };
  const r = convertWith((x) => x, withEntries(Object.entries(values)));
  const yaml = yamlOf(r.project);
  for (const [k, v] of Object.entries(values)) assert.ok(yaml.includes(`  ${k}: ${JSON.stringify(v)}\n`), `${k} was not kept`);
  assert.match(yaml, /dir: "\/var\/synth\/archive"/);
  assert.match(yaml, /url: "https:\/\/results\.example\.test\/api\/adt"/);
  assert.match(yaml, /port: 6661/);
});

test("two keys that fold to one environment name each get a name of their own", () => {
  const r = convertWith(
    (x) => x.replace(API_HOST, `<host>https://synthuser:collide-s3cret-1${AT}results.example.test/api/adt</host>`),
    withEntries([["apiToken", "tok-one-1111"], ["api_token", "tok-two-2222"], ["db.password", "pw-one-3333"], ["dbPassword", "pw-two-4444"], ["SYNTH_ADT_FEED_D2_URL", "plainvalue"]]),
  );
  assert.equal(r.code, 1, r.err);
  const model = modelOf(r.project);
  const byKey = new Map(model.config.map((c) => [c.key, c.env]));
  assert.equal(byKey.get("apiToken"), "API_TOKEN");
  assert.match(byKey.get("api_token"), /^API_TOKEN_[0-9A-F]{6}$/);
  assert.equal(byKey.get("db.password"), "DB_PASSWORD");
  assert.match(byKey.get("dbPassword"), /^DB_PASSWORD_[0-9A-F]{6}$/);
  assert.equal(byKey.get("SYNTH_ADT_FEED_D2_URL"), "SYNTH_ADT_FEED_D2_URL");
  const d2 = model.destinations.find((d) => d.id === "D2");
  assert.match(d2.settings.url.env, /^SYNTH_ADT_FEED_D2_URL_[0-9A-F]{6}$/, "a connector name never equals a configuration key's");
  const names = model.envRefs.map((e) => e.name);
  assert.equal(new Set(names).size, names.length, `env names repeat: ${names.join(", ")}`);
  const env = reportOf(r.project).env;
  assert.equal(env.find((e) => e.name === byKey.get("api_token")).configKey, "api_token");
  assert.equal(env.find((e) => e.name === "API_TOKEN").configKey, "apiToken");
  const url = env.find((e) => e.name === d2.settings.url.env);
  assert.equal(url.element, "D2");
  assert.equal(url.setting, "url");
  const md = readFileSync(join(r.project, "migration", CHANNEL, "MIGRATION-REPORT.md"), "utf8");
  assert.ok(md.includes(`| ${byKey.get("api_token")} | configuration map key api_token |`));
});

test("a ${key} reference is listed in the report, with or without a configuration map entry", () => {
  const r = convertWith((x) => x.replace(ARCHIVE, "<host>${archiveRoot}</host>").replace("<port>6661</port>", "<port>${listenPort}</port>"), withEntries([["listenPort", "6661"]]));
  assert.equal(r.code, 1, r.err);
  const env = reportOf(r.project).env;
  const root = env.find((e) => e.name === "ARCHIVE_ROOT");
  assert.ok(root, "ARCHIVE_ROOT is not in the report");
  assert.equal(root.configKey, "archiveRoot");
  assert.deepEqual(root.usedIn, ["D1 dir"]);
  const port = env.find((e) => e.name === "LISTEN_PORT");
  assert.deepEqual(port.usedIn, ["SRC port"]);
  assert.equal(port.inConfigMap, true);
  assert.equal(root.inConfigMap, false);
  const md = readFileSync(join(r.project, "migration", CHANNEL, "MIGRATION-REPORT.md"), "utf8");
  assert.match(md, /## Environment variables/);
  assert.match(md, /\| ARCHIVE_ROOT \| configuration map key archiveRoot, not in the map \| D1 dir \|/);
  assert.match(md, /deliberate/);
});

// A small seeded generator, so a failing case can be run again from its seed.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("a marker planted as any value at any place in an export reaches no written file but the source copies", () => {
  const WORDS = ["site", "code", "mode", "hmac", "api", "value", "name", "path", "retry", "zone", "label", "ref"];
  const seeds = Array.from({ length: 24 }, (_, i) => 1000 + i * 7919);
  for (const seed of seeds) {
    const next = rng(seed);
    const pick = (list) => list[Math.floor(next() * list.length)];
    const alnum = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const marker = `Zq${Array.from({ length: 10 + Math.floor(next() * 8) }, () => pick([...alnum])).join("")}`;
    const parts = Array.from({ length: 1 + Math.floor(next() * 3) }, () => pick(WORDS));
    const key = pick([
      () => parts.join("_"),
      () => parts.map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join(""),
      () => parts.join(".").toUpperCase(),
    ])();
    const place = pick(["config", "config-ref", "source-port", "archive-dir", "results-url", "tcp-host", "new-source-property", "new-destination-property"]);
    let edit = (x) => x;
    let editMap = (m) => m;
    if (place === "config") editMap = withEntries([[key, marker]]);
    if (place === "config-ref") {
      editMap = withEntries([[key, marker]]);
      edit = (x) => x.replace(ARCHIVE, `<host>\${${key}}</host>`);
    }
    if (place === "source-port") edit = (x) => x.replace("<port>6661</port>", `<port>${marker}</port>`);
    if (place === "archive-dir") edit = (x) => x.replace(ARCHIVE, `<host>${marker}</host>`);
    if (place === "results-url") edit = (x) => x.replace(API_HOST, `<host>${marker}</host>`);
    if (place === "tcp-host") {
      edit = (x) => x.replace(API_HOST, `<host>${marker}</host>`).replace("<transportName>HTTP Sender</transportName>", "<transportName>TCP Sender</transportName>").replace("<host>" + marker + "</host>", `<remoteAddress>${marker}</remoteAddress>`);
    }
    if (place === "new-source-property") edit = (x) => x.replace("<processBatch>false</processBatch>", `<processBatch>false</processBatch>\n      <${key.replace(/\./g, "_")}>${marker}</${key.replace(/\./g, "_")}>`);
    if (place === "new-destination-property") edit = (x) => x.replace("<contentType>text/plain</contentType>", `<contentType>text/plain</contentType>\n        <${key.replace(/\./g, "_")}>${marker}</${key.replace(/\./g, "_")}>`);
    const r = convertWith(edit, editMap);
    assert.ok(r.code === 1, `seed ${seed}, ${place}, ${key}: exit ${r.code} ${r.err}`);
    const { project, out, err } = r;
    assert.ok(!(out + err).includes(marker), `seed ${seed}, ${place}, ${key}: printed`);
    for (const f of writtenOutsideSource(project)) {
      assert.ok(!readFileSync(f, "utf8").includes(marker), `seed ${seed}, ${place}, ${key}: written to ${relative(project, f)}`);
    }
  }
});
