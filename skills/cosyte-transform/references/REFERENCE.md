# @cosyte/transform reference (0.2.1)

Detail from the published README and type declarations. Use synthetic data only.

## Contents

1. Datatype converters
2. Message families and the segment map
3. Refusals worth knowing before you consume a Bundle
4. Coded value translation
5. The reverse path (FHIR to v2)
6. Issue codes
7. PID fields the Patient does not carry

## 1. Datatype converters

Each converter returns `{ value, issues }`: the FHIR datatype node it could faithfully produce
(or `undefined`) plus the value-free issues it raised.

| Converter | v2 to FHIR |
| --- | --- |
| `toFhirDateTime(ts, options?)` | DTM/TS to `dateTime` (a lexical string) |
| `toFhirIdentifier(cx, ctx?)` | CX to `Identifier` |
| `toFhirCodeableConcept(cwe, ctx?)` | CWE/CE to `CodeableConcept` |
| `toFhirHumanName(xpn)` | XPN to `HumanName` |
| `toFhirAddress(xad)` | XAD to `Address` |
| `toFhirQuantity(value, units, ctx?)` | NM plus units to `Quantity` |

```ts
import { serializeResource } from "@cosyte/fhir";
import { parseDtm } from "@cosyte/hl7";
import { toFhirDateTime, toFhirHumanName } from "@cosyte/transform";

const name = toFhirHumanName({ familyName: "Public", givenName: "Jane", nameTypeCode: "L" });
console.log(name.value === undefined ? "no value" : serializeResource(name.value));
// {"use":"official","family":"Public","given":["Jane"]}

const dob = toFhirDateTime(parseDtm("20260721"));
console.log(dob.value); // "2026-07-21": date-only precision is kept exactly

const naked = toFhirDateTime(parseDtm("20260721143000"));
console.log(naked.value, naked.issues.map((i) => i.code));
// reduced to date precision, TRANSFORM_TIMESTAMP_NO_TIMEZONE
```

The fail-safe rule: on a time of day with no timezone, an assigning authority that does not
resolve to a system URI, an unrecognized or absent coding system, or a unit that is not UCUM,
the converter produces what it can (often at reduced precision) and raises an issue. Magnitudes
are never converted, and a system URI is never synthesized from a bare HD.1 namespace (that would
merge two patients). The only automatic HD derivations are `urn:oid:` (HD.2 an OID with HD.3
`ISO`) and `urn:uuid:` (HD.3 `UUID`).

## 2. Message families and the segment map

`toFhir(msg)` returns a FHIR R4 message Bundle: `MessageHeader` first, then the resources, every
reference resolving to a `urn:uuid:` fullUrl inside the Bundle.

| Segment | FHIR resource | Key maps |
| --- | --- | --- |
| MSH | `MessageHeader` | MSH-9 to `eventCoding`; MSH-7 and MSH-10 to `Bundle.timestamp` and `.identifier` |
| PID | `Patient` | PID-3, 5, 7, 8, 11 to `identifier`, `name`, `birthDate`, `gender`, `address` |
| PV1 | `Encounter` | PV1-2 to `class` and `status` (HL70004); PV1-19, 44, 45 to `identifier`, `period` |
| NK1 | `RelatedPerson` | NK1-2, 3, 4 to `name`, `relationship`, `address` |
| AL1 | `AllergyIntolerance` | AL1-2 to `category` and `type` (two maps); AL1-3, 4, 5 to `code`, `criticality`, `reaction` |
| DG1 | `Condition` | DG1-3, 4 to `code`, `code.text`; DG1-5, 19 to `onsetDateTime`, `recordedDate`; DG1-21 `D` to `verificationStatus` |
| PR1 | `Procedure` | PR1-3, 4 to `code`, `code.text`; PR1-5 plus PR1-7 to `performedDateTime` or `performedPeriod`; PR1-6, 15 to `category`, `reasonCode` |
| IN1 | `Coverage` | IN1-2, 15 to `identifier`, `type`; IN1-12, 13 to `period`; IN1-4.1 to `payor.display`; IN1-10, 49 to the subscriber-id extension |

