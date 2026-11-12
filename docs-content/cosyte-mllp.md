---
id: cosyte-mllp
title: The cosyte-mllp skill
sidebar_label: cosyte-mllp
description: "The cosyte-mllp skill: when an agent should use @cosyte/mllp to send and receive HL7 v2 over MLLP, with an example prompt."
---

# The cosyte-mllp skill

The `cosyte-mllp` skill teaches an agent to use [`@cosyte/mllp`](https://docs.cosyte.com/mllp/intro). Its source is
[skills/cosyte-mllp/SKILL.md](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-mllp/SKILL.md); the sections below quote it.

## What it does

HL7 v2 over MLLP for Node.js: client, server, framing codec, acknowledgement correlation and
reconnects, as a library with zero runtime dependencies and an in-memory transport for tests. It
is the transport-only sibling of `@cosyte/hl7`, built around one guarantee: a positive
acknowledgement cannot precede a durable commit.

## When an agent should use it

- "Build an HL7 listener", "receive HL7 v2 over TCP", "stand up an MLLP server".
- "Send this ADT/ORU to the interface engine and wait for the ACK".
- Deciding when to answer `AA`, `AE` or `AR`, and what a failed commit should return.
- Framing or unframing MLLP bytes (`VT + payload + FS + CR`) without a socket.
- Reconnects, timeouts, backpressure and a clean shutdown that says which sends are safe to retry.
- MLLPS: TLS with certificate verification, mutual TLS (IHE ATNA ITI-19).
- Socket-free tests of an MLLP integration; a parity check against your own engine endpoint.

Use another skill when:

- parsing or reading fields of the message (PID, OBX, MSH-9): `cosyte-hl7`;
- converting the received message to FHIR: `cosyte-transform`;
- generating synthetic HL7 test traffic: `cosyte-synth`; the `cosyte` CLI: `cosyte-cli`.

## Install

The skill comes with the rest of the collection: [install the skills](./installation.md) in your
agent, and in Claude Code with the plugin, run it as `/cosyte:cosyte-mllp`. The skill then tells the
agent how to install the package:

```bash
npm install @cosyte/mllp
# the README's form
pnpm add @cosyte/mllp

# optional peer, needed only for the ack-from-hl7 subpath
pnpm add @cosyte/hl7
```

`engines.node` is `>=22.0.0` (tested on 22, 24 and 26). Published dual ESM and CommonJS, each
with its own type declarations. Zero runtime dependencies. Three code subpaths: `@cosyte/mllp`,
`@cosyte/mllp/testing` and `@cosyte/mllp/ack-from-hl7`. The payload API is Buffer-first: messages
are raw bytes and charset decoding is yours.

## Example prompt

```text
Build an HL7 listener in Node that receives messages over MLLP on a local port,
stores each one, and acknowledges only after the store succeeds. Show it working with
one synthetic ADT^A01 sent from a client.
```

## Result

The request asks for an HL7 listener over MLLP and for when to acknowledge, which the description of `cosyte-mllp` lists. The agent loads the skill and follows its example, below. It is the code the skill
shows the agent for this task, not a recorded session: an agent's answer varies from run to run,
but the package, the API and the rules come from the skill.

The README's round trip, wrapped in a function. The server auto-acknowledges after the handler.

```ts no-run copied from the skill, and this repository has no sample runner yet
import { createStarterClient, createStarterServer } from "@cosyte/mllp";

async function main(): Promise<void> {
  const committed: Buffer[] = [];

  // Port 0: the OS picks a free port. The host defaults to loopback, 127.0.0.1.
  const server = await createStarterServer({
    port: 0,
    onMessage: async (payload) => {
      committed.push(payload); // your durable commit: a throw here answers AE, never AA
    },
  });

  const client = await createStarterClient({ host: "127.0.0.1", port: server.getStats().port ?? 0 });

  const ack = await client.send(
    Buffer.from(
      "MSH|^~\\&|SENDING_APP|SENDING_FAC|RECEIVING_APP|RECEIVING_FAC|20260101120000||ADT^A01|CTRL0001|P|2.5.1\r",
    ),
  );

  // Log the shape of the acknowledgement, never its field values.
  const msa = ack
    .toString("utf8")
    .split("\r")
    .find((segment) => segment.startsWith("MSA|"))
    ?.split("|");
  console.log("acknowledgement code:", msa?.[1]);
  console.log("MSA-2 echoes the control id sent:", msa?.[2] === "CTRL0001");
  console.log("messages committed:", committed.length);

  await client.close();
  await server.close();
}

void main();
```

```text
acknowledgement code: AA
MSA-2 echoes the control id sent: true
messages committed: 1
```

## More in the skill

The skill also lists the [key API](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-mllp/SKILL.md#key-api), the
[limits and known defects](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-mllp/SKILL.md#limits-and-known-defects) and how to handle PHI
([PHI handling](https://github.com/cosyte/agent-skills/blob/main/skills/cosyte-mllp/SKILL.md#phi-handling)). The package's own documentation is at
[docs.cosyte.com/mllp/intro](https://docs.cosyte.com/mllp/intro).
