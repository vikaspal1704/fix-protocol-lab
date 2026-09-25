# Agent Brief — FIX Protocol Lab

**Primary instructions for AI coding agents.**  
Author: Vikas Pal · Repo: https://github.com/vikaspal1704/fix-protocol-lab

Read this file completely before writing code.

---

## 1. Mission

Build a **from-scratch, version-pluggable FIX codec and TCP session engine in TypeScript** (v1 implements FIX 4.4), and a **React front end that makes FIX visible**: order entry with a live encoded preview, a real-time sequence-diagram visualizer, fault injection with visible recovery, and an inline tag reference. Deploy it as a public demo on a custom domain.

**The differentiator is clarity, not completeness.** Do not try to out-build QuickFIX/QuickFIX/J. Every feature should help someone *understand* FIX.

**This repository may currently be docs-only.** You implement the code; do not change wire rules, session semantics or event shapes already locked in the docs.

---

## 2. Read order (mandatory)

1. [`PRD.md`](PRD.md) — goals, MUST/SHOULD/COULD, non-goals
2. [`TRD.md`](TRD.md) — stack lock, monorepo layout, config, CI, deploy
3. [`API_CONTRACT.md`](API_CONTRACT.md) — wire rules, golden vectors, codec/session APIs, WS events, REST
4. [`ARCHITECTURE.md`](ARCHITECTURE.md) — state machine, sequence rules, resend, heartbeats, exchange fill model, worked examples
5. [`ACCEPTANCE_CRITERIA.md`](ACCEPTANCE_CRITERIA.md) — binary done checklist
6. [`TEST_PLAN.md`](TEST_PLAN.md) — exact test titles and fixtures

If docs conflict, prefer **API_CONTRACT → ARCHITECTURE → TRD → PRD**. The golden vectors in API_CONTRACT §1.3 are ground truth for bytes.

---

## 3. Implementation phases

Ship each phase green before starting the next. **Milestone M1 = Phases 1–2.** Stop and open a PR at M1.

### Phase 1 — `fix-core` (codec + version registry)

- Version registry first (ARCHITECTURE §12): `FixVersionProfile`, `registerVersion`, `getVersion`, `listVersions`, `versionForBeginString`. Register FIX 4.4 as `implemented`, and 4.2, 4.3 and 5.0 SP2 as `planned` (metadata only). (Done: M3 has since implemented all four; see ARCHITECTURE §12.)

- Scaffold npm workspaces, `tsconfig.base.json` (strict), ESLint/Prettier, Vitest, CI skeleton.
- `encode`, `decode`, `computeCheckSum`, `toDisplay`/`fromDisplay`, field helpers, `FixParseError`.
- `FixFramer` for TCP streams.
- `time.ts` UTCTimestamp; `dictionary/` with every tag and msgType in API_CONTRACT §2 (plain-language descriptions and enum meanings).
- All §2 tests in TEST_PLAN, including golden vectors and ≥ 90% coverage.

### Phase 2 — `fix-session` (engine)

- Transport-agnostic `FixSession` with an injectable `Clock`; in-memory `ByteTransport` pipe for tests.
- Logon/Logout, heartbeats, TestRequest, sequence rules (ARCHITECTURE §4), resend with GapFill/PossDup, Reject, SequenceReset, faults.
- TCP adapter: `listenAcceptor` (127.0.0.1:0) and `connectInitiator`.
- All §3 tests, including worked examples A–D, and `worked example A produces golden vectors A1 to A4`.

### Phase 3 — Server

- `node:http` server: `/health`, `/api/instruments`, static UI with SPA fallback.
- Sandbox per WebSocket (`ws`): acceptor + initiator over loopback, exchange simulator (ARCHITECTURE §6), bridge events (API_CONTRACT §5), validation, rate limit, capacity, idle timeout, autoplay.
- All §4 tests.

### Phase 4 — Web

