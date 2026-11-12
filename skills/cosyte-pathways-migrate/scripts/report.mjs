// The migration report: each element of the export with its status, read from the model the
// reader wrote and the markers in the channel's TypeScript, plus the PHI scan of the output.
// MIGRATION-REPORT.md is for a reader, report.json for a program; both say the same thing.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, lstatSync } from "node:fs";
import { join, relative, resolve, sep, dirname } from "node:path";
import { capital, PATHWAYS_VERSION, STATUS_WORDS } from "./convert.mjs";

export const EXIT = { done: 0, pending: 1, refused: 2, phi: 3 };

const MARKER_RE = /migrate: ([A-Z0-9-]+) (pending|rewritten|dropped)(?::\s*(.*))?$/;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
}

const posix = (p) => p.split(sep).join("/");

// Every marker in the channel's .ts files, by element id. A marker given twice keeps the first.
export function readMarkers(channelDir) {
  const markers = new Map();
  for (const file of walk(channelDir).filter((f) => f.endsWith(".ts"))) {
    readFileSync(file, "utf8").split("\n").forEach((line) => {
      const m = MARKER_RE.exec(line.trim().replace(/^\/\/\s*/, ""));
      if (m !== null && !markers.has(m[1])) markers.set(m[1], { state: m[2], note: (m[3] ?? "").trim() });
    });
  }
  return markers;
}

// ---------------------------------------------------------------------------------------------
// The PHI scan. A floor, not a proof: it looks for the shapes of identifiers that should never be in
// a converted channel, and reports each by file, line and kind, never the value.

