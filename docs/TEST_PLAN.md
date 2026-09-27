# Test Plan

**Frameworks:** Vitest (unit + integration, all workspaces), Playwright (one e2e smoke).  
**Location:** `packages/*/test/`, `apps/server/test/`, `apps/web/src/**/*.test.tsx`, `apps/web/e2e/`.  
**Rule:** Arrange-Act-Assert; one behavior per test; use the **exact test titles** listed here (they are referenced by ACCEPTANCE_CRITERIA). Time-based behavior uses fake timers or the injectable `Clock`; never sleep more than 200 ms of real time.

---

## 1. Matrix overview

| Area | Must cover |
|------|------------|
| Codec | golden vectors, round trip, BodyLength/CheckSum rules and edge cases, malformed input |
| Framer | split chunks, multiple messages per chunk, garbage resync, size limit |
| Session | logon, heartbeats, TestRequest, timeout, gap → resend, GapFill vs PossDup resend, too-low logout, garbled drop, logout; logon and gap recovery in every FIX version |
| TCP adapter | real loopback sockets, initiator ↔ acceptor |
| Exchange sim | ack, crossing and non-crossing, partial then full fill, cancel, cancel reject, unknown symbol; the full flow byte for byte in every FIX version |
| Bridge | event shapes, validation, rate limit, capacity, isolation, idle timeout |
| Web | encoded preview, visualizer rows, tag panel, fault buttons |
| E2E | real browser against the production build |

---

## 2. `fix-core` (packages/fix-core/test)

| Test title | Expect |
|------------|--------|
| `encodes golden vectors byte-for-byte` | `encode` output equals every vector A1–B5, E1, E2 in API_CONTRACT §1.3 (after `fromDisplay`) |
| `decodes golden vectors into ordered fields` | Field order preserved; 8/9/35/10 excluded from `fields`; `msgType` set |
| `round-trips encode and decode` | Property test: 500 random valid messages; `decode(encode(m))` equals `m` |
| `computes checksum edge values 000 and 255` | E1 → `000`, E2 → `255` |
| `rejects wrong checksum` | Flip the last digit → `FixParseError` `BAD_CHECKSUM` |
| `rejects wrong body length` | 9 off by ±1 → `BAD_BODY_LENGTH` |
| `rejects missing or misplaced begin string` | → `BAD_BEGIN_STRING` |
| `rejects msg type not in third position` | → `MISSING_MSG_TYPE` |
| `rejects malformed fields` | `abc=1`, `012=x`, `44=`, missing `=` → `MALFORMED_FIELD` |
| `preserves duplicate tags in order` | Repeating-group-like duplicates survive the round trip |
| `encoder rejects SOH and non-ASCII in values` | → `MALFORMED_FIELD` |
| `formats UTC timestamps with milliseconds` | `time.ts` round trip, `YYYYMMDD-HH:MM:SS.sss` |
| `dictionary covers every tag used by the project` | In every implemented version, every tag in API_CONTRACT §2 (plus 20/21 in 4.2, 21 in 4.3, 1128/1137 in 5.0 SP2) has a `TagInfo`, and every msgType has an entry |
| `framer reassembles a message split across chunks` | Feed byte by byte → exactly one message |
| `framer returns multiple messages from one chunk` | Concatenated A1+A3+A4 → three messages in order |
| `framer resyncs after garbage bytes` | `xx…` + A1 → A1 emitted, garbage discarded |
| `framer enforces max message size` | 9=70000 → `MESSAGE_TOO_LARGE` |
| `runs without Node built-ins` | Guard test: `fix-core/src` imports no `node:*` and no `Buffer` |
| `registry lists every roadmap version as implemented` | `listVersions()` is FIX.4.2, FIX.4.3, FIX.4.4, FIX.5.0SP2 (BeginString `FIXT.1.1`, ApplVerID `9`), all `implemented`, oldest first |
| `registry rejects duplicate version ids` | `registerVersion` twice → throws |
| `decode rejects unregistered or planned begin strings` | A test-registered planned profile `FIX.9.7` and `8=FOO.1` → `UNKNOWN_VERSION` |
| `supports a newly registered test version` | Register a fake implemented profile `FIX.9.9` in the test → encode/decode round trip works with no codec change |
| `dictionary overrides compose over a base` | `defineDictionary(base, {tags, removeTags})` adds, overrides and removes as specified |
| `no hard-coded begin string outside version profiles` | Guard test: no `"FIX.x"` / `"FIXT.x"` string literal in `fix-core/src` outside `versions/<id>/` |
| `codec round-trips FIX.4.2 golden vectors` | Every §1.4 vector for FIX.4.2 decodes to its fields and re-encodes byte for byte |
| `codec round-trips FIX.4.3 golden vectors` | Every §1.4 vector for FIX.4.3 decodes to its fields and re-encodes byte for byte |
| `codec round-trips FIX.4.4 golden vectors` | Every §1.4 vector for FIX.4.4 decodes to its fields and re-encodes byte for byte |
| `codec round-trips FIX.5.0SP2 golden vectors` | Every §1.4 vector for FIX.5.0SP2 decodes to its fields and re-encodes byte for byte |
| `docs show only valid fix messages and the per-version vectors` | Every complete `8=…|10=…|` message in README and `docs/` decodes (valid 9/10), and API_CONTRACT §1.4 lists every per-version vector |
| `version dictionaries describe what changed between versions` | 4.2: ExecType 1/2, no F, tag 32 = LastShares; 4.3: no tag 20; 4.4: no tag 21; 5.0 SP2: 1137 value 9 = FIX 5.0 SP2 |

