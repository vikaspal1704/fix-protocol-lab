# Product Requirements Document (PRD)

**Product:** FIX Protocol Lab  
**Owner:** Vikas Pal  
**Version:** 1.0 (docs-first)  
**Status:** Spec locked for v1 implementation

---

## 1. Goals

1. Deliver a **correct, from-scratch FIX codec and session engine** in TypeScript that proves an understanding of FIX beyond message format: sequencing, heartbeats, test requests and gap recovery.
2. Be **the place to see FIX working live**, across FIX versions. v1 ships FIX 4.4 end to end. The design is **version-pluggable**, so FIX 4.2, 4.3 and 5.0 (over FIXT.1.1) can be added one at a time, each as a self-contained profile, without touching the engine.
3. Make FIX **visible**: a live, sequence-diagram view of two counterparties exchanging real FIX over a real TCP session, with the ability to inject faults and watch recovery.
4. Be the tool someone with **zero trading background** uses to understand FIX: plain-language README, an inline tag reference, and a session-layer write-up.
5. Ship a **live public demo on a real domain**, with green CI and an MIT license.
6. Be **agent-implementable**: locked wire rules, APIs, event shapes and test names, so there is no guesswork.

## 2. Non-goals

- Competing with QuickFIX / QuickFIX/J / QuickFIX/n on completeness or performance
- Shipping every FIX version in v1 (v1 = FIX 4.4; others follow the version roadmap)
- FAST, SBE, FIXML or other non-tag=value encodings
- TLS, authentication of FIX counterparties, or certification against a real venue
- Persistent message stores or recovery across process restarts
- Repeating-group-aware business logic (groups are preserved in order, not interpreted)
- Real market data, real prices, risk checks, positions or settlement
- Exposing a raw FIX TCP port to the public internet
- Multi-instance / horizontally scaled deployment

## 3. Personas

| Persona | Needs |
|---------|--------|
| **Recruiter / hiring manager** | Understand in ≤2 minutes what FIX is and what was built; click a live link and *see* it working. |
| **Trading-systems engineer (interviewer)** | Probe sequence numbers, resend semantics, PossDup, heartbeat/TestRequest timing; read the write-up and the code. |
| **Learner / curious engineer** | Compose an order, see the bytes, click tags to learn their meaning, break the session and watch it heal. |
| **AI implementer** | Follow AGENT_BRIEF → contracts → acceptance without inventing semantics. |

## 4. User stories

### Codec

| ID | Story |
|----|--------|
| US-C-1 | As a developer, I decode a raw FIX byte string into ordered fields and get a precise error (bad BodyLength, bad CheckSum, malformed field) when it is invalid. |
| US-C-2 | As a developer, I encode fields into a valid FIX message whose BodyLength (9) and CheckSum (10) are computed for me. |
| US-C-3 | As a developer, I feed arbitrary TCP chunks into a framer and get back whole messages, even when a message is split across chunks or several arrive in one chunk. |

### Session

| ID | Story |
|----|--------|
| US-S-1 | As an initiator, I connect over TCP, send Logon (A), and reach ACTIVE when the acceptor replies with Logon. |
| US-S-2 | As either side, I send Heartbeat (0) when I have sent nothing for HeartBtInt seconds, and a TestRequest (1) when I have received nothing; if the TestRequest goes unanswered, I disconnect. |
| US-S-3 | As a receiver, when a MsgSeqNum is higher than expected, I send ResendRequest (2). The sender replays application messages with PossDupFlag=Y and replaces admin messages with SequenceReset-GapFill (4). |
| US-S-4 | As a receiver, when a MsgSeqNum is lower than expected without PossDupFlag=Y, I log out with a reason and disconnect. |
| US-S-5 | As either side, I log out cleanly with Logout (5) and a reply Logout. |

### Order flow (simulated exchange)

| ID | Story |
|----|--------|
| US-O-1 | As a visitor, I compose a NewOrderSingle (D) in a form, see it encoded live, send it, and receive ExecutionReports (8): New, then fills if it crosses the simulated price. |
| US-O-2 | As a visitor, I cancel a working order with OrderCancelRequest (F) and receive ExecutionReport Canceled, or OrderCancelReject (9) if it is too late or unknown. |

### Visualization and learning

| ID | Story |
|----|--------|
| US-V-1 | As a visitor, I see every FIX message between the two counterparties appear in real time as arrows in a sequence diagram, with admin vs application messages distinguished. |
| US-V-2 | As a visitor, I select any message to see its raw bytes (SOH shown as `|`) and a parsed field table. |
| US-V-3 | As a visitor, I click any tag to see its name, description and enumerated values. |
| US-V-4 | As a visitor, I inject a fault (drop the next message, pause heartbeats, corrupt the next checksum) and watch the session detect and recover from it. |
| US-V-5 | As a visitor, I turn on **autoplay** to watch a scripted stream of orders and cancels without typing anything. |

## 5. Functional requirements

### MUST