Other families through the same `toFhir(msg)`:

- ORU^R01: OBR to `DiagnosticReport`, OBX to `Observation`, SPM to `Specimen` (withheld with its
  report rather than orphaned). OBSERVATION-group NTE becomes `Observation.note`. OBX-2 selects
  `value[x]`, including `DR` period, `NR` range, `TM` time, `NA` sampled data and a Base64 `ED`
  payload carried byte for byte, undecoded, in the IG's `valueAttachment` extension.
- ORM_O01 and OML_O21: ORC/OBR to `ServiceRequest` (status from HL70119, withheld when it cannot
  be grounded), RXO plus RXR route to `MedicationRequest` (status `unknown` unless grounded).
- TQ1 on an order: `dosageInstruction.timing` on a MedicationRequest, `occurrenceTiming` on a
  ServiceRequest. TQ1-10 and TQ1-11 are free text read whole. A schedule is fully grounded or
  withheld with an issue: a half-built timing is never emitted.
- VXU_V04: RXA (plus RXR, ORC) to `Immunization`.
- SIU_S12: SCH, AIS and PID to `Appointment`.
- MDM_T02: TXA and OBX to `DocumentReference`; status grounded only for TXA-19 `AV`, document body
  base64-encoded verbatim and never interpreted.

A trigger the IG has no message map for is assembled from the segment maps and flagged
`TRANSFORM_SEGMENT_ASSEMBLED`. The mapped triggers are in `IG_MAPPED_ADT_TRIGGERS`,
`IG_MAPPED_ORU_TRIGGERS`, `IG_MAPPED_ORDER_TRIGGERS`, `IG_MAPPED_IMMUNIZATION_TRIGGERS`,
`IG_MAPPED_APPOINTMENT_TRIGGERS` and `IG_MAPPED_DOCUMENT_TRIGGERS`.

## 3. Refusals worth knowing before you consume a Bundle

- AllergyIntolerance: `clinicalStatus` is `active` as the IG assigns. AL1-2 resolves `category`
  and `type` independently (a `MA` gets type `allergy` and no category); the original v2 code is
  kept in the `alternate-codes` extension. `criticality` is the only severity target; an unmapped
  HL70128 code leaves it absent and flagged. An AL1 naming no substance, or with no Patient, is
  withheld. AL1-6 is read as `onsetDateTime` only before v2.7.
- Condition, Procedure, Coverage: each references the Bundle Patient and is withheld without one.
  `Coverage.status` ships value-absent with `data-absent-reason` `unknown`: read it as unknown,
  not active. `Coverage.payor` is a `display` only; an IN1 naming no insurer is withheld.
  `Procedure.status` is `unknown` where the message determines none. DG1-21 `D` sets
  `verificationStatus` to `entered-in-error`; other action codes leave it absent and flagged.
- Any map row whose target needs a Practitioner, Location or Organization (PV1-3, PV1-7, PV1-8
  among them) raises an issue naming the field and the path not built.
- Emit gate: each resource is checked against an internal required-element schema; a resource
  with a structural error is withheld and flagged `TRANSFORM_RESOURCE_INVALID`. When the Patient
  is withheld, the Encounter subject and any RelatedPerson are dropped, so references always
  resolve.
- Segment completeness: a segment occurrence that reached no emitted resource raises
  `TRANSFORM_SEGMENT_NOT_EMITTED` (the IG has a map) or `TRANSFORM_SEGMENT_NO_IG_MAP` (it has none,
  or the name could not be classified). Location is `DG1[2]` (1-based per name) or `[#4]` for an
  unclassifiable name. A flagged segment is still not transformed.
