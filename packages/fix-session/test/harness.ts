import { encode, formatUtcTimestamp, toDisplay, type FixField } from "@fixlab/fix-core";

import { createPipe, FixSession, ManualClock, type SessionConfig, type WireEvent } from "../src/index.js";

export const T0 = Date.UTC(2026, 8, 24, 10, 0, 0, 0); // 20260924-10:00:00.000

export interface Side {
  session: FixSession;
  wire: WireEvent[];
  app: string[];
  states: string[];
  /** Display strings of messages that actually went on the wire. */
  sent(): string[];
  /** MsgTypes this side sent (including dropped). */
  sentTypes(): string[];
}

function track(session: FixSession): Side {
  const side: Side = {
    session,
    wire: [],
    app: [],
    states: [],
    sent: () => side.wire.filter((w) => w.direction === "out" && !w.dropped).map((w) => toDisplay(w.raw)),
    sentTypes: () => side.wire.filter((w) => w.direction === "out").map((w) => w.msg!.msgType),
  };
  session.on("wire", (w) => side.wire.push(w));
  session.on("app", (m) => side.app.push(m.msgType));
  session.on("state", (s, reason) => side.states.push(reason ? `${s}:${reason}` : s));
  return side;
}

export function pair(overrides: Partial<SessionConfig> = {}, heartBtIntSec = 30) {
  const clock = new ManualClock(T0);
  const [a, b] = createPipe(clock, 1);
  const base = { version: "FIX.4.4", heartBtIntSec, clock, ...overrides };
  const buy = track(new FixSession({ ...base, role: "initiator", senderCompId: "BUYSIDE", targetCompId: "EXCH" }));
  const exch = track(new FixSession({ ...base, role: "acceptor", senderCompId: "EXCH", targetCompId: "BUYSIDE" }));
  buy.session.attach(a);
  exch.session.attach(b);
  return { clock, buy, exch, pipes: [a, b] as const };
}

/** Log on and let the reply arrive. */
export function loggedOn(heartBtIntSec = 30) {
  const p = pair({}, heartBtIntSec);
  p.buy.session.logon();
  p.clock.advance(2);
  return p;
}

/** Fields of the worked-example NewOrderSingle. */
export function order(clOrdId: string, side: "1" | "2", qty: number, price: string, at: number): FixField[] {
  return [
    [11, clOrdId],
    [55, "DEMO"],
    [54, side],
    [60, formatUtcTimestamp(at)],
    [38, String(qty)],
    [40, "2"],
    [44, price],
    [59, "0"],
  ];
}

/** Raw display of a hand-built message (for injecting unusual input). */
export function raw(msgType: string, fields: FixField[]): Uint8Array {
  return encode({ beginString: "FIX.4.4", msgType, fields });
}
