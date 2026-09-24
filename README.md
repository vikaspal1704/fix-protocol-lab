# FIX Protocol Lab

**See FIX working, live.** A from-scratch FIX toolkit (tag=value codec plus a TCP session engine) with a live, visual front end. You can watch two counterparties log on, exchange heartbeats, trade, lose a message and recover it, one message at a time, and switch between FIX versions to see what changes.

Built as a portfolio project by **Vikas Pal** (Software Engineer, Fintech).

| | |
|---|---|
| **Status** | Implemented (M1 + M2) — 98 tests incl. Playwright e2e; see [CI](.github/workflows/ci.yml). Live demo: deploy pending |
| **Protocol** | FIX tag=value over TCP. v1 ships **FIX 4.4**; every version is a plug-in profile, and 4.2, 4.3 and 5.0 SP2 (over FIXT.1.1) are on the roadmap |
| **Stack** | Node.js 22 + TypeScript (engine, server) · React 19 + TypeScript strict + Redux Toolkit/RTK Query + Tailwind v4 (UI) |
| **Live demo** | `https://<your-domain>` (planned; see [Deploy](#deploy)) |
| **License** | [MIT](LICENSE) |
| **Repo** | https://github.com/vikaspal1704/fix-protocol-lab |

---

## What is FIX, and why does this exist?

When a fund, broker or exchange sends someone an order ("buy 100 shares of X at 101.25"), the message usually travels in **FIX**, the *Financial Information eXchange* protocol. Order management systems, risk systems, brokers and exchanges all speak it. A FIX message is a line of `tag=value` pairs:

```
8=FIX.4.4|9=128|35=D|49=BUYSIDE|56=EXCH|34=2|52=20260924-10:00:05.000|11=ORD-1|55=DEMO|54=1|60=20260924-10:00:05.000|38=100|40=2|44=101.25|59=0|10=073|
```

(`|` stands in for the invisible SOH byte, `0x01`, that really separates fields.) `35=D` means *New Order Single*, `54=1` means *buy*, `38=100` is the quantity, `44=101.25` the limit price. `9` and `10` are a length and a checksum that let the receiver detect a damaged message.

The format is only half of FIX. The other half is the **session layer**: logging on, numbering every message, sending heartbeats to prove the line is alive, and **recovering messages lost in transit**. That half is what keeps trading systems in sync, and it is the part people rarely see.

Production engines like QuickFIX/J are excellent and complete, but they are text-only and hard to learn from. **FIX Protocol Lab doesn't try to compete with them.** Its goal is to be the clearest place to *understand* FIX:

- Compose an order and watch it get **encoded byte by byte**.
- Watch it travel over a **real TCP FIX session** between two simulated firms, drawn as a live sequence diagram.
- **Break things on purpose** (drop a message, stop heartbeats, corrupt a checksum) and watch the session layer detect and repair it.
- **Click any tag** to see what it means.

## What it is

1. **`fix-core`**: parser/encoder for tag=value messages, with BodyLength and CheckSum validation, a streaming framer for TCP byte streams, and a tag dictionary. Pure TypeScript that runs in Node and in the browser.
2. **`fix-session`**: a small initiator/acceptor over raw TCP. It implements Logon (A), Heartbeat (0), TestRequest (1), ResendRequest (2), SequenceReset/GapFill (4), Reject (3) and Logout (5), with sequence-number tracking and gap recovery.
3. **Order entry simulator**: a React UI to compose NewOrderSingle (D) and OrderCancelRequest (F), see the encoded FIX, send it, and receive ExecutionReport (8) or OrderCancelReject (9) from a simulated exchange.
4. **Live message-flow visualizer**: a real-time sequence diagram of every message between the two counterparties, streamed over WebSocket.
5. **Tag reference panel**: click any tag in any message to see its name, meaning and allowed values for the version in use.
6. **Version profiles**: each FIX version (BeginString, dictionary, session rules, order-message dialect) is a self-contained profile in a registry. Adding FIX 4.2 or 5.0 means adding a profile and its tests, not changing the engine. The UI shows which versions are live and which are planned.

## What it is not

- Not a production FIX engine: no persistence, no encryption, no certification. Versions are added one profile at a time, not all at once.
- Not connected to any real venue. Both counterparties are simulated inside one server.
- Not a trading system: no risk checks, positions or real prices.

---

## Documentation (start here)

| Doc | Audience | Purpose |
|-----|----------|---------|
| [`docs/AGENT_BRIEF.md`](docs/AGENT_BRIEF.md) | **AI coding agents** | Primary build instructions — read this first |
| [`docs/PRD.md`](docs/PRD.md) | Recruiters / PMs | Goals, personas, MUST/SHOULD/COULD |
| [`docs/TRD.md`](docs/TRD.md) | Implementers | Stack lock, monorepo layout, config, CI, deploy |
| [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) | Implementers | Wire rules, codec + session APIs, WebSocket events, REST |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Implementers / interviewers | Components, session state machine, gap recovery, worked examples |
| [`docs/ACCEPTANCE_CRITERIA.md`](docs/ACCEPTANCE_CRITERIA.md) | QA / agents | Binary checklist for “done” |
| [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) | Implementers | Required tests, golden vectors, fixtures |
| [`AGENTS.md`](AGENTS.md) | Agents | Short pointer to the brief |

---

## How to run

```bash
git clone https://github.com/vikaspal1704/fix-protocol-lab.git
cd fix-protocol-lab
npm install            # npm workspaces
npm test               # vitest across all packages
npm run dev            # server on :8080 + Vite dev server on :5173 (open :5173)
npm run build && npm start   # production: one Node process serves UI + WebSocket on :8080
npm run e2e            # Playwright end-to-end against the production build
```

## Project layout

```
packages/fix-core      tag=value codec, framer, version registry, per-version dictionaries (isomorphic)
packages/fix-orders    per-version order dialects (NewOrderSingle, ExecutionReport, …), shared by server and UI
packages/fix-session   session engine: logon, heartbeats, TestRequest, sequence rules, resend/gap fill, faults, TCP
apps/server            one sandbox per visitor (BUYSIDE + EXCH over loopback TCP), exchange simulator, WebSocket bridge
apps/web               React UI: live sequence diagram, order ticket + encoded preview, inspector, tag reference
docs/                  PRD, TRD, API contract, architecture, acceptance criteria, test plan, session-layer write-up
```

The session layer is explained step by step in [`docs/SESSION_LAYER.md`](docs/SESSION_LAYER.md).

## Deploy

One Node web service serves the built UI, `GET /health` and `WS /ws`. The FIX TCP sessions run on loopback inside that process and are never exposed publicly.

1. Render dashboard → **New → Blueprint** → pick this repo → **Apply** ([`render.yaml`](render.yaml); tracks `main`).
2. Add your domain under the service's **Settings → Custom Domains** and point a CNAME at it; Render issues HTTPS.
3. Share links like `https://<your-domain>/?scenario=gap-recovery` to open straight into a demo.

See [`docs/TRD.md`](docs/TRD.md) §9.

## Roadmap

| Milestone | Scope | Target |
|---|---|---|
| **M1** | `fix-core` codec + version registry + `fix-session` engine with tests, FIX 4.4 (Phases 1–2) | 1–2 weekends |
| **M2** | Exchange simulator, WebSocket bridge, order entry, visualizer, tag panel, deploy, session-layer write-up (Phases 3–5) | 2–3 weekends |
| **M3+** | One version per step: FIX 4.2 → 4.3 → 5.0 SP2 over FIXT.1.1 (ARCHITECTURE §12) | ongoing |

Ship M1 narrow and working before starting M2.

---

## License

MIT © 2026 Vikas Pal — see [LICENSE](LICENSE).
