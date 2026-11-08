# @cosyte/fhir reference (0.1.4)

Everything here comes from the published 0.1.4 README and type declarations. The package exports
roughly two hundred names from one entry point; this page groups the ones most tasks need. Check
`node_modules/@cosyte/fhir/dist/index.d.ts` for the rest.

## The model

- `FhirNode` is one of three immutable kinds, discriminated on `kind`:
  - `FhirComplex` (`kind: "complex"`): `properties`, an insertion-ordered list of `{ name, value }`.
    A repeated property name in a non-conformant document keeps the first in `properties` and the
    rest in `duplicates`.
  - `FhirList` (`kind: "list"`): `items`, a repeating element.
  - `FhirPrimitive` (`kind: "primitive"`): `value` (`string`, `boolean`, `FhirDecimal`, or
    `undefined` when only metadata is present), plus `id` and `extension`.
- Type guards: `isComplex`, `isList`, `isPrimitive`. Constructors: `complex`, `list`, `primitive`.
- `getProperty(node, name)` returns the first value for a name; `getAllProperties(node, name)`
  returns every value including shadowed duplicates. `resourceType(node)` reads the type.
- `codeOf(node, preferredSystem?)`, `codingsOf(node)`, `hasCoding(node, system, code)` read codes.
- `FhirDecimal` keeps `raw`; `equals` is precision-sensitive (`0.010` is not `0.01`), `equalsValue`
  compares quantity only, `toBigInt` is exact for integer values, `toNumber` is the explicit lossy
  escape. `FhirInteger64` keeps the full 64-bit range as text with a `toBigInt()` view.
- `resolvePath(node, path)` and `pathExists(node, path)` walk dotted element paths with `[x]` choice
  suffixes (no functions, no filters). In 0.1.4 a repeating last segment comes back as the list node,
  not its items; flatten with `isList(node) ? node.items : [node]`.

## Read and write

- `parseResource(input: string | RawJson)`: `{ resource, issues }`. Lenient: an unexpected shape is
  preserved and flagged. Throws `FhirCodecError` (`code`, `expression`, `offset`) for
  `MALFORMED_JSON`, `PRIMITIVE_EXTENSION_MISALIGNED` and `MAX_DEPTH_EXCEEDED` (`FATAL_CODES`).
- `parseResourceXml(input)`: same result shape. Accepts plain XML only and throws `FhirXmlError`
  (`code`, `offset`) for `MALFORMED_XML`, `DTD_FORBIDDEN`, `UNDEFINED_ENTITY`, `MAX_DEPTH_EXCEEDED`
  (`XML_FATAL_CODES`). It performs no I/O and resolves no URI.
- The `offset` on `FhirCodecError` and `FhirXmlError` is an index into the input string in UTF-16
  code units, not a byte offset; the two differ once a non-ASCII character precedes the failure.
- Read issues (`ISSUE_CODES`): `DECIMAL_PRECISION_AT_RISK`, `UNKNOWN_PROPERTY`,
  `UNEXPECTED_XML_CONTENT`, `DUPLICATE_PROPERTY`, `NESTED_ARRAY`, `MISPLACED_PRIMITIVE_EXTENSION`,
  `MIXED_XML_SPELLING`, `UNDEFINED_JSON_NULL`. Each is `{ code, severity, expression }`.
- `serializeResource(node)` writes compact FHIR JSON; `serializeResourceXml(node)` writes XML. Both
  throw `FhirSerializeError` with a `SERIALIZE_ERROR_CODES` code when a model cannot be written
  faithfully. JSON written from a model read out of XML is not guaranteed spec-clean.
- `nodesEquivalent(a, b)` compares a JSON-read model with an XML-read one.

## Validate

- `validateResource(resource, options?)` returns `{ issues, valid, toOperationOutcome }`. `valid` is
  `true` when there is no `error` or `fatal` finding.
- `ValidateOptions`: `mode` (`"lenient"` default, `"strict"` makes unknown elements errors),
  `profiles` (`StructureDefinition[]`), `terminology` (`TerminologyService`), `bindings`, `schemas`,
  `resolveBase` (to snapshot a differential-only profile).
- `ValidationIssue`: `code`, `severity` (`fatal`, `error`, `warning`, `information`), `type` (the R4
  `IssueType`), `expression`, and `constraint` for invariant findings.
