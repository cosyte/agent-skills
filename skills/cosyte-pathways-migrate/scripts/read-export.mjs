#!/usr/bin/env node
// Reads a channel exported from another integration engine as XML and writes a Pathways channel
// skeleton, a normalised model and the migration report. Node's standard library only.
//
//   node read-export.mjs <export.xml> --out <project> [--config-map <file.xml>]
//                        [--name <channel>] [--keep-samples-synthetic]
//
// It writes channels/<name>/ (channel.yaml, transform.ts, shared/) and migration/<name>/
// (model.json, source/, MIGRATION-REPORT.md, report.json) under the project. It never runs an
// exported script and opens no connection.
//
// Exit codes: 0 every step converted; 1 written, with steps waiting for a rewrite; 2 refused (the
// input, the arguments, or a channel folder that already exists); 3 the PHI scan found something.

if (Number(process.versions.node.split(".")[0]) < 22) {
  process.stderr.write("read-export: needs Node.js 22 or later\n");
  process.exit(2);
}

const { parseArgs } = await import("node:util");
const { createReadStream, existsSync, statSync } = await import("node:fs");
const { join, resolve } = await import("node:path");
const { parseXmlStream, XmlRefused } = await import("./xml.mjs");
const { convert, readConfigMapTree, ConvertRefused } = await import("./convert.mjs");
const { evaluate, writeReport, writeFiles, exitCode, printSummary, EXIT } = await import("./report.mjs");

function refuse(message) {
  process.stderr.write(`read-export: ${message}\n`);
  process.exit(EXIT.refused);
}

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string" },
      "config-map": { type: "string" },
      name: { type: "string" },
      "keep-samples-synthetic": { type: "boolean", default: false },
    },
  });
} catch (err) {
  refuse(err.message);
}
const [input] = args.positionals;
if (input === undefined || args.positionals.length !== 1 || args.values.out === undefined) {
  refuse("usage: read-export.mjs <export.xml> --out <project> [--config-map <file.xml>] [--name <channel>] [--keep-samples-synthetic]");
}
if (args.values.name !== undefined && !/^[a-z0-9][a-z0-9-]*$/.test(args.values.name)) {
  refuse("--name takes a channel name: lowercase letters, digits and hyphens");
}

async function readTree(file, what) {
  if (!existsSync(file) || !statSync(file).isFile()) refuse(`${what} is not a file`);
  try {
    return await parseXmlStream(createReadStream(file));
  } catch (err) {
    if (err instanceof XmlRefused) refuse(`${what} refused: ${err.message}`);
    throw err;
  }
}

const root = await readTree(input, "the export");
const configMap = args.values["config-map"] === undefined
  ? undefined
  : readConfigMapTree(await readTree(args.values["config-map"], "the configuration map"));

let result;
try {
  result = convert(root, { configMap, name: args.values.name, keepSamples: args.values["keep-samples-synthetic"] });
} catch (err) {
  if (err instanceof ConvertRefused) refuse(err.message);
  throw err;
}

const project = resolve(args.values.out);
const name = result.model.channel.name;
for (const dir of [join(project, "channels", name), join(project, "migration", name)]) {
  if (existsSync(dir)) refuse(`${dir} already exists; the reader never overwrites a channel. Move it away or pass --name`);
}
if (result.synthetic.length > 0) result.files.set(`channels/${name}/tests/.synthetic`, `${result.synthetic.join("\n")}\n`);
writeFiles(project, result.files);
const report = evaluate(project, result.model);
writeReport(project, report);
printSummary(report);
process.exit(exitCode(report));