Coverage gate: ≥ 90% lines for `fix-core`.

## 3. `fix-session` (packages/fix-session/test)

Unit tests drive two `FixSession`s through an in-memory `ByteTransport` pipe with a fake `Clock`.

| Test title | Expect |
|------------|--------|
| `initiator logon reaches ACTIVE on both sides` | States CONNECTED → LOGON_SENT → ACTIVE; the acceptor replies Logon echoing 108; both `nextInSeq=2` |
| `first message must be logon` | Acceptor receives Heartbeat first → disconnect, no reply |
| `rejects logon with wrong comp ids` | Reject 373=9, then Logout, then DISCONNECTED |
| `logon times out without reply` | 5 s fake time → DISCONNECTED `logon timeout` |
| `sends heartbeat after outbound idle interval` | Advance H → Heartbeat sent, seq +1 |
| `sends test request after inbound idle and accepts echoed heartbeat` | Peer silent for 1.2·H → TestRequest 112=TEST-1; peer answers → no disconnect |
| `disconnects when test request goes unanswered` | Advance a further H → DISCONNECTED `heartbeat timeout` |
| `answers test request with matching TestReqID` | Inbound 1 with 112=X → Heartbeat 112=X |
| `sends resend request when inbound seq is too high` | Receive seq 4 when expecting 3 → ResendRequest 7=3 16=0; message 4 not delivered to `app` |
| `gap fills admin messages during resend` | Store [3=Heartbeat, 4=D] → sends GapFill `34=3 36=4 43=Y 122=…`, then D `34=4 43=Y 122=<original 52>` |
| `collapses consecutive admin messages into one gap fill` | Store 3,4,5 admin, 6 app → one GapFill 34=3 36=6, then 6 resent |
| `resends application messages with PossDupFlag and OrigSendingTime` | 43=Y, 122=original 52, new 52, same 34 |
| `returns to ACTIVE after gap is filled` | RESENDING → ACTIVE; `nextInSeq` equals the peer's `nextOutSeq` |
| `ignores possdup messages below expected seq` | Seq 2 with 43=Y while expecting 5 → ignored, no state change |
| `logs out when inbound seq is too low without possdup` | Seq 2 without 43 while expecting 5 → Logout `MsgSeqNum too low, expecting 5 but received 2`, then DISCONNECTED |
| `drops garbled messages without advancing sequence` | Bad checksum inbound → `wire` note `garbled: BAD_CHECKSUM (ignored)`; `nextInSeq` unchanged; no Reject |
| `rejects message missing required header tag` | Well-formed without 52 → Reject 45/371=52/373=1; `nextInSeq+1` |
| `applies sequence reset in reset mode` | 123=N 36=10 → `nextInSeq=10` |
| `rejects gap fill that lowers sequence` | 36 ≤ `nextInSeq` → Reject 373=5 |
| `fault drop_next consumes seq and triggers peer recovery` | Worked example B end to end in memory; both sides return to ACTIVE |
| `fault corrupt_next_checksum triggers recovery` | Worked example D |
| `fault pause_heartbeats still answers test requests` | Worked example C; no disconnect |
| `logout handshake closes cleanly` | Logout → peer replies Logout → both DISCONNECTED |
| `session uses version profile for logon` | Logon carries the profile's BeginString and `extraLogonFields` (a fake profile with `[[1137,"9"]]` proves it) |
| `logs out on incorrect begin string` | Inbound message with another BeginString → Logout `Incorrect BeginString`, DISCONNECTED |
| `queues new outbound messages during resend replay` | A message sent mid-replay goes out after the replay with the next seq |
| `worked example A produces golden vectors A1 to A4` | With the fake clock at the example times, the `wire` raw bytes equal the vectors |
| `session logs on and recovers a gap in FIX.4.2` | Logon both ways equals the §1.4 FIX.4.2 LOGON/LOGON_REPLY vectors; a dropped order is recovered via ResendRequest and PossDup replay; every message carries that version's BeginString |
| `session logs on and recovers a gap in FIX.4.3` | Logon both ways equals the §1.4 FIX.4.3 LOGON/LOGON_REPLY vectors; a dropped order is recovered via ResendRequest and PossDup replay; every message carries that version's BeginString |
| `session logs on and recovers a gap in FIX.4.4` | Logon both ways equals the §1.4 FIX.4.4 LOGON/LOGON_REPLY vectors; a dropped order is recovered via ResendRequest and PossDup replay; every message carries that version's BeginString |
| `session logs on and recovers a gap in FIX.5.0SP2` | Logon both ways equals the §1.4 FIX.5.0SP2 LOGON/LOGON_REPLY vectors; a dropped order is recovered via ResendRequest and PossDup replay; every message carries that version's BeginString |
| `fixt acceptor rejects logon without DefaultApplVerID` | FIX.5.0SP2 acceptor, Logon without 1137 → Reject 373=1 371=1137, Logout, DISCONNECTED |

