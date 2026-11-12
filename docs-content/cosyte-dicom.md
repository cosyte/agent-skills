---
id: cosyte-dicom
title: The cosyte-dicom skill
sidebar_label: cosyte-dicom
description: "The cosyte-dicom skill: when an agent should use @cosyte/dicom to parse DICOM Part 10 files and read their tags, with an example prompt."
---

# The cosyte-dicom skill

The `cosyte-dicom` skill teaches an agent to use [`@cosyte/dicom`](https://docs.cosyte.com/dicom/intro). Its source is
[skills/cosyte-dicom/SKILL.md](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-dicom/SKILL.md); the sections below quote it.

## What it does

A DICOM Part 10 parser and utility library for Node.js and TypeScript: metadata-first, tolerant of
vendor-quirky files, dual ESM/CJS. It reads the headers leniently, records every deviation it tolerated
as a stable warning code, exposes Pixel Data as raw bytes and never decodes pixels.

## When an agent should use it

- "Parse this .dcm file", "get the Patient ID / Study Instance UID / Modality out of a DICOM file".
- Index a folder of studies or a patient CD: patient, study, series and instance UIDs, accession number.
- Read pixel-interpretation metadata (rescale slope and intercept, Pixel Representation, Photometric
  Interpretation, Pixel Spacing, per-frame geometry of an Enhanced multi-frame object).
- Get an element by 8-character tag and decode its value (PN, DA, TM, DT, DS, IS, SQ and the rest);
  walk a DICOMDIR's Directory Records.
- Read a compressed object's Basic Offset Table and fragments as raw bytes; resolve GE, Siemens or
  Philips private tags with a vendor profile.
- Apply the PS3.15 Annex E Basic Profile to the header (metadata only) and serialize the result.

Use another skill when:

- One Safe Harbor policy and one value-free manifest across DICOM and other formats: cosyte-deid (its
  DICOM adapter delegates to this package).
- HL7 v2 orders and results (the accession number is typically OBR-18): cosyte-hl7; MLLP transport:
  cosyte-mllp.
- FHIR R4 resources such as ImagingStudy: cosyte-fhir. Code systems and ConceptMap: cosyte-terminology.
- The `cosyte` command line: cosyte-cli. Unsure which package fits: cosyte.

## Install

The skill comes with the rest of the collection: [install the skills](./installation.md) in your
agent, and in Claude Code with the plugin, run it as `/cosyte:cosyte-dicom`. The skill then tells the
agent how to install the package:

```bash
pnpm add @cosyte/dicom   # the README's recommendation; npm install @cosyte/dicom also works
```

- Node `>=22` (`engines.node` is `>=22.0.0`). Dual ESM and CJS with per-condition type declarations,
  one entry point (`@cosyte/dicom`), zero runtime dependencies.

## Example prompt

```text
Write a script that reads the patient ID, the study instance UID, the modality, the
image size and the rescale slope and intercept from a synthetic .dcm file, and reports
every deviation the parser tolerated.
```

## Result

The request asks to read DICOM header tags such as the Study Instance UID, Modality and Rescale Slope, which the description of `cosyte-dicom` lists. The agent loads the skill and follows its example, below. It is the code the skill
shows the agent for this task, not a recorded session: an agent's answer varies from run to run,
but the package, the API and the rules come from the skill.

From the README: a synthetic CT object saved without its 128-byte preamble, with an invented patient
and example-root UIDs.

```ts no-run copied from the skill, and this repository has no sample runner yet
import { parseDicom } from "@cosyte/dicom";

const buf = Buffer.from(
  "AgAAAFVMBAAcAAAAAgAQAFVJFAAxLjIuODQwLjEwMDA4LjEuMi4xAAgAFgBVSRoAMS4yLjg0MC4xMDAwOC41LjEuNC4xLjEuMgAIABgAVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMTExAAgAIABEQQgAMTkwMDAxMDEIAGAAQ1MCAENUEAAQAFBOCABEb2VeSmFuZRAAIABMTwYATVJOLTQyEAAhAExPDABTQU1QTEUtSE9TUCAgAA0AVUkeADEuMi44MjYuMC4xLjM2ODAwNDMuOC40OTguMS4xACAADgBVSR4AMS4yLjgyNi4wLjEuMzY4MDA0My44LjQ5OC4xLjIAIAARAElTAgAyICgAEABVUwIAAAIoABEAVVMCAAACKAAAAVVTAgAQACgAAwFVUwIAAQAoAFIQRFMGAC0xMDI0ICgAUxBEUwIAMSAoADAARFMIADAuNVwwLjUg",
  "base64",
);
const ds = parseDicom(buf);

// Read the patient and study identifiers into variables. Do not log them: the values in the
// comments are synthetic.
const patientId = ds.patient.id; // "MRN-42" (synthetic)
const issuer = ds.patient.issuerOfId; // "SAMPLE-HOSP" (synthetic)
const studyUid = ds.study.instanceUid; // "1.2.826.0.1.3680043.8.498.1.1" (synthetic)

// Log only what is safe: booleans, a modality, dimensions, rescale numbers, a warning code.
console.log("patient id and issuer present", patientId !== undefined, issuer !== undefined);
console.log("study uid present", studyUid !== undefined);
console.log("series", ds.series.modality, "image", ds.image.rows, "x", ds.image.columns);
console.log("rescale slope", ds.image.rescaleSlope, "intercept", ds.image.rescaleIntercept);
console.log("tolerated", ds.warnings.length, ds.warnings[0]?.code);
```

```text
patient id and issuer present true true
study uid present true
series CT image 512 x 512
rescale slope 1 intercept -1024
tolerated 1 DICOM_MISSING_PREAMBLE
```

## More in the skill

The skill also lists the [key API](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-dicom/SKILL.md#key-api), the
[limits and known defects](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-dicom/SKILL.md#limits-and-known-defects) and how to handle PHI
([PHI handling](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-dicom/SKILL.md#phi-handling)). The package's own documentation is at
[docs.cosyte.com/dicom/intro](https://docs.cosyte.com/dicom/intro).
