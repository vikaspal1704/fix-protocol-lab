# Technical Requirements Document (TRD)

**Product:** FIX Protocol Lab  
**Version:** 1.0

---

## 1. Language & runtime

- **Node.js 22 LTS** for the engine and server; **TypeScript 5.x**, `strict: true`, ESM (`"type": "module"`).
- Browser: evergreen Chromium, Firefox and Safari (last 2 versions).

## 2. Stack lock (normative)

| Layer | Choice | Notes |
|-------|--------|-------|
| Monorepo | **npm workspaces** | No Nx/Turborepo in v1 |
| Codec | `packages/fix-core` | Pure TS, isomorphic (no `Buffer`, no `node:*` imports) |
| Session | `packages/fix-session` | Node `node:net` raw TCP; no third-party FIX libraries |
| Server | `apps/server` | Node `node:http` + **`ws`** WebSocket library; serves the built UI statically |
| Frontend | `apps/web` | **React 19**, **Vite**, **Redux Toolkit + RTK Query**, **Tailwind CSS v4** (`@tailwindcss/vite`) |
| Tests | **Vitest** (all packages) + **Playwright** (one e2e smoke) | Fake timers for session timing |
| Lint/format | ESLint 9 flat config + `typescript-eslint`, Prettier | |

**Forbidden:** QuickFIX bindings or any FIX library (the point is to implement it), Express (use `node:http`), Socket.IO (use plain WebSocket), CSS-in-JS runtimes.

## 3. Repository layout

```
fix-protocol-lab/
├── AGENTS.md
├── LICENSE
├── README.md
├── package.json                 # workspaces, root scripts
├── tsconfig.base.json           # strict settings shared by all packages
├── eslint.config.js
├── render.yaml                  # deploy blueprint (Phase 5)
├── .github/workflows/ci.yml
├── packages/
│   ├── fix-core/
│   │   ├── src/
│   │   │   ├── index.ts         # public exports (API_CONTRACT §3)
│   │   │   ├── codec.ts         # encode / decode / checksum / bodyLength
│   │   │   ├── framer.ts        # FixFramer: TCP chunks -> whole messages
│   │   │   ├── message.ts       # FixMessage type + helpers
│   │   │   ├── errors.ts        # FixParseError + codes
│   │   │   ├── time.ts          # UTCTimestamp format/parse (ms precision)
│   │   │   └── dictionary/      # tags.ts, msgTypes.ts, enums (FIX 4.4 subset)
│   │   └── test/
│   └── fix-session/
│       ├── src/
│       │   ├── index.ts
│       │   ├── session.ts       # FixSession state machine (transport-agnostic)
│       │   ├── transport.ts     # TCP binding: initiator / acceptor
│       │   ├── store.ts         # in-memory outbound message store for resends
│       │   ├── clock.ts         # injectable clock + timers
│       │   └── faults.ts        # fault-injection hooks
│       └── test/
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── main.ts          # http server, static files, /health, /ws
│   │   │   ├── config.ts
│   │   │   ├── sandbox.ts       # one initiator+acceptor pair per WS client
│   │   │   ├── exchange.ts      # simulated exchange (ARCHITECTURE §6)
│   │   │   ├── autoplay.ts      # scripted order generator
│   │   │   └── bridge.ts        # FIX events -> WS events (API_CONTRACT §5)
│   │   └── test/
│   └── web/
│       ├── index.html
│       ├── src/
│       │   ├── main.tsx
│       │   ├── app/store.ts     # RTK store
│       │   ├── features/
│       │   │   ├── session/     # connection + session state slice, WS middleware
│       │   │   ├── orders/      # order entry form, encoded preview, blotter
│       │   │   ├── flow/        # sequence-diagram visualizer
│       │   │   ├── inspector/   # raw + parsed message view
│       │   │   └── dictionary/  # tag reference panel
│       │   └── api/health.ts    # RTK Query endpoints (REST)
│       └── e2e/                 # Playwright smoke
└── docs/
    ├── *.md                     # this documentation pack
    └── SESSION_LAYER.md         # public write-up (Phase 5)
```

