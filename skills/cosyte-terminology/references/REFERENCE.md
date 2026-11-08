# @cosyte/terminology reference (0.1.4)

Everything here comes from the published 0.1.4 README and type declarations. Check
`node_modules/@cosyte/terminology/dist/index.d.ts` for any name not listed.

## Code-system identity

- `resolveSystem(id)` accepts a canonical URI (case-insensitive), a `v2-XXXX` mnemonic or v2 table
  URI or OID, a bare or `urn:oid:` OID, or an HL7 v2 Table 0396 mnemonic. It returns a
  `SystemIdentity` (`url`, `oid`, `name`, `mnemonics`) or `{ unknown: true, input }`; it never
  invents a URI. Narrow with `isUnknownSystem`.
- Constants: `SYSTEM_IDENTITIES`, `HL7_V2_OID_ROOT`, `HL7_V2_URL_PREFIX`, `ICD10CM_SYSTEM`,
  `ICD9CM_SYSTEM`, `SNOMEDCT_SYSTEM`, `RXNORM_SYSTEM`.

## ConceptMap `$translate`

- `loadConceptMap(json)` reads an untrusted FHIR R4 ConceptMap and deep-freezes it. A structurally
  unusable resource throws `TerminologyError` with `TERM_CONCEPTMAP_MALFORMED`.
- `translate(coding, map)` matches the source side only (never inverted) and returns:
  - `{ unmapped: false, matches, provenance }`, each match carrying `target` (verbatim `Coding`),
    `relationship` (R5 vocabulary), `equivalence` (the R4 token) and `comment`; or
  - `{ unmapped: true, code: "TERM_TRANSLATE_UNMAPPED", mode, source, notRelated?, fixedTarget?,
    otherMapUrl?, provenance }`. A `group.unmapped` directive is reported in `mode`, never applied.
- When every declared target asserts non-relation (`disjoint` or `unmatched`) the source is
  unmapped and the `disjoint` rows ride on `notRelated`. When at least one target asserts a
  relationship, `disjoint` rows stay in `matches` in declared order, so check `equivalence` before
  using a match.

## Code systems: load, `$lookup`, `$validate-code`

`loadCodeSystem(source)` dispatches on `format`:

| `format`        | source fields                                                        | typical release              |
| --------------- | -------------------------------------------------------------------- | ---------------------------- |
| `"rrf"`         | `content`, `columns` (`code`, `display`, `status?` as column indexes) | RxNorm or UMLS RRF           |
| `"csv"`         | `content`, `columns` (`code`, `display`, `status?` as header names)   | LOINC CSV                    |
| `"fixed-width"` | `content`, `fields` (for example `ICD10CM_ORDER_FILE_FIELDS`)        | ICD-10-CM order file         |
| `"fhir"`        | `resource` (a FHIR CodeSystem JSON value)                            | any FHIR CodeSystem          |

Each delimited source also takes `url`, `name`, `version` and `statusMap`. A malformed row is
skipped and surfaced on `cs.warnings`; an unusable source throws `TERM_CODESYSTEM_MALFORMED`.

- `lookup(cs, code)` returns `{ found: true, code, display, definition, status, properties }` or
  `{ found: false, code: "TERM_CODE_UNKNOWN", input }`. `status` carries deprecated, header
  (not billable) and obsolete states rather than presenting a code as clean.
- `validateCode(cs, code)` returns `{ valid, status?, code? }`; `valid` is `true` only when the code
  is present, and a deprecated code validates as present with its status.

```ts
import { loadCodeSystem, lookup, validateCode } from "@cosyte/terminology";

// Synthetic CSV release; with a real LOINC file you point the columns at its own headers.
const cs = loadCodeSystem({
  format: "csv",
  content: "CODE,NAME\nX-1,Example concept one\nX-2,Example concept two\n",
  columns: { code: "CODE", display: "NAME" },
  url: "http://example.org/cs",
});

const hit = lookup(cs, "X-1");
console.log(hit.found ? hit.display : hit.code);
console.log(validateCode(cs, "X-9").valid); // false
```

## ValueSet `$expand` and `$validate-code`

- `loadValueSet(json)` reads an untrusted FHIR R4 ValueSet (`TERM_VALUESET_MALFORMED` if unusable).
- `expand(vs, { codeSystems?, valueSets? })` returns `{ complete, contains, total?, diagnostics }`.
  When `complete` is `false`, `contains` is a lower bound, never exhaustive membership.
- `validateCodeInValueSet(coding, vs, ctx?)` returns `{ undetermined: false, result, coding }` only
  when membership can be proven, otherwise `{ undetermined: true, code:
  "TERM_VALUESET_CANNOT_EXPAND", diagnostics }`. It never fabricates a `false`.
