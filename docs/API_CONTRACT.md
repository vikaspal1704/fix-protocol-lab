# API Contract

**Normative.** Implementations MUST match these wire rules, TypeScript signatures and JSON shapes.

---

## 1. FIX wire rules (FIX 4.4 subset)

| Rule | Value |
|------|-------|
| BeginString (8) | `FIX.4.4` exactly |
| Field syntax | `<tag>=<value><SOH>`, where `SOH` = byte `0x01`; tag is a positive integer without leading zeros; value is non-empty and contains no SOH |
| Field order | `8`, then `9`, then `35` must be the first three fields; `10` must be the last field |
| Required header | `49` SenderCompID, `56` TargetCompID, `34` MsgSeqNum, `52` SendingTime |
| Optional header used | `43` PossDupFlag (`Y`/`N`), `97` PossResend, `122` OrigSendingTime |
| Timestamps | UTCTimestamp with milliseconds: `YYYYMMDD-HH:MM:SS.sss` |
| Encoding | ASCII only in v1 (non-ASCII input is rejected by the encoder) |
| Display | UIs and docs render SOH as `|`; the wire always carries `0x01` |

### 1.1 BodyLength (9)

The number of **bytes** after the SOH that ends the `9=` field, up to **and including** the SOH before `10=`.

### 1.2 CheckSum (10)

The sum of **all bytes** from the start of `8=` up to **and including** the SOH before `10=`, modulo 256, written as **exactly three digits** with zero padding (`000`–`255`).

### 1.3 Golden vectors (MUST pass byte for byte; `|` = SOH)

**Worked-example timeline** (ARCHITECTURE §8, examples A and B):

```
A1  Logon (initiator)
8=FIX.4.4|9=72|35=A|49=BUYSIDE|56=EXCH|34=1|52=20260924-10:00:00.000|98=0|108=30|141=Y|10=083|

A2  Logon (acceptor reply)
8=FIX.4.4|9=72|35=A|49=EXCH|56=BUYSIDE|34=1|52=20260924-10:00:00.012|98=0|108=30|141=Y|10=086|

A3  NewOrderSingle
8=FIX.4.4|9=128|35=D|49=BUYSIDE|56=EXCH|34=2|52=20260924-10:00:05.000|11=ORD-1|55=DEMO|54=1|60=20260924-10:00:05.000|38=100|40=2|44=101.25|59=0|10=073|

A4  ExecutionReport (New)
8=FIX.4.4|9=139|35=8|49=EXCH|56=BUYSIDE|34=2|52=20260924-10:00:05.004|37=EX-1|11=ORD-1|17=EXEC-1|150=0|39=0|55=DEMO|54=1|38=100|44=101.25|151=100|14=0|6=0|10=088|

B1  Heartbeat (dropped in transit)
8=FIX.4.4|9=54|35=0|49=BUYSIDE|56=EXCH|34=3|52=20260924-10:00:35.000|10=006|

B2  NewOrderSingle arriving above the gap
8=FIX.4.4|9=127|35=D|49=BUYSIDE|56=EXCH|34=4|52=20260924-10:00:35.500|11=ORD-2|55=DEMO|54=2|60=20260924-10:00:35.500|38=10|40=2|44=102.00|59=0|10=038|

B3  ResendRequest
8=FIX.4.4|9=63|35=2|49=EXCH|56=BUYSIDE|34=5|52=20260924-10:00:35.501|7=3|16=0|10=141|

B4  SequenceReset-GapFill for the admin message at seq 3
8=FIX.4.4|9=96|35=4|49=BUYSIDE|56=EXCH|34=3|52=20260924-10:00:35.511|43=Y|122=20260924-10:00:35.000|123=Y|36=4|10=017|

B5  NewOrderSingle resent as a possible duplicate
8=FIX.4.4|9=158|35=D|49=BUYSIDE|56=EXCH|34=4|52=20260924-10:00:35.512|43=Y|122=20260924-10:00:35.500|11=ORD-2|55=DEMO|54=2|60=20260924-10:00:35.500|38=10|40=2|44=102.00|59=0|10=036|
```

**CheckSum edge cases** (standalone):

```
E1  CheckSum 000
8=FIX.4.4|9=54|35=0|49=BUYSIDE|56=EXCH|34=2|52=20260924-10:00:30.000|10=000|

E2  CheckSum 255
8=FIX.4.4|9=96|35=4|49=BUYSIDE|56=EXCH|34=3|52=20260924-10:01:00.010|43=Y|122=20260924-10:00:30.000|123=Y|36=4|10=255|
```

