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
  assert.deepEqual(d2.settings.url, { env: "SYNTH_ADT_FEED_D2_URL" });
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
  const listed = elements.filter((e) => ["apiToken", "keyStorePassword", "trustStorePassword"].includes(e.name));
  assert.deepEqual(listed.map((e) => e.name).sort(), ["apiToken", "keyStorePassword", "trustStorePassword"]);
  for (const e of listed) {
    assert.equal(e.kind, "property");
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

// Values a rule by name or by shape lets through: a PIN under a name with pin in it, a password
// under a short name, an account number, passwords that are valid host names, paths whose last
// part is the secret, a webhook URL holding short tokens, a code and durations shaped like numbers,
// and TRUE spelled in capitals. The reader cannot tell any of them from a harmless value, so it
// writes none of them.
const UNTELLABLE = [
  ["pinCode", "4821", "PIN_CODE"],
  ["pin_code", "4822", "PIN_CODE_"],
  ["pinNumber", "4823", "PIN_NUMBER"],
  ["dbPw", "hunter2.com", "DB_PW"],
  ["smtpLogin", "correct.horse.battery", "SMTP_LOGIN"],
  ["accountNumber", "123456789", "ACCOUNT_NUMBER"],
  ["mfa", "123456", "MFA"],
  ["vaultFile", "/dev/shm/s3cr3t", "VAULT_FILE"],
  ["svcHome", "C:\\Users\\svc\\Pa55w0rd", "SVC_HOME"],
  ["hookUrl", "https://hooks.example.test/services/T0AB/B0CD/xY7zQ3", "HOOK_URL"],
  ["waitFor", "1234 s", "WAIT_FOR"],
  ["holdFor", "PT1234567S", "HOLD_FOR"],
  ["flagValue", "TRUE", "FLAG_VALUE"],
];

test("no configuration map value is written, whatever its key or its shape", () => {
  const r = convertWith((x) => x, withEntries(UNTELLABLE.map(([k, v]) => [k, v])));
  assert.equal(r.code, 1, r.err);
  const yaml = yamlOf(r.project);
  const model = modelOf(r.project);
  const env = reportOf(r.project).env;
  for (const [k, v, name] of UNTELLABLE) {
    assert.ok(!yaml.includes(JSON.stringify(v)), `${k}: its value was written to channel.yaml`);
    if (v !== "TRUE") assertNowhere(r, v);
    const entry = model.config.find((c) => c.key === k);
    assert.ok(entry.env.startsWith(name), `${k} is read from ${entry.env}`);
    assert.equal(entry.value, undefined, `${k}: its value is in model.json`);
    assert.match(yaml, new RegExp(`  ${k}:\\n    env: ${entry.env}\\n`), `${k} is not an environment reference`);
    assert.equal(env.find((e) => e.name === entry.env).configKey, k);
  }
  assert.doesNotMatch(yaml, /^\s*default:/m, "an environment reference carries a default");
});

test("no connector setting is written: a port, a host, a folder and a URL are all read from the environment", () => {
  const r = convertWith((x) => x);
  assert.equal(r.code, 1, r.err);
  const yaml = yamlOf(r.project);
  for (const v of ["6661", "/var/synth/archive", "results.example.test", "synth-user", "0.0.0.0"]) assertNowhere(r, v);
  assert.match(yaml, /  mllp:\n    port:\n      env: SYNTH_ADT_FEED_SRC_PORT\n/);
  assert.match(yaml, /  - file:\n      dir:\n        env: SYNTH_ADT_FEED_D1_DIR\n/);
  assert.match(yaml, /  - http:\n      url:\n        env: SYNTH_ADT_FEED_D2_URL\n/);
  const env = reportOf(r.project).env;
  const port = env.find((e) => e.name === "SYNTH_ADT_FEED_SRC_PORT");
  assert.equal(port.element, "SRC");
  assert.equal(port.setting, "port");
  assert.deepEqual(port.usedIn, ["SRC port"]);
  const md = readFileSync(join(r.project, "migration", CHANNEL, "MIGRATION-REPORT.md"), "utf8");
  assert.ok(md.includes("| SYNTH_ADT_FEED_SRC_PORT | the port of SRC | SRC port |"));
  const top = md.split("## Summary")[0];
  assert.match(top, /cannot\s+tell\s+a\s+PIN\s+from\s+a\s+port/);
  assert.match(top, /password\s+from\s+a\s+host\s+name/);
});

test("a TCP destination's host and port and a file source's folder are read from the environment", () => {
  const tcp = convertWith((x) =>
    x
      .replace(API_HOST, "<remoteAddress>relay.example.test</remoteAddress>\n        <remotePort>7771</remotePort>")
      .replace("<transportName>HTTP Sender</transportName>", "<transportName>TCP Sender</transportName>"),
  );
  assert.equal(tcp.code, 1, tcp.err);
  for (const v of ["relay.example.test", "7771"]) assertNowhere(tcp, v);
  assert.match(yamlOf(tcp.project), /  - tcp:\n      host:\n        env: SYNTH_ADT_FEED_D2_HOST\n      port:\n        env: SYNTH_ADT_FEED_D2_PORT\n/);
  const file = convertWith((x) =>
    x
      .replace(/<properties class="example\.connectors\.tcp\.TcpReceiverProperties"[\s\S]*?<\/properties>/, '<properties class="example.connectors.file.FileReceiverProperties"><scheme>FILE</scheme><host>/srv/synth/inbox</host></properties>')
      .replace("<transportName>TCP Listener</transportName>", "<transportName>File Reader</transportName>"),
  );
  assert.equal(file.code, 1, file.err);
  assertNowhere(file, "/srv/synth/inbox");
  assert.match(yamlOf(file.project), /  file:\n    dir:\n      env: SYNTH_ADT_FEED_SRC_DIR\n/);
});

test("only the booleans true and false are written as they are", () => {
  const r = convertWith((x) => x, withEntries([["archiveOn", "true"], ["traceOn", "false"], ["shout", "TRUE"], ["blank", ""]]));
  assert.equal(r.code, 1, r.err);
  const yaml = yamlOf(r.project);
  assert.match(yaml, /  archiveOn: "true"\n/);
  assert.match(yaml, /  traceOn: "false"\n/);
  assert.match(yaml, /  shout:\n    env: SHOUT\n/);
  assert.match(yaml, /  blank:\n    env: BLANK\n/);
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
  // The map's own value is read from the same variable: the reader writes no value, a port included.
  assert.deepEqual(port.usedIn, ["SRC port", "config.listenPort"]);
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

// Replaces `from` in `text`, failing when it is not there, so a planted marker never silently
// misses its place because the fixture changed.
function sub(text, from, to) {
  assert.ok(text.includes(from), `the fixture no longer holds ${from}`);
  return text.replace(from, () => to);
}

// Every place a value can sit in an export, with a marker planted at each. Names (of the channel,
// a connector, a step, a library or a template, a configuration key, a transport or a data type)
// are written to comments and the report so a person can find each element; they are not values
// and are not planted here.
function plantedExport(m, variant) {
  let x = exportXml;
  x = sub(x, "<id>00000000-0000-4000-8000-000000000001</id>", `<id>${m.channelId}</id>`);
  x = sub(x, '<channel version="9.9.0">', `<channel version="${m.exportVersion}">`);
  x = sub(x, "<description>A made-up feed for tests.</description>", `<description>${m.description}</description>`);
  x = sub(x, "<revision>3</revision>", `<revision>${m.revision}</revision>`);
  if (variant === "mllp-source") {
    x = sub(x, "<host>0.0.0.0</host>", `<host>${m.listenerHost}</host>`);
    x = sub(x, "<port>6661</port>", `<port>${m.sourcePort}</port>`);
    x = sub(x, "</listenerConnectorProperties>", `</listenerConnectorProperties>\n      <keyStorePassword>${m.sourceProperty}</keyStorePassword>`);
    x = sub(x, "<processBatch>false</processBatch>", `<processBatch>${m.processBatch}</processBatch>`);
  } else {
    const tcp = /<properties class="example\.connectors\.tcp\.TcpReceiverProperties"[\s\S]*?<\/properties>/;
    assert.match(x, tcp);
    x = x.replace(tcp, () => `<properties class="example.connectors.file.FileReceiverProperties"><scheme>FILE</scheme><host>${m.sourceFolder}</host><fileFilter>${m.sourceProperty}</fileFilter></properties>`);
    x = sub(x, "<transportName>TCP Listener</transportName>", "<transportName>File Reader</transportName>");
  }
  x = sub(x, "var site = $cfg('siteCode');", `var site = $cfg('siteCode');\nvar planted = '${m.stepScript}';`);
  x = sub(x, "<variable>patientClass</variable>", `<variable>${m.mapperVariable}</variable>`);
  x = sub(x, "<defaultValue></defaultValue>", `<defaultValue>${m.mapperDefault}</defaultValue>`);
  x = sub(x, "<template>&lt;xsl:stylesheet/&gt;</template>", `<template>${m.xslt}</template>`);
  const sample = /<inboundTemplate encoding="base64">[^<]*<\/inboundTemplate>/;
  assert.match(x, sample);
  x = x.replace(sample, () => `<inboundTemplate>${m.sample}</inboundTemplate>`);
  x = sub(x, "<operator>NONE</operator>", `<operator>${m.ruleOperator}</operator>`);
  x = sub(x, "== 'A01';", `== '${m.ruleScript}';`);
  x = sub(x, ARCHIVE, variant === "mllp-source" ? `<host>${m.archiveDir}</host>` : `<host>\${${m.refKey}}</host>`);
  x = sub(x, "<outputPattern>${message.messageId}.hl7</outputPattern>", `<outputPattern>${m.outputPattern}</outputPattern>`);
  x = sub(x, "<template>${message.encodedData}</template>", `<template>${m.fileTemplate}</template>`);
  x = sub(x, "var stamp = eval('1 + 1');", `var stamp = '${m.destinationScript}';`);
  x = sub(x, API_HOST, `<host>${m.resultsUrl}</host>`);
  x = sub(x, "<method>post</method>", `<method>${m.method}</method>`);
  x = sub(x, "<username>synth-user</username>", `<username>${m.username}</username>`);
  x = sub(x, "<password>${resultsApiPassword}</password>", `<password>${m.password}</password>`);
  x = sub(x, "<content>${message.encodedData}</content>", `<content>${m.content}</content>`);
  x = sub(x, "<contentType>text/plain</contentType>", `<contentType>${m.contentType}</contentType>`);
  x = sub(x, "responseStatus = ERROR;", `responseStatus = '${m.responseScript}';`);
  x = sub(x, "<channelId>00000000-0000-4000-8000-000000000002</channelId>", `<channelId>${m.channelWriterId}</channelId>`);
  x = sub(
    x,
    "  </destinationConnectors>",
    [
      '    <connector version="9.9.0">',
      "      <metaDataId>4</metaDataId>",
      "      <name>Relay</name>",
      '      <properties class="example.connectors.tcp.TcpDispatcherProperties" version="9.9.0">',
      '        <transmissionModeProperties class="example.MLLPModeProperties">',
      `          <pluginPointName>${m.tcpMode}</pluginPointName>`,
      "        </transmissionModeProperties>",
      `        <remoteAddress>${m.tcpHost}</remoteAddress>`,
      `        <remotePort>${m.tcpPort}</remotePort>`,
      `        <keepConnectionOpen>${m.tcpProperty}</keepConnectionOpen>`,
      "      </properties>",
      "      <transportName>TCP Sender</transportName>",
      "      <enabled>true</enabled>",
      "    </connector>",
      '    <connector version="9.9.0">',
      "      <metaDataId>5</metaDataId>",
      "      <name>Old archive</name>",
      `      <properties class="example.connectors.file.FileDispatcherProperties"><scheme>FILE</scheme><host>${m.disabledDir}</host></properties>`,
      "      <transportName>File Writer</transportName>",
      "      <enabled>false</enabled>",
      "    </connector>",
      "  </destinationConnectors>",
    ].join("\n"),
  );
  x = sub(x, "// Nothing to do before the message is read.", `// ${m.preprocessor}`);
  x = sub(x, "globalChannelMap.put('started', 'yes');", `globalChannelMap.put('started', '${m.deployScript}');`);
  x = sub(x, "<initialState>STARTED</initialState>", `<initialState>${m.initialState}</initialState>`);
  x = sub(x, "<type>FUNCTION</type>", `<type>${m.templateType}</type>`);
  x = sub(x, "text = '0' + text;", `text = '${m.sharedCode}' + text;`);
  return x;
}

function plantedMap(m) {
  let x = configXml;
  x = sub(x, "<value>SYNTHSITE</value>", `<value>${m.configValue}</value>`);
  x = sub(x, "<comment>The made-up site</comment>", `<comment>${m.configComment}</comment>`);
  x = sub(x, "<value>not-a-real-secret-0000</value>", `<value>${m.configSecret}</value>`);
  return withEntries([[m.extraKey, m.extraValue], [m.refKey, m.refValue]])(x);
}

test("a marker planted as any value at every place in an export reaches no written file but the source copies", () => {
  const WORDS = ["site", "code", "mode", "pin", "pw", "value", "name", "path", "retry", "zone", "label", "ref"];
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const seeds = Array.from({ length: 8 }, (_, i) => 1000 + i * 7919);
  for (const seed of seeds) {
    const next = rng(seed);
    const pick = (list) => list[Math.floor(next() * list.length)];
    const word = (n) => Array.from({ length: n }, () => pick([...lower])).join("");
    const digits = (n) => String(10 ** (n - 1) + Math.floor(next() * 9 * 10 ** (n - 1)));
    // Each marker has a core of random letters or digits that nothing else in the output holds,
    // and a shape picked from the seed. Most shapes are ones a rule by shape might call harmless:
    // a number, a host name, a path, a URL, a duration.
    const shapes = [
      () => { const c = `zq${word(10)}`; return [`Zq${c}9X`, c]; },
      () => { const c = digits(9); return [c, c]; },
      () => { const c = `zq${word(8)}`; return [`${c}.example.test`, c]; },
      () => { const c = `zq${word(8)}`; return [`/srv/${c}/in`, c]; },
      () => { const c = `zq${word(8)}`; return [`C:\\svc\\${c}`, c]; },
      () => { const c = `zq${word(8)}`; return [`https://${c}.example.test/hook/T0AB/x9`, c]; },
      () => { const c = digits(7); return [`${c} s`, c]; },
      () => { const c = digits(7); return [`PT${c}S`, c]; },
    ];
    const places = [
      "channelId", "exportVersion", "description", "revision", "listenerHost", "sourcePort", "sourceFolder", "sourceProperty",
      "processBatch", "stepScript", "mapperVariable", "mapperDefault", "xslt", "sample", "ruleOperator", "ruleScript", "archiveDir",
      "outputPattern", "fileTemplate", "destinationScript", "resultsUrl", "method", "username", "password", "content", "contentType",
      "responseScript", "channelWriterId", "tcpMode", "tcpHost", "tcpPort", "tcpProperty", "disabledDir", "preprocessor",
      "deployScript", "initialState", "templateType", "sharedCode", "configValue", "configComment", "configSecret", "extraValue", "refValue",
    ];
    const m = {};
    const cores = {};
    for (const place of places) [m[place], cores[place]] = pick(shapes)();
    const parts = Array.from({ length: 1 + Math.floor(next() * 3) }, () => pick(WORDS));
    m.extraKey = parts.map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join("");
    m.refKey = `${parts.join("_")}_ref`;
    for (const variant of ["mllp-source", "file-source"]) {
      const r = convertWith(() => plantedExport(m, variant), () => plantedMap(m));
      assert.equal(r.code, 1, `seed ${seed}, ${variant}: exit ${r.code} ${r.err}`);
      const written = writtenOutsideSource(r.project).map((f) => [relative(r.project, f), readFileSync(f, "utf8")]);
      assert.ok(written.length >= 6, `seed ${seed}, ${variant}: only ${written.length} files written`);
      for (const place of places) {
        const core = cores[place];
        assert.ok(!(r.out + r.err).includes(core), `seed ${seed}, ${variant}, ${place}: printed`);
        for (const [file, text] of written) assert.ok(!text.includes(core), `seed ${seed}, ${variant}, ${place} (${m[place]}): written to ${file}`);
      }
    }
  }
});