TCP integration (`transport.test.ts`, real sockets):

| Test title | Expect |
|------------|--------|
| `acceptor binds only to loopback on an ephemeral port` | Address `127.0.0.1`, port > 0 |
| `initiator and acceptor log on over real TCP` | ACTIVE on both sides within 1 s real time |
| `order round trip over real TCP` | D → 8 New received by the initiator |
| `socket close moves both sessions to DISCONNECTED` | Destroy the socket → state events with a reason |

## 4. Server (apps/server/test)

| Test title | Expect |
|------------|--------|
| `exchange acks new order` | D → 8 150=0 39=0 151=qty, OrderID EX-1 |
| `exchange fills crossing limit order in two parts` | qty 100 → +250 ms 50 @ refPx (39=1), +500 ms 50 (39=2), AvgPx=refPx |
| `exchange fills quantity one in a single fill` | qty 1 → one 39=2 at +250 ms |
| `exchange rests non-crossing order` | Buy below refPx → only New, even after 10 s fake time |
| `exchange fills market order at reference price` | 40=1 → fills at refPx |
| `exchange cancels working order and stops pending fills` | F after New, before fills → 150=4 39=4; no later fills |
| `exchange rejects cancel of filled order as too late` | 9 with 102=0 |
| `exchange rejects cancel of unknown order` | 9 with 102=1 |
| `exchange rejects unknown symbol` | 8 150=8 39=8 58=Unknown symbol |
| `exchange flow in FIX.4.2 produces valid execution reports` | Session pair + exchange in FIX.4.2: the wire equals the §1.4 FIX.4.2 vectors (logon, order, ack, partial, fill) and the dialect parses NEW → PARTIALLY_FILLED → FILLED |
| `exchange flow in FIX.4.3 produces valid execution reports` | Session pair + exchange in FIX.4.3: the wire equals the §1.4 FIX.4.3 vectors (logon, order, ack, partial, fill) and the dialect parses NEW → PARTIALLY_FILLED → FILLED |
| `exchange flow in FIX.4.4 produces valid execution reports` | Session pair + exchange in FIX.4.4: the wire equals the §1.4 FIX.4.4 vectors (logon, order, ack, partial, fill) and the dialect parses NEW → PARTIALLY_FILLED → FILLED |
| `exchange flow in FIX.5.0SP2 produces valid execution reports` | Session pair + exchange in FIX.5.0SP2: the wire equals the §1.4 FIX.5.0SP2 vectors (logon, order, ack, partial, fill) and the dialect parses NEW → PARTIALLY_FILLED → FILLED |
| `bridge sends hello and session state on connect` | `hello`, then both sides reach `ACTIVE` via `session.state` |
| `bridge emits out and in events for each message` | One D produces a `fix.message` `out` from BUYSIDE and an `in` at EXCH with the same seq |
| `bridge emits order updates from execution reports` | `order.update` NEW → PARTIALLY_FILLED → FILLED |
| `bridge validates client commands` | Bad qty/price/type → `error` BAD_REQUEST, connection stays open |
| `bridge rate limits order commands` | 6 `order.new` within 1 s → one `RATE_LIMITED` |
| `bridge enforces sandbox capacity` | MAX_SANDBOXES=1, second client → `CAPACITY` and close 1013 |
| `bridge trades over a FIX.4.2 session` | `/ws?fixVersion=FIX.4.2`: every `fix.message` starts `8=FIX.4.2` and is tagged FIX.4.2; order reaches FILLED |
| `bridge trades over a FIX.4.3 session` | `/ws?fixVersion=FIX.4.3`: every `fix.message` starts `8=FIX.4.3` and is tagged FIX.4.3; order reaches FILLED |
| `bridge trades over a FIX.5.0SP2 session` | `/ws?fixVersion=FIX.5.0SP2`: every `fix.message` starts `8=FIXT.1.1` and is tagged FIX.5.0SP2; order reaches FILLED |
| `sandboxes are isolated` | Two clients; A's order never appears in B's stream |
| `sandbox closes after idle timeout` | Fake time > SANDBOX_IDLE_TIMEOUT_SEC → close 1000, sockets freed |
| `gap recovery scenario over websocket` | `fault.inject drop_next` then `order.new` → the stream contains ResendRequest, GapFill and a PossDup resend; both sides ACTIVE |
| `health reports status and sandbox count` | `GET /health` shape per API_CONTRACT §6 |
| `instruments endpoint lists symbols` | `GET /api/instruments` |
| `serves built ui with spa fallback` | `GET /some/route` → index.html |
| `versions endpoint lists registry` | `GET /api/versions` mirrors `listVersions()` |
| `bridge rejects unsupported fix version` | `/ws?fixVersion=FIX.4.1` (not registered) → `error` UNSUPPORTED_VERSION, close 1008 |
| `fix44 dialect builds execution reports per spec` | New/fill/cancel/reject events → fields per API_CONTRACT §2 |
| `every implemented version has a dialect` | `hasDialect` for all four; unknown version → throws |
| `fix42 dialect uses ExecTransType and ExecType 1/2 for fills` | Partial fill `20=0 150=1 39=1`, full fill `150=2 39=2`; D carries `21=1` |
| `fix43 dialect drops ExecTransType but keeps HandlInst` | No tag 20, fill `150=F`; D tags `11 21 55 54 60 38 40 44 59` |
| `fix50sp2 dialect sends the FIX 4.4 order shapes` | Same D and 8 fields as FIX 4.4, no HandlInst |
| `every dialect parses its own execution reports for the blotter` | `parseOrderUpdate` / `parseNewOrder` round-trip in every version |