| ID | Requirement |
|----|-------------|
| F-MUST-1 | Codec encodes and decodes tag=value messages for every **registered** FIX version with SOH delimiters, computing and validating BodyLength (9) and CheckSum (10) exactly per API_CONTRACT §1. |
| F-MUST-2 | Codec preserves field order and duplicate tags (repeating groups) on decode and encode. |
| F-MUST-3 | A streaming framer extracts complete messages from arbitrary TCP chunk boundaries. |
| F-MUST-4 | Session engine over raw TCP (`node:net`), with initiator and acceptor roles: Logon, Heartbeat, TestRequest, ResendRequest, SequenceReset (GapFill and Reset), Reject, Logout. |
| F-MUST-5 | Separate inbound and outbound sequence numbers per session, with the too-high → ResendRequest and too-low → Logout rules per ARCHITECTURE §4. |
| F-MUST-6 | Resend replays stored application messages with PossDupFlag (43)=Y and OrigSendingTime (122); admin messages are replaced by SequenceReset-GapFill (123=Y). |
| F-MUST-7 | Simulated exchange acceptor: acks D with ExecutionReport New, fills per the fill model in ARCHITECTURE §6, handles F with Canceled or OrderCancelReject (9). |
| F-MUST-8 | WebSocket bridge streams every FIX message, both directions, to the UI with the event shape in API_CONTRACT §5. |
| F-MUST-9 | React UI with order entry plus live encoded preview, sequence-diagram visualizer, message inspector, and tag reference panel. |
| F-MUST-10 | Fault injection: `drop_next`, `pause_heartbeats`, `corrupt_next_checksum`, visibly recovered or handled per spec. |
| F-MUST-11 | Each browser connection gets an **isolated sandbox** (its own initiator/acceptor pair). The public demo has caps and idle timeouts (TRD §6). |
| F-MUST-12 | README explains FIX for a zero-background reader; MIT license; CI green; live demo deployed. |
| F-MUST-13 | **Version registry:** every version-specific rule (BeginString, dictionary, logon fields, supported message types, order dialect) lives in a `FixVersionProfile`. Codec, session and server look versions up in the registry and never hard-code `"FIX.4.4"`. FIX 4.4 is registered and implemented. |
| F-MUST-14 | The UI shows the version of every message and a version picker listing implemented and planned versions; planned versions are visible but disabled. |

### SHOULD

| ID | Requirement |
|----|-------------|
| F-SHOULD-1 | Autoplay mode: a scripted order/cancel generator per sandbox. |
| F-SHOULD-2 | Session-layer write-up `docs/SESSION_LAYER.md` (≈1,500–2,500 words, diagrams) published with the demo. |
| F-SHOULD-3 | Timeline controls: pause the live stream, filter admin messages, clear. |
| F-SHOULD-4 | Custom domain with HTTPS for the demo. |
| F-SHOULD-5 | Shareable "scenario" links (e.g. `?scenario=gap-recovery`) that auto-run a fault demo. |
| F-SHOULD-6 | A second implemented version (**FIX 4.2**) to prove the profile design with real differences (ExecTransType 20, ExecType 1/2 for fills). |

### COULD

| ID | Requirement |
|----|-------------|
| F-COULD-1 | OrderCancelReplaceRequest (G). |
| F-COULD-2 | Paste-a-message decoder page (decode any raw FIX string, highlight errors). |
| F-COULD-3 | CLI tools: `fixlab decode`, `fixlab session --initiator`. |
| F-COULD-4 | Export a session's message log as a `.fixlog` file. |
| F-COULD-5 | Version diff view: the same order flow side by side in two versions, with changed tags highlighted. |

## 6. Non-functional requirements

| ID | Requirement |
|----|-------------|
| NF-1 | **Clarity over completeness.** Readable code with the FIX rule cited in a comment where it is enforced. |
| NF-2 | **Deterministic tests:** fake timers for heartbeats and seeded fill model; no real-time sleeps longer than 200 ms in tests. |
| NF-3 | TypeScript `strict: true` everywhere; no `any` in public APIs. |
| NF-4 | `fix-core` is **isomorphic**: no Node-only APIs (use `Uint8Array`/`TextEncoder`), so the browser uses the same codec for previews. |
| NF-5 | Public demo stays responsive with 50 concurrent sandboxes on one small instance. |
| NF-6 | Accessible UI: keyboard reachable controls, visible focus, not colour-only distinctions, readable at 390 px width. |

## 7. Out of scope (explicit)

- No competing-engine ambitions; versions beyond 4.4 are roadmap, not v1
- No real venues, no auth, no persistence
- No public raw TCP endpoint

## 8. Worked example (summary)

Full detail lives in [`ARCHITECTURE.md`](ARCHITECTURE.md) §8. In short:

1. BUYSIDE connects to EXCH over TCP and sends Logon (seq 1). EXCH replies Logon (seq 1). The session is ACTIVE.
2. BUYSIDE sends NewOrderSingle `ORD-1` buy 100 @ 101.25 (seq 2). EXCH replies ExecutionReport New (seq 2), then fills.
3. Visitor clicks **Drop next message**. BUYSIDE's next Heartbeat (seq 3) is dropped in transit, so its next order (seq 4) arrives with a gap in front of it.
4. EXCH sees seq 4 while expecting 3, and sends ResendRequest `7=3|16=0`.
5. BUYSIDE answers with SequenceReset-GapFill `43=Y|123=Y|36=4`, because seq 3 was an admin message. EXCH then processes seq 4 and the session is back in sync.

## 9. Success metrics (v1)

- All MUST requirements mapped in `ACCEPTANCE_CRITERIA.md` and checked off
- Required tests from `TEST_PLAN.md` exist and pass in CI
- Live demo reachable on a custom domain; gap-recovery scenario works end to end
- README understandable by a non-trading reader (reviewed by one such person)