- `toOperationOutcome(issues)` builds a value-free `OperationOutcome`; with no findings it emits one
  `information` all-clear issue.
- Layers: structure, cardinality, value domains, R4 constraints on the eight modeled types
  (AllergyIntolerance, Condition, DiagnosticReport, Immunization, MedicationRequest,
  MedicationStatement, Observation, Patient), Quantity and UCUM shape, binding strength, and your
  profiles (fixed and pattern values, must-support, slicing, cardinality, FHIRPath invariants).
- `VALIDATION_CODES`: `UNKNOWN_ELEMENT`, `RESOURCE_TYPE_UNKNOWN`, `RESOURCE_NOT_MODELED`,
  `TYPE_MISMATCH`, `CHOICE_AMBIGUOUS`, `CARDINALITY_MIN`, `CARDINALITY_MAX`, `PRIMITIVE_INVALID`,
  `CODE_INVALID`, `UNHANDLED_MODIFIER_EXTENSION`, `DUPLICATE_PROPERTY`, `ARRAY_WRAPPED_SCALAR`,
  `ARRAY_WRAPPED_CHOICE`, `NESTED_ARRAY`, `DROPPED_ELEMENT_TEXT`, `ABSENCE_MARKER_CONFLICT`,
  `ABSENCE_MARKER_UNREADABLE`, `RETRACTED_RESOURCE`, `INVARIANT_VIOLATED`, `INVARIANT_UNCHECKED`,
  `UCUM_UNIT_UNRECOGNIZED`, `VITAL_SIGN_UNIT_NONCONFORMANT`, `VALUE_TYPE_UNEXPECTED`,
  `CODE_SYSTEM_UNKNOWN`, `CODE_SYSTEM_UNEXPECTED`, `CODE_NOT_IN_VALUESET`, `PROFILE_SLICE_UNMATCHED`,
  `PROFILE_SLICE_UNCHECKED`, `MUST_SUPPORT_ABSENT`, `PROFILE_VERSION_MISMATCH`,
  `PROFILE_FIXED_MISMATCH`, `PROFILE_PATTERN_MISMATCH`, `REFERENCE_UNRESOLVED`, `CONTAINED_CYCLE`,
  `FULLURL_ID_MISMATCH`.
- `INVARIANT_UNCHECKED` and `PROFILE_SLICE_UNCHECKED` mean "not evaluated". Never report them as a
  pass.

### Profiles

- `loadStructureDefinition(resource)` reads a parsed `StructureDefinition` (for example a US Core
  profile you supply); it returns `undefined` when the resource is not one or lacks a `type`.
- `defineProfile(spec)` authors one in code; it throws `InvalidProfileError` on a malformed spec.

```ts
import { defineProfile, parseResource, primitive, validateResource } from "@cosyte/fhir";

const finalOnly = defineProfile({
  url: "http://example.org/StructureDefinition/final-observation",
  type: "Observation",
  differential: [{ path: "Observation.status", fixed: { type: "Code", value: primitive("final") } }],
});

const { resource } = parseResource('{"resourceType":"Observation","status":"preliminary"}');
const result = validateResource(resource, { profiles: [finalOnly] });
console.log(result.issues.map((issue) => issue.code)); // includes "PROFILE_FIXED_MISMATCH"
```

### A terminology service of your own

None is bundled. `TerminologyService.validateCode({ valueSet, system, code })` is synchronous and
returns `{ membership: "in" | "not-in" | "unknown", systemVersion? }`.

```ts
import { parseResource, validateResource, type TerminologyService } from "@cosyte/fhir";

// Stand-in for your own value-set content, keyed by value set URL.
const members = new Map<string, ReadonlySet<string>>([
  ["http://example.org/ValueSet/demo", new Set(["http://loinc.org|8480-6"])],
]);

const terminology: TerminologyService = {
  validateCode: ({ valueSet, system, code }) => {
    const expansion = members.get(valueSet);
    if (expansion === undefined) return { membership: "unknown" };
    return { membership: expansion.has(`${system}|${code}`) ? "in" : "not-in" };
  },
};

export function validateWithTerminology(json: string) {
  return validateResource(parseResource(json).resource, { terminology });
}
```

## Safety readout

- `readSafety(resource)` returns a `SafetyReadout`: `resourceType`, `status`, `clinicalStatus`,
  `verificationStatus`, `doNotPerform`, `retracted`, `noKnownAllergy`, `negations`,
  `unhandledModifierExtensions`, `modifierElements`, `intents`, `datatypeUses`, location lists for
  unreadable or ambiguous shapes, and `safeToSummarize`.