- `unsupportedOps(filters)` lists `compose.include.filter` operators the engine does not implement.
  `buildSubsumption(cs)` and `isA(sub, code, anchor)` read subsumption from the release's own
  hierarchy.

```ts
import { expand, loadCodeSystem, loadValueSet, validateCodeInValueSet } from "@cosyte/terminology";

const cs = loadCodeSystem({
  format: "fhir",
  resource: {
    resourceType: "CodeSystem",
    url: "http://example.org/cs",
    concept: [{ code: "a" }, { code: "b" }, { code: "c" }],
  },
});
const vs = loadValueSet({
  resourceType: "ValueSet",
  compose: { include: [{ system: "http://example.org/cs", concept: [{ code: "a" }, { code: "b" }] }] },
});
const ctx = { codeSystems: new Map([["http://example.org/cs", cs]]) };

const expansion = expand(vs, ctx);
console.log(expansion.complete, expansion.contains.length); // true 2

const membership = validateCodeInValueSet({ system: "http://example.org/cs", code: "c" }, vs, ctx);
console.log(membership.undetermined ? membership.code : membership.result);
```

## UCUM

- `validateUcum(unit)` returns `{ valid: true, canonical }` or `{ valid: false, code:
  "TERM_UCUM_INVALID", reason }`. `canonical` is a comparison descriptor, not guaranteed to be a
  re-parseable UCUM expression.
- `ucumEqual(a, b)` is `true` when both are valid and denote the same unit (same dimensions and
  scale). Annotations are inert. A special unit such as `Cel` is never equal to a linear one, and
  `mg` is not `g`: this is not conversion.
- Lower level: `parseUcum`, `reduce`, `loadUcumEssence` (the bundled table).
- Case-sensitive mode only. No magnitude conversion.

## Crosswalks

### CMS GEMs (ICD-9-CM and ICD-10-CM)

- `loadGems({ content, direction: "9-to-10" | "10-to-9", version? })` loads a public-domain GEM file
  you supply. Malformed rows become warnings; there is no fatal for GEM load.
- `applyGem(map, code)` returns the full candidate set (`mapped: true`, `entries`, and
  `combinations` for a combination source), a steward No-Map (`mapped: false`, `noMap: true`,
  `TERM_CROSSWALK_NO_MAP`) or an absent source (`mapped: false`, `noMap: false`,
  `TERM_CROSSWALK_UNMAPPED`).
- `invertGem` always throws `TERM_MAP_NOT_INVERTIBLE`: forward and backward GEMs are separate files.

```ts
import { applyGem, loadGems } from "@cosyte/terminology";

// Synthetic rows in the CMS GEM format (source target flags): an exact map and a No-Map.
const gems = loadGems({
  direction: "9-to-10",
  version: "2018",
  content: "0010 A000 00000\nV290 NoDx 11000\n",
});

console.log(applyGem(gems, "0010").mapped); // true
const noMap = applyGem(gems, "V290");
console.log(noMap.mapped ? "mapped" : noMap.code); // TERM_CROSSWALK_NO_MAP
```

### SNOMED CT to ICD-10-CM complex map

- `loadComplexMap({ format: "rows", rows })` or `loadComplexMap({ format: "rf2", content })` loads
  the NLM extended-map refset you supply under your own SNOMED CT licence.
- `applyComplexMap(map, sctid, context?)` evaluates each group's rules in priority order. When a rule
  needs an age or gender the `PatientContext` does not supply, the group comes back
  `context-required` (`TERM_CROSSWALK_CONTEXT_REQUIRED`), never a guessed branch.
- `MAP_CATEGORIES`, `NO_MAP_CATEGORIES`, `COMPLEX_MAP_SOURCE_SYSTEM`.

## RxNorm drug graph

- `loadRxNormGraph({ conso, rel, sat?, version? })` loads RXNCONSO, RXNREL and optionally RXNSAT
  text you supply. A concept is typed by its defining atom; an untyped `RXCUI` is left out and
  reported on `graph.warnings` as `TERM_RXNORM_UNTYPED_CONCEPT`.
- Navigation returns `{ found: true, rxcui, predicates, targets }` (targets may be empty) or
  `{ found: false, code: "TERM_RXNORM_UNKNOWN_RXCUI", rxcui }`: `ingredientsOf`, `genericFor`,
  `brandsFor`, `doseFormsOf`, `consistsOf`, `relatedByRela(graph, rxcui, predicate)`,
  `getConcept`.
- `resolveNdc(graph, ndc)` returns `{ resolved: true, ndc, rxcui, status, asOf? }` or
  `{ resolved: false, code: "TERM_RXNORM_NDC_UNMAPPED", ndc }`.
