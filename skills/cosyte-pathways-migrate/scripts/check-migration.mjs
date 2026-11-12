#!/usr/bin/env node
// Checks a converted channel: reads the model read-export wrote and the markers in the channel's
// TypeScript, runs the PHI scan on the output, and writes the report again. Run it after each round
// of rewriting. Node's standard library only; it runs nothing and opens no connection.
//
//   node check-migration.mjs --project <project> --channel <name>
//
// Exit codes: 0 every step rewritten or dropped and the scan clean; 1 a step still pending;
// 2 refused (the arguments, no model to read, or a symbolic link where the report goes); 3 the PHI
// scan found something.

if (Number(process.versions.node.split(".")[0]) < 22) {
  process.stderr.write("check-migration: needs Node.js 22 or later\n");
  process.exit(2);
}

const { parseArgs } = await import("node:util");
const { readFileSync, existsSync } = await import("node:fs");
const { join, resolve } = await import("node:path");
const { MODEL_FORMAT } = await import("./convert.mjs");
const { evaluate, writeReport, exitCode, printSummary, EXIT, WriteRefused } = await import("./report.mjs");

function refuse(message) {
  process.stderr.write(`check-migration: ${message}\n`);
  process.exit(EXIT.refused);
}

let args;
try {
  args = parseArgs({ options: { project: { type: "string" }, channel: { type: "string" } } });
} catch (err) {
  refuse(err.message);
}
const { project, channel } = args.values;
if (project === undefined || channel === undefined) refuse("usage: check-migration.mjs --project <project> --channel <name>");
if (!/^[a-z0-9][a-z0-9-]*$/.test(channel)) refuse("--channel takes a channel name: lowercase letters, digits and hyphens");

const root = resolve(project);
const modelFile = join(root, "migration", channel, "model.json");
if (!existsSync(modelFile)) refuse(`no model at migration/${channel}/model.json; run read-export.mjs first`);
let model;
try {
  model = JSON.parse(readFileSync(modelFile, "utf8"));
} catch {
  refuse(`migration/${channel}/model.json is not JSON`);
}
if (model.format !== MODEL_FORMAT) refuse(`migration/${channel}/model.json is not a ${MODEL_FORMAT} model`);
if (model.channel?.name !== channel) refuse(`migration/${channel}/model.json is for another channel`);

const report = evaluate(root, model);
try {
  writeReport(root, report);
} catch (err) {
  if (err instanceof WriteRefused) refuse(err.message);
  throw err;
}
printSummary(report);
process.exit(exitCode(report));
