# cosyte-pathways-migrate reference

What the reader converts, the files it writes, and the formats of its model and report. Every
Pathways key named here is a key of `@cosyte/pathways` 0.0.3, the version in the skill's metadata.

## The conversion table

### The source

| In the export | In channel.yaml | Status and flag |
| --- | --- | --- |
| TCP listener in MLLP mode | `source.mllp` with the port, `host: "127.0.0.1"`, `plaintext: true` | converted, with a flag: set `host` and `tls` before it takes traffic from another machine |
| TCP listener in another mode | `source.tcp` with the port, `host: "127.0.0.1"`, `plaintext: true` | converted, with a flag: framing was not converted |
| HTTP listener | `source.http` with the port, `host: "127.0.0.1"`, `plaintext: true` | converted, with a flag: set `tls` and `auth` |
| File reader on a local folder | `source.file.dir`, the exported folder | converted, with a flag: filters, sorting and the after-read action were not converted |
| Any other source | `source.file.dir: "../../data/<name>/in"`, standing in | not converted, with the transport named |
| Batch processing on the source | nothing | not converted: Pathways 0.0.3 splits no batch on a source |
| The inbound data type | `format:` | HL7 v2 to `hl7v2`, JSON to `json`, delimited to `csv`, EDI or X12 to `x12`, FHIR to `fhir`; anything else to `text`, with a flag |

### Destinations

Each converted destination is written with `dryRun: true`: Pathways transforms and records each
output and never sends it. The team removes the line when it decides to send.

| In the export | In channel.yaml | Status and flag |
| --- | --- | --- |
| File writer on a local folder | `file.dir`, the exported folder | converted, with a flag: Pathways names each file itself |
| HTTP sender | `http.url`; with authentication, `headers.Authorization: { env: <CHANNEL>_D<n>_AUTHORIZATION }` | converted, with a flag: method, content type and query not converted; set the variable to the header's whole value |
| TCP sender in MLLP mode | `mllp` with the host and port, `plaintext: true` | converted, with a flag: set `tls` |
| TCP sender in another mode | `tcp` with the host and port, `plaintext: true` | converted, with a flag: framing was not converted |
| Channel writer | nothing | not converted: Pathways 0.0.3 has no channel destination |
| Any other destination, or one disabled in the export | nothing | not converted, with the reason |

When no destination converts, a file destination on `../../data/<name>/out` stands in, so the
channel still loads.

### Steps, rules and scripts

Every one of these is a step: it gets a marker, and `check-migration` exits 1 until its marker is
`rewritten` or `dropped`.

| In the export | Id | Extracted to | Status |
| --- | --- | --- | --- |
| Source filter rule, as a script | `F<n>` | `source/F<n>-<name>.js` | waiting for a rewrite: return `null` to filter |
| Source filter rule, on a field | `F<n>` | `source/F<n>-<name>.json` (field, condition, values) | waiting for a rewrite |
| Source transformer script step | `S<n>` | `source/S<n>-<name>.js` | waiting for a rewrite |
| Source mapping step | `S<n>` | `source/S<n>-<name>.json` (variable, mapping, scope) | waiting for a rewrite |
| Source message builder step | `S<n>` | `source/S<n>-<name>.json` | waiting for a rewrite |
| XSLT step | `S<n>` | nothing | not converted: Pathways has no XSLT step |
| A step or rule type the reader does not know | `S<n>`, `F<n>` | nothing | not converted |
| A destination's filter rules and steps | `D<n>-F<m>`, `D<n>-S<m>` | `source/D<n>-...` | not converted: no transform per destination in 0.0.3 |
| A destination's response steps | `D<n>-R<m>` | `source/D<n>-R<m>-...` | not converted: no response step in 0.0.3 |
| Deploy script | `DEPLOY` | `source/DEPLOY-deploy-script.js` | waiting for a rewrite: no start hook in 0.0.3; code at the top of transform.ts runs at each worker load |
| Preprocessor | `PRE` | `source/PRE-preprocessor.js` | not converted: no preprocessor in 0.0.3 |
| Postprocessor | `POST` | `source/POST-postprocessor.js` | not converted: nothing runs after delivery in 0.0.3 |
| Undeploy script | `UNDEPLOY` | `source/UNDEPLOY-undeploy-script.js` | not converted: no stop hook in 0.0.3 |
| A script that is empty once comments and a bare `return` are removed | as above | nothing | converted: nothing to carry over |
| Shared code template | `T<n>` | `source/T<n>-<library>-<template>.js`, stub `shared/t<n>-<library>-<template>.ts` (the id keeps two templates with the same name apart) | waiting for a rewrite |
| A step disabled in the export | as above | as above | not converted: disabled in the export |