- `approximateMatch(graph, query, { minScore?, limit? })` is opt-in; every result is marked
  `approximate: true` with a `score`. Never treat one as an identity.
- Edges are RxNorm's as authored. An `SCD` has no ingredient edge: call `consistsOf` and then
  `ingredientsOf` on the `SCDC`. A branded drug's `has_ingredient` reaches the brand name (`BN`). The
  precise forms (`SCDFP`, `SBDFP`, `SCDGP`) carry no ingredient edge. Check `tty` on every result.
- Term types: `TERM_TYPES`, `asTermType`, `isSynonymTermType`. Relationship names: `RELA`,
  `RELA_INVERSE`.

The README's walk-through, for orientation (it needs a real RRF release to run):

```text
ingredientsOf(graph, "316151")      an SCDC: found, targets [ { rxcui: "29046", tty: "IN", ... } ]
ingredientsOf(graph, "314076")      an SCD: found, targets [] because no such edge is authored
consistsOf(graph, "314076")         the SCDC, the first of two hops to the ingredient
genericFor(graph, "104377")         an SBD: its SCD, via the authored tradename_of edge
ingredientsOf(graph, "99999999")    { found: false, code: "TERM_RXNORM_UNKNOWN_RXCUI" }
```

## Conformance claims and other limits

- **ValueSet layer** against HL7's FHIR terminology ecosystem test cases (`HL7/fhir-tx-ecosystem-ig`,
  upstream commit `33d37fc0f8efaed5832032f3a73956f66d4d4f23`): suites `simple-cases`, `parameters`,
  `validation`; operations `$expand` and ValueSet `$validate-code`. 101 cases ran, 20 passed, 81
  declined, none answered differently. A declined case asks for a request parameter the API takes no
  argument for (`activeOnly`, `displayLanguage`, `includeDesignations` and others), for HTTP or
  language negotiation, or meets the engine's own typed refusal. The cases are driven in process,
  comparing membership (system, code, display) and `result`. This is a measurement, not an
  approval, certification or endorsement by HL7 or anyone else.
- **UCUM** against the official functional tests (suite dated 3-Feb 2021, table version 2.2): the
  `validation` and `conversion` case kinds are claimed, conversion for commensurability only (the
  converted magnitude is not asserted). `displayNameGeneration` and `multiplication` are not run and
  not claimed.
- Loaded releases (a code system's concepts, GEM and complex-map entries, a drug graph's concepts,
  edges and NDCs) are frozen read-only views, not `Map` instances. They cannot be
  `structuredClone`d or posted to a worker; copy what you need (`new Map(cs.concepts)`).
- An `RXCUI` no defining atom could type is left out of the graph and reported as
  `TERM_RXNORM_UNTYPED_CONCEPT` on `graph.warnings`.
- The "What is bundled" section of the README states what is distributed and under whose copyright;
  it is not legal advice about any particular use.

## Errors and diagnostics

- `TerminologyError` is thrown only for `FATAL_CODES`: `TERM_CONCEPTMAP_MALFORMED`,
  `TERM_CODESYSTEM_MALFORMED`, `TERM_VALUESET_MALFORMED`, `TERM_CROSSWALK_MALFORMED`,
  `TERM_MAP_NOT_INVERTIBLE`. Its `message` is value-free; branch on `err.code`.
- `DIAGNOSTIC_CODES` (typed outcomes and load warnings): `TERM_TRANSLATE_UNMAPPED`,
  `TERM_SYSTEM_UNRECOGNIZED`, `TERM_RRF_MALFORMED_ROW`, `TERM_CSV_MALFORMED`,
  `TERM_FIXED_WIDTH_MALFORMED`, `TERM_FHIR_CONCEPT_MALFORMED`, `TERM_CODE_UNKNOWN`,
  `TERM_CONCEPT_DEPRECATED`, `TERM_CONCEPT_HEADER_NOT_BILLABLE`, `TERM_VALUESET_CANNOT_EXPAND`,
  `TERM_VALUESET_EXPANSION_TRUNCATED`, `TERM_VALUESET_ENUMERATED_CODE_UNDEFINED`,
  `TERM_UCUM_INVALID`, `TERM_CROSSWALK_NO_MAP`, `TERM_CROSSWALK_UNMAPPED`,
  `TERM_CROSSWALK_CONTEXT_REQUIRED`, `TERM_GEM_MALFORMED_ROW`, `TERM_COMPLEX_MAP_MALFORMED_ROW`,
  `TERM_RXNORM_MALFORMED_ROW`, `TERM_RXNORM_UNTYPED_CONCEPT`, `TERM_RXNORM_UNKNOWN_RXCUI`,
  `TERM_RXNORM_NDC_UNMAPPED`.