## 5. Web (apps/web, Vitest + Testing Library)

| Test title | Expect |
|------------|--------|
| `order form shows live encoded preview` | Typing qty/price updates the preview; 9 and 10 change accordingly |
| `order form validates price and quantity` | Invalid input disables Send, with an inline message |
| `visualizer renders arrows for out and in events` | Paired events → one row, correct direction, label `35=D NewOrderSingle #2` |
| `visualizer marks dropped messages` | `dropped=true` → row ends in ✕ with the text "dropped" (not colour only) |
| `visualizer can hide admin messages` | Toggle filter → heartbeats hidden |
| `inspector shows raw and parsed fields` | Raw with `|`, table of tag/name/value |
| `clicking a tag opens its dictionary entry` | Click `54` → "Side", values 1=Buy, 2=Sell |
| `fault buttons send fault inject commands` | Click → `fault.inject` sent over the mocked socket |
| `reconnects with backoff after socket close` | Mock close → status "reconnecting", retry scheduled |
| `version picker lists implemented and planned versions` | Implemented versions enabled; planned ones visible, disabled, labelled "planned"; the selected version's summary is shown |
| `switching version reconnects and encodes orders for that version` | Click FIX 4.2 → reconnect to `?fixVersion=FIX.4.2`; preview starts `8=FIX.4.2` and contains `21=1` |
| `visualizer shows the fix version of each message` | Row or inspector shows `FIX.4.4` |

## 6. End-to-end (apps/web/e2e, Playwright)

| Test title | Expect |
|------------|--------|
| `visitor sends an order and sees it filled` | Production build + server; submit buy DEMO 100 @ 101.25 → visualizer shows D, 8 New, two 8 fills; blotter FILLED |
| `visitor triggers gap recovery` | Click "Drop next message", then send an order → a ResendRequest (35=2) row and a SequenceReset (35=4) row appear; both sides ACTIVE |
| `layout fits a 390px viewport` | No horizontal page scroll |

## 7. Non-goals for tests

- Load tests beyond the capacity-cap test
- Interop tests against QuickFIX (COULD later as a manual check)
- Visual regression screenshots

## 8. Commands

```bash
npm ci
npm test                 # all Vitest suites
npm run test -w packages/fix-core -- --coverage
npm run build && npm run e2e
```

CI MUST run the full suite with no skipped required tests.