const SYNTH_PHONE = /555[-. ]?01\d\d/;
const SAFE_EMAIL_DOMAIN = /@(?:[A-Za-z0-9-]+\.)*(?:example\.(?:com|org|net)|example|test|invalid|localhost)$/i;
const PHI_PATTERNS = [
  { kind: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g, ok: () => false },
  { kind: "email", re: /\b[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/g, ok: (m) => SAFE_EMAIL_DOMAIN.test(m) },
  { kind: "phone", re: /(?:\(\d{3}\)\s?|\b\d{3}[-. ])\d{3}[-. ]\d{4}\b/g, ok: (m) => SYNTH_PHONE.test(m) },
  { kind: "hl7-patient-segment", re: /(?:^|\r|\n)PID\|[^|\r\n]*\|[^|\r\n]*\|[^|\r\n]*\|[^|\r\n]*\|[^|\r\n^]+/g, ok: () => false },
];

// Names listed in a tests/ folder's .synthetic file were made by @cosyte/synth or confirmed
// synthetic by the person who ran the reader; the scan skips them and says how many it skipped.
export function phiScan(projectDir, dirs) {
  const findings = [];
  let scanned = 0;
  let skipped = 0;
  for (const dir of dirs) {
    for (const file of walk(join(projectDir, dir))) {
      const rel = posix(relative(projectDir, file));
      if (/\/(report\.json|MIGRATION-REPORT\.md)$/.test(rel)) continue;
      const base = rel.split("/").pop();
      if (base.startsWith(".")) continue;
      const listed = join(dirname(file), ".synthetic");
      if (existsSync(listed) && readFileSync(listed, "utf8").split("\n").map((s) => s.trim()).includes(base)) {
        skipped += 1;
        continue;
      }
      if (lstatSync(file).size > 16 * 1024 * 1024) {
        findings.push({ file: rel, line: 0, kind: "too-large-to-scan" });
        continue;
      }
      scanned += 1;
      const text = readFileSync(file, "utf8");
      for (const { kind, re, ok } of PHI_PATTERNS) {
        for (const m of text.matchAll(re)) {
          if (ok(m[0])) continue;
          const at = m.index + (m[0].startsWith("\n") || m[0].startsWith("\r") ? 1 : 0);
          const line = text.slice(0, at).split(/\r\n|\r|\n/).length;
          findings.push({ file: rel, line, kind });
        }
      }
    }
  }
  findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  return { findings, scanned, skipped };
}

// ---------------------------------------------------------------------------------------------

export function evaluate(projectDir, model) {
  const name = model.channel.name;
  const channelDir = join(projectDir, "channels", name);
  const markers = readMarkers(channelDir);
  const elements = model.elements.map((e) => {
    const out = { ...e };
    if (!e.step) return out;
    const marker = markers.get(e.id);
    if (marker === undefined) {
      out.status = "rewrite-pending";
      out.reason = "its marker is missing from the channel's .ts files: put the marker back, then mark it rewritten or dropped";
      out.pending = true;
    } else if (marker.state === "rewritten") {
      out.status = "rewritten";
      out.reason = marker.note === "" ? "rewritten in TypeScript by the agent" : `rewritten in TypeScript by the agent: ${marker.note}`;
    } else if (marker.state === "dropped") {
      out.status = "not-converted";
      out.reason = marker.note === "" ? "dropped, with no reason given" : `dropped: ${marker.note}`;
    } else {
      out.pending = true;
    }
    return out;
  });
  const unreviewedFile = join(channelDir, "tests", ".unreviewed");
  const unreviewed = existsSync(unreviewedFile)
    ? readFileSync(unreviewedFile, "utf8").split("\n").map((s) => s.trim()).filter(Boolean)
    : [];
  const phi = phiScan(projectDir, [posix(join("channels", name)), posix(join("migration", name))]);
  const count = (s) => elements.filter((e) => e.status === s).length;
  const summary = {
    elements: elements.length,
    converted: count("converted"),
    convertedWithFlag: count("converted-with-flag"),
    rewritten: count("rewritten"),
    rewritePending: count("rewrite-pending"),
    notConverted: count("not-converted"),
    pendingSteps: elements.filter((e) => e.pending).length,
    unreviewedExpected: unreviewed.length,
    phiFindings: phi.findings.length,
    filesScanned: phi.scanned,
    syntheticFilesSkipped: phi.skipped,
  };
  return {
    format: model.format,
    pathwaysVersion: PATHWAYS_VERSION,
    channel: model.channel,
    summary,
    elements: elements.map(({ pending, ...e }) => e),
    dynamic: model.dynamic,
    unreviewedExpected: unreviewed,
    phi: phi.findings,
  };
}

export function exitCode(report) {
  if (report.phi.length > 0) return EXIT.phi;
  if (report.summary.pendingSteps > 0) return EXIT.pending;
  return EXIT.done;
}


const cell = (s) => String(s ?? "").replace(/\|/g, "\\|");

export function renderMarkdown(report) {
  const s = report.summary;
  const name = report.channel.name;
  const lines = [
    `# Migration report: ${name}`,
    "",
    `Written by the cosyte-pathways-migrate skill for Pathways ${report.pathwaysVersion}.`,
    "",
    "This conversion is a starting point, not a proved conversion. A conversion is proved only by",
    "running the channel against input and output pairs your team supplies, de-identified, and",
    "reviewing every expected file. The skill ran nothing but `pathways test` and `pathways verify`",
    "on files, and never ran an exported script.",
    "",
    "## Summary",
    "",
    `- Elements: ${s.elements}. Converted: ${s.converted}. Converted with a flag: ${s.convertedWithFlag}. Rewritten by the agent: ${s.rewritten}. Waiting for a rewrite: ${s.rewritePending}. Not converted: ${s.notConverted}.`,
    `- Steps still pending: ${s.pendingSteps}.${s.pendingSteps > 0 ? " check-migration exits 1 until none is." : ""}`,
    `- Expected files not yet reviewed: ${s.unreviewedExpected}.`,
    `- PHI scan: ${s.phiFindings} finding(s) in ${s.filesScanned} file(s) scanned; ${s.syntheticFilesSkipped} file(s) listed as synthetic skipped.`,
    "",
    "## Elements",
    "",
    "| Id | Kind | Name | Status | Why |",
    "| --- | --- | --- | --- | --- |",
    ...report.elements.map((e) => `| ${e.id} | ${e.kind} | ${cell(e.name)} | ${STATUS_WORDS[e.status]} | ${cell(capital(e.reason ?? ""))} |`),
    "",
    "## Dynamic constructs",
    "",
    "Lines in the extracted scripts, under this folder, that a rewrite has to read with care. Each is",
    "named by file, line and kind; the report never quotes a script.",
    "",
  ];
  if (report.dynamic.length === 0) lines.push("None found.");
  else {
    lines.push("| Element | File | Line | Construct |", "| --- | --- | --- | --- |");
    for (const d of report.dynamic) lines.push(`| ${d.element} | ${d.file} | ${d.line} | ${d.construct} |`);
  }
  lines.push("", "## PHI scan", "");
  if (report.phi.length === 0) lines.push("No finding.");
  else {
    lines.push("Remove each value below from the output before anything else. The report names where, never what.", "", "| File | Line | Kind |", "| --- | --- | --- |");
    for (const f of report.phi) lines.push(`| ${f.file} | ${f.line} | ${f.kind} |`);
  }
  if (report.unreviewedExpected.length > 0) {
    lines.push("", "## Expected files not yet reviewed", "", "Read each, compare it with what the other engine produced for the same input, and remove its name from tests/.unreviewed once it is right.", "");
    for (const f of report.unreviewedExpected) lines.push(`- tests/${f}`);
  }
  return `${lines.join("\n")}\n`;
}

export function writeReport(projectDir, report) {
  const dir = join(projectDir, "migration", report.channel.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(dir, "MIGRATION-REPORT.md"), renderMarkdown(report));
}

// Writes each file under the project, refusing any path that would land outside it.
export function writeFiles(projectDir, files) {
  const root = resolve(projectDir);
  for (const [rel, text] of files) {
    const target = resolve(root, rel);
    if (!target.startsWith(root + sep)) throw new Error("a file path that leaves the project");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text, { flag: "wx" });
  }
}

export function printSummary(report, out = process.stdout) {
  const s = report.summary;
  out.write(
    `${report.channel.name}: ${s.elements} elements; converted ${s.converted}, with a flag ${s.convertedWithFlag}, ` +
      `rewritten ${s.rewritten}, waiting for a rewrite ${s.rewritePending}, not converted ${s.notConverted}; ` +
      `steps pending ${s.pendingSteps}; PHI findings ${s.phiFindings}.\n` +
      `See migration/${report.channel.name}/MIGRATION-REPORT.md.\n`,
  );
}