- Conformance: none of the IG's seven published test messages yields a Bundle with zero errors
  against FHIR R4 4.0.1 plus `hl7.fhir.us.core` 9.0.0; six of seven are clean against base R4. US
  Core asks for elements the IG maps publish no row for (`Encounter.type`,
  `Coverage.relationship`, `Observation.category`, `DocumentReference.category`), and they are left
  absent. The repository's `documentation/conformance/report.md` lists every finding.

## 4. Coded value translation

`toFhirCodeableConceptVia(cwe, map)` translates a table code through a transcribed IG ConceptMap
and keeps the raw coding beside the derived one. A code the map leaves unmapped is flagged, never
coerced to a neighbour. Maps: `ROUTE_VALUE_MAP` and `SITE_VALUE_MAP` (RXR, HL70162 and HL70550),
`APPOINTMENT_TYPE_VALUE_MAP` (SCH-8, HL70277), `SUBSTITUTION_VALUE_MAP` (RXO-9, HL70161), and the
AL1 maps `ALLERGY_CATEGORY_VALUE_MAP`, `ALLERGY_TYPE_VALUE_MAP`, `ALLERGY_CRITICALITY_VALUE_MAP`,
`ALLERGY_ORIGINAL_CATEGORY_VALUE_MAP`, `ALLERGY_ORIGINAL_CRITICALITY_VALUE_MAP`. OBR-5 priority
uses `SERVICE_REQUEST_PRIORITY_MAP`. SNOMED CT targets (RXR-4 method, SCH-7 reason) stay
structural: bring your own ConceptMap.

## 5. The reverse path (FHIR to v2)

| Function | In | Out |
| --- | --- | --- |
| `toV2Patient(patient, trigger, options?)` | FHIR `Patient` | a v2 `ADT^trigger` message with a PID |
| `toV2Observation(observation, trigger, options?)` | FHIR `Observation` | a v2 `ORU^trigger` message with an OBX |

```ts
import { parseResource } from "@cosyte/fhir";
import { toV2Patient } from "@cosyte/transform";

// A synthetic Patient. The system URI is a documentation placeholder.
const patientJson = JSON.stringify({
  resourceType: "Patient",
  identifier: [{ system: "https://example.org/fhir/sid/mrn", value: "MRN1" }],
  name: [{ family: "Public", given: ["Jane"] }],
});

const { resource } = parseResource(patientJson);
const { value, issues } = toV2Patient(resource, "A28", {
  assigningAuthorities: { "https://example.org/fhir/sid/mrn": "HOSP" },
  envelope: { sendingApp: "EHR", sendingFacility: "MAIN" },
});
console.log(value === undefined ? "no message" : "message built");
for (const i of issues) console.log(i.severity, i.code, i.v2Location);
```

- The trigger is required and never inferred: without it you get no message and one
  `TRANSFORM_MISSING_TRIGGER`.
- Lossy by design, not a round trip. Refused as ambiguous (`TRANSFORM_CODE_NOT_INVERTIBLE`):
  `gender` `other`, name use `official` and `temp`, address use `work`, every `Address.type`, and
  `Observation.status` `entered-in-error`. An element with no v2 field is flagged
  `TRANSFORM_NO_V2_TARGET`; a value v2 cannot carry unchanged, `TRANSFORM_VALUE_NOT_REPRESENTABLE`;
  a coding system with no v2 mnemonic, `TRANSFORM_CODE_SYSTEM_NOT_V2`.
- Required v2 fields with no source (PID-3, PID-5, OBX-11) are left absent with one
  `TRANSFORM_V2_REQUIRED_FIELD_ABSENT` each, at error severity. A resource that grounds no field
  returns no message and `TRANSFORM_NO_V2_MESSAGE_EMITTED`.
- Options: `assigningAuthorities` (system URI to HD.1 namespace), `codeSystems`, `envelope` (MSH
  sending and receiving application and facility, control id, timestamp, version, processing id;
  never the message type).