- `negations` holds `NegationKind`s: `refuted`, `no-known-allergy`, `do-not-perform`, `not-taken`,
  `not-done`, `entered-in-error`. It covers the whole document, including `contained` resources and
  Bundle entries. The single-valued fields (`status`, `doNotPerform`, `retracted` and the rest) read
  the root resource only.
- `assertSafeToSummarize(resourceOrReadout)` throws `FhirSafetyError` (`locations` only) when the
  resource carries a `modifierExtension` it does not understand, a modifier element, a repeated
  property name, an array-wrapped single value, a nested array, dropped XML text, an unreadable
  boolean, negation code, intent or `use`, or a conflicting or unreadable absence marker.
- Constants for the codes it reads: `REFUTED`, `ENTERED_IN_ERROR`, `NOT_DONE`, `NOT_TAKEN`,
  `NO_KNOWN_ALLERGY`, `KNOWN_MODIFIER_EXTENSION_URLS`.

## Measured values

- `readObservationValue(node)` returns `{ type, property, node, quantity, ambiguous, encodingIssue }`
  or `undefined` when there is no `value[x]`. `type` is one of `OBSERVATION_VALUE_TYPES` (eleven
  variants); `quantity` is set only when `type === "Quantity"`. It works on a `component` too.
- `readQuantity(node)` returns `{ value, comparator, unit, system, code }`. Compare on `code` (UCUM),
  not on the display `unit`. `value` is `undefined` when no readable magnitude is found, including
  text outside the R4 decimal lexical space, and nothing is raised in that case.
- `readMedicationDoses(resource, resourceType(resource))` reads MedicationRequest and
  MedicationStatement dose quantities.
- `readReferenceRanges(observation)` and `readInterpretations(observation)` surface what the
  document says; no abnormal flag is ever computed.
- `validateUcumShape(code)` checks UCUM shape only, not that the unit exists. No unit is converted.

## Bundles and references

- `readBundle(bundle)` returns `{ type, processing, atomic, total, entries }`; `atomic` is `true`
  only for a `transaction`. `total` stays a string. Nothing is executed.
- `buildBundleIndex(bundle)` and `containedIndex(resource)` build closures;
  `resolveReference(reference, { bundle, contained })` answers `resolved` (with `target`),
  `unresolved` (a local miss) or `external` (outside the closure, not a defect).
- `hasContainedCycle(resource)` detects `contained` reference cycles without following them.

```ts
import { buildBundleIndex, parseResource, readBundle, resolveReference } from "@cosyte/fhir";

const { resource } = parseResource(
  '{"resourceType":"Bundle","type":"transaction","entry":[' +
    '{"fullUrl":"urn:uuid:1","resource":{"resourceType":"Patient","id":"1"},' +
    '"request":{"method":"POST","url":"Patient"}}]}',
);

const bundle = readBundle(resource);
console.log(bundle.atomic, bundle.entries[0]?.requestMethod); // true "POST"
console.log(resolveReference("urn:uuid:1", { bundle: buildBundleIndex(resource) }).status);
```

## Bulk Data NDJSON

- `streamNdjson(source, { maxLineBytes? })` reads any async or sync iterable of `string` or
  `Uint8Array` chunks (a Node `Readable`, a web stream, a generator) and yields one `NdjsonRecord`
  per non-blank line without loading the whole file. `maxLineBytes` defaults to 16 MiB.
- A record has `line` and either `resource` (plus `issues`) or `error` (`line`, `code`, `message`).
  `NDJSON_ERROR_CODES`: `MALFORMED_JSON`, `NOT_A_RESOURCE`, `LINE_TOO_LONG`. A bad line never stops
  the stream and its content is never reported.
- `parseNdjsonLine(line, lineNumber?)` does the same for one line and never throws.

```ts
import { streamNdjson } from "@cosyte/fhir";

// `chunks` can be a Node Readable such as fs.createReadStream(path).
export async function countResources(chunks: AsyncIterable<string | Uint8Array>): Promise<number> {
  let count = 0;
  for await (const record of streamNdjson(chunks)) {
    if (record.error) console.warn("bad line", record.error.line, record.error.code);
    else if (record.resource) count += 1;
  }
  return count;
}
```