## 4. Package boundaries

| Package | May depend on | Must not depend on |
|---------|---------------|--------------------|
| `fix-core` | nothing (runtime) | `node:*`, React, `ws` |
| `fix-session` | `fix-core`, `node:net`, `node:events` | React, `ws`, server code |
| `apps/server` | `fix-core`, `fix-session`, `ws` | React |
| `apps/web` | `fix-core` (for live preview and dictionary), React stack | `fix-session`, `node:*` |

The browser never opens a FIX session. It only talks to the server over WebSocket.

## 5. Scripts (root `package.json`)

| Script | Does |
|--------|------|
| `npm run build` | Build `fix-core`, `fix-session`, server, web (web → `apps/web/dist`) |
| `npm test` | Vitest in every workspace |
| `npm run lint` | ESLint + `tsc --noEmit` across workspaces |
| `npm run dev` | Server (watch) on `:8080` + Vite on `:5173` proxying `/ws` and `/health` |
| `npm start` | Production server on `$PORT`, serving `apps/web/dist` |
| `npm run e2e` | Playwright smoke against a local production build |

## 6. Configuration (server environment)

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `8080` | HTTP/WebSocket port |
| `HEARTBEAT_INTERVAL_SEC` | `10` | HeartBtInt (108) used by sandbox sessions (short, so the demo is lively) |
| `MAX_SANDBOXES` | `50` | Concurrent sandboxes; beyond this `/ws` sends `error` `CAPACITY` and closes (1013) |
| `SANDBOX_IDLE_TIMEOUT_SEC` | `600` | Close a sandbox after no client messages for this long |
| `ORDER_RATE_LIMIT_PER_SEC` | `5` | Per-sandbox `order.*` message cap; excess → `error` `RATE_LIMITED` |
| `FILL_SEED` | unset | Seed for the exchange fill model (tests set it) |
| `PUBLIC_ORIGIN` | unset | If set, `/ws` rejects other `Origin` headers |

FIX TCP listeners bind to **127.0.0.1 on an ephemeral port** per sandbox, never `0.0.0.0`.

## 7. Concurrency model

- One Node process and one event loop. Each sandbox owns one acceptor listener, one initiator socket and one exchange simulator.
- All timers go through the injectable `Clock` (fix-session `clock.ts`), so tests use fake time.
- Back-pressure: the WebSocket bridge drops a client whose `ws.bufferedAmount` exceeds 1 MiB (close 1013), mirroring the slow-consumer rule in the sibling live-orderbook-feed project.

## 8. CI (GitHub Actions)

`.github/workflows/ci.yml` MUST, on push to `main` and on pull requests:

1. Set up Node 22 with the npm cache, then run `npm ci`.
2. `npm run lint` (ESLint + typecheck).
3. `npm test` (Vitest, all workspaces), with coverage for `fix-core` ≥ 90% lines.
4. `npm run build`.
5. `npm run e2e` (Playwright, bundled Chromium) on one job.

No secrets required.

## 9. Deploy

| Item | Choice |
|------|--------|
| Host | **Render** web service (free or starter) from `render.yaml`, auto-deploy from `main` |
| Build | `npm ci && npm run build` |
| Start | `npm start` |
| Health check | `GET /health` |
| Domain | Custom domain (e.g. `fixlab.<your-domain>`), set in the Render dashboard, HTTPS by Render |
| WebSocket | Same origin: `wss://<domain>/ws` |

Free-tier instances sleep when idle; the UI shows a "waking the server…" state while the first `/health` is pending.

## 10. Observability

- Structured JSON logs (`console` with a tiny logger): sandbox open/close, session state changes, faults injected, capacity and rate-limit rejections. Never log full message streams at info level.
- `GET /health` reports uptime, sandbox count and version.

## 11. Non-requirements (tech)

- No database, Redis or queue
- No SSR / Next.js
- No FIX over TLS
- No Docker requirement (Render builds from source); a Dockerfile is COULD