---

## 2. Message types in scope

| MsgType (35) | Name | Direction | Key fields |
|---|---|---|---|
| `A` | Logon | both | 98 EncryptMethod=`0`, 108 HeartBtInt, 141 ResetSeqNumFlag=`Y` |
| `0` | Heartbeat | both | 112 TestReqID (only when answering a TestRequest) |
| `1` | TestRequest | both | 112 TestReqID (required) |
| `2` | ResendRequest | both | 7 BeginSeqNo, 16 EndSeqNo (`0` = infinity) |
| `3` | Reject | both | 45 RefSeqNum, 371 RefTagID, 372 RefMsgType, 373 SessionRejectReason, 58 Text |
| `4` | SequenceReset | both | 123 GapFillFlag (`Y` = gap fill), 36 NewSeqNo |
| `5` | Logout | both | 58 Text (optional) |
| `D` | NewOrderSingle | BUYSIDE → EXCH | 11 ClOrdID, 55 Symbol, 54 Side (`1` buy, `2` sell), 60 TransactTime, 38 OrderQty, 40 OrdType (`1` market, `2` limit), 44 Price (limit only), 59 TimeInForce (`0` day) |
| `F` | OrderCancelRequest | BUYSIDE → EXCH | 41 OrigClOrdID, 11 ClOrdID, 55, 54, 60, 38 |
| `8` | ExecutionReport | EXCH → BUYSIDE | 37 OrderID, 11, 41 (on cancel), 17 ExecID, 150 ExecType, 39 OrdStatus, 55, 54, 38, 44, 151 LeavesQty, 14 CumQty, 6 AvgPx, 31 LastPx, 32 LastQty (on fills), 58 Text (on reject) |
| `9` | OrderCancelReject | EXCH → BUYSIDE | 37, 11, 41, 39, 434 CxlRejResponseTo=`1`, 102 CxlRejReason (`0` too late, `1` unknown order), 58 |

ExecType (150) / OrdStatus (39) values used: `0` New, `4` Canceled, `8` Rejected, `F` Trade (150 only), `1` Partially filled (39 only), `2` Filled (39 only).

---

## 3. `fix-core` public API

```ts
export const SOH = 0x01;

/** A field is a numeric tag and its raw string value. Order is significant. */
export type FixField = readonly [tag: number, value: string];

export interface FixMessage {
  readonly beginString: "FIX.4.4";
  readonly msgType: string;               // tag 35
  /** Body fields in wire order, excluding 8, 9, 35 and 10. Duplicates allowed. */
  readonly fields: readonly FixField[];
}

export interface EncodeOptions {
  /** Present only for tests; normally computed. */
  readonly overrideCheckSum?: string;
  readonly overrideBodyLength?: number;
}

export function encode(msg: FixMessage, opts?: EncodeOptions): Uint8Array;
export function decode(bytes: Uint8Array): FixMessage;          // throws FixParseError
export function computeCheckSum(bytesBeforeChecksum: Uint8Array): string; // "000".."255"
export function toDisplay(bytes: Uint8Array): string;           // SOH -> "|"
export function fromDisplay(text: string): Uint8Array;          // "|" -> SOH (tests, paste box)

/** Helpers */
export function getField(msg: FixMessage, tag: number): string | undefined;   // first occurrence
export function getFields(msg: FixMessage, tag: number): string[];            // all occurrences
export function requireField(msg: FixMessage, tag: number): string;           // throws MISSING_REQUIRED_TAG

/** Streaming framer for TCP byte streams. */
export class FixFramer {
  constructor(opts?: { maxMessageBytes?: number });                // default 65536
  /** Append a chunk; returns every complete message now available (raw bytes). */
  push(chunk: Uint8Array): Uint8Array[];
  /** Bytes buffered but not yet a complete message. */
  readonly pending: number;
}

export type FixParseErrorCode =
  | "BAD_BEGIN_STRING"      // missing/incorrect 8= or wrong position
  | "BAD_BODY_LENGTH"       // 9 missing, non-numeric, or mismatch
  | "BAD_CHECKSUM"          // 10 missing, not 3 digits, or mismatch
  | "MALFORMED_FIELD"       // no '=', empty value, non-numeric/leading-zero tag
  | "MISSING_MSG_TYPE"      // 35 missing or not third
  | "MISSING_REQUIRED_TAG"  // requireField / header validation
  | "MESSAGE_TOO_LARGE";    // framer limit exceeded

export class FixParseError extends Error {
  readonly code: FixParseErrorCode;
  readonly tag?: number;
}

/** Dictionary (FIX 4.4 subset used by this project). */
export interface TagInfo {
  readonly tag: number;
  readonly name: string;             // e.g. "OrdType"
  readonly type: "STRING" | "INT" | "SEQNUM" | "LENGTH" | "PRICE" | "QTY" | "CHAR" | "BOOLEAN" | "UTCTIMESTAMP";
  readonly description: string;      // one plain-language sentence
  readonly values?: Readonly<Record<string, string>>; // enum code -> meaning
}
export const TAGS: ReadonlyMap<number, TagInfo>;
export const MSG_TYPES: ReadonlyMap<string, { name: string; category: "admin" | "app"; description: string }>;
```