### Everything else

| In the export | Status |
| --- | --- |
| The channel's name | converted: cut to lowercase letters, digits and hyphens |
| Configuration map key | converted: `config.<key>` with its value; a key that looks like a secret, or a value shaped like one, becomes `{ env: <KEY> }`, converted with a flag, value not written |
| A connector setting the reader converts (a URL, a host, a folder, a port) whose value is shaped like a secret | `{ env: <CHANNEL>_<ID>_<SETTING> }`, the element converted with a flag that names the variable, value not written. The shapes: a URL with a user name or password, a credential in a URL's query or a connection string, a private key, a signed token, an authorization header, and a long random token |
| Any other connector property named like a secret or shaped like one (a keystore or truststore password, a token, a key) | not converted, kind `credential`, listed by the property's name, value not written |
| `${key}` in a converted setting | `{ env: <KEY> }`, with the configuration map's value as `default` when the key is not a secret |
| An embedded sample message | not converted: dropped, unless `--keep-samples-synthetic`, when it becomes `tests/sample-<owner>-<inbound or outbound>.<ext>` with no expected file |
| Id, revision, description and export metadata | not converted: the other engine's bookkeeping |
| A top-level element the reader does not know | not converted |

## Markers

A marker is one line comment in a `.ts` file under `channels/<name>/`:

```ts
// migrate: S1 pending: source transformer step 1, "Set receiving app"
// migrate: S1 rewritten
// migrate: S1 rewritten: reads MSH-5 with msg.get
// migrate: S3 dropped: disabled in the export
```

The id comes first, then `pending`, `rewritten` or `dropped`, then an optional note after a colon.
`check-migration` reads the first marker for each id. A step with no marker is pending, so deleting
a marker never finishes a step.

## Exit codes

`0` done, `1` a step pending (or, for try-channel, a test or compare failed), `2` refused, `3` the PHI
scan found something. The PHI code wins over the pending code. The credential scan never changes
the exit code.

## The source copies

`migration/<name>/source/` holds each exported script, mapping and rule verbatim, so it can hold a
password hard-coded in a script or sample patient data. The reader writes a `.gitignore` in it that
ignores every file but itself, so nothing there is committed until a person removes it. The
credential scan lists each line shaped like a secret, there and anywhere else in the output.

## model.json

```json
{
  "format": "cosyte-pathways-migrate/1",
  "pathwaysVersion": "0.0.3",
  "channel": { "name": "synth-adt-feed", "exportedName": "Synth ADT Feed", "exportVersion": "9.9.0" },
  "formatName": "hl7v2",
  "source": { "id": "SRC", "transport": "TCP Listener", "kind": "mllp", "settings": {}, "filter": [], "steps": [] },
  "destinations": [{ "id": "D1", "index": 1, "name": "Archive", "kind": "file", "settings": {}, "filter": [], "steps": [], "responseSteps": [] }],
  "scripts": { "PRE": { "empty": true }, "DEPLOY": { "empty": false, "file": "source/DEPLOY-deploy-script.js" } },
  "shared": [{ "id": "T1", "library": "Synth Helpers", "name": "padLeft", "file": "source/T1-...js", "module": "shared/....ts" }],
  "config": [{ "key": "siteCode", "value": "SYNTHSITE", "secret": false }, { "key": "apiPassword", "env": "API_PASSWORD", "secret": true }],
  "envRefs": ["API_PASSWORD"],
  "elements": [],
  "dynamic": []
}
```