## 6. Issue codes

`ISSUE_CODES` (stable; a rename or removal is a breaking change, new codes are additions):

| Forward (v2 to FHIR) | Reverse (FHIR to v2) |
| --- | --- |
| `TRANSFORM_TIMESTAMP_NO_TIMEZONE` | `TRANSFORM_MISSING_TRIGGER` |
| `TRANSFORM_TIMESTAMP_INVALID` | `TRANSFORM_UNSUPPORTED_RESOURCE` |
| `TRANSFORM_IDENTIFIER_SYSTEM_UNRESOLVED` | `TRANSFORM_RESOURCE_MALFORMED` |
| `TRANSFORM_CODE_UNMAPPED` | `TRANSFORM_NO_V2_TARGET` |
| `TRANSFORM_CODE_SYSTEM_UNRESOLVED` | `TRANSFORM_VALUE_NOT_REPRESENTABLE` |
| `TRANSFORM_UNIT_NOT_UCUM` | `TRANSFORM_CODE_NOT_INVERTIBLE` |
| `TRANSFORM_QUANTITY_VALUE_INVALID` | `TRANSFORM_CODE_SYSTEM_NOT_V2` |
| `TRANSFORM_ELEMENT_DROPPED` | `TRANSFORM_V2_REQUIRED_FIELD_ABSENT` |
| `TRANSFORM_NAME_USE_UNMAPPED` | `TRANSFORM_NO_V2_MESSAGE_EMITTED` |
| `TRANSFORM_ADDRESS_USE_UNMAPPED` | |
| `TRANSFORM_SEGMENT_ASSEMBLED` | |
| `TRANSFORM_RESOURCE_INVALID` | |
| `TRANSFORM_REQUIRED_ELEMENT_UNKNOWN` | |
| `TRANSFORM_SEGMENT_NOT_EMITTED` | |
| `TRANSFORM_SEGMENT_NO_IG_MAP` | |
| `TRANSFORM_TIMESTAMP_DROPPED_BY_PARSER` | |

The grouping above is ours, for reading; branch on the code, not the column. Each code's
severity (`error`, `warning` or `information`), FHIR issue type and static message are in
`ISSUE_REGISTRY`. `FATAL_CODES` (`EMPTY_INPUT`, `TRANSFORM_UNSUPPORTED_INPUT`) are reserved for
thrown errors; per the type declarations nothing in the library throws one today.

## 7. PID fields the Patient does not carry

The Patient built from PID carries `identifier` (PID-3), `name` (PID-5), `birthDate` (PID-7, time
of day dropped with `TRANSFORM_ELEMENT_DROPPED`), `gender` (PID-8) and `address` (PID-11), with only
the first repetition of PID-5 and PID-11. Since 0.2.0 a valued PID-10, PID-15, PID-19, PID-22,
PID-29 or PID-30 raises `TRANSFORM_ELEMENT_DROPPED` at information severity at its own location
(`PID.10` and so on), naming the FHIR element the guide maps it to where there is one, and PID-13
and PID-14 telecom raise one each at `PID.13` and `PID.14`. None of these fields is mapped, and the
issues carry no values. Consequences and what to do:

- A deceased patient comes out with no `deceasedBoolean` or `deceasedDateTime`. Never read that
  absence as alive. Check PID-30 (`msg.get("PID.30")`) and PID-29
  (`msg.segments("PID")[0]?.field(29).asTs()`) yourself.
- Race, ethnicity and language are on the `@cosyte/hl7` Patient view: `msg.patient?.race`
  (PID-10, CWE), `msg.patient?.ethnicity` (PID-22, CWE), `msg.patient?.language` (PID-15, CE).
- PID-19 has no named helper; `msg.get("PID.19")` reads it. Treat it as the most sensitive value
  in the segment.
- The issues tell you a field was dropped, not its value: read the value from the parsed message.