Rules:
- `encode` computes `9` and `10`; it throws `MALFORMED_FIELD` if a value is empty or contains SOH or a non-ASCII byte.
- `decode(encode(m))` deep-equals `m` for every valid `m` (round-trip law).
- The framer finds the message end by reading `9=` and then expecting `10=nnn<SOH>` exactly BodyLength bytes later. On garbage (no `8=FIX.4.4<SOH>9=` prefix), it discards bytes up to the next `8=FIX` and keeps going.

---

## 4. `fix-session` public API

```ts
import type { FixMessage } from "@fixlab/fix-core";

export type SessionRole = "initiator" | "acceptor";
export type SessionState =
  | "DISCONNECTED" | "CONNECTED" | "LOGON_SENT" | "ACTIVE" | "RESENDING" | "LOGOUT_SENT";

export interface SessionConfig {
  readonly role: SessionRole;
  readonly senderCompId: string;
  readonly targetCompId: string;
  readonly heartBtIntSec: number;             // tag 108
  readonly clock?: Clock;                     // injectable for tests
}

export type FaultKind = "drop_next" | "pause_heartbeats" | "corrupt_next_checksum";

export interface SessionEvents {
  state: (state: SessionState, reason?: string) => void;
  /** Every message crossing the wire, after encoding (out) or framing (in). */
  wire: (e: WireEvent) => void;
  /** Application messages (not admin) delivered in sequence. */
  app: (msg: FixMessage) => void;
  error: (err: Error) => void;
}

export interface WireEvent {
  readonly direction: "out" | "in";
  readonly raw: Uint8Array;
  readonly msg: FixMessage | null;            // null if the bytes failed to decode
  readonly seq: number | null;
  readonly dropped: boolean;                  // true when a fault swallowed it (out only)
  readonly note?: string;                     // e.g. "garbled: BAD_CHECKSUM (ignored)"
  readonly at: number;                        // clock ms
}

export class FixSession /* extends typed EventEmitter<SessionEvents> */ {
  constructor(config: SessionConfig);
  readonly state: SessionState;
  readonly nextOutSeq: number;
  readonly nextInSeq: number;
  /** Attach a byte transport (TCP socket in production, in-memory pipe in tests). */
  attach(transport: ByteTransport): void;
  /** Initiator only: send Logon. */
  logon(): void;
  logout(text?: string): void;
  /** Send an application message; header and trailer are filled in. */
  send(msgType: string, fields: readonly (readonly [number, string])[]): number; // returns MsgSeqNum
  injectFault(kind: FaultKind): void;
}

export interface ByteTransport {
  write(bytes: Uint8Array): void;
  onData(cb: (chunk: Uint8Array) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}

/** TCP bindings */
export function listenAcceptor(opts: { host: "127.0.0.1"; port: 0; config: SessionConfig }):
  Promise<{ port: number; session: Promise<FixSession>; close(): Promise<void> }>;
export function connectInitiator(opts: { host: "127.0.0.1"; port: number; config: SessionConfig }):
  Promise<FixSession>;

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
```

`FixSession` is transport-agnostic, so unit tests drive two sessions through an in-memory pipe. The TCP binding is a thin adapter and has its own integration tests over real loopback sockets.

---

## 5. WebSocket bridge (`WS /ws`)

One WebSocket connection = one **sandbox**: a BUYSIDE initiator and an EXCH acceptor connected over loopback TCP. JSON text frames only.

### 5.1 Server → client

