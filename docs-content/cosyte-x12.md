---
id: cosyte-x12
title: The cosyte-x12 skill
sidebar_label: cosyte-x12
description: "The cosyte-x12 skill: when an agent should use @cosyte/x12 to parse, read and build X12 005010 healthcare EDI, with an example prompt."
---

# The cosyte-x12 skill

The `cosyte-x12` skill teaches an agent to use [`@cosyte/x12`](https://docs.cosyte.com/x12/intro). Its source is
[skills/cosyte-x12/SKILL.md](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-x12/SKILL.md); the sections below quote it.

## What it does

An ASC X12 healthcare EDI parser, serializer and builder for Node.js and TypeScript: lenient on
parse, spec-clean on emit. It decodes the HIPAA 005010 transaction sets into typed models, keeps
every amount in exact decimal arithmetic, and reports each tolerated vendor deviation as a stable
warning code.

## When an agent should use it

- "Parse this X12 file", "read this EDI interchange in Node", "what is in this ISA envelope".
- "Read an 835", "post this ERA", "how much did the payer pay and why", "reconcile the 835".
- "Read or build an 837P / 837I / 837D claim".
- "Answer a 270 with a 271", "read the 271 eligibility benefits", "claim status 276/277".
- "Build a 999 or TA1 acknowledgment", "read a 834 enrollment file", "read an 820".

Use another skill when:

- The data is HL7 v2 (pipe-delimited, starts with `MSH|`): use cosyte-hl7.
- The data is an NCPDP pharmacy claim: use cosyte-ncpdp.
- You need synthetic X12 fixtures for tests: use cosyte-synth.
- You need to strip identifiers from an interchange: use cosyte-deid.

## Install

The skill comes with the rest of the collection: [install the skills](./installation.md) in your
agent, and in Claude Code with the plugin, run it as `/cosyte:cosyte-x12`. The skill then tells the
agent how to install the package:

```bash
npm install @cosyte/x12
```

The README leads with `pnpm add @cosyte/x12`; yarn works the same way. Node 22.0.0 or later, zero
runtime dependencies, dual ESM and CJS builds with type declarations for both. Everything ships from
one entry point; there are no subpath imports.

## Example prompt

```text
Read the synthetic 835 remittance in test/fixtures/remit-835.edi and tell me how much
the payer paid, what the first claim charged, what the patient owes and why.
```

## Result

The request asks to read an 835 remittance, which the description of `cosyte-x12` lists. The agent loads the skill and follows its example, below. It is the code the skill
shows the agent for this task, not a recorded session: an agent's answer varies from run to run,
but the package, the API and the rules come from the skill.

From the README: parse an 835 and read the payment, the claim split and the adjustment reason. The
interchange is synthetic.

```ts no-run copied from the skill, and this repository has no sample runner yet
import { parseX12, get835 } from "@cosyte/x12";

const raw = `ISA*00*          *00*          *ZZ*MEDICARE       *ZZ*SUBMITTER      *260601*1200*^*00501*000000001*0*P*:~
GS*HP*MEDICARE*SUBMITTER*20260601*1200*1*X*005010X221A1~
ST*835*0001~
BPR*I*450.00*C*ACH*CCP*01*123456789*DA*987654321*1512345678**01*111111111*DA*222222222*20260601~
TRN*1*0012345*1512345678~
DTM*405*20260601~
N1*PR*MEDICARE PART A~
N3*123 PAYER WAY~
N4*BALTIMORE*MD*21244~
PER*BL*JANE COORDINATOR*TE*5551234567~
N1*PE*SAMPLE CLINIC INC~
N3*456 PROVIDER LN~
N4*CLEVELAND*OH*44113~
REF*TJ*123456789~
LX*1~
CLP*PT-ACCT-001*1*500.00*450.00*50.00*MC*PAYER-CLAIM-001*11*1~
NM1*QC*1*PATIENT*TEST*A***MI*MEMBER001~
NM1*82*2*RENDERING PROVIDER INC*****XX*1234567890~
DTM*232*20260501~
DTM*233*20260501~
SVC*HC:99213*500.00*450.00**1~
DTM*472*20260501~
CAS*PR*1*50.00~
REF*6R*LINE-CTRL-001~
SE*23*0001~
GE*1*1~
IEA*1*000000001~`;

const ix = parseX12(raw);
const tx = ix.groups[0]?.transactions.find((t) => t.st.elements[1] === "835");
if (tx === undefined) throw new Error("no 835 in this interchange");
const remit = get835(ix.delimiters, tx);
if (remit === undefined) throw new Error("not an 835");

const claim = remit.claims[0];
const adjustment = claim?.serviceLines[0]?.adjustments[0];
console.log("paid", remit.payment.totalActualPayment?.toString(), "by", remit.payment.method);
// The patient control number is an account number. Read it into a variable; do not log it.
const accountNumber = claim?.patientControlNumber; // "PT-ACCT-001" (synthetic)
console.log("claim has account number", accountNumber !== undefined, "charged", claim?.totalChargeAmount?.toString());
console.log("patient owes", claim?.patientResponsibilityAmount?.toString());
console.log("reason", adjustment?.groupCode, adjustment?.reasonCode, adjustment?.reasonDescription);
console.log("warnings", ix.warnings.length);
```

```text
paid 450.00 by ACH
claim has account number true charged 500.00
patient owes 50.00
reason PR 1 Deductible Amount
warnings 0
```

The `groupCode` says who owes the money (`PR` patient responsibility, `CO` contractual obligation).
Read it; never infer it.

## More in the skill

The skill also lists the [key API](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-x12/SKILL.md#key-api), the
[limits and known defects](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-x12/SKILL.md#limits-and-known-defects) and how to handle PHI
([PHI handling](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-x12/SKILL.md#phi-handling)). The package's own documentation is at
[docs.cosyte.com/x12/intro](https://docs.cosyte.com/x12/intro).