A setting is `{ "value": "..." }`, `{ "env": "NAME", "default": "..." }`, or
`{ "env": "NAME", "secret": true }` for a value shaped like a secret. A secret's value is never in
the model. A `kind` of `null` is a destination that was not converted.

## report.json

```json
{
  "format": "cosyte-pathways-migrate/1",
  "pathwaysVersion": "0.0.3",
  "channel": { "name": "synth-adt-feed" },
  "summary": {
    "elements": 21, "converted": 6, "convertedWithFlag": 4, "rewritten": 0, "rewritePending": 5,
    "notConverted": 6, "pendingSteps": 8, "unreviewedExpected": 0, "phiFindings": 0,
    "secretFindings": 0, "filesScanned": 11, "syntheticFilesSkipped": 0
  },
  "elements": [{ "id": "S1", "kind": "step", "name": "Set receiving app", "status": "rewrite-pending", "reason": "...", "step": true, "file": "migration/.../source/S1-....js" }],
  "dynamic": [{ "element": "D1-S1", "file": "source/D1-S1-stamp.js", "line": 1, "construct": "eval" }],
  "unreviewedExpected": ["synth-1-001.expected.hl7"],
  "phi": [{ "file": "channels/synth-adt-feed/transform.ts", "line": 12, "kind": "ssn" }],
  "secrets": [{ "file": "migration/synth-adt-feed/source/S1-set-receiving-app.js", "line": 3, "kind": "secret-assignment" }]
}
```

`status` is one of `converted`, `converted-with-flag`, `rewritten`, `rewrite-pending` and
`not-converted`; every status but `converted` and `rewritten` carries a `reason`. `kind` is one of
`channel`, `setting`, `source`, `destination`, `filter-rule`, `step`, `response-step`, `script`,
`shared-code`, `config`, `credential` and `sample`. A dynamic construct is one of `eval`,
`function-constructor`, `java-bridge`, `shared-map`, `routing` and `network-or-file`. A PHI finding
is one of `ssn`, `email`, `phone`, `hl7-patient-segment` and `too-large-to-scan`. A credential
finding is one of `secret-assignment`, `url-credentials`, `url-query-credential`,
`connection-string-credential`, `private-key`, `signed-token`, `authorization-header` and
`random-token`. None ever carries the text it found.

## The XML reader's limits

The reader streams the file as UTF-8 and refuses, with the code and the line, never the text:

| Code | When |
| --- | --- |
| `XML_DOCTYPE_REFUSED` | any `<!DOCTYPE` or other markup declaration, so no entity is declared, fetched or expanded |
| `XML_ENTITY_REFUSED` | an entity other than `&amp;`, `&lt;`, `&gt;`, `&quot;` and `&apos;`, or a character reference XML does not allow |
| `XML_ENCODING_REFUSED` | a declared encoding other than UTF-8, or bytes that are not UTF-8 |
| `XML_LIMIT_SIZE` | over 64 MiB of characters, or one tag over 1 MiB |
| `XML_LIMIT_DEPTH` | nesting over 128 levels |
| `XML_LIMIT_ELEMENTS` | over 500,000 elements |
| `XML_LIMIT_ATTRIBUTES` | over 64 attributes on one element |
| `XML_LIMIT_NAME` | a name over 256 characters |
| `XML_LIMIT_TEXT` | one text node over 16 MiB of characters |
| `XML_LIMIT_REFS` | over 1,000,000 character or entity references |
| `XML_MALFORMED` | anything not well-formed: mismatched tags, a second root, text outside the root |

## The tests/ lists

- `tests/.synthetic`: input files made by @cosyte/synth, or samples confirmed synthetic. The PHI
  scan skips them. try-channel and `read-export --keep-samples-synthetic` write it.
- `tests/.unreviewed`: expected files written by try-channel that no person has reviewed. Remove a
  name once its file is right. Both files are hidden, so `pathways test` never reads them as inputs.