- Vite + React 19 + TS strict + RTK/RTK Query + Tailwind v4.
- WS listener middleware; slices per ARCHITECTURE §9.
- Order entry with a live `fix-core` encoded preview (highlight 9 and 10 changing); blotter.
- Sequence-diagram visualizer (virtualized, filters, pause); inspector with clickable tags; tag panel; fault buttons; autoplay toggle; scenario links.
- Accessible and responsive to 390 px; light and dark themes.
- §5 tests and §6 Playwright e2e.

### Phase 5 — Deploy + write-up

- `render.yaml`; custom domain; README "Live demo" link; status → implemented.
- `docs/SESSION_LAYER.md`: the public technical write-up covering sequence numbers, heartbeats vs TestRequest, why GapFill replaces admin messages, PossDup vs PossResend, and garbled-message handling, with the gap-recovery diagram from ARCHITECTURE §8B.

---

## 4. Do

- Cite the FIX rule in a short comment wherever the code enforces it (e.g. `// FIX: too-low MsgSeqNum without PossDupFlag → Logout`)
- Keep `fix-core` isomorphic (`Uint8Array`, `TextEncoder`); the browser reuses it
- Use the injectable `Clock` for every timer
- Bind FIX listeners to `127.0.0.1` only
- Make the visualizer the best part: clear labels, text plus icon (never colour-only), smooth auto-scroll
- Map every F-MUST to tests using the exact titles in TEST_PLAN
- Commit focused changes (`feat(fix-core): …`, `test(fix-session): …`, `ci: …`), and **open a PR to `main`** at the end of each milestone

## 5. Don't

- Don't add QuickFIX or any FIX library, Express, Socket.IO, or CSS-in-JS runtimes
- Don't hard-code `"FIX.4.4"` outside `versions/fix44/`. Everything else goes through the registry
- Don't implement a planned version without its profile, dictionary, dialect and golden vectors in the same change
- Don't implement TLS, persistence or repeating-group semantics
- Don't expose a raw FIX TCP port publicly or let the browser send raw FIX
- Don't use real sleeps in tests (fake timers / `Clock`)
- Don't use `any` in public APIs
- Don't change golden vectors, wire rules or WS event shapes without updating API_CONTRACT and tests in the same change
- Don't leave the README in "Docs-first" state once the implementation lands

---

## 6. Definition of done

Copy from ACCEPTANCE_CRITERIA:

```
DONE when:
1. All section A criteria pass via section B tests.
2. Section C demo behaviors verified on the live site.
3. Section D CI green.
4. Section E live on a custom domain.
5. Section F docs complete.
6. No divergence from API_CONTRACT.md (wire rules, APIs, WS events).
```

---

## 7. Quick reference

```ts
import { encode, decode, toDisplay, FixFramer, TAGS } from "@fixlab/fix-core";
import { listenAcceptor, connectInitiator } from "@fixlab/fix-session";

const bytes = encode({ beginString: "FIX.4.4", msgType: "0",
  fields: [[49, "BUYSIDE"], [56, "EXCH"], [34, "2"], [52, "20260924-10:00:30.000"]] });
toDisplay(bytes); // "8=FIX.4.4|9=54|35=0|49=BUYSIDE|56=EXCH|34=2|52=20260924-10:00:30.000|10=000|"

const acc = await listenAcceptor({ host: "127.0.0.1", port: 0,
  config: { role: "acceptor", senderCompId: "EXCH", targetCompId: "BUYSIDE", heartBtIntSec: 10 } });
const buy = await connectInitiator({ host: "127.0.0.1", port: acc.port,
  config: { role: "initiator", senderCompId: "BUYSIDE", targetCompId: "EXCH", heartBtIntSec: 10 } });
buy.logon();
```

Worked examples: [`ARCHITECTURE.md`](ARCHITECTURE.md) §8. Golden bytes: [`API_CONTRACT.md`](API_CONTRACT.md) §1.3.

---

## 8. Git / PR expectations

- Branch per milestone (e.g. `feat/m1-codec-session`, `feat/m2-demo`)
- PR description cites the ACCEPTANCE_CRITERIA rows it satisfies
- Do not force-push `main`

---

## 9. Out of scope reminder

No real venues, no auth, no persistence, no competing-engine ambitions. New FIX versions are added one profile at a time.
Clarity and correctness of the session layer > breadth of message types.
