#!/usr/bin/env node
// End-to-end check of a running FIX Protocol Lab (local or deployed).
//
//   BASE_URL=https://fix-protocol-lab.onrender.com node scripts/live-smoke.mjs
//
// Checks /health, the UI page, /api/versions, then opens /ws and drives a real
// sandbox: both sides log on, an order fills, and the "Lose a message" scenario
// is recovered through ResendRequest + GapFill/PossDup. No dependencies: uses
// Node 22's built-in fetch and WebSocket.

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 60_000);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`ok   ${message}`);
}

async function getJson(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) fail(`GET ${path} returned ${res.status}`);
  return res.json();
}

async function checkHttp() {
  const health = await getJson("/health");
  if (health.status !== "ok") fail(`/health status is ${JSON.stringify(health.status)}`);
  ok(`/health ${JSON.stringify(health)}`);

  const page = await fetch(`${BASE_URL}/?scenario=gap-recovery`);
  const html = await page.text();
  if (!page.ok || !html.includes('<div id="root">'))
    fail(`UI page returned ${page.status} without the app root`);
  ok("UI page and deep link served");

  const versions = await getJson("/api/versions");
  const list = Array.isArray(versions) ? versions : versions.versions;
  if (!list?.some((v) => v.id === "FIX.4.4" && v.status === "implemented"))
    fail("FIX.4.4 not listed as implemented");
  ok(`/api/versions lists ${list.map((v) => `${v.id}(${v.status})`).join(", ")}`);
}

/** Opens /ws and resolves helpers for waiting on server events. */
function openSandbox() {
  const wsUrl = `${BASE_URL.replace(/^http/, "ws")}/ws`;
  const ws = new WebSocket(wsUrl);
  const events = [];
  const waiters = [];

  ws.addEventListener("message", (e) => {
    const event = JSON.parse(String(e.data));
    events.push(event);
    if (event.type === "error") fail(`server error ${event.code}: ${event.message}`);
    for (const w of [...waiters]) {
      if (w.match(event)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(event);
      }
    }
  });
  ws.addEventListener("close", (e) => {
    for (const w of waiters)
      w.reject(new Error(`socket closed (${e.code}) while waiting for ${w.what}`));
  });

  const waitFor = (what, match) => {
    const seen = events.find(match);
    if (seen) return Promise.resolve(seen);
    return new Promise((resolve, reject) => waiters.push({ what, match, resolve, reject }));
  };
  const send = (command) => ws.send(JSON.stringify(command));
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error(`could not open ${wsUrl}`)), {
      once: true,
    });
  });
  return { ws, events, waitFor, send, opened };
}

const isState = (side, state) => (e) =>
  e.type === "session.state" && e.side === side && e.state === state;
const isFix =
  (from, msgType, extra = () => true) =>
  (e) =>
    e.type === "fix.message" &&
    e.direction === "in" &&
    e.from === from &&
    e.msgType === msgType &&
    extra(e);
const isOrder = (clOrdId, status) => (e) =>
  e.type === "order.update" && e.clOrdId === clOrdId && e.status === status;

async function checkSession() {
  const { ws, events, waitFor, send, opened } = openSandbox();
  await opened;

  const hello = await waitFor("hello", (e) => e.type === "hello");
  ok(`hello: sandbox ${hello.sandboxId}, ${hello.fixVersion}, HeartBtInt ${hello.heartBtIntSec}s`);

  await Promise.all([
    waitFor("BUYSIDE ACTIVE", isState("BUYSIDE", "ACTIVE")),
    waitFor("EXCH ACTIVE", isState("EXCH", "ACTIVE")),
  ]);
  ok("Logon (35=A) both ways; BUYSIDE and EXCH are ACTIVE");

  // 1. A crossing order fills in two parts.
  send({
    type: "order.new",
    symbol: "DEMO",
    side: "BUY",
    qty: 100,
    ordType: "LIMIT",
    price: "101.25",
  });
  const accepted = await waitFor(
    "first order accepted",
    (e) => e.type === "order.update" && e.status !== "PENDING_NEW",
  );
  const first = accepted.clOrdId;
  await waitFor(`${first} FILLED`, isOrder(first, "FILLED"));
  if (!events.some(isFix("BUYSIDE", "D"))) fail("EXCH never received the NewOrderSingle (35=D)");
  const reports = events.filter(isFix("EXCH", "8"));
  ok(`${first}: 35=D sent, ${reports.length} ExecutionReports (35=8), FILLED`);

  // 2. "Lose a message": drop BUYSIDE's next order; the following one exposes the gap.
  send({ type: "fault.inject", side: "BUYSIDE", kind: "drop_next" });
  await waitFor("fault applied", (e) => e.type === "fault.applied" && e.kind === "drop_next");
  send({
    type: "order.new",
    symbol: "DEMO",
    side: "BUY",
    qty: 10,
    ordType: "LIMIT",
    price: "101.25",
  });
  await new Promise((r) => setTimeout(r, 400));
  send({
    type: "order.new",
    symbol: "DEMO",
    side: "SELL",
    qty: 10,
    ordType: "LIMIT",
    price: "105.00",
  });

  await waitFor("dropped message", (e) => e.type === "fix.message" && e.dropped);
  const resend = await waitFor("ResendRequest", isFix("EXCH", "2"));
  const begin = resend.fields.find(([tag]) => tag === 7)?.[1];
  ok(`gap detected: EXCH sent ResendRequest (35=2, 7=${begin})`);
  await waitFor(
    "PossDup replay",
    isFix("BUYSIDE", "D", (e) => e.possDup),
  );
  await waitFor(
    "EXCH back to ACTIVE",
    (e) => isState("EXCH", "ACTIVE")(e) && events.indexOf(e) > events.indexOf(resend),
  );
  ok("replayed the order with PossDupFlag (43=Y); EXCH back in sync");

  const clOrdIds = [
    ...new Set(events.filter((e) => e.type === "order.update").map((e) => e.clOrdId)),
  ];
  const lost = clOrdIds.find((id) => id !== first);
  if (!lost) fail("no order.update for the dropped order");
  await waitFor(`${lost} FILLED`, isOrder(lost, "FILLED"));
  const fills = events.filter(
    (e) =>
      isFix("EXCH", "8")(e) &&
      e.fields.some(([t, v]) => t === 11 && v === lost) &&
      e.fields.some(([t, v]) => t === 150 && v === "F"),
  );
  const filledQty = fills.reduce(
    (sum, e) => sum + Number(e.fields.find(([t]) => t === 32)?.[1] ?? 0),
    0,
  );
  if (filledQty !== 10)
    fail(`${lost} filled ${filledQty}, expected 10 (processed more than once?)`);
  ok(`${lost} (the dropped order) was recovered and FILLED exactly once`);

  const seqNotes = events.filter(isFix("BUYSIDE", "4")).length;
  if (seqNotes) ok(`${seqNotes} SequenceReset-GapFill (35=4) skipped admin messages`);

  send({ type: "session.logout", side: "BUYSIDE" });
  await waitFor("Logout", isFix("EXCH", "5"));
  ok("Logout (35=5) acknowledged");
  ws.close();
}

const timer = setTimeout(() => fail(`timed out after ${TIMEOUT_MS} ms`), TIMEOUT_MS);
try {
  console.log(`Smoke test against ${BASE_URL}`);
  await checkHttp();
  await checkSession();
  clearTimeout(timer);
  console.log("PASS");
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
