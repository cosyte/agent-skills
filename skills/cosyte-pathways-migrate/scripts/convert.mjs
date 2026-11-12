// Turns the tree of a channel export into a normalised model and the files of a Pathways channel.
// It reads names and settings only. It never runs, evaluates or rewrites an exported script: each
// script is copied out as it is, for the agent to read and rewrite in TypeScript.
//
// The element names this reader knows were written from a description of the export format, then
// checked only against synthetic exports written from scratch. An element it does not know is
// listed in the report as not converted, never guessed at.

import { child, children, textOf, descendant } from "./xml.mjs";

export const MODEL_FORMAT = "cosyte-pathways-migrate/1";
// The Pathways release this conversion targets: the keys it writes are the keys this version has.
export const PATHWAYS_VERSION = "0.0.3";

export class ConvertRefused extends Error {
  constructor(message) {
    super(message);
    this.name = "ConvertRefused";
  }
}

// A name for a folder or a file: lowercase letters, digits and single hyphens, nothing else, so no
// name from the export can hold a path separator, a dot segment or a drive letter.
export function slug(raw, fallback, max = 48) {
  const s = String(raw ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return s === "" ? fallback : s;
}

// A name shown in a comment or the report: one line, no control characters, at most 80 characters.
export function label(raw) {
  const s = String(raw ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}

export function envName(...parts) {
  return parts
    .map((p) => String(p).replace(/([a-z0-9])([A-Z])/g, "$1_$2"))
    .join("_")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(?=[0-9])/, "_");
}

const SECRET_NAME = /pass(word|wd|phrase)?|secret|token|api[-_]?key|credential|private|pwd|auth/i;
export const isSecretName = (name) => SECRET_NAME.test(name);

// The last part of a dotted class name, so a step type is known by its kind, not its package.
const kindOf = (name) => name.split(".").pop();

const FORMATS = {
  HL7V2: { format: "hl7v2", ext: "hl7" },
  JSON: { format: "json", ext: "json" },
  DELIMITED: { format: "csv", ext: "csv" },
  EDI: { format: "x12", ext: "x12" },
  X12: { format: "x12", ext: "x12" },
  FHIR: { format: "fhir", ext: "json" },
  RAW: { format: "text", ext: "txt" },
};

// A script that does nothing once its comments, whitespace and a bare return are taken out.
export function isEmptyScript(text) {
  const code = String(text ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\breturn(\s+message)?\s*;?/g, "")
    .trim();
  return code === "";
}

// Constructs a rewrite has to look at by hand, found by line in an extracted script. The report
// names each by file and line and the construct's kind, never the text of the line.
const DYNAMIC = [
  ["eval", new RegExp("\\bev" + "al\\s*\\(")],
  ["function-constructor", new RegExp("\\bnew\\s+Func" + "tion\\b")],
  ["java-bridge", /\b(?:Packages\.|java\.|javax\.|importPackage\s*\(|importClass\s*\(|JavaAdapter\b)/],
  ["shared-map", /\$(?:g|gc|c|co|r|s|cfg)\s*\(|\b(?:globalMap|globalChannelMap|channelMap|connectorMap|responseMap|sourceMap|configurationMap)\b/],
  ["routing", /\brouter\s*\./],
  ["network-or-file", /\b(?:Socket|URL|HttpClient|FileWriter|FileReader|FileOutputStream|Connection)\b/],
];

export function findDynamic(text) {
  const hits = [];
  String(text).split("\n").forEach((line, i) => {
    for (const [construct, re] of DYNAMIC) if (re.test(line)) hits.push({ line: i + 1, construct });
  });
  return hits;
}

// ${name} in a setting: a reference to the configuration map or to the engine's own variables.
const VAR_RE = /^\$\{([A-Za-z_][A-Za-z0-9_.]*)\}$/;

class Builder {
  constructor(root, options) {
    this.root = root;
    this.options = options;
    this.elements = [];
    this.files = new Map(); // relative path in the project -> text
    this.dynamic = [];
    this.config = new Map(); // key -> { value?, env?, secret }
    this.envRefs = new Set();
    this.markers = { transform: [], shared: new Map() };
  }

  add(entry) {
    this.elements.push({ step: false, ...entry, name: entry.name === undefined ? undefined : label(entry.name) });
    return entry;
  }

  sourceFile(id, name, ext, text) {
    const file = `source/${id}-${slug(name, "step")}.${ext}`;
    this.files.set(`${this.migrationDir}/${file}`, text.endsWith("\n") ? text : `${text}\n`);
    if (ext === "js") for (const h of findDynamic(text)) this.dynamic.push({ element: id, file, line: h.line, construct: h.construct });
    return file;
  }

  // A setting's value, with ${...} turned into an environment reference.
  setting(raw, where) {
    if (raw === undefined) return undefined;
    const value = raw.trim();
    const m = VAR_RE.exec(value);
    if (m === null) return { value };
    const key = m[1];
    const env = envName(key);
    this.envRefs.add(env);
    const fromMap = this.configMap?.get(key);
    if (fromMap !== undefined && !fromMap.secret && !isSecretName(where)) return { env, default: fromMap.value, ref: key };
    return { env, ref: key };
  }

  build() {
    const root = this.root;
    if (root.name !== "channel" || child(root, "sourceConnector") === undefined) {
      throw new ConvertRefused("this file is not a channel export: its root is not a channel with a sourceConnector");
    }
    const exportedName = textOf(root, "name") ?? "";
    const name = this.options.name ?? slug(exportedName, "");
    if (name === "" || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      throw new ConvertRefused("the export gives no channel name that makes a Pathways channel name; pass --name");
    }
    this.name = name;
    this.channelDir = `channels/${name}`;
    this.migrationDir = `migration/${name}`;
    this.configMap = this.options.configMap;

    this.add({ id: "CH", kind: "channel", name: exportedName, status: "converted", reason: `named ${name}` });
    for (const c of root.children) {
      if (["id", "description", "revision", "nextMetaDataId", "lastModified", "exportData", "properties", "name"].includes(c.name)) continue;
      if (["sourceConnector", "destinationConnectors", "preprocessingScript", "postprocessingScript", "deployScript", "undeployScript"].includes(c.name)) continue;
      this.add({ id: `CH-${slug(c.name, "element")}`, kind: "setting", name: c.name, status: "not-converted", reason: "an element this reader does not know" });
    }
    this.add({ id: "CH-bookkeeping", kind: "setting", name: "id, revision, description and export metadata", status: "not-converted", reason: "the other engine's bookkeeping, with no Pathways counterpart" });

    const source = this.readSource(child(root, "sourceConnector"));
    const destinations = children(child(root, "destinationConnectors"), "connector").map((c, i) => this.readDestination(c, i + 1));
    const scripts = this.readScripts(root);
    const shared = this.readShared(child(root, "exportData"));
    const config = this.readConfigMap();

    this.model = {
      format: MODEL_FORMAT,
      pathwaysVersion: PATHWAYS_VERSION,
      channel: { name, exportedName: label(exportedName), exportVersion: label(root.attrs.version ?? "") },
      formatName: source.format,
      source,
      destinations,
      scripts,
      shared,
      config,
      envRefs: [...this.envRefs].sort(),
      elements: this.elements,
      dynamic: this.dynamic,
    };
    this.files.set(`${this.channelDir}/channel.yaml`, this.channelYaml());
    this.files.set(`${this.channelDir}/transform.ts`, this.transformTs());
    for (const [file, text] of this.markers.shared) this.files.set(`${this.channelDir}/shared/${file}`, text);
    this.files.set(`${this.migrationDir}/model.json`, `${JSON.stringify(this.model, null, 2)}\n`);
    return { model: this.model, files: this.files };
  }

  readSource(node) {
    const transport = label(textOf(node, "transportName") ?? "");
    const props = child(node, "properties");
    const transformer = child(node, "transformer");
    const dataType = (textOf(transformer, "inboundDataType") ?? "HL7V2").trim().toUpperCase();
    const known = FORMATS[dataType];
    const format = known?.format ?? "text";
    this.ext = known?.ext ?? "txt";
    if (known === undefined || dataType === "RAW") {
      this.add({ id: "SRC-format", kind: "setting", name: `data type ${label(dataType)}`, status: "converted-with-flag", reason: "read as text: Pathways 0.0.3 has no typed format for it, so the transform gets the body as a string" });
    } else {
      this.add({ id: "SRC-format", kind: "setting", name: `data type ${label(dataType)}`, status: "converted", reason: `format: ${format}` });
    }

    const src = { id: "SRC", transport, kind: null, settings: {}, format };
    const port = this.setting(textOf(descendant(props, "listenerConnectorProperties"), "port"), "port");
    const mode = (textOf(descendant(props, "transmissionModeProperties"), "pluginPointName") ?? "").trim();
    let reason;
    let status = "converted-with-flag";
    if (transport === "TCP Listener" && mode === "MLLP") {
      src.kind = "mllp";
      src.settings = { port, host: { value: "127.0.0.1" }, plaintext: true };
      reason = "an MLLP source on 127.0.0.1 without TLS, as the skill runs it; set host and tls before it takes traffic from another machine";
      if (format !== "hl7v2") reason += "; MLLP needs format hl7v2";
    } else if (transport === "TCP Listener") {
      src.kind = "tcp";
      src.settings = { port, host: { value: "127.0.0.1" }, plaintext: true };
      reason = "a TCP source on 127.0.0.1 without TLS; its framing was not converted, set framing by hand";
    } else if (transport === "HTTP Listener") {
      src.kind = "http";
      src.settings = { port, host: { value: "127.0.0.1" }, plaintext: true };
      reason = "an HTTP source on 127.0.0.1 without TLS; set tls and auth before it takes traffic from another machine";
    } else if (transport === "File Reader" && /^file$/i.test((textOf(props, "scheme") ?? "").trim())) {
      src.kind = "file";
      src.settings = { dir: this.setting(textOf(props, "host"), "dir") };
      reason = "a file source on the exported folder; its file name filter, sorting and after-read action were not converted";
    } else {
      src.kind = "file";
      src.settings = { dir: { value: `../../data/${this.name}/in` } };
      status = "not-converted";
      reason = transport === ""
        ? "the source names no transport; a file source stands in"
        : `Pathways 0.0.3 has no counterpart for a ${transport} source; a file source on ../../data/${this.name}/in stands in`;
      src.placeholder = true;
    }
    if (src.settings.port === undefined && ["mllp", "tcp", "http"].includes(src.kind)) {
      src.settings.port = { value: "2575" };
      reason += "; the export gives no port, 2575 stands in";
    }
    this.add({ id: "SRC", kind: "source", name: transport, status, reason });
    if ((textOf(props, "processBatch") ?? "").trim() === "true") {
      this.add({ id: "SRC-batch", kind: "setting", name: "batch processing", status: "not-converted", reason: "Pathways 0.0.3 does not split a batch on a source: each file or body is one message" });
    }
    src.filter = this.readFilter(child(node, "filter"), "", "source filter");
    src.steps = this.readSteps(transformer, "", "source transformer");
    this.readSamples(transformer, "SRC");
    return src;
  }

  readDestination(node, index) {
    const id = `D${index}`;
    const transport = label(textOf(node, "transportName") ?? "");
    const name = textOf(node, "name") ?? `destination ${index}`;
    const props = child(node, "properties");
    const dest = { id, index, name: label(name), transport, kind: null, settings: {} };
    let status = "converted-with-flag";
    let reason;
    const enabled = (textOf(node, "enabled") ?? "true").trim() !== "false";
    if (transport === "File Writer" && /^file$/i.test((textOf(props, "scheme") ?? "FILE").trim())) {
      dest.kind = "file";
      dest.settings = { dir: this.setting(textOf(props, "host"), "dir") };
      reason = "a file destination on the exported folder; Pathways names each file itself, so the exported file name pattern was not converted";
    } else if (transport === "HTTP Sender") {
      dest.kind = "http";
      dest.settings = { url: this.setting(textOf(props, "host"), "url") };
      reason = "an HTTP destination that POSTs; the exported method, content type and query were not converted";
      if ((textOf(props, "useAuthentication") ?? "").trim() === "true") {
        const env = envName(this.name, id, "authorization");
        this.envRefs.add(env);
        dest.settings.headers = { Authorization: { env } };
        reason += `; its user name and password became the Authorization header, read from ${env}, which you set`;
      }
      if (/^http:/i.test(dest.settings.url?.value ?? "")) {
        dest.settings.plaintext = true;
        reason += "; an http:// URL needs plaintext: true";
      }
    } else if (transport === "TCP Sender") {
      const mode = (textOf(descendant(props, "transmissionModeProperties"), "pluginPointName") ?? "").trim();
      dest.kind = mode === "MLLP" ? "mllp" : "tcp";
      dest.settings = {
        host: this.setting(textOf(props, "remoteAddress"), "host") ?? { value: "127.0.0.1" },
        port: this.setting(textOf(props, "remotePort"), "port") ?? { value: "2575" },
        plaintext: true,
      };
      reason = dest.kind === "mllp"
        ? "an MLLP destination without TLS, as exported; set tls before it sends to another machine"
        : "a TCP destination without TLS; its framing was not converted, set framing by hand";
    } else {
      status = "not-converted";
      reason = transport === "Channel Writer"
        ? "Pathways 0.0.3 has no channel destination: send to the other channel over a file folder or MLLP on 127.0.0.1, or wait for routing between channels in a later release"
        : `Pathways 0.0.3 has no counterpart for a ${transport || "transport the export does not name"} destination; write a custom destination module or convert it by hand`;
    }
    if (!enabled) {
      status = "not-converted";
      reason = "disabled in the export";
      dest.kind = null;
    }
    dest.status = status;
    this.add({ id, kind: "destination", name, status, reason });
    const owner = `${id}-`;
    const where = `destination ${index}`;
    dest.filter = this.readFilter(child(node, "filter"), owner, `${where} filter`, true);
    dest.steps = this.readSteps(child(node, "transformer"), owner, `${where} transformer`, "destination");
    dest.responseSteps = this.readSteps(child(node, "responseTransformer"), owner, `${where} response transformer`, "response");
    this.readSamples(child(node, "transformer"), id);
    return dest;
  }

  readFilter(node, owner, where, perDestination = false) {
    const rules = [];
    const list = child(node, "elements")?.children ?? [];
    list.forEach((el, i) => {
      const id = `${owner}F${i + 1}`;
      const kind = kindOf(el.name);
      const name = textOf(el, "name") ?? `rule ${i + 1}`;
      const enabled = (textOf(el, "enabled") ?? "true").trim() !== "false";
      let file;
      let status = "rewrite-pending";
      let reason;
      if (/JavaScriptRule$/.test(kind)) {
        file = this.sourceFile(id, name, "js", textOf(el, "script") ?? "");
        reason = "a filter rule script: rewrite it in the transform, returning null to filter the message out";
      } else if (/RuleBuilderRule$/.test(kind)) {
        const detail = {
          field: label(textOf(el, "field") ?? ""),
          condition: label(textOf(el, "condition") ?? ""),
          values: children(child(el, "values"), "string").map((v) => label(v.text)),
          operator: label(textOf(el, "operator") ?? ""),
        };
        file = this.sourceFile(id, name, "json", JSON.stringify(detail, null, 2));
        reason = "a rule on a field: rewrite it in the transform, returning null to filter the message out";
      } else {
        status = "not-converted";
        reason = "a filter rule type this reader does not know";
      }
      if (perDestination) {
        status = "not-converted";
        reason = "Pathways 0.0.3 has no filter per destination: fold it into the channel transform if it holds for every destination, or move the destination to a channel of its own";
      }
      if (!enabled) {
        status = "not-converted";
        reason = "disabled in the export";
      }
      const rule = { id, kind, name: label(name), file, enabled, operator: label(textOf(el, "operator") ?? "") };
      this.add({ id, kind: "filter-rule", name, status, reason, step: true, file: file && `${this.migrationDir}/${file}` });
      this.markers.transform.push({ id, what: `${where} rule ${i + 1}`, name, file, reason });
      rules.push(rule);
    });
    return rules;
  }

  readSteps(node, owner, where, role = "channel") {
    const steps = [];
    const prefix = role === "response" ? "R" : "S";
    const list = child(node, "elements")?.children ?? [];
    list.forEach((el, i) => {
      const id = `${owner}${prefix}${i + 1}`;
      const kind = kindOf(el.name);
      const name = textOf(el, "name") ?? `step ${i + 1}`;
      const enabled = (textOf(el, "enabled") ?? "true").trim() !== "false";
      let file;
      let status = "rewrite-pending";
      let reason;
      if (/JavaScriptStep$/.test(kind)) {
        file = this.sourceFile(id, name, "js", textOf(el, "script") ?? "");
        reason = "a script step: rewrite it in TypeScript";
      } else if (/MapperStep$/.test(kind)) {
        const detail = { variable: label(textOf(el, "variable") ?? ""), mapping: textOf(el, "mapping") ?? "", scope: label(textOf(el, "scope") ?? "") };
        file = this.sourceFile(id, name, "json", JSON.stringify(detail, null, 2));
        reason = "a mapping step: rewrite it as a value read in the transform";
      } else if (/MessageBuilderStep$/.test(kind)) {
        const detail = { messageSegment: textOf(el, "messageSegment") ?? "", mapping: textOf(el, "mapping") ?? "" };
        file = this.sourceFile(id, name, "json", JSON.stringify(detail, null, 2));
        reason = "a message builder step: rewrite it as a field set in the transform";
      } else if (/XsltStep$/.test(kind)) {
        status = "not-converted";
        reason = "Pathways has no XSLT step: rewrite what it does in TypeScript, or drop it";
      } else {
        status = "not-converted";
        reason = "a step type this reader does not know";
      }
      if (role === "destination" && status !== "not-converted") {
        status = "not-converted";
        reason = "Pathways 0.0.3 has no transform per destination: fold it into the channel transform if it holds for every destination, or move the destination to a channel of its own";
      }
      if (role === "response") {
        status = "not-converted";
        reason = "Pathways 0.0.3 gives a transform no destination reply, so a response step has no place yet";
      }
      if (!enabled) {
        status = "not-converted";
        reason = "disabled in the export";
      }
      const kindName = role === "response" ? "response-step" : "step";
      this.add({ id, kind: kindName, name, status, reason, step: true, file: file && `${this.migrationDir}/${file}` });
      this.markers.transform.push({ id, what: `${where} step ${i + 1}`, name, file, reason });
      steps.push({ id, kind, name: label(name), file, enabled });
    });
    return steps;
  }

  readSamples(transformer, owner) {
    for (const which of ["inboundTemplate", "outboundTemplate"]) {
      const node = child(transformer, which);
      if (node === undefined || node.text.trim() === "") continue;
      const id = `${owner}-${which === "inboundTemplate" ? "inbound" : "outbound"}`;
      if (!this.options.keepSamples) {
        this.add({ id, kind: "sample", name: `${which === "inboundTemplate" ? "inbound" : "outbound"} sample message`, status: "not-converted", reason: "sample data dropped: it may hold a real patient's message; pass --keep-samples-synthetic only when you know it is synthetic" });
        continue;
      }
      const body = node.attrs.encoding === "base64" ? Buffer.from(node.text.trim(), "base64").toString("utf8") : node.text;
      const who = owner === "SRC" ? "source" : slug(owner, "x");
      const file = `${this.channelDir}/tests/sample-${who}-${which === "inboundTemplate" ? "inbound" : "outbound"}.${this.ext}`;
      this.files.set(file, body);
      this.add({ id, kind: "sample", name: "sample message", status: "converted-with-flag", reason: `kept as ${file}, confirmed synthetic by whoever ran the reader; it has no expected file until try-channel writes one, marked unreviewed` });
      this.synthetic = [...(this.synthetic ?? []), file.split("/").pop()];
    }
  }

  readScripts(root) {
    const out = {};
    const kinds = [
      ["PRE", "preprocessingScript", "preprocessor", "Pathways 0.0.3 has no preprocessor: the transform receives the message already parsed, so a repair the parse needs has no place yet"],
      ["POST", "postprocessingScript", "postprocessor", "Pathways 0.0.3 runs nothing after delivery; a lifecycle hook (hooks:) sees events, not messages"],
      ["DEPLOY", "deployScript", "deploy script", "Pathways 0.0.3 has no start script: code at the top of transform.ts runs whenever the channel's worker loads it, which can be more than once"],
      ["UNDEPLOY", "undeployScript", "undeploy script", "Pathways 0.0.3 has no stop script"],
    ];
    for (const [id, element, what, why] of kinds) {
      const text = textOf(root, element);
      if (text === undefined) continue;
      if (isEmptyScript(text)) {
        this.add({ id, kind: "script", name: what, status: "converted", reason: "empty in the export: nothing to carry over" });
        out[id] = { empty: true };
        continue;
      }
      const file = this.sourceFile(id, what, "js", text);
      const status = id === "DEPLOY" ? "rewrite-pending" : "not-converted";
      this.add({ id, kind: "script", name: what, status, reason: why, step: true, file: `${this.migrationDir}/${file}` });
      this.markers.transform.push({ id, what: "channel script", name: what, file, reason: why });
      out[id] = { empty: false, file };
    }
    return out;
  }

  readShared(exportData) {
    const shared = [];
    let n = 0;
    for (const lib of children(child(exportData, "codeTemplateLibraries"), "codeTemplateLibrary")) {
      const libName = textOf(lib, "name") ?? "library";
      for (const tpl of children(child(lib, "codeTemplates"), "codeTemplate")) {
        n += 1;
        const id = `T${n}`;
        const tplName = textOf(tpl, "name") ?? `template ${n}`;
        const props = child(tpl, "properties");
        const code = textOf(props, "code") ?? textOf(tpl, "code") ?? "";
        const base = `${slug(libName, "library", 24)}-${slug(tplName, "template", 24)}`;
        const file = this.sourceFile(id, base, "js", code);
        const module = `${base}.ts`;
        const reason = `shared code: rewrite it in TypeScript in shared/${module} and import it from transform.ts`;
        this.add({ id, kind: "shared-code", name: `${libName} / ${tplName}`, status: "rewrite-pending", reason, step: true, file: `${this.migrationDir}/${file}` });
        this.markers.shared.set(module, sharedStub(id, libName, tplName, `${this.migrationDir}/${file}`));
        shared.push({ id, library: label(libName), name: label(tplName), file, module: `shared/${module}` });
      }
    }
    return shared;
  }

  readConfigMap() {
    const config = [];
    if (this.configMap === undefined) return config;
    let n = 0;
    for (const [key, entry] of this.configMap) {
      n += 1;
      const id = `CFG${n}`;
      if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) {
        this.add({ id, kind: "config", name: key, status: "not-converted", reason: "a key that is not a plain name" });
        continue;
      }
      if (entry.secret) {
        const env = envName(key);
        this.envRefs.add(env);
        config.push({ key, env, secret: true });
        this.add({ id, kind: "config", name: key, status: "converted-with-flag", reason: `a secret: ctx.config.${key} reads it from ${env}, which you set where the engine runs; its value was not written` });
      } else {
        config.push({ key, value: entry.value, secret: false });
        this.add({ id, kind: "config", name: key, status: "converted", reason: `kept as ctx.config.${key}, the value as exported` });
      }
    }
    return config;
  }

  channelYaml() {
    const m = this.model;
    const q = (s) => JSON.stringify(String(s));
    const scalar = (v, indent) => {
      if (v === undefined) return " \"\"";
      if (v === true) return " true";
      if (v.env !== undefined) {
        const pad = " ".repeat(indent + 2);
        return `\n${pad}env: ${v.env}${v.default !== undefined ? `\n${pad}default: ${q(v.default)}` : ""}`;
      }
      return /^[0-9]+$/.test(v.value) ? ` ${v.value}` : ` ${q(v.value)}`;
    };
    const block = (settings, indent) => {
      const pad = " ".repeat(indent);
      const lines = [];
      for (const [k, v] of Object.entries(settings)) {
        if (k === "headers") {
          lines.push(`${pad}headers:`);
          for (const [h, hv] of Object.entries(v)) lines.push(`${pad}  ${h}:${scalar(hv, indent + 2)}`);
        } else lines.push(`${pad}${k}:${scalar(v, indent)}`);
      }
      return lines;
    };
    const reasonOf = (id) => this.elements.find((e) => e.id === id);
    const comment = (id, indent) => {
      const e = reasonOf(id);
      const pad = " ".repeat(indent);
      const head = `${id}${e.name ? ` "${e.name}"` : ""}: ${STATUS_WORDS[e.status]}.`;
      return wrap(`${head} ${capital(e.reason)}.`, 98 - indent).map((l) => `${pad}# ${l}`);
    };
    const out = [
      "# yaml-language-server: $schema=../../node_modules/@cosyte/pathways/schema/channel.json",
      ...wrap(
        `Converted by the cosyte-pathways-migrate skill from an exported channel, for Pathways ${PATHWAYS_VERSION}. ` +
          "It is a starting point, not a proved conversion: a conversion is proved only against input and output pairs your team supplies, de-identified. " +
          `migration/${m.channel.name}/MIGRATION-REPORT.md lists what was converted, what carries a flag and what was not converted. ` +
          "Every destination runs dry until you remove its dryRun line.",
        96,
      ).map((l) => `# ${l}`),
      "",
      `name: ${m.channel.name}`,
      `format: ${m.source.format}`,
      "",
      "source:",
      ...comment("SRC", 2),
      `  ${m.source.kind}:`,
      ...block(m.source.settings, 4),
      "",
      "transform: ./transform.ts",
      "",
      "destinations:",
    ];
    let any = false;
    for (const d of m.destinations) {
      out.push(...comment(d.id, 2));
      if (d.kind === null) continue;
      any = true;
      out.push(`  - ${d.kind}:`, ...block(d.settings, 6), "    dryRun: true");
    }
    if (!any) {
      out.push(
        "  # No destination converted: a file destination stands in so the channel loads.",
        "  - file:",
        `      dir: ${q(`../../data/${m.channel.name}/out`)}`,
        "    dryRun: true",
      );
    }
    if (m.config.length > 0) {
      out.push("", "# The exported configuration map, as ctx.config. A secret is read from the environment.", "config:");
      for (const c of m.config) {
        if (c.secret) out.push(`  ${c.key}:`, `    env: ${c.env}`);
        else out.push(`  ${c.key}: ${q(c.value)}`);
      }
    }
    return `${out.join("\n")}\n`;
  }

  transformTs() {
    const m = this.model;
    const lines = [
      ...wrap(
        `The channel's transform, converted by the cosyte-pathways-migrate skill from an exported channel. ` +
          "Each step of the export has a marker below. Rewrite the step in TypeScript from its file under " +
          `migration/${m.channel.name}/source/ and change its marker from pending to rewritten, or to ` +
          '"dropped: <why>" when the step is not needed. Never run an exported script: read it. ' +
          `check-migration exits 0 only once no marker is pending.`,
        96,
      ).map((l) => `// ${l}`),
      "//",
      "// Node runs this file as it is, by stripping the types: import shared code as \"./shared/<name>.ts\".",
      'import type { Transform } from "@cosyte/pathways";',
      "",
    ];
    const deploy = this.markers.transform.filter((t) => t.id === "DEPLOY");
    for (const t of deploy) lines.push(...markerLines(t, m.channel.name, 0), "");
    lines.push("export default ((msg, ctx) => {");
    for (const t of this.markers.transform.filter((x) => x.id !== "DEPLOY")) lines.push(...markerLines(t, m.channel.name, 2));
    lines.push("  void ctx;", "  return msg;", "}) satisfies Transform;");
    return `${lines.join("\n")}\n`;
  }
}

function markerLines(t, channel, indent) {
  const pad = " ".repeat(indent);
  const head = `migrate: ${t.id} pending: ${t.what}, "${label(t.name)}"`;
  const rest = `${t.file ? `Source: migration/${channel}/${t.file}. ` : ""}${capital(t.reason)}.`;
  return [`${pad}// ${head}`, ...wrap(rest, 96 - indent).map((l) => `${pad}//   ${l}`)];
}

function sharedStub(id, lib, tpl, file) {
  return [
    `// Shared code from the export's library "${label(lib)}", template "${label(tpl)}".`,
    `// migrate: ${id} pending: rewrite ${file} in TypeScript here, then mark it rewritten.`,
    "// Import it from transform.ts with its .ts extension.",
    "export {};",
    "",
  ].join("\n");
}

export const STATUS_WORDS = {
  converted: "converted",
  "converted-with-flag": "converted, with a flag",
  rewritten: "rewritten by the agent",
  "rewrite-pending": "waiting for the agent to rewrite it",
  "not-converted": "not converted",
};

export const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function wrap(text, width) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (line === "") line = w;
    else if (line.length + 1 + w.length > width) {
      lines.push(line);
      line = w;
    } else line += ` ${w}`;
  }
  if (line !== "") lines.push(line);
  return lines;
}

// Reads a configuration map export: entries of a key and a value, in order. A value whose key
// looks like a secret is kept in memory only, to be replaced by an environment reference.
export function readConfigMapTree(root) {
  const map = new Map();
  for (const entry of children(root, "entry")) {
    const [keyNode, valueNode] = entry.children;
    if (keyNode === undefined) continue;
    const key = keyNode.text.trim();
    const value = valueNode === undefined ? "" : (textOf(valueNode, "value") ?? valueNode.text).trim();
    map.set(key, { value, secret: isSecretName(key) });
  }
  return map;
}

export function convert(root, options = {}) {
  const builder = new Builder(root, options);
  const result = builder.build();
  return { ...result, synthetic: builder.synthetic ?? [] };
}
