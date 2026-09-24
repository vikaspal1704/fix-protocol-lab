# Acceptance Criteria

Binary checklist. v1 is **done** only when every box is true. Milestone M1 = sections A (F-MUST-1..6) + B (codec/session tests) + D (CI).

---

## A. PRD MUST → verifiable criteria

| PRD ID | Criterion | How to verify |
|--------|-----------|---------------|
| F-MUST-1 | BodyLength/CheckSum exact | `encodes golden vectors byte-for-byte`, `computes checksum edge values 000 and 255`, `rejects wrong checksum`, `rejects wrong body length` |
| F-MUST-2 | Order and duplicates preserved | `decodes golden vectors into ordered fields`, `preserves duplicate tags in order`, `round-trips encode and decode` |
| F-MUST-3 | Streaming framer | `framer reassembles a message split across chunks`, `framer returns multiple messages from one chunk`, `framer resyncs after garbage bytes` |
| F-MUST-4 | Session over raw TCP | `initiator and acceptor log on over real TCP`, `initiator logon reaches ACTIVE on both sides`, `logout handshake closes cleanly`, `answers test request with matching TestReqID` |
| F-MUST-5 | Sequence rules | `sends resend request when inbound seq is too high`, `logs out when inbound seq is too low without possdup`, `ignores possdup messages below expected seq`, `drops garbled messages without advancing sequence` |
| F-MUST-6 | Resend semantics | `gap fills admin messages during resend`, `collapses consecutive admin messages into one gap fill`, `resends application messages with PossDupFlag and OrigSendingTime`, `returns to ACTIVE after gap is filled` |
| F-MUST-7 | Exchange simulator | `exchange acks new order`, `exchange fills crossing limit order in two parts`, `exchange cancels working order and stops pending fills`, `exchange rejects cancel of filled order as too late`, `exchange rejects cancel of unknown order` |
| F-MUST-8 | WS bridge events | `bridge emits out and in events for each message`, `bridge emits order updates from execution reports`, `bridge sends hello and session state on connect` |
| F-MUST-9 | UI: entry, preview, visualizer, inspector, tag panel | `order form shows live encoded preview`, `visualizer renders arrows for out and in events`, `inspector shows raw and parsed fields`, `clicking a tag opens its dictionary entry`, e2e `visitor sends an order and sees it filled` |
| F-MUST-10 | Fault injection and recovery | `fault drop_next consumes seq and triggers peer recovery`, `fault corrupt_next_checksum triggers recovery`, `fault pause_heartbeats still answers test requests`, `gap recovery scenario over websocket`, e2e `visitor triggers gap recovery` |
| F-MUST-11 | Sandbox isolation and limits | `sandboxes are isolated`, `bridge enforces sandbox capacity`, `bridge rate limits order commands`, `sandbox closes after idle timeout`, `acceptor binds only to loopback on an ephemeral port` |
| F-MUST-12 | README, license, CI, live demo | Sections D, E, F below |
| F-MUST-13 | Version registry, no hard-coded versions | `registry lists implemented and planned versions`, `decode rejects unregistered or planned begin strings`, `session uses version profile for logon`, `no hard-coded begin string outside version profiles` |
| F-MUST-14 | Version shown and selectable in UI | `bridge rejects unsupported fix version`, `version picker lists implemented and planned versions`, `visualizer shows the fix version of each message` |

---

## B. Required tests

Every test title in [`TEST_PLAN.md`](TEST_PLAN.md) §2–§6 MUST exist with that exact title and pass. Additional tests are encouraged. `fix-core` line coverage ≥ 90%.

---

## C. Demo behavior (manual check on the live site)

- [ ] Opening the site shows both lifelines, and Logon A ↔ A appears within 3 s (after any cold start)
- [ ] Sending an order shows D → 8 New → 8 Trade ×2 for a crossing order; the blotter reads FILLED
- [ ] "Drop next message" followed by any traffic shows ResendRequest (2) and SequenceReset-GapFill (4) or a PossDup resend, and both sides return to ACTIVE
- [ ] "Pause heartbeats" shows TestRequest (1) answered by Heartbeat (0) with the same 112
- [ ] "Corrupt next checksum" shows a garbled row (✕ + note) followed by recovery
- [ ] Clicking any tag in the inspector shows its name, description and values
- [ ] Autoplay produces a continuous stream with no errors for 5 minutes
- [ ] Usable at 390 px width; keyboard can reach every control

---

## D. Packaging & CI

- [ ] npm workspaces; `npm ci && npm test && npm run build` works from a clean clone on Node 22
- [ ] TypeScript `strict: true` in every workspace; `npm run lint` clean
- [ ] `.github/workflows/ci.yml` runs lint, tests, build and e2e on push/PR; no secrets
- [ ] CI green on `main`
- [ ] No FIX libraries in `package-lock.json` (quickfix, fixparser, etc.)

---

## E. Deploy

- [ ] `render.yaml` (or equivalent) deploys one web service from `main`; `GET /health` is the health check
- [ ] Live demo on a **custom domain** over HTTPS; `wss://<domain>/ws` works
- [ ] FIX TCP ports not reachable from the internet (bound to 127.0.0.1)
- [ ] README "Live demo" row links to the domain

---

## F. Docs / README polish

- [ ] README explains FIX for a zero-background reader, links all docs and the live demo
- [ ] README status updated from "Docs-first" to implemented
- [ ] `docs/SESSION_LAYER.md` write-up published (≈1,500–2,500 words, includes the gap-recovery sequence diagram)
- [ ] `LICENSE` is MIT © 2026 Vikas Pal; `AGENTS.md` points to `docs/AGENT_BRIEF.md`

---

## G. Definition of done (copy for agents)

```
DONE when:
1. All section A criteria pass via section B tests.
2. Section C demo behaviors verified on the live site.
3. Section D CI green.
4. Section E live on a custom domain.
5. Section F docs complete.
6. No divergence from API_CONTRACT.md (wire rules, APIs, WS events).
```
