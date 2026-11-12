---
id: cosyte-ncpdp
title: The cosyte-ncpdp skill
sidebar_label: cosyte-ncpdp
description: "The cosyte-ncpdp skill: when an agent should use @cosyte/ncpdp for NCPDP Telecom claims and SCRIPT e-prescriptions, with an example prompt."
---

# The cosyte-ncpdp skill

The `cosyte-ncpdp` skill teaches an agent to use [`@cosyte/ncpdp`](https://docs.cosyte.com/ncpdp/intro). Its source is
[skills/cosyte-ncpdp/SKILL.md](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-ncpdp/SKILL.md); the sections below quote it.

## What it does

NCPDP parser, serializer and builder for Node.js and TypeScript: SCRIPT ePrescribing (XML) and
Telecommunication Standard pharmacy claims (control-character framed), lenient on parse and
spec-clean on emit. A vendor quirk becomes a positioned warning with a stable code, and money and
quantities are handled string-wise so floating point never touches a value.

## When an agent should use it

- "Parse this NCPDP Telecom claim", "read this D.0 B1 transmission", FS/GS/RS-separated bytes.
- "Was this claim paid or rejected?": disposition, reject codes, pricing and DUR alerts.
- Compound ingredients, coordination-of-benefits payments, DUR/PPS or prior authorization segments.
- "Parse this NewRx": patient, prescriber, medication, NDC and SIG text from SCRIPT XML; or a
  Status, Error, Verify, RxRenewal, RxChange or CancelRx response.
- Build a Telecom request (`buildTelecomRequest`) or a SCRIPT NewRx (`buildNewRx`).

Use another skill when: you need synthetic NCPDP fixtures (cosyte-synth); the claim is X12 837,
835 or 270/271 (cosyte-x12); the message is HL7 v2 (cosyte-hl7) or FHIR (cosyte-fhir); you need
RxNorm or other code lookups (cosyte-terminology); you must de-identify data (cosyte-deid); you
are unsure which package fits (cosyte).

## Install

The skill comes with the rest of the collection: [install the skills](./installation.md) in your
agent, and in Claude Code with the plugin, run it as `/cosyte:cosyte-ncpdp`. The skill then tells the
agent how to install the package:

```bash
pnpm add @cosyte/ncpdp
# or
npm install @cosyte/ncpdp
```

Node 22 or newer. ESM with a CommonJS build beside it, both through the `exports` map. No runtime
dependencies: since 0.1.7 the SCRIPT side reads XML with its own reader, which refuses any DOCTYPE.
Entry points: `@cosyte/ncpdp/telecom`, `/script`, `/common`, `/profiles` and the root; since 0.1.6
the root re-exports every Telecom export. Each entry point is its own bundle, so a default profile
set through `@cosyte/ncpdp/profiles` does not reach a parser imported from another subpath: set and
parse through the same entry point.

## Example prompt

```text
Build a synthetic NCPDP Telecom D.0 B1 billing claim, serialize it, then parse it back
and print the cardholder ID, the prescription number, the product ID and qualifier,
and the quantity dispensed.
```

## Result

The request asks to build and decode a Telecom D.0 claim, which the description of `cosyte-ncpdp` lists. The agent loads the skill and follows its example, below. It is the code the skill
shows the agent for this task, not a recorded session: an agent's answer varies from run to run,
but the package, the API and the rules come from the skill.

```ts no-run copied from the skill, and this repository has no sample runner yet
import { buildTelecomRequest, serializeTelecom, parseTelecom, claim } from "@cosyte/ncpdp/telecom";

// Emit a spec-clean Telecom B1 billing claim. Every value below is synthetic.
const wire = serializeTelecom(
  buildTelecomRequest({
    header: { transactionCode: "B1", binNumber: "999999", dateOfService: "20260115" },
    segments: [
      { segmentId: "04", fields: [{ id: "C2", value: "SYNTHCARD09" }] },
      {
        segmentId: "07",
        fields: [
          { id: "D2", value: "RX0000001" },
          { id: "E1", value: "03" },
          { id: "D7", value: "99999999999" },
          { id: "E7", value: "30000" },
          { id: "D5", value: "30" },
        ],
      },
    ],
  }),
);

// Read it back. A vendor quirk becomes a positioned warning here, never a throw.
const t = parseTelecom(wire);
const c = claim(t);

console.log(t.kind, t.header.transactionCode, t.warnings.length);
// Read the member and prescription numbers into variables. Do not log them: the values in the
// comments are synthetic.
const cardholderId = c?.cardholderId; // "SYNTHCARD09" (synthetic)
const rxNumber = c?.prescriptionReferenceNumber; // "RX0000001" (synthetic)
console.log("cardholder id and Rx number present", cardholderId !== undefined, rxNumber !== undefined);
console.log(c?.product?.id, c?.product?.qualifier);
console.log(c?.quantityDispensed?.source, c?.quantityDispensed?.impliedDecimal);
```

```text
request B1 0
cardholder id and Rx number present true true
99999999999 03
30000 30.000
```

## More in the skill

The skill also lists the [key API](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-ncpdp/SKILL.md#key-api), the
[limits and known defects](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-ncpdp/SKILL.md#limits-and-known-defects) and how to handle PHI
([PHI handling](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-ncpdp/SKILL.md#phi-handling)). The package's own documentation is at
[docs.cosyte.com/ncpdp/intro](https://docs.cosyte.com/ncpdp/intro).
