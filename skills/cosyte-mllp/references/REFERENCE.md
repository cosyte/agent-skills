# @cosyte/mllp reference (0.1.1)

Detail from the published README and type declarations. Placeholder application and facility
names and synthetic control ids only; no sample carries a name, a date of birth, an identifier or
an address.

## Contents

1. Framing without a socket
2. MLLPS (TLS) example
3. Server acknowledgement modes
4. Client defaults and send outcomes
5. `ack-from-hl7`: acknowledgements through the `@cosyte/hl7` peer
6. Socket-free tests
7. Warning codes

## 1. Framing without a socket

`encodeFrame` and `FrameReader` frame and unframe bytes with no socket. The reader is a stateful
decoder: feed it whatever TCP hands you and complete frames fire on `onFrame`.

```ts
import { encodeFrame, FrameReader } from "@cosyte/mllp";

const payload = Buffer.from(
  "MSH|^~\\&|SENDING_APP|SENDING_FAC|RECEIVING_APP|RECEIVING_FAC|20260101120000||ADT^A01|CTRL0001|P|2.5.1\r",
);

const frame = encodeFrame(payload);
console.log(frame.subarray(0, 3).toString("hex"), frame.subarray(-2).toString("hex"));
console.log("frame", frame.length, "payload", payload.length);

const reader = new FrameReader({
  onFrame: (bytes, byteOffset, warnings) => {
    console.log("onFrame at", byteOffset, bytes.length, "bytes,", warnings.length, "warnings");
  },
});

reader.push(frame.subarray(0, 10)); // partial chunk: nothing fires
reader.push(frame.subarray(10)); // completes the frame
```

```text
0b4d53 1c0d
frame 105 payload 102
onFrame at 0 102 bytes, 0 warnings
```

`0b` is the leading VT, `1c0d` the trailing FS CR. The decoder is lenient and the encoder strict;
tolerance is opt-in per flag and the server ships tolerant defaults.

## 2. MLLPS (TLS) example

The README's example, with the PEM material read from files.

```ts
import { readFileSync } from "node:fs";
import { createClient, createServer } from "@cosyte/mllp";

async function main(): Promise<void> {
  // Server: mutual TLS (IHE ATNA ITI-19). Add autoAck and onMessage as in SKILL.md.
  const server = createServer({
    tls: {
      cert: readFileSync("server-cert.pem"),
      key: readFileSync("server-key.pem"),
      ca: readFileSync("client-ca.pem"),
      clientAuth: "MUST",
    },
  });
  await server.listen(2575, "127.0.0.1");

  // Client: verify the peer, and present a certificate of our own
  const client = createClient({
    host: "mllp.example.com",
    port: 2575,
    tls: {
      ca: readFileSync("ca.pem"),
      cert: readFileSync("client-cert.pem"),
      key: readFileSync("client-key.pem"),
    },
  });
  await client.connect();
}

void main();
```

- `clientAuth` is `"NONE"`, `"WANT"` (request a client certificate, surface but do not enforce)
  or `"MUST"` (request and enforce).
- Certificate verification is on by default. The server binds `127.0.0.1` by default; a wildcard
  host needs `allowWildcardBind: true` and then raises a one-time `MLLP_BIND_ALL_INTERFACES`
  security warning.
- A TLS configuration the package will not open a connection on rejects `connect()` or
  `listen()` with `MllpTlsConfigurationError`; branch on its `code`, not its message.
- Failed handshakes on a server surface as `tlsClientError` events and the server keeps serving.

## 3. Server acknowledgement modes

From the `ServerOptions` declarations:

| `autoAck` | `onMessage` | Behaviour |
| --- | --- | --- |
| `"AA"` | set | Commit-gated: the server awaits the handler; resolve gives `AA`, throw gives `AE`, `MllpAckError` with `ackCode: "AR"` gives `AR`. Do not call `conn.send()`. |
| `"AA"` | not set | Transport accept: `AA` on frame receipt, meaning only received and framed. Unsafe on its own for clinical messages. |
| a function | optional | The function returns the ACK bytes and owns MSA-1 (for enhanced-mode `CA`, `CE`, `CR`); `onMessage` is observation only. Do not call `conn.send()`. |
| unset | set | Manual mode: the handler owns the response and sends it with `conn.send(...)`. |

`createStarterServer` defaults to `autoAck: "AA"`; `createServer` leaves it unset. A positive
auto-ACK is downgraded to `AE` (and a `nack` event fires with reason
`"uncorrelatable-inbound"` or `"discarded-bytes"`) when the inbound has no readable MSH, an empty
MSH-10, a batch or concatenated payload, or bytes the decoder discarded. A handler failure fires
`nack` with reason `"handler-rejected"`.

Other server options: `framing` (FrameReader tolerances, for example `maxFrameSizeBytes`),
`onWarning`, `keepaliveIntervalMs` (TCP keepalive), `deadPeerTimeoutMs` (idle close),
`drainTimeoutMs` (default 30000), `tls`, `allowWildcardBind`. `createStarterServer` adds `port`,
`host` and `handleSignals`.

## 4. Client defaults and send outcomes

`createStarterClient` returns a connected client with these defaults: `autoReconnect: true`,
`ackTimeoutMs: 30000`, `correlateByControlId: false` (FIFO), `pipeline: true`,
`highWaterMark: 64`, `onBackpressure: "reject"`, `handleSignals: false`. Other options:
`onMessage`, `retryStrategy`, `drainTimeoutMs`, `framing`, `keepaliveIntervalMs`,
`deadPeerTimeoutMs`, `tls`.