```jsonc
// Sent once on connect
{ "type": "hello", "sandboxId": "sbx_7f3a", "buyside": "BUYSIDE", "exchange": "EXCH",
  "heartBtIntSec": 10, "version": "0.1.0" }

// Session state change of either side
{ "type": "session.state", "side": "BUYSIDE" | "EXCH", "state": "ACTIVE", "reason": null,
  "nextOutSeq": 3, "nextInSeq": 3, "at": 1790208005004 }

// Every FIX message, emitted once for the sender's "out" and once for the receiver's "in"
// (or with dropped=true if a fault swallowed it)
{ "type": "fix.message", "id": "m_42", "from": "BUYSIDE", "to": "EXCH",
  "direction": "out" | "in", "msgType": "D", "msgTypeName": "NewOrderSingle",
  "category": "admin" | "app", "seq": 2, "possDup": false,
  "raw": "8=FIX.4.4|9=128|35=D|...|10=073|",          // SOH rendered as |
  "fields": [[8,"FIX.4.4"],[9,"128"],[35,"D"], ... ,[10,"073"]],
  "dropped": false, "note": null, "at": 1790208005000 }

// Order blotter update derived from ExecutionReport / OrderCancelReject
{ "type": "order.update", "clOrdId": "ORD-1", "orderId": "EX-1", "symbol": "DEMO",
  "side": "BUY", "qty": 100, "price": "101.25", "status": "NEW" | "PARTIALLY_FILLED" | "FILLED"
  | "CANCELED" | "REJECTED", "cumQty": 0, "leavesQty": 100, "avgPx": "0", "text": null }

{ "type": "fault.applied", "side": "BUYSIDE", "kind": "drop_next" }

{ "type": "error", "code": "BAD_REQUEST" | "RATE_LIMITED" | "CAPACITY" | "SESSION_NOT_ACTIVE"
  | "UNKNOWN_ORDER" | "INTERNAL", "message": "…" }
```

### 5.2 Client → server

```jsonc
{ "type": "order.new", "symbol": "DEMO", "side": "BUY" | "SELL", "qty": 100,
  "ordType": "LIMIT" | "MARKET", "price": "101.25" }          // price required for LIMIT, decimal string
{ "type": "order.cancel", "clOrdId": "ORD-1" }
{ "type": "fault.inject", "side": "BUYSIDE" | "EXCH", "kind": "drop_next" | "pause_heartbeats" | "corrupt_next_checksum" }
{ "type": "session.logout", "side": "BUYSIDE" }
{ "type": "session.logon" }                                     // reconnect + Logon after logout
{ "type": "autoplay.set", "on": true }
```

Rules:
- The server assigns ClOrdIDs `ORD-<n>`, starting at 1 per sandbox. The browser never sends raw FIX.
- `qty` is an integer from 1 to 1,000,000. `price` matches `^\d{1,7}(\.\d{1,4})?$`. Symbols come from `GET /api/instruments`.
- Invalid messages → `error` `BAD_REQUEST`; the connection stays open.
- More than `ORDER_RATE_LIMIT_PER_SEC` `order.*` messages per second → `error` `RATE_LIMITED`.
- No capacity → `error` `CAPACITY`, then close with code 1013.

### 5.3 Close codes

| Code | Meaning |
|------|---------|
| 1000 | Normal / idle timeout |
| 1008 | Origin not allowed (`PUBLIC_ORIGIN` set) |
| 1013 | Capacity reached or slow consumer |

---

## 6. REST

| Method | Path | Response |
|--------|------|----------|
| GET | `/health` | `200 {"status":"ok","version":"0.1.0","uptimeSec":123,"sandboxes":4}` |
| GET | `/api/instruments` | `200 [{"symbol":"DEMO","refPx":"101.00"},{"symbol":"ACME","refPx":"50.00"}]` |
| GET | `/` and static assets | Built React app (`apps/web/dist`), SPA fallback to `index.html` |

The tag dictionary is **not** a REST endpoint: the UI imports `TAGS`/`MSG_TYPES` from `fix-core`.

---

## 7. Invariants (testable)

1. **Round trip:** `decode(encode(m))` equals `m`; `encode(decode(b))` equals `b` for every valid `b`.
2. **Integrity:** every outbound message has a correct 9 and 10, except when `corrupt_next_checksum` is applied.
3. **Monotonic sequencing:** each side's outbound MsgSeqNum increases by exactly 1 per message sent (drops included). Resent messages keep their original MsgSeqNum and carry `43=Y`.
4. **Gap recovery:** after any single `drop_next`, both sides return to `ACTIVE` with `nextInSeq` equal to the peer's `nextOutSeq`, without a manual step.
5. **Garbled input is ignored:** an inbound message with a bad checksum or body length is discarded without incrementing `nextInSeq` and without a Reject, per the FIX spec, and is surfaced with a `note`.
6. **Isolation:** no event from sandbox A is ever delivered to sandbox B.
7. **No public FIX port:** FIX listeners bind only to `127.0.0.1`.