`client.send(payload, opts?)` resolves with the ACK payload. `opts` takes `signal`,
`ackTimeoutMs`, `applicationAckTimeoutMs` and `onCommitAck`. It rejects with:

| Error | Meaning | Resend? |
| --- | --- | --- |
| `MllpNeverDeliveredError` | still held in the client when it shut down; never written | Safe to resend |
| `MllpUnknownFateError` | written, no ACK by the time close finished | Do not blindly resend; the peer may hold it |
| `MllpTimeoutError` | no ACK within `ackTimeoutMs` (clock starts at write flush) | Decide with peer de-duplication |
| `MllpCommitRejectedError` | peer answered a negative commit (`CE` or `CR`) | `CR`: do not resend unchanged |
| `MllpApplicationAckError` | peer committed, application ACK never followed (enhanced mode) | The peer has custody |
| `MllpBackpressureError` | in-flight queue over `highWaterMark` with `onBackpressure: "reject"` | Retry later |
| `MllpConnectionError` | socket-layer failure; carries `phase` and a cause | Depends on phase |

Retransmission is your decision, keyed on the peer's de-duplication of MSH-10 plus MSH-7. Per the
declarations, these errors carry counts, byte lengths, codes and timestamps, never the payload or
the control id itself.

## 5. `ack-from-hl7`

`@cosyte/mllp/ack-from-hl7` builds acknowledgements through the optional `@cosyte/hl7` peer, which
it loads lazily on first call. It decodes the whole inbound message, PID included, so leave it out
if your data-flow boundary requires later segments never to be materialised as text.

```ts
import { createServer } from "@cosyte/mllp";
import { buildMllpAck } from "@cosyte/mllp/ack-from-hl7";

const store: Buffer[] = []; // stand-in for your durable store

async function main(): Promise<void> {
  // Manual mode (no autoAck): this handler owns the response, so commit first, then answer.
  const server = createServer({
    onMessage: async (payload, _meta, conn) => {
      let code: "AA" | "AE" = "AA";
      try {
        store.push(payload); // your durable commit
      } catch {
        code = "AE";
      }
      const ack = buildMllpAck(payload, { code });
      for (const w of ack.warnings) console.log(w.code); // log codes, not messages
      conn.send(ack.frame);
    },
  });
  await server.listen(2575, "127.0.0.1");
}

void main();
```

- `buildMllpAck(inbound, { code, error?, encoding? })` takes a parsed `Hl7Message`, a `Buffer` or
  a string and returns `frame` (ready to write), `payload`, `ack`, `requestedCode`, `code` (after
  any downgrade), `correlationId`, `mode` and `warnings`.
- Pass the raw `Buffer`: its default `latin1` codec makes MSA-2 echo MSH-10 byte for byte. A text
  inbound with a non-ASCII control id raises `MLLP_ACK_CONTROL_ID_UNVERIFIABLE`; a broken echo on a
  `Buffer` raises `MLLP_ACK_CONTROL_ID_NOT_VERBATIM`.
- An unparseable inbound never gets a positive code (`AA` becomes `AE`, `CA` becomes `CE`) and
  raises `MLLP_ACK_INBOUND_UNPARSEABLE`.
- Shortcuts: `buildAckAA`, `buildAckAE`, `buildAckAR`, `buildAckCA`, `buildAckCE`, `buildAckCR`.
  `detectMode(inbound)` returns `"original"` or `"enhanced"` and rethrows a parse failure.
- Missing peer: `MllpPeerMissingError` (`code: "MLLP_PEER_MISSING"`). Install `@cosyte/hl7`.
- Without the peer, `buildRawAck(payload, code)` from the root entry point builds a minimal
  original-mode ACK from the MSH alone.

## 6. Socket-free tests

`InMemoryTransport` from `@cosyte/mllp/testing` creates two connected ends; a write to one end
fires the other end's `onData` synchronously.

```ts
import { encodeFrame } from "@cosyte/mllp";
import { InMemoryTransport } from "@cosyte/mllp/testing";

const [client, server] = InMemoryTransport.pair();
server.onData((chunk) => console.log("server received", chunk.length, "bytes"));
client.write(encodeFrame(Buffer.from("MSH|^~\\&|SENDING_APP|SENDING_FAC|||20260101120000||ADT^A01|CTRL0001|P|2.5.1\r")));
```

It also offers `split(n)` for chunked reads, `pause()` and `resume()` for backpressure, and
`destroy(reason)` for an abrupt disconnect.

## 7. Warning codes

11 stable framing and correlation warning codes (renaming one is a breaking change):
`MLLP_MISSING_LEADING_VT`, `MLLP_FS_WITHOUT_CR`, `MLLP_LF_AFTER_FS`, `MLLP_LEADING_WHITESPACE`,
`MLLP_TRAILING_BYTES`, `MLLP_PAYLOAD_CONTAINS_VT`, `MLLP_PAYLOAD_CONTAINS_FS`,
`MLLP_EMPTY_PAYLOAD`, `MLLP_FRAME_TOO_LARGE`, `MLLP_ACK_UNMATCHED_CONTROL_ID`,
`MLLP_ACK_AFTER_TIMEOUT`.

`MLLP_MISSING_LEADING_VT` and `MLLP_FS_WITHOUT_CR` render the hex of one byte in their message,
which on a stream missing its leading VT is the first content byte. Log `code` and `byteOffset`
if that matters to your threat model.
